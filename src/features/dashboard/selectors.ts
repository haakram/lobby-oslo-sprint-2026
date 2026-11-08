import { BASE_HOTEL, type HotelMap, nodeFloorIn, roomsOf } from "@/features/hotel";
import { nightOutcomes, type Outcome as RequestOutcome, type Tally, type Verdict } from "@/features/nightshift/outcomes";
import type { RunLine } from "@/features/nightshift/runlog";
import { KNOWN_STATUSES, type KnownStatus, type RoomStatus, STATUS_ORDER } from "./labels";

/**
 * Pure selectors for the overview: the hotel's state at a point in the night, read from run log v1
 * (docs/ARCHITECTURE.md § 4.3). `foldNight(lines, upto)` replays the first `upto` lines once; the
 * select* functions shape that snapshot for each panel. No I/O, no clock: the same lines and point
 * always give the same screen, so a replay engine can drive it by moving `upto`.
 */

export type HotelRoom = { id: string; number: string; floor: number };

/** Every room on a map, by floor then number. The map is tonight's (`useHotelMap(lines)`). */
export function roomsOfMap(map: HotelMap): HotelRoom[] {
  return roomsOf(map)
    .map((node) => ({ id: node.id, number: node.id.replace(/^room-/, ""), floor: node.floor }))
    .sort((a, b) => a.floor - b.floor || a.number.localeCompare(b.number, "nb", { numeric: true }));
}

export function floorsOfRooms(rooms: readonly HotelRoom[]): number[] {
  return [...new Set(rooms.map((room) => room.floor))].sort((a, b) => a - b);
}

/** The seed-1 base hotel, for screens with no night loaded yet. */
export const HOTEL_ROOMS: readonly HotelRoom[] = roomsOfMap(BASE_HOTEL);
export const FLOORS: readonly number[] = floorsOfRooms(HOTEL_ROOMS);

export function nodeFloor(node: string | null | undefined, map: HotelMap = BASE_HOTEL): number | null {
  return node ? nodeFloorIn(map, node) : null;
}

export type Outcome = "running" | "done" | "failed";

export type Task = {
  request: string;
  kind: string;
  /** The request as the night manager wrote it (English, from the server). */
  text: string | null;
  room: string | null;
  item: string | null;
  startedAt: string | null;
  endedAt: string | null;
  outcome: Outcome;
  /** How it really ended (src/features/nightshift/outcomes.ts): a "done" the server did not credit is not done. */
  verdict: Verdict;
  /** Why, in Norwegian; null for a plain done. */
  reason: string | null;
};

export type QueuedRequest = { request: string; kind: string; text: string | null; at: string | null };

export type WorkOrder = {
  /** Stable while the log only grows: the line it came from. */
  id: string;
  type: string;
  text: string;
  room: string | null;
  place: string | null;
  request: string | null;
  at: string | null;
  /** A wet-floor sign that the robot later moved to another spill (`sign_moved`): this place has no sign any more. */
  signMoved?: boolean;
};

export type RoomEvent =
  | { kind: "status"; at: string | null; status: KnownStatus; source: string | null }
  | { kind: "task"; at: string | null; request: string }
  | { kind: "work_order"; at: string | null; order: string };

export type Night = {
  /** Epoch seconds of the start line (when the shift was recorded). */
  startedAt: number | null;
  clock: string | null;
  ended: boolean;
  score: number;
  location: string | null;
  battery: number | null;
  hands: string[];
  cart: string[];
  rooms: Map<string, { status: KnownStatus; source: string | null; at: string | null }>;
  roomEvents: Map<string, RoomEvent[]>;
  /** Oldest first. */
  workOrders: WorkOrder[];
  tasks: Map<string, Task>;
  /** Request ids in the order their tasks (re)started. */
  started: string[];
  requests: Map<string, QueuedRequest>;
  /** Done and credited by the server (the tally's `done`). */
  tasksDone: number;
  /** Handed to a person: failed, not credited, or not reached (the tally's `handedBack`). */
  tasksFailed: number;
  /** Every request's verdict, and the night's one set of robot figures. */
  outcomes: Map<string, RequestOutcome>;
  tally: Tally;
};

const STATUS_SET = new Set<string>(KNOWN_STATUSES);

function str(data: Record<string, unknown> | undefined, key: string): string | null {
  const value = data?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function items(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/** Where a `move` ended: `{at}` or, when the shift ended mid-move, `{outcome: {at}}`. */
function movedTo(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const record = result as Record<string, unknown>;
  if (typeof record.at === "string") return record.at;
  return movedTo(record.outcome);
}

function pushEvent(night: Night, room: string, event: RoomEvent) {
  const list = night.roomEvents.get(room);
  if (list) list.push(event);
  else night.roomEvents.set(room, [event]);
}

function attachTask(night: Night, task: Task, at: string | null) {
  if (!task.room) return;
  const events = night.roomEvents.get(task.room) ?? [];
  if (events.some((event) => event.kind === "task" && event.request === task.request)) return;
  pushEvent(night, task.room, { kind: "task", at, request: task.request });
}

/** The night after its first `upto` lines (all of them by default: the 06:00 handover). */
export function foldNight(lines: readonly RunLine[], upto: number = lines.length): Night {
  const night: Night = {
    startedAt: null,
    clock: null,
    ended: false,
    score: 0,
    location: null,
    battery: null,
    hands: [],
    cart: [],
    rooms: new Map(),
    roomEvents: new Map(),
    workOrders: [],
    tasks: new Map(),
    started: [],
    requests: new Map(),
    tasksDone: 0,
    tasksFailed: 0,
    outcomes: new Map(),
    tally: nightOutcomes([]).tally,
  };
  const end = Math.max(0, Math.min(upto, lines.length));

  for (let index = 0; index < end; index += 1) {
    const line = lines[index];
    switch (line.type) {
      case "start":
        night.startedAt ??= line.t ?? null;
        break;
      case "call":
        if (line.clock) night.clock = line.clock;
        if (line.cmd === "move" && line.ok) night.location = movedTo(line.result) ?? night.location;
        break;
      case "state":
        if (line.clock) night.clock = line.clock;
        if (line.location) night.location = line.location;
        if (!night.ended) night.score = line.score;
        if (typeof line.battery === "number") night.battery = line.battery;
        night.hands = items(line.hands);
        night.cart = items(line.cart);
        break;
      case "end":
        night.ended = true;
        night.score = line.score;
        break;
      case "decision":
        foldDecision(night, line.kind, line.data, index);
        break;
    }
  }
  // One reading of how each request ended, the same one every screen counts with.
  const { outcomes, tally } = nightOutcomes(end === lines.length ? lines : lines.slice(0, end));
  night.outcomes = outcomes;
  night.tally = tally;
  night.tasksDone = tally.done;
  night.tasksFailed = tally.handedBack;
  for (const task of night.tasks.values()) {
    const outcome = outcomes.get(task.request);
    if (outcome) {
      task.verdict = outcome.verdict;
      task.reason = outcome.reason;
    }
  }
  return night;
}

function foldDecision(night: Night, kind: string, data: Record<string, unknown> | undefined, index: number) {
  const at = night.clock;
  const request = str(data, "request");
  switch (kind) {
    case "request": {
      if (request) night.requests.set(request, { request, kind: str(data, "kind") ?? "", text: str(data, "text"), at });
      break;
    }
    case "task_start": {
      if (!request) break;
      const task: Task = {
        request,
        kind: str(data, "kind") ?? night.requests.get(request)?.kind ?? "",
        text: night.requests.get(request)?.text ?? null,
        room: str(data, "room"),
        item: str(data, "item"),
        startedAt: at,
        endedAt: null,
        outcome: "running",
        verdict: "running",
        reason: null,
      };
      night.tasks.set(request, task);
      night.started = [...night.started.filter((id) => id !== request), request];
      attachTask(night, task, at);
      break;
    }
    case "task_done":
    case "task_failed": {
      const task = request ? night.tasks.get(request) : undefined;
      if (task) {
        task.outcome = kind === "task_done" ? "done" : "failed";
        task.endedAt = at;
      }
      break;
    }
    case "hypothesis": {
      // A named-guest flow learns the room after the task started.
      const task = request ? night.tasks.get(request) : undefined;
      const room = str(data, "room");
      if (task && !task.room && room) {
        task.room = room;
        attachTask(night, task, at);
      }
      break;
    }
    case "room_status": {
      const room = str(data, "room");
      const status = str(data, "status");
      if (!room || !status || !STATUS_SET.has(status)) break;
      const source = str(data, "source");
      night.rooms.set(room, { status: status as KnownStatus, source, at });
      pushEvent(night, room, { kind: "status", at, status: status as KnownStatus, source });
      break;
    }
    case "sign_moved": {
      // The robot took the sign from an earlier spill to a new one: the old place is wet without a sign again.
      const old = str(data, "old_request");
      const order = old ? night.workOrders.find((entry) => entry.request === old && /varselskilt/i.test(entry.text)) : undefined;
      if (order) order.signMoved = true;
      break;
    }
    case "work_order": {
      const text = str(data, "text");
      if (!text) break;
      const order: WorkOrder = {
        id: `wo-${index}`,
        type: str(data, "type") ?? "annet",
        text,
        room: str(data, "room"),
        place: str(data, "place"),
        request,
        at,
      };
      night.workOrders.push(order);
      if (order.room) pushEvent(night, order.room, { kind: "work_order", at, order: order.id });
      break;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Selectors

const NONE: ReadonlySet<string> = new Set();

export type RoomView = HotelRoom & {
  status: RoomStatus;
  source: string | null;
  statusAt: string | null;
  /** Work orders on this room that staff have not marked Løst. */
  openOrders: number;
  /** Out of order today (an open work order closes it): not sold, whatever the robot saw. */
  closed?: boolean;
  /** Held back by the room check (the robot carried an arriving guest's bags in): taken, never "Klar" on a rack. */
  held?: boolean;
  /**
   * The room check found it empty, but the booking system still holds it (213 on the demo night): not a
   * green Klar until a person confirmed and released it ("Bekreft først"), so the rack's legend counts
   * the same Klare til salg as the figure beside it (jury round 3, the founder juror/the design juror).
   */
  toConfirm?: boolean;
};

/** The rooms with today's closed ones marked, so the rack says "Ute av drift" where the bell says "stengt". */
export function withClosed(rooms: readonly RoomView[], closed: readonly string[]): RoomView[] {
  const set = new Set(closed);
  return rooms.map((room) => (set.has(room.id) ? { ...room, closed: true } : room));
}

/**
 * The rooms the room check held back (rooms/reconcile.ts): the robot found them tidy, but it carried an
 * arriving guest's bags in, so the rack shows them taken ("Holdt tilbake"), never as a green Klar
 * beside the money line that says they are held (jury round 3).
 */
export function withHeld(rooms: readonly RoomView[], held: readonly string[], toConfirm: readonly string[] = []): RoomView[] {
  if (held.length === 0 && toConfirm.length === 0) return rooms as RoomView[];
  const set = new Set(held);
  const confirm = new Set(toConfirm);
  return rooms.map((room) => {
    if (room.status !== "klar") return room;
    if (set.has(room.id)) return { ...room, status: "opptatt", held: true };
    return confirm.has(room.id) ? { ...room, status: "opptatt", toConfirm: true } : room;
  });
}

export function selectRooms(night: Night, resolved: ReadonlySet<string> = NONE, map: HotelMap = BASE_HOTEL): RoomView[] {
  const open = new Map<string, number>();
  for (const order of night.workOrders) {
    if (order.room && !resolved.has(order.id)) open.set(order.room, (open.get(order.room) ?? 0) + 1);
  }
  return roomsOfMap(map).map((room) => {
    const seen = night.rooms.get(room.id);
    return {
      ...room,
      status: seen?.status ?? "ukjent",
      source: seen?.source ?? null,
      statusAt: seen?.at ?? null,
      openOrders: open.get(room.id) ?? 0,
    };
  });
}

export type StatusCounts = Record<RoomStatus, number> & { avvik: number };

export function countRooms(rooms: readonly RoomView[]): StatusCounts {
  const counts = Object.fromEntries(STATUS_ORDER.map((status) => [status, 0])) as StatusCounts;
  counts.avvik = 0;
  for (const room of rooms) {
    counts[room.status] += 1;
    if (room.openOrders > 0) counts.avvik += 1;
  }
  return counts;
}

export type OrderView = WorkOrder & {
  robot: Outcome | null;
  /** The robot's verdict on its own task for it ("declined": it found no order on record). */
  verdict: Verdict | null;
};

/** Newest first, each with how the robot's own task for it went (when it had one). */
export function selectWorkOrders(night: Night): OrderView[] {
  return [...night.workOrders].reverse().map((order) => ({
    ...order,
    robot: (order.request && night.tasks.get(order.request)?.outcome) || null,
    verdict: (order.request && night.outcomes.get(order.request)?.verdict) || null,
  }));
}

export type Kpis = {
  roomsReady: number;
  roomsDirty: number;
  roomsTotal: number;
  ordersOpen: number;
  /** Open orders where a guest is waiting: a complaint, or the robot's own task failed. */
  guestsWaiting: number;
  tasksDone: number;
  tasksFailed: number;
  /** Tasks still running when the night ended (the "feilet" number elsewhere may count these). */
  tasksOpen: number;
  score: number;
};

export function selectKpis(night: Night, resolved: ReadonlySet<string> = NONE, map: HotelMap = BASE_HOTEL): Kpis {
  const rooms = selectRooms(night, NONE, map);
  const open = selectWorkOrders(night).filter((order) => !resolved.has(order.id));
  return {
    roomsReady: rooms.filter((room) => room.status === "klar").length,
    roomsDirty: rooms.filter((room) => room.status === "ma_vaskes").length,
    roomsTotal: rooms.length,
    ordersOpen: open.length,
    guestsWaiting: open.filter((order) => order.verdict !== "declined" && order.verdict !== "cancelled" && (order.type === "gjesteklage" || order.robot === "failed")).length,
    tasksDone: night.tasksDone,
    tasksFailed: night.tasksFailed,
    tasksOpen: night.ended ? [...night.tasks.values()].filter((task) => task.outcome === "running").length : 0,
    score: night.score,
  };
}

export type RobotView = {
  clock: string | null;
  location: string | null;
  floor: number | null;
  battery: number | null;
  hands: string[];
  cart: string[];
  ended: boolean;
  /** The task in progress, if any. */
  current: Task | null;
  /** The most recently finished task. */
  last: Task | null;
  /** Requests received but not started, oldest first. */
  queue: QueuedRequest[];
};

export function selectRobot(night: Night, map: HotelMap = BASE_HOTEL): RobotView {
  const startedTasks = night.started.map((id) => night.tasks.get(id)).filter((task): task is Task => !!task);
  const current = [...startedTasks].reverse().find((task) => task.outcome === "running") ?? null;
  const finished = startedTasks.filter((task) => task.outcome !== "running");
  const last = finished.at(-1) ?? null;
  const queue = [...night.requests.values()].filter((request) => !night.tasks.has(request.request));
  return {
    clock: night.clock,
    location: night.location,
    floor: nodeFloor(night.location, map),
    battery: night.battery,
    hands: night.hands,
    cart: night.cart,
    ended: night.ended,
    current: night.ended ? null : current,
    last: night.ended ? (current ?? last) : last,
    queue: night.ended ? [] : queue,
  };
}

export type RoomNightEntry =
  | { kind: "status"; at: string | null; status: KnownStatus; source: string | null }
  | { kind: "task"; at: string | null; task: Task }
  | { kind: "work_order"; at: string | null; order: WorkOrder };

/** One room's night, in log order: what the robot saw, the tasks for it, the faults on it. */
export function selectRoomNight(night: Night, room: string): RoomNightEntry[] {
  const orders = new Map(night.workOrders.map((order) => [order.id, order]));
  return (night.roomEvents.get(room) ?? []).flatMap((event): RoomNightEntry[] => {
    if (event.kind === "status") return [event];
    if (event.kind === "task") {
      const task = night.tasks.get(event.request);
      return task ? [{ kind: "task", at: event.at, task }] : [];
    }
    const order = orders.get(event.order);
    return order ? [{ kind: "work_order", at: event.at, order }] : [];
  });
}

/** Rooms the cleaners should go to: the robot's room checks said "må vaskes". */
export function selectCleaning(rooms: readonly RoomView[]): string[] {
  return rooms.filter((room) => room.status === "ma_vaskes").map((room) => room.id);
}

/** Ruter with no rooms opens on Dagens renhold: the night's dirty rooms and today's departures (routes/dayRooms.ts). */
export const DAY_ROUND = "/ruter";

/** Ruter takes the rooms in the query string: `/ruter?rom=room-201,room-214`. */
export function cleaningHref(rooms: readonly string[]): string {
  return `/ruter?rom=${rooms.join(",")}`;
}

export type OrderStatus = "ny" | "tildelt" | "lost";

/** Ny → Tildelt → Løst; Løst stays. */
export function nextOrderStatus(status: OrderStatus): OrderStatus {
  return status === "ny" ? "tildelt" : "lost";
}
