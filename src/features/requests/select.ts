import type { CallSummary } from "@/features/dashboard/useReceptionCalls";
import { hhmm } from "@/features/dashboard/format";
import { requestKindLabel } from "@/features/dashboard/labels";
import type { Night, OrderStatus, Task } from "@/features/dashboard/selectors";
import { formatClock } from "@/features/reception/format";
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

/** A staff-kept status (Ny → Tildelt → Løst) over a request's own: Tildelt is "pågår", Løst "fullført". */
function withStaffStatus(request: RequestView, status: OrderStatus): RequestView {
  if (!request.actionable || status === "ny") return request;
  const handler = request.source === "robot" ? "Personalet tok over fra roboten" : request.handler;
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
}: {
  night: Night | null;
  calls: CallSummary[] | null;
  statusOf: (id: string) => OrderStatus;
  manual?: readonly ManualRequest[];
}): RequestView[] {
  const robot = night ? [...night.tasks.values()].map((task) => fromTask(task, night.ended)) : [];
  const phone = (calls ?? []).filter((call) => call.needsCallback).map(fromCall);
  const staff = manual.map(fromManual);
  return [...phone, ...staff, ...robot]
    .map((request) => withStaffStatus(request, statusOf(request.id)))
    .sort((a, b) => REQUEST_ORDER.indexOf(a.status) - REQUEST_ORDER.indexOf(b.status) || (b.at ?? "").localeCompare(a.at ?? ""));
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
