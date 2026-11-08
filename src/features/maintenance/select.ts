import { hhmm } from "@/features/dashboard/format";
import type { OrderStatus, OrderView } from "@/features/dashboard/selectors";
import { HANDED_BACK } from "@/features/nightshift/outcomes";
import { type ManualOrder, MANUAL_ORDERS, type Priority } from "./testData";

/**
 * Work orders from both sources in one shape: the robot's overnight findings (run log) and the
 * ones staff reported (test data until the maintenance system is connected).
 */

export const PRIORITY: Record<Priority, { word: string; tone: "danger" | "warning" | "neutral"; rank: number }> = {
  hoy: { word: "Høy", tone: "danger", rank: 0 },
  middels: { word: "Middels", tone: "warning", rank: 1 },
  lav: { word: "Lav", tone: "neutral", rank: 2 },
};

export type OrderOrigin = "robot" | "personale";

export type WorkOrderView = {
  id: string;
  origin: OrderOrigin;
  type: string;
  text: string;
  room: string | null;
  place: string | null;
  priority: Priority;
  assignee: string | null;
  at: string | null;
  reportedBy: string;
  /** Ny → Tildelt → Løst, kept by staff. */
  status: OrderStatus;
  outOfOrder: boolean;
  /** For the robot's orders: how its own task went. */
  robot: OrderView["robot"];
  /** A wet floor the robot found and nobody has put a sign on yet: safety first, at the top and in the bell. */
  safety?: boolean;
};

/**
 * Safety first: a wet floor without a sign is high. A guest waiting is high, but not a complaint the
 * robot checked and found no order for ("bestilt X kom aldri" with nothing on record), and not a
 * request the night manager called off. A signed spill or noise is medium; the rest can wait.
 */
export function priorityOf(order: OrderView, unsigned = false): Priority {
  if (unsigned) return "hoy";
  if (order.verdict === "declined" || order.verdict === "cancelled") return "lav";
  if (order.type === "gjesteklage" || (order.verdict ? HANDED_BACK.has(order.verdict) : order.robot === "failed")) return "hoy";
  if (order.type === "sol" || order.type === "stoy") return "middels";
  return "lav";
}

/** "Vått gulv ved corridor-2b" with no "varselskilt satt ut" at the same place after it. `orders` newest first. */
export function unsignedWetFloors(orders: readonly OrderView[]): Set<string> {
  const unsigned = new Set<string>();
  orders.forEach((order, index) => {
    if (order.type !== "sol" || order.request || !order.place || /varselskilt/i.test(order.text)) return;
    const signedAfter = orders.slice(0, index).some((later) => later.type === "sol" && later.place === order.place && /varselskilt/i.test(later.text));
    if (!signedAfter) unsigned.add(order.id);
  });
  return unsigned;
}

function fromRobot(order: OrderView, status: OrderStatus, assignee: string | null, unsigned: boolean): WorkOrderView {
  const refused = order.verdict === "declined";
  return {
    id: order.id,
    origin: "robot",
    type: order.type,
    // The robot wrote the complaint before it checked; say what the check found.
    text: refused ? `${order.text}. Roboten sjekket: ingen bestilling registrert` : unsigned ? `${order.text}, uten skilt` : order.text,
    room: order.room,
    place: order.place,
    priority: priorityOf(order, unsigned),
    assignee: status === "ny" ? null : assignee,
    at: hhmm(order.at),
    reportedBy: "Roboten",
    status,
    outOfOrder: false,
    robot: order.robot,
    safety: unsigned,
  };
}

function fromManual(order: ManualOrder, status: OrderStatus): WorkOrderView {
  // A manual order that already has a name is at least Tildelt; one fixed already comes in as Løst.
  const effective: OrderStatus = status !== "ny" ? status : order.resolvedAt ? "lost" : order.assignee ? "tildelt" : "ny";
  return {
    id: order.id,
    origin: "personale",
    type: order.type,
    text: order.text,
    room: order.room,
    place: order.place,
    priority: order.priority,
    assignee: order.assignee,
    at: order.at,
    reportedBy: order.reportedBy,
    status: effective,
    outOfOrder: order.outOfOrder ?? false,
    robot: null,
  };
}

const ENGLISH = /\b(?:the|is|are|was|nobody|here|there|and|with|not|please|floor|unmade)\b/i;

/**
 * A robot finding is "what: what it saw". The second half is the robot's own words, sometimes
 * English: then it is quoted apart (DESIGN.md "Voice"), never read out as Norwegian.
 */
export function splitNote(text: string): { lead: string; quote: string | null } {
  const at = text.indexOf(": ");
  if (at < 0) return { lead: text, quote: null };
  const rest = text.slice(at + 2);
  return ENGLISH.test(rest) ? { lead: text.slice(0, at), quote: rest } : { lead: text, quote: null };
}

export function selectMaintenance({
  orders,
  statusOf,
  assignee,
  manual = MANUAL_ORDERS,
}: {
  /** The robot's orders, newest first (useNight). */
  orders: OrderView[] | null;
  statusOf: (id: string) => OrderStatus;
  /** Who a newly assigned robot order goes to (the maintenance person on shift). */
  assignee: string | null;
  manual?: readonly ManualOrder[];
}): WorkOrderView[] {
  const wet = unsignedWetFloors(orders ?? []);
  const robot = (orders ?? []).map((order) => fromRobot(order, statusOf(order.id), assignee, wet.has(order.id)));
  const staff = manual.map((order) => fromManual(order, statusOf(order.id)));
  return [...staff, ...robot].sort(
    (a, b) =>
      rankStatus(a.status) - rankStatus(b.status) ||
      Number(Boolean(b.safety)) - Number(Boolean(a.safety)) ||
      PRIORITY[a.priority].rank - PRIORITY[b.priority].rank ||
      (b.at ?? "").localeCompare(a.at ?? ""),
  );
}

function rankStatus(status: OrderStatus): number {
  return status === "lost" ? 1 : 0;
}

export type MaintenanceCounts = { open: number; high: number; assigned: number; resolved: number; outOfOrder: number };

export function countMaintenance(orders: readonly WorkOrderView[]): MaintenanceCounts {
  const open = orders.filter((order) => order.status !== "lost");
  return {
    open: open.length,
    high: open.filter((order) => order.priority === "hoy").length,
    assigned: open.filter((order) => order.status === "tildelt").length,
    resolved: orders.length - open.length,
    outOfOrder: open.filter((order) => order.outOfOrder).length,
  };
}

/** Rooms that can't be sold: an unresolved order marked out of order. */
export function outOfOrderRooms(orders: readonly WorkOrderView[]): string[] {
  return orders.filter((order) => order.outOfOrder && order.status !== "lost" && order.room).map((order) => order.room as string);
}
