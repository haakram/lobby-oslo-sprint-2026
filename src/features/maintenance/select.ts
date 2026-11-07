import { hhmm } from "@/features/dashboard/format";
import type { OrderStatus, OrderView } from "@/features/dashboard/selectors";
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
};

/** A guest waiting is high; a wet floor or noise is medium; the rest can wait for the day. */
export function priorityOf(order: OrderView): Priority {
  if (order.type === "gjesteklage" || order.robot === "failed") return "hoy";
  if (order.type === "sol" || order.type === "stoy") return "middels";
  return "lav";
}

function fromRobot(order: OrderView, status: OrderStatus, assignee: string | null): WorkOrderView {
  return {
    id: order.id,
    origin: "robot",
    type: order.type,
    text: order.text,
    room: order.room,
    place: order.place,
    priority: priorityOf(order),
    assignee: status === "ny" ? null : assignee,
    at: hhmm(order.at),
    reportedBy: "Roboten",
    status,
    outOfOrder: false,
    robot: order.robot,
  };
}

function fromManual(order: ManualOrder, status: OrderStatus): WorkOrderView {
  // A manual order that already has a name is at least Tildelt.
  const effective: OrderStatus = status === "ny" && order.assignee ? "tildelt" : status;
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
  const robot = (orders ?? []).map((order) => fromRobot(order, statusOf(order.id), assignee));
  const staff = manual.map((order) => fromManual(order, statusOf(order.id)));
  return [...staff, ...robot].sort(
    (a, b) => rankStatus(a.status) - rankStatus(b.status) || PRIORITY[a.priority].rank - PRIORITY[b.priority].rank || (b.at ?? "").localeCompare(a.at ?? ""),
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
