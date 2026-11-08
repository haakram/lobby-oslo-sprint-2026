import type { CallSummary } from "@/features/dashboard/useReceptionCalls";
import { createLocalStore, recordOf } from "@/features/modules/localStore";
import type { DemoCall } from "@/features/reception/demoCalls";
import { formatClock } from "@/features/reception/format";
import type { MessageRecord, ReceptionRecord } from "@/features/reception/records";
import { floorOfArea } from "@/features/rooms/housekeeping";
import { byRole, cleanersToday } from "@/features/staff/testData";

/**
 * A phone call becomes a task. When a guest calls the AI receptionist during their stay ("Rom 214
 * ønsker ekstra håndklær"), the receptionist's `record_message` tool leaves a message for staff. A
 * message that names a room is an in-stay request: it lands in Forespørsler as a task with the guest's
 * words, the call it came from, and who can take it (the robot carries things; staff fix things).
 * Pure: the screen passes in the records and today's assignments.
 */

export type PhoneTaskKind = "Utstyr" | "Romservice" | "Teknisk" | "Støy" | "Beskjed";

export type PhoneTask = {
  /** The request's id in Forespørsler. */
  id: string;
  record: MessageRecord;
  /** "room-214". */
  room: string;
  kind: PhoneTaskKind;
  /** Wall clock HH:MM (Oslo) the call came in. */
  at: string;
  /** The robot can carry it (towels, a tray); fixing a radiator is for a person. */
  robotCan: boolean;
  /** Who should take it, by what it is: the robot when it can, else the right person on shift. */
  suggested: "robot" | "staff";
  staff: { name: string; first: string };
  /** Where the call is kept: a record on Resepsjon, a note in its call log, or a seeded demo call. */
  origin: "record" | "call-log" | "demo";
  /** The seeded demo call (with its words and length), when it is one. */
  demo: DemoCall | null;
};

const ROOM_IN_TEXT = /\b(?:rom(?:met)?|room|værelse(?:t)?|chambre|zimmer)\s*(?:nr\.?|nummer|number|no\.?)?\s*(\d{3})\b/i;

/** "Rom 214 ønsker …" → "room-214"; null when no room number is named. */
export function roomInText(text: string): string | null {
  const match = ROOM_IN_TEXT.exec(text);
  return match ? `room-${match[1]}` : null;
}

const KINDS: readonly [PhoneTaskKind, RegExp][] = [
  ["Teknisk", /radiator|varme|\bheat|klima|air ?condition|\bac\b|\blys\b|lampe|\blight|dusj|shower|toalett(?!papir)|toilet(?! paper)|\btv\b|wifi|internett|nøkkelkort|keycard|lekk|leak|virker ikke|fungerer ikke|not working|broken|ødelagt|\bkald|\bcold/i],
  ["Støy", /støy|bråk|noise|\bloud/i],
  ["Romservice", /frokost|breakfast|room service|romservice|\bbrett|\btray|\bmat\b|\bfood/i],
  ["Utstyr", /håndkl|towel|pute|pillow|dyne|duvet|pledd|blanket|såpe|soap|sjampo|shampoo|tannbørste|toothbrush|\bvann\b|water|toalettpapir|toilet paper|lader|charger/i],
];

export function classifyRequest(text: string): { kind: PhoneTaskKind; robotCan: boolean } {
  const kind = KINDS.find(([, pattern]) => pattern.test(text))?.[0] ?? "Beskjed";
  return { kind, robotCan: kind === "Utstyr" || kind === "Romservice" };
}

/** The person on today's day shift for this kind of task on this floor. */
export function staffFor(kind: PhoneTaskKind, room: string): { name: string; first: string } {
  const floor = Number(room.replace(/^room-/, "").charAt(0));
  const person =
    kind === "Teknisk"
      ? byRole("Vedlikehold").find((member) => member.shift === "dag")
      : kind === "Utstyr" || kind === "Romservice"
        ? cleanersToday().find((member) => floorOfArea(member.area) === floor)
        : undefined;
  if (!person) return { name: "Resepsjonen", first: "resepsjonen" };
  return { name: person.name, first: person.name.split(" ")[0] };
}

/** A receptionist record that is an in-stay request, as a task; null for bookings and plain callbacks. */
export function phoneTaskFromRecord(record: ReceptionRecord, demo: DemoCall | null = null): PhoneTask | null {
  if (record.kind !== "message" || record.topic === "booking") return null;
  const room = roomInText(record.message);
  if (!room) return null;
  const { kind, robotCan } = classifyRequest(record.message);
  return {
    id: `phone:${record.id}`,
    record,
    room,
    kind,
    at: formatClock(record.createdAt),
    robotCan,
    suggested: robotCan ? "robot" : "staff",
    staff: staffFor(kind, room),
    origin: demo ? "demo" : "record",
    demo,
  };
}

/**
 * A note in the receptionist's call log (ElevenLabs) that asks staff to call back about something in a
 * room ("Gjesten i rom 222 mangler håndklær") is an in-stay request too. Bookings stay callbacks.
 */
export function phoneTaskFromCall(call: CallSummary): PhoneTask | null {
  if (call.requestType === "booking") return null;
  const text = call.summary ?? call.title;
  const room = text ? roomInText(text) : null;
  if (!text || !room) return null;
  const record: MessageRecord = {
    kind: "message",
    id: `call-${call.id}`,
    createdAt: call.startedAt,
    name: call.callerName ?? "Ukjent innringer",
    phone: "",
    topic: "other",
    message: text,
    urgent: false,
  };
  const task = phoneTaskFromRecord(record);
  return task ? { ...task, id: `call:${call.id}`, origin: "call-log" } : null;
}

/** Live calls first (the call log, then the records left in this browser), then the seeded demo calls; each once. */
export function phoneTasks(records: readonly ReceptionRecord[], demo: readonly DemoCall[], calls: readonly CallSummary[] = []): PhoneTask[] {
  const seen = new Set<string>();
  const tasks: PhoneTask[] = [];
  const add = (record: ReceptionRecord, call: DemoCall | null) => {
    if (seen.has(record.id)) return;
    seen.add(record.id);
    const task = phoneTaskFromRecord(record, call);
    if (task) tasks.push(task);
  };
  for (const call of calls) {
    const task = phoneTaskFromCall(call);
    if (task) tasks.push(task);
  }
  for (const record of records) add(record, null);
  for (const call of demo) add(call.record, call);
  return tasks;
}

// ---------------------------------------------------------------------------------------------
// Who took each phone task (one tap: the robot or a person). The status itself (Pågår, Fullført)
// is the shared Ny → Tildelt → Løst of useOrderStatuses.

export type PhoneAssignment = { to: "robot" | "staff"; who: string; at: string };

const isAssignment = (value: unknown): value is PhoneAssignment => {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (entry.to === "robot" || entry.to === "staff") && typeof entry.who === "string" && typeof entry.at === "string";
};

/** TODO(phase-3): *Send roboten* puts the task in the robot's queue on the Wybe server. */
export const PHONE_ASSIGNMENTS = createLocalStore<Record<string, PhoneAssignment>>(
  "lobby:phone-task-assignments",
  (raw) => recordOf(raw, isAssignment),
  {},
);

export function assignPhoneTask(id: string, assignment: PhoneAssignment | null) {
  PHONE_ASSIGNMENTS.set((current) => {
    const next = { ...current };
    if (assignment) next[id] = assignment;
    else delete next[id];
    return next;
  });
}
