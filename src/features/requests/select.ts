import type { CallSummary } from "@/features/dashboard/useReceptionCalls";
import { hhmm } from "@/features/dashboard/format";
import { requestKindLabel } from "@/features/dashboard/labels";
import type { Night, OrderStatus, QueuedRequest, Task } from "@/features/dashboard/selectors";
import { type HotelMap, roomsOf } from "@/features/hotel";
import type { DeclineCheck, DeclineSplit } from "@/features/nightshift/declines";
import type { Outcome } from "@/features/nightshift/outcomes";
import { formatClock } from "@/features/reception/format";
import type { RoomCheckMark } from "@/features/rooms/reconcile";
import type { PhoneAssignment, PhoneTask } from "./phoneTasks";
import type { RequestStamp } from "./stamps";
import { type ManualRequest, MANUAL_REQUESTS } from "./testData";

/**
 * Every guest request from every source, in one shape: the robot's tasks (run log), the phone
 * (the AI receptionist's calls that need a callback), staff and in-room voice (test data).
 */

export type RequestSource = "robot" | "telefon" | "personale" | "stemme";

export const SOURCE_WORD: Record<RequestSource, string> = {
  robot: "Roboten",
  telefon: "Telefon",
  personale: "Personale",
  stemme: "Stemme",
};

/** The source filter's chips, in order. */
export const SOURCES: readonly RequestSource[] = ["telefon", "stemme", "personale", "robot"];

/**
 * `?filter=robot` opens Forespørsler on one source (Overlevering's hand-back item links there, jury round
 * 3). Here, not in the screen: the page (a server component) reads it.
 */
export function sourceFromQuery(value: string | string[] | undefined): RequestSource | null {
  const filter = Array.isArray(value) ? value[0] : value;
  return SOURCES.find((source) => source === filter) ?? null;
}

/**
 * `avvist`: the robot checked and refused on good grounds (no order on record, already delivered).
 * `avlyst`: the night manager called it off. Neither is a failure, and neither needs a person.
 */
export type RequestStatus = "venter" | "pagar" | "fullfort" | "feilet" | "avvist" | "avlyst";

export const REQUEST_STATUS: Record<RequestStatus, { word: string; tone: "neutral" | "accent" | "success" | "danger" | "warning" }> = {
  venter: { word: "Venter", tone: "warning" },
  // The accent is the robot and the one primary action, never a state (DESIGN.md).
  pagar: { word: "Pågår", tone: "neutral" },
  fullfort: { word: "Fullført", tone: "success" },
  feilet: { word: "Feilet", tone: "danger" },
  avvist: { word: "Avvist", tone: "neutral" },
  avlyst: { word: "Avlyst", tone: "neutral" },
};

export const REQUEST_ORDER: readonly RequestStatus[] = ["venter", "feilet", "pagar", "fullfort", "avvist", "avlyst"];

export type RequestView = {
  id: string;
  source: RequestSource;
  kind: string;
  room: string | null;
  /** The guest's words, when a source recorded them. English from the robot's server. */
  text: string | null;
  lang: "en" | "nb" | null;
  /** HH:MM, wall clock or the night's shift clock. */
  at: string | null;
  handler: string;
  status: RequestStatus;
  /** Staff can move this one along: everything but the robot's done and running tasks, which the robot reports. */
  actionable: boolean;
  /** Where the night happened: the robot's requests carry the shift clock, not today's time. */
  tonight: boolean;
  /** The source badge when it says more than the filter's word ("Telefon (AI)", "Romsjekk"). */
  badge?: string;
  /** A call the AI receptionist turned into a task: the call, and who can take it in one tap. */
  phone?: PhoneTask;
  /** Why the robot did not finish it, in Norwegian (src/features/nightshift/outcomes.ts). */
  reason?: string | null;
  /** Put in the robot's queue but not sent: there is no connection to the robot yet (TODO(phase-3)). */
  pending?: boolean;
  /** The status badge's word when it says more than the status's own. */
  statusWord?: string;
  /** The guest named a room the hotel doesn't have ("222"): "Ukjent rom", for reception, never a room task. */
  unknownRoom?: string;
  /** The call an unknown-room request came from (*Se samtalen*); not a phone task, so nobody is sent to the room. */
  call?: PhoneTask;
  /** Who moved it along on Forespørsler, and when (ISO); the row says "Siri Haugen tok saken · nå". */
  stamp?: RequestStamp;
  /** A phone task given in one tap: to the robot's queue, or to this person. */
  assignedTo?: "robot" | string;
  /** A robot's refusal: what the referee (the Wybe Night Shift simulator) made of it, and what kind it was. */
  decline?: Pick<DeclineCheck, "judged" | "kind">;
};

/**
 * Where a row stands on Forespørsler, top to bottom (jury round 3, the product juror): what the robot handed back first,
 * pinned, so calls that arrive a moment later can't push it down; the phone's calls in their own group below;
 * then everything else that waits, what is under way, done, refused after a check and called off.
 */
export type RequestLane = "handback" | "phone" | "venter" | "pagar" | "fullfort" | "avvist" | "avlyst";

export const REQUEST_LANES: readonly RequestLane[] = ["handback", "phone", "venter", "pagar", "fullfort", "avvist", "avlyst"];

export function requestLane(request: RequestView): RequestLane {
  if (request.status === "venter" || request.status === "feilet") {
    if (request.source === "robot" && !request.badge) return "handback";
    if (request.source === "telefon") return "phone";
    return "venter";
  }
  return request.status;
}

/**
 * The rooms of tonight's hotel, to tell a room a caller names from one that doesn't exist. Only from a night
 * that has ended (the robot's whole night shaped the map); earlier, or with no night, null: nothing is
 * called unknown on a half-drawn map.
 */
export function hotelRoomsOf(map: HotelMap, ended: boolean): ReadonlySet<string> | null {
  if (!map.fromRun || !ended) return null;
  const rooms = roomsOf(map);
  return rooms.length > 0 ? new Set(rooms.map((node) => node.id)) : null;
}

/** The robot's verdict as a request's status: refused and called-off requests are their own, quiet states. */
function robotStatus(outcome: Outcome | undefined, fallback: RequestStatus): RequestStatus {
  switch (outcome?.verdict) {
    case "done":
      return "fullfort";
    case "declined":
      return "avvist";
    case "cancelled":
      return "avlyst";
    case "failed":
    case "unverified":
      return "feilet";
    case "open":
      return "venter";
    default:
      return fallback;
  }
}

const ROBOT_HANDLER: Partial<Record<RequestStatus, string>> = {
  venter: "Roboten · trenger en person",
  feilet: "Roboten · trenger en person",
  avvist: "Roboten sjekket først · din beslutning",
  avlyst: "Avlyst av nattsjefen",
};

function robotRequest(id: string, kind: string, room: string | null, text: string | null, at: string | null, status: RequestStatus, outcome: Outcome | undefined): RequestView {
  // A person can take over what the robot failed or left open, and give what it refused anyway (a refusal is a
  // decision for a person, jury round 3, the Wybe engineer); done, running and called-off stay the robot's.
  const needsPerson = status === "venter" || status === "feilet" || status === "avvist";
  return {
    id: `robot:${id}`,
    source: "robot",
    kind: requestKindLabel(kind),
    room,
    text,
    lang: text ? "en" : null,
    at: hhmm(at),
    handler: ROBOT_HANDLER[status] ?? "Roboten",
    status,
    actionable: needsPerson,
    tonight: true,
    reason: outcome?.reason ?? null,
  };
}

function fromTask(task: Task, outcome: Outcome | undefined, ended: boolean): RequestView {
  const fallback: RequestStatus = task.outcome === "done" ? "fullfort" : task.outcome === "failed" ? "feilet" : ended ? "venter" : "pagar";
  return robotRequest(task.request, task.kind, task.room, task.text, task.startedAt, robotStatus(outcome, fallback), outcome);
}

/** A request the robot never started: in its queue while the night runs, waiting for a person after it. */
function fromQueued(request: QueuedRequest, outcome: Outcome | undefined, ended: boolean): RequestView {
  const view = robotRequest(request.request, request.kind, null, request.text, request.at, robotStatus(outcome, ended ? "venter" : "pagar"), outcome);
  return view.status === "pagar" ? { ...view, handler: "I robotens kø" } : view;
}

function fromCall(call: CallSummary): RequestView {
  return {
    id: `call:${call.id}`,
    source: "telefon",
    badge: "Telefon (AI)",
    kind: call.requestType === "booking" ? "Booking" : "Ring tilbake",
    room: null,
    // The caller is the guest, not the one who has the case: their name goes in the text.
    text: [call.callerName ? `Ring tilbake til ${call.callerName}` : null, call.summary ?? call.title].filter(Boolean).join(": ") || null,
    lang: "nb",
    at: formatClock(call.startedAt) || null,
    handler: "Resepsjon",
    status: "venter",
    actionable: true,
    tonight: false,
  };
}

function fromManual(request: ManualRequest): RequestView {
  return {
    id: request.id,
    source: request.source,
    kind: request.kind,
    room: request.room,
    text: request.text,
    lang: "nb",
    at: request.at,
    handler: request.handler,
    status: request.status,
    actionable: true,
    tonight: false,
  };
}

/** A phone call the AI receptionist took down, as a task: waiting until someone takes it in one tap. */
export function fromPhoneTask(task: PhoneTask, assignment: PhoneAssignment | undefined, staffStatus: OrderStatus = "ny"): RequestView {
  const handled = task.demo?.handled;
  // Nothing reaches the robot yet, so a robot task closed here was closed by staff, never "Roboten ordnet det".
  const doneBy = assignment ? (assignment.to === "robot" ? "Personalet" : assignment.who) : null;
  const queued = assignment?.to === "robot" && staffStatus !== "lost";
  return {
    id: task.id,
    source: "telefon",
    badge: "Telefon (AI)",
    kind: task.kind,
    room: task.room,
    text: task.record.message,
    lang: "nb",
    at: task.at || null,
    handler: doneBy && staffStatus === "lost"
      ? `${doneBy} ordnet det`
      : assignment
      ? assignment.to === "robot"
        ? "Lagt i robotens kø · sendes når roboten er koblet til"
        : `${assignment.who} har saken`
      : handled
        ? `${handled.who} ordnet det ${handled.at}`
        : `Forslag: ${task.suggested === "robot" ? "roboten" : task.staff.name}`,
    status: handled && !assignment ? "fullfort" : "venter",
    actionable: true,
    tonight: false,
    phone: task,
    pending: queued,
    ...(assignment ? { assignedTo: assignment.to === "robot" ? "robot" : assignment.who } : {}),
  };
}

/**
 * A call that names a room the hotel doesn't have (a test call to "rom 222" in a hotel of 201–214): not a
 * room task and nothing for the robot. Reception rings back and asks; it waits in the phone's group, never
 * at the top of Overlevering or in the bell's Haster.
 */
export function fromUnknownRoom(task: PhoneTask): RequestView {
  const number = task.room.replace(/^room-/, "");
  return {
    id: task.id,
    source: "telefon",
    badge: "Telefon (AI)",
    kind: "Ukjent rom",
    room: null,
    text: task.record.message,
    lang: "nb",
    at: task.at || null,
    handler: "Resepsjon",
    status: "venter",
    actionable: true,
    tonight: false,
    reason: `Hotellet har ikke rom ${number}. Ring gjesten tilbake og spør hvilket rom det gjelder.`,
    unknownRoom: number,
    call: task,
  };
}

/** The task *Lag oppgave for resepsjonen* made on Rom: the robot met a guest the booking system doesn't have. */
export function fromRoomCheck(day: string, room: string, mark: RoomCheckMark): RequestView {
  return {
    id: `romsjekk:${day}:${room}`,
    source: "robot",
    badge: "Romsjekk",
    kind: "Sjekk registreringen",
    room,
    text: "Roboten møtte en gjest på rommet, men bookingsystemet har det som ledig.",
    lang: "nb",
    at: mark.at,
    handler: mark.by ? `Resepsjonen · laget av ${mark.by}` : "Resepsjonen",
    status: "venter",
    actionable: true,
    tonight: false,
  };
}

/** A staff-kept status (Ny → Tildelt → Løst) over a request's own: Tildelt is "pågår", Løst "fullført". */
function withStaffStatus(request: RequestView, status: OrderStatus, stamp: RequestStamp | undefined): RequestView {
  if (!request.actionable || status === "ny") return request;
  const robot = request.source === "robot" && !request.badge;
  const handler = robot ? (request.status === "avvist" ? "Personalet ga det likevel" : "Personalet tok over fra roboten") : request.handler;
  return { ...request, status: status === "tildelt" ? "pagar" : "fullfort", handler, ...(stamp ? { stamp } : {}) };
}

/** The Ny → Tildelt → Løst step a row shows now, so the first click on it moves it one step on. */
export function orderStatusOf(request: RequestView): OrderStatus {
  return request.status === "pagar" ? "tildelt" : request.status === "fullfort" ? "lost" : "ny";
}

export function selectRequests({
  night,
  calls,
  statusOf,
  manual = MANUAL_REQUESTS,
  phone = [],
  assignments = {},
  extra = [],
  hotelRooms = null,
  stamps = {},
  declines = null,
}: {
  night: Night | null;
  calls: CallSummary[] | null;
  statusOf: (id: string) => OrderStatus;
  manual?: readonly ManualRequest[];
  /** In-stay requests the AI receptionist took down on the phone (phoneTasks.ts). */
  phone?: readonly PhoneTask[];
  assignments?: Readonly<Record<string, PhoneAssignment>>;
  /** Requests made on other screens (the robot's room checks on Rom). */
  extra?: readonly RequestView[];
  /** Tonight's rooms (`hotelRoomsOf`): a call naming any other room is "Ukjent rom". Null: don't judge. */
  hotelRooms?: ReadonlySet<string> | null;
  /** Who moved each request along here, and when (stamps.ts). */
  stamps?: Readonly<Record<string, RequestStamp>>;
  /** The referee's verdict on each refusal (src/features/nightshift/declines.ts). */
  declines?: DeclineSplit | null;
}): RequestView[] {
  const robot = night
    ? [
        ...[...night.tasks.values()].map((task) => fromTask(task, night.outcomes.get(task.request), night.ended)),
        ...[...night.requests.values()].filter((request) => !night.tasks.has(request.request)).map((request) => fromQueued(request, night.outcomes.get(request.request), night.ended)),
      ]
    : [];
  // A callback that became a phone task (it names a room) is listed once, as the task.
  const asTask = new Set(phone.map((task) => task.id));
  const callbacks = (calls ?? []).filter((call) => call.needsCallback && !asTask.has(`call:${call.id}`)).map(fromCall);
  const known = (task: PhoneTask) => !hotelRooms || hotelRooms.has(task.room);
  const phoneTasks = phone.map((task) =>
    known(task) ? fromPhoneTask(task, assignments[task.id], statusOf(task.id)) : fromUnknownRoom(task),
  );
  const staff = manual.map(fromManual);
  const withDecline = (request: RequestView): RequestView => {
    const check = request.status === "avvist" && request.source === "robot" ? declines?.byRequest.get(request.id.replace(/^robot:/, "")) : undefined;
    return check ? { ...request, decline: { judged: check.judged, kind: check.kind } } : request;
  };
  return [...phoneTasks, ...callbacks, ...extra, ...staff, ...robot.map(withDecline)]
    .map((request) => withStaffStatus(request, statusOf(request.id), stamps[request.id]))
    .sort(byLane);
}

const JUDGED_FIRST: Record<NonNullable<RequestView["decline"]>["judged"], number> = { not_credited: 0, pending: 1, credited: 2 };

/**
 * Lane by lane (REQUEST_LANES); inside one, the newest first (by the night's clock), except: in the phone's group a guest waiting
 * in a room the hotel has (a phone task) before a callback or an unknown room; among the refusals, the one
 * the referee did not approve first (the likeliest to be wrong).
 */
export function byLane(a: RequestView, b: RequestView): number {
  const lane = REQUEST_LANES.indexOf(requestLane(a)) - REQUEST_LANES.indexOf(requestLane(b));
  if (lane !== 0) return lane;
  const phone = Number(Boolean(b.phone)) - Number(Boolean(a.phone));
  if (phone !== 0) return phone;
  if (a.status === "avvist") {
    const judged = (a.decline ? JUDGED_FIRST[a.decline.judged] : 3) - (b.decline ? JUDGED_FIRST[b.decline.judged] : 3);
    if (judged !== 0) return judged;
  }
  return nightOrder(b.at) - nightOrder(a.at);
}

/** "22:10" before "05:55": a night's clock read from noon, so the newest of the night comes first. */
function nightOrder(at: string | null): number {
  const match = at ? /^(\d{1,2}):(\d{2})/.exec(at) : null;
  if (!match) return -1;
  const hour = Number(match[1]);
  return (hour < 12 ? hour + 24 : hour) * 60 + Number(match[2]);
}

export function countRequests(requests: readonly RequestView[]): Record<RequestStatus, number> {
  const counts: Record<RequestStatus, number> = { venter: 0, pagar: 0, fullfort: 0, feilet: 0, avvist: 0, avlyst: 0 };
  for (const request of requests) counts[request.status] += 1;
  return counts;
}

export type RequestTotals = {
  done: number;
  /** Every request but the refused and the called-off ones: read "done av total". */
  total: number;
  /** Waiting for a person: waiting, or the robot handed it back. */
  waiting: number;
  declined: number;
  cancelled: number;
};

/** One definition of "fullført av alle", for Forespørsler and its widget on Oversikt. */
export function requestTotals(requests: readonly RequestView[]): RequestTotals {
  const counts = countRequests(requests);
  return {
    done: counts.fullfort,
    total: requests.length - counts.avvist - counts.avlyst,
    waiting: counts.venter + counts.feilet,
    declined: counts.avvist,
    cancelled: counts.avlyst,
  };
}

/** What needs a person now: waiting, or the robot failed and nobody has taken over. */
export function waiting(requests: readonly RequestView[]): RequestView[] {
  return requests.filter((request) => request.status === "venter" || request.status === "feilet");
}
