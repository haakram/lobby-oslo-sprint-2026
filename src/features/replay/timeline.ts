import { BASE_HOTEL, type HotelMap, hotelForRun, nodeFloorIn, roomsOf } from "@/features/hotel/mapFromRun";
import type { RunLine } from "@/features/nightshift/runlog";
import { DOCK_NODE, itemName, placeName, roomNumber, taskKindName } from "./hotel";

/**
 * The replay engine: a run log v1 becomes a timeline over sim time (seconds since 22:00), and a
 * timeline answers "what did the hotel look like at time t". Pure functions; the hook in
 * `useHotelReplay.ts` drives the clock.
 */

export const NIGHT_START_SECONDS = 22 * 3600;
export const NIGHT_LENGTH = 8 * 3600;

/** "23:31:07" → seconds since 22:00; the clock wraps past midnight. */
export function clockToSim(clock: string): number {
  const [h = 0, m = 0, s = 0] = clock.split(":").map((part) => Number(part) || 0);
  let sim = h * 3600 + m * 60 + s - NIGHT_START_SECONDS;
  if (sim < 0) sim += 24 * 3600;
  return sim;
}

/** Seconds since 22:00 → "23:31:07". */
export function simToClock(t: number, seconds = true): string {
  const total = (Math.max(0, Math.floor(t)) + NIGHT_START_SECONDS) % (24 * 3600);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const hm = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  return seconds ? `${hm}:${String(s).padStart(2, "0")}` : hm;
}

export type RoomStatus = "klar" | "ma_vaskes" | "opptatt" | "ikke_forstyrr" | "avvik" | "ukjent";

export const ROOM_STATUS_LABEL: Record<RoomStatus, string> = {
  klar: "Klar",
  ma_vaskes: "Må vaskes",
  opptatt: "Opptatt",
  ikke_forstyrr: "Ikke forstyrr",
  avvik: "Avvik",
  ukjent: "Ikke sjekket",
};

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger";

export type Move = { t0: number; t1: number; from: string; to: string };

export type Task = {
  id: string;
  kind: string;
  room: string | null;
  item: string | null;
  /** The guest's words, from the matching `request` decision. */
  text: string;
  start: number;
  end: number | null;
  outcome: "done" | "failed" | null;
  points: number | null;
  note: string | null;
};

export type RoomChange = { t: number; room: string; status: RoomStatus; note: string | null };

export type WorkOrder = {
  id: number;
  t: number;
  clock: string;
  room: string | null;
  place: string | null;
  type: string;
  text: string;
  request: string | null;
};

export type ReplayEvent = {
  id: number;
  t: number;
  clock: string;
  kind: string;
  /** Short Norwegian badge text: "Fullført", "Banket på", … */
  label: string;
  text: string;
  tone: Tone;
  request: string | null;
  /** True for decisions (the agent's choices), false for plain robot actions. */
  decision: boolean;
};

export type CarryChange = { t: number; hands: string[]; cart: string[] | null };
export type StateSample = { t: number; score: number; battery: number | null };

export type Timeline = {
  /** The hotel this night was played in: the seed-1 base shaped by what the log revealed. */
  map: HotelMap;
  shift: string | null;
  mode: string | null;
  seed: number | null;
  /** No `end` line yet: the shift is still running. */
  live: boolean;
  /** Sim seconds at the last line. */
  duration: number;
  finalScore: number;
  requestsServed: number | null;
  startNode: string;
  moves: Move[];
  tasks: Task[];
  roomChanges: RoomChange[];
  workOrders: WorkOrder[];
  events: ReplayEvent[];
  carry: CarryChange[];
  samples: StateSample[];
};

export type TaskView = {
  id: string;
  kind: string;
  kindLabel: string;
  room: string | null;
  item: string | null;
  text: string;
  /** "R-021 · Romservice til 214" */
  title: string;
  since: number;
  outcome: "done" | "failed" | null;
};

export type RobotView = {
  node: string;
  floor: number;
  from: string;
  to: string;
  /** 0..1 along from→to; 1 when standing still. */
  progress: number;
  moving: boolean;
  carrying: string[];
  cart: boolean;
  task: TaskView | null;
  /** The room the robot is working on (its task's room), for a highlight. */
  attention: string | null;
};

export type RoomView = { status: RoomStatus; note: string | null; since: number | null };

export type Snapshot = {
  t: number;
  clock: string;
  score: number;
  battery: number | null;
  robot: RobotView;
  rooms: Record<string, RoomView>;
  workOrders: WorkOrder[];
  /** Newest first, at most 12. */
  recent: ReplayEvent[];
  /** How many of `timeline.events` have happened by `t`. */
  eventCount: number;
  tasksDone: number;
  tasksFailed: number;
  finished: boolean;
};

const MAX_RECENT = 12;
const ELEVATOR_RIDE_SECONDS = 15;
const WALK_METRES_PER_SECOND = 1;

const ROOM_STATUSES = new Set<RoomStatus>(["klar", "ma_vaskes", "opptatt", "ikke_forstyrr", "avvik"]);

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function rec(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
function strList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function taskTitle(id: string, kind: string, room: string | null, item: string | null): string {
  const what = kind === "amenity" && item ? capitalise(itemName(item)) : taskKindName(kind);
  return room ? `${id} · ${what} til ${roomNumber(room)}` : `${id} · ${what}`;
}

function capitalise(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

const WORK_ORDER_TYPES: Record<string, string> = {
  stoy: "Støy",
  sol: "Søl",
  teknisk: "Teknisk",
  gjesteklage: "Gjesteklage",
  annet: "Annet",
};

export function workOrderType(type: string): string {
  return WORK_ORDER_TYPES[type] ?? type;
}

type Described = { label: string; text: string; tone: Tone };

/** What a decision line means, in the shift lead's words. */
function describeDecision(kind: string, data: Record<string, unknown>, requests: Map<string, string>): Described | null {
  const request = str(data.request);
  const note = str(data.note) ?? str(data.text) ?? str(data.reason) ?? "";
  switch (kind) {
    case "request":
      return { label: "Forespørsel", text: note, tone: "neutral" };
    case "task_start":
      return {
        label: "Startet",
        text: taskTitle(request ?? "", str(data.kind) ?? "", str(data.room), str(data.item)).replace(/^ · /, ""),
        tone: "neutral",
      };
    case "task_done": {
      const points = num(data.points);
      return { label: "Fullført", text: `${note}${points ? ` (+${points} p)` : ""}`, tone: "success" };
    }
    case "task_failed": {
      const refused = /do not disturb|did not disturb|did not knock|duplicate|no order/i.test(note);
      return { label: refused ? "Avstått" : "Feilet", text: note, tone: refused ? "warning" : "danger" };
    }
    case "room_status": {
      const status = str(data.status) as RoomStatus | null;
      return {
        label: "Romstatus",
        text: `${placeName(str(data.room))}: ${ROOM_STATUS_LABEL[status && ROOM_STATUSES.has(status) ? status : "ukjent"]}${
          str(data.note) ? ` · ${str(data.note)}` : ""
        }`,
        tone: status === "klar" ? "success" : status === "ikke_forstyrr" ? "warning" : "neutral",
      };
    }
    case "work_order":
      return {
        label: "Arbeidsordre",
        text: `${workOrderType(str(data.type) ?? "annet")} · ${str(data.text) ?? placeName(str(data.room) ?? str(data.place))}`,
        tone: "danger",
      };
    case "hypothesis": {
      const before = num(data.score_before);
      const after = num(data.score_after);
      const gain = before !== null && after !== null ? after - before : null;
      return {
        label: "Hypotese",
        text: `${str(data.id) ?? ""} · ${str(data.action) ?? ""}${gain !== null ? ` (${gain > 0 ? "+" : ""}${gain} p)` : ""}`,
        tone: gain ? "accent" : "neutral",
      };
    }
    case "person":
      return { label: "Gjest", text: str(data.text) ?? "", tone: "neutral" };
    case "keycard_withheld":
      return { label: "Avstått", text: note || "Ga ikke fra seg nøkkelkort", tone: "warning" };
    case "noise_look":
      return { label: "Så etter", text: `${placeName(str(data.at))}: ${str(data.description) ?? ""}`, tone: "neutral" };
    case "asked_room":
      return { label: "Spurte", text: str(data.answer) ?? "", tone: "neutral" };
    case "brain":
      return { label: "Claude", text: note, tone: "accent" };
    case "brain_rejected":
      return { label: "Avvist", text: `${request ?? ""} · ${note}`, tone: "warning" };
    case "task_requeued":
      return { label: "Satt tilbake", text: `${request ?? ""} · ${str(data.error) ?? ""}`, tone: "warning" };
    case "task_given_up":
      return { label: "Ga opp", text: `${request ?? ""} · ${str(data.error) ?? ""}`, tone: "danger" };
    case "stock_cart": {
      const picked = rec(data.picked);
      const items = picked
        ? Object.entries(picked)
            .map(([item, count]) => `${count} × ${itemName(item)}`)
            .join(", ")
        : "";
      return { label: "Fylte trallen", text: items, tone: "neutral" };
    }
    case "wet_floor":
      return data.slipped === true
        ? { label: "Vått gulv", text: `Gled ved ${placeName(strList(data.edge)[1])}`, tone: "warning" }
        : null;
    case "scan":
      return null;
    case "plan":
    case "note":
      return { label: kind === "plan" ? "Plan" : "Notat", text: note, tone: "neutral" };
    default: {
      const detail = note || (request ? (requests.get(request) ?? "") : "");
      return { label: capitalise(kind.replace(/_/g, " ")), text: detail, tone: "neutral" };
    }
  }
}

/** Node ids inside free text ("room-319", "corridor-1b") in the hotel's own words. */
export function humanise(text: string): string {
  return text
    .replace(/\broom-(\d+)\b/g, "rom $1")
    .replace(/\bcorridor-(\w+)\b/g, "korridor $1")
    .replace(/\belevator-(\d)\b/g, "heis $1")
    .replace(/\bstairwell-(\d)\b/g, "trapp $1")
    .replace(/\bkitchen-pass\b/g, "kjøkkenluka")
    .replace(/\bcharging-dock\b/g, "ladestasjonen")
    .replace(/\bfront-desk\b/g, "resepsjonen")
    .replace(/\blobby-bar\b/g, "baren")
    .replace(/\bstaff-room\b/g, "personalrommet");
}

/** What a robot action means. Only the actions worth a line in the feed. */
function describeCall(cmd: string, args: Record<string, unknown>, ok: boolean, result: unknown, node: string | null): Described | null {
  const text = str(result) ?? "";
  if (!ok) {
    return { label: "Gikk ikke", text: `${cmd}: ${text}`, tone: "danger" };
  }
  switch (cmd) {
    case "knock":
      return { label: "Banket på", text: `${placeName(str(args.door))} · ${text}`, tone: "neutral" };
    case "place": {
      const where = str(args.where) ?? node;
      return {
        label: "La igjen",
        text: `${itemName(str(args.item))}${where ? ` ${str(args.where) ? "i" : "ved"} ${placeName(where).toLowerCase()}` : ""}`,
        tone: "neutral",
      };
    }
    case "pick":
      return { label: "Plukket", text: itemName(str(args.item)), tone: "neutral" };
    case "say": {
      const heard = rec(result) ? strList(rec(result)?.heard).join(" ") : "";
      return { label: "Sa", text: `«${str(args.text) ?? ""}»${heard ? ` · ${heard}` : ""}`, tone: "neutral" };
    }
    case "call_elevator":
      return { label: "Heis", text: `Tok heisen til ${num(args.floor) ?? "?"}. etasje`, tone: "neutral" };
    case "dock":
      return { label: "Ladet", text, tone: "neutral" };
    case "use": {
      const item = str(args.item);
      if (item === "keycard") return { label: "Nøkkelkort", text: `${placeName(str(args.on))} · ${text}`, tone: "neutral" };
      if (item === "cart") return { label: "Tralle", text: "Tok med trallen", tone: "neutral" };
      return { label: "Brukte", text: `${itemName(item)} · ${text}`, tone: "neutral" };
    }
    case "ask":
      return { label: "Spurte", text: `${str(args.question) ?? ""} · ${str(rec(result)?.answer) ?? ""}`, tone: "neutral" };
    case "report": {
      const outcome = str(args.outcome);
      return {
        label: "Rapporterte",
        text: `${str(args.request) ?? ""} ${outcome === "done" ? "utført" : outcome === "failed" ? "ikke utført" : (outcome ?? "")}`,
        tone: "neutral",
      };
    }
    default:
      return null;
  }
}

/** The arrival node of a successful `move`, whatever shape the server answered with. */
function moveTarget(args: Record<string, unknown> | null, result: unknown): string | null {
  const r = rec(result);
  return str(r?.at) ?? str(rec(r?.outcome)?.at) ?? str(args?.to) ?? null;
}

export function buildTimeline(lines: readonly RunLine[]): Timeline {
  const map = hotelForRun(lines);
  const timeline: Timeline = {
    map,
    shift: null,
    mode: null,
    seed: null,
    live: true,
    duration: 0,
    finalScore: 0,
    requestsServed: null,
    startNode: DOCK_NODE,
    moves: [],
    tasks: [],
    roomChanges: [],
    workOrders: [],
    events: [],
    carry: [],
    samples: [],
  };
  const requests = new Map<string, string>();
  const openTasks = new Map<string, Task>();
  let node: string | null = null;
  let lastT = 0;
  let hands: string[] = [];
  let cart: string[] | null = null;
  let lastScore = 0;

  const pushEvent = (t: number, kind: string, described: Described, request: string | null, decision: boolean) => {
    timeline.events.push({
      id: timeline.events.length,
      t,
      clock: simToClock(t),
      kind,
      label: described.label,
      text: humanise(described.text),
      tone: described.tone,
      request,
      decision,
    });
  };

  const arrive = (t1: number, to: string, metres: number | null) => {
    if (!map.nodes[to]) return;
    if (node === null) {
      node = to;
      timeline.startNode = to;
      return;
    }
    if (to === node) return;
    const sameFloor = nodeFloorIn(map, node) === nodeFloorIn(map, to);
    const travel = metres !== null ? metres / WALK_METRES_PER_SECOND : sameFloor ? 0 : ELEVATOR_RIDE_SECONDS;
    const t0 = Math.max(lastT, t1 - travel);
    timeline.moves.push({ t0: Math.min(t0, t1), t1, from: node, to });
    node = to;
  };

  const carryChanged = (t: number) => {
    timeline.carry.push({ t, hands: [...hands], cart: cart ? [...cart] : null });
  };

  for (const line of lines) {
    switch (line.type) {
      case "start":
        timeline.shift = line.shift;
        timeline.mode = line.mode;
        timeline.seed = line.seed ?? null;
        break;

      case "call": {
        const t = line.clock ? clockToSim(line.clock) : lastT;
        const args = rec(line.args);
        const result = rec(line.result);
        if (line.cmd === "status" && line.ok && result) {
          const location = str(result.location);
          if (location) arrive(t, location, null);
          const score = num(result.score);
          if (score !== null) lastScore = score;
        }
        if (line.cmd === "move" && line.ok) {
          const to = moveTarget(args, line.result);
          if (to) arrive(t, to, num(result?.metres));
        }
        if (line.ok && line.cmd === "pick" && args) {
          const item = str(args.item);
          if (item) {
            if (/in the cart/i.test(str(line.result) ?? "")) cart = [...(cart ?? []), item];
            else hands = [...hands, item];
            carryChanged(t);
          }
        }
        if (line.ok && line.cmd === "place" && args) {
          const item = str(args.item);
          if (item) {
            const inHands = hands.indexOf(item);
            if (inHands >= 0) hands = hands.filter((_, index) => index !== inHands);
            else if (cart) {
              const inCart = cart.indexOf(item);
              if (inCart >= 0) cart = cart.filter((_, index) => index !== inCart);
            }
            carryChanged(t);
          }
        }
        if (line.ok && line.cmd === "use" && str(args?.item) === "cart" && cart === null) {
          cart = [];
          carryChanged(t);
        }
        const described = describeCall(line.cmd, args ?? {}, line.ok, line.result, node);
        if (described) pushEvent(t, `call:${line.cmd}`, described, str(args?.request), false);
        lastT = Math.max(lastT, t);
        break;
      }

      case "state": {
        const t = line.clock ? clockToSim(line.clock) : lastT;
        if (line.location) arrive(t, line.location, null);
        if (line.hands !== undefined || line.cart !== undefined) {
          const nextHands = strList(line.hands);
          const nextCart: string[] | null = line.cart == null ? cart : strList(line.cart);
          if (nextHands.join() !== hands.join() || (nextCart?.join() ?? null) !== (cart?.join() ?? null)) {
            hands = nextHands;
            cart = nextCart;
            carryChanged(t);
          }
        }
        lastScore = line.score;
        timeline.samples.push({ t, score: line.score, battery: line.battery ?? null });
        lastT = Math.max(lastT, t);
        break;
      }

      case "decision": {
        const t = lastT;
        const data = line.data ?? {};
        const request = str(data.request);
        if (line.kind === "request" && request) requests.set(request, str(data.text) ?? "");
        if (line.kind === "task_start" && request) {
          const task: Task = {
            id: request,
            kind: str(data.kind) ?? "",
            room: str(data.room),
            item: str(data.item),
            text: requests.get(request) ?? "",
            start: t,
            end: null,
            outcome: null,
            points: null,
            note: null,
          };
          openTasks.set(request, task);
          timeline.tasks.push(task);
        }
        if ((line.kind === "task_done" || line.kind === "task_failed") && request) {
          const task = openTasks.get(request);
          if (task) {
            task.end = t;
            task.outcome = line.kind === "task_done" ? "done" : "failed";
            task.points = num(data.points);
            task.note = str(data.note);
            openTasks.delete(request);
          }
        }
        if (line.kind === "room_status") {
          const room = str(data.room);
          const status = str(data.status) as RoomStatus | null;
          if (room && status && ROOM_STATUSES.has(status)) {
            timeline.roomChanges.push({ t, room, status, note: str(data.note) });
          }
        }
        if (line.kind === "work_order") {
          const room = str(data.room);
          timeline.workOrders.push({
            id: timeline.workOrders.length,
            t,
            clock: simToClock(t),
            room,
            place: str(data.place),
            type: str(data.type) ?? "annet",
            text: humanise(str(data.text) ?? ""),
            request,
          });
          if (room && map.nodes[room]) timeline.roomChanges.push({ t, room, status: "avvik", note: str(data.text) });
        }
        const described = describeDecision(line.kind, data, requests);
        if (described) pushEvent(t, line.kind, described, request, true);
        break;
      }

      case "end":
        timeline.live = false;
        timeline.finalScore = line.score;
        timeline.requestsServed = line.requests_served ?? null;
        lastScore = line.score;
        break;
    }
  }

  // A task still open when the log ends: in a live shift it is running; in a finished one it never
  // reported, which the screen shows as "failed".
  for (const task of openTasks.values()) {
    if (!timeline.live) {
      task.end = lastT;
      task.outcome = "failed";
      task.note = "Skiftet tok slutt";
    }
  }

  timeline.duration = lastT;
  if (timeline.live) timeline.finalScore = lastScore;
  return timeline;
}

/** Index of the last entry whose `key` is ≤ t, or −1. `items` must be sorted by `key`. */
function lastAtOrBefore<T>(items: readonly T[], t: number, key: (item: T) => number): number {
  let lo = 0;
  let hi = items.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (key(items[mid]) <= t) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

const moveStart = (move: Move) => move.t0;
const eventTime = (event: ReplayEvent) => event.t;
const changeTime = (change: { t: number }) => change.t;

export type RobotPose = { from: string; to: string; progress: number; node: string; floor: number; moving: boolean };

/**
 * Where the robot is at `t`, cheap enough for every frame: writes into `out` and allocates nothing.
 */
export function robotPoseAt(timeline: Timeline, t: number, out: RobotPose): RobotPose {
  const index = lastAtOrBefore(timeline.moves, t, moveStart);
  if (index < 0) {
    out.from = out.to = out.node = timeline.startNode;
    out.progress = 1;
    out.moving = false;
    out.floor = nodeFloorIn(timeline.map, timeline.startNode);
    return out;
  }
  const move = timeline.moves[index];
  out.from = move.from;
  out.to = move.to;
  if (t >= move.t1 || move.t1 <= move.t0) {
    out.progress = 1;
    out.moving = false;
    out.node = move.to;
  } else {
    out.progress = (t - move.t0) / (move.t1 - move.t0);
    out.moving = true;
    out.node = out.progress < 0.5 ? move.from : move.to;
  }
  out.floor = nodeFloorIn(timeline.map, out.node);
  return out;
}

function taskView(task: Task): TaskView {
  return {
    id: task.id,
    kind: task.kind,
    kindLabel: taskKindName(task.kind),
    room: task.room,
    item: task.item,
    text: task.text,
    title: taskTitle(task.id, task.kind, task.room, task.item),
    since: task.start,
    outcome: task.outcome,
  };
}

/** The task running at `t`: started at or before `t` and not ended yet (or ended at `t` itself). */
export function taskAt(timeline: Timeline, t: number): Task | null {
  let current: Task | null = null;
  for (const task of timeline.tasks) {
    if (task.start > t) break;
    if (task.end === null || task.end > t || (task.end === t && task.start === t)) current = task;
  }
  return current;
}

export function snapshotAt(timeline: Timeline, t: number): Snapshot {
  const pose = robotPoseAt(timeline, t, { from: "", to: "", progress: 1, node: "", floor: 1, moving: false });

  const sampleIndex = lastAtOrBefore(timeline.samples, t, changeTime);
  const sample = sampleIndex >= 0 ? timeline.samples[sampleIndex] : null;
  const finished = !timeline.live && t >= timeline.duration;
  const score = finished ? timeline.finalScore : (sample?.score ?? 0);

  const carryIndex = lastAtOrBefore(timeline.carry, t, changeTime);
  const carry = carryIndex >= 0 ? timeline.carry[carryIndex] : null;

  const rooms: Record<string, RoomView> = {};
  for (const room of roomsOf(timeline.map ?? BASE_HOTEL)) rooms[room.id] = { status: "ukjent", note: null, since: null };
  for (const change of timeline.roomChanges) {
    if (change.t > t) break;
    rooms[change.room] = { status: change.status, note: change.note, since: change.t };
  }

  const eventCount = lastAtOrBefore(timeline.events, t, eventTime) + 1;
  const recent = timeline.events.slice(Math.max(0, eventCount - MAX_RECENT), eventCount).reverse();

  let tasksDone = 0;
  let tasksFailed = 0;
  for (const task of timeline.tasks) {
    if (task.end !== null && task.end <= t) {
      if (task.outcome === "done") tasksDone += 1;
      else tasksFailed += 1;
    }
  }

  const task = taskAt(timeline, t);
  const workOrders = timeline.workOrders.filter((order) => order.t <= t);

  return {
    t,
    clock: simToClock(t),
    score,
    battery: sample?.battery ?? null,
    robot: {
      node: pose.node,
      floor: pose.floor,
      from: pose.from,
      to: pose.to,
      progress: pose.progress,
      moving: pose.moving,
      carrying: [...(carry?.hands ?? []), ...(carry?.cart ?? [])],
      cart: carry?.cart !== null && carry?.cart !== undefined,
      task: task ? taskView(task) : null,
      attention: task?.room ?? null,
    },
    rooms,
    workOrders,
    recent,
    eventCount,
    tasksDone,
    tasksFailed,
    finished,
  };
}
