import type { CallSummary } from "@/features/dashboard/useReceptionCalls";
import { hhmm } from "@/features/dashboard/format";
import { requestKindLabel } from "@/features/dashboard/labels";
import type { Night, OrderStatus, Task } from "@/features/dashboard/selectors";
import { formatClock } from "@/features/reception/format";
import type { RoomCheckMark } from "@/features/rooms/reconcile";
import type { PhoneAssignment, PhoneTask } from "./phoneTasks";
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

export type RequestStatus = "venter" | "pagar" | "fullfort" | "feilet";

export const REQUEST_STATUS: Record<RequestStatus, { word: string; tone: "neutral" | "accent" | "success" | "danger" | "warning" }> = {
  venter: { word: "Venter", tone: "warning" },
  // The accent is the robot and the one primary action, never a state (DESIGN.md).
  pagar: { word: "Pågår", tone: "neutral" },
  fullfort: { word: "Fullført", tone: "success" },
  feilet: { word: "Feilet", tone: "danger" },
};

export const REQUEST_ORDER: readonly RequestStatus[] = ["venter", "feilet", "pagar", "fullfort"];

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
};

function fromTask(task: Task, ended: boolean): RequestView {
  const status: RequestStatus = task.outcome === "done" ? "fullfort" : task.outcome === "failed" ? "feilet" : ended ? "venter" : "pagar";
  // A person can take over what the robot failed or left open; done and running tasks stay the robot's.
  const needsPerson = status === "venter" || status === "feilet";
  return {
    id: `robot:${task.request}`,
    source: "robot",
    kind: requestKindLabel(task.kind),
    room: task.room,
    text: task.text,
    lang: task.text ? "en" : null,
    at: hhmm(task.startedAt),
    handler: needsPerson ? "Roboten · trenger en person" : "Roboten",
    status,
    actionable: needsPerson,
    tonight: true,
  };
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
  const doneBy = assignment ? (assignment.to === "robot" ? "Roboten" : assignment.who) : null;
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
        ? "Roboten tar den"
        : `${assignment.who} har saken`
      : handled
        ? `${handled.who} ordnet det ${handled.at}`
        : `Forslag: ${task.suggested === "robot" ? "roboten" : task.staff.name}`,
    status: handled && !assignment ? "fullfort" : "venter",
    actionable: true,
    tonight: false,
    phone: task,
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
function withStaffStatus(request: RequestView, status: OrderStatus): RequestView {
  if (!request.actionable || status === "ny") return request;
  const handler = request.source === "robot" && !request.badge ? "Personalet tok over fra roboten" : request.handler;
  return { ...request, status: status === "tildelt" ? "pagar" : "fullfort", handler };
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
}): RequestView[] {
  const robot = night ? [...night.tasks.values()].map((task) => fromTask(task, night.ended)) : [];
  // A callback that became a phone task (it names a room) is listed once, as the task.
  const asTask = new Set(phone.map((task) => task.id));
  const callbacks = (calls ?? []).filter((call) => call.needsCallback && !asTask.has(`call:${call.id}`)).map(fromCall);
  const phoneTasks = phone.map((task) => fromPhoneTask(task, assignments[task.id], statusOf(task.id)));
  const staff = manual.map(fromManual);
  return [...phoneTasks, ...callbacks, ...extra, ...staff, ...robot]
    .map((request) => withStaffStatus(request, statusOf(request.id)))
    // A guest waiting in their room (a phone task) comes first in its group, then the newest.
    .sort(
      (a, b) =>
        REQUEST_ORDER.indexOf(a.status) - REQUEST_ORDER.indexOf(b.status) ||
        Number(Boolean(b.phone)) - Number(Boolean(a.phone)) ||
        (b.at ?? "").localeCompare(a.at ?? ""),
    );
}

export function countRequests(requests: readonly RequestView[]): Record<RequestStatus, number> {
  const counts: Record<RequestStatus, number> = { venter: 0, pagar: 0, fullfort: 0, feilet: 0 };
  for (const request of requests) counts[request.status] += 1;
  return counts;
}

/** What needs a person now: waiting, or the robot failed and nobody has taken over. */
export function waiting(requests: readonly RequestView[]): RequestView[] {
  return requests.filter((request) => request.status === "venter" || request.status === "feilet");
}
