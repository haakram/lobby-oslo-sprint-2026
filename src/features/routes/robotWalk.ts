import { itemLabel, placeLabel } from "@/features/dashboard/labels";
import type { RunLine } from "@/features/nightshift/runlog";
import type { HotelGraph } from "./hotelMap";
import { nightSeconds } from "./nightRooms";

// Where the robot actually went tonight, from run log v1: every successful `move` call, cut into
// the tasks it served (task_start … task_done / task_failed) and the walks between them.

export type RobotMove = {
  from: string;
  to: string;
  metres: number;
  clock: string | null;
  /** A ride from one elevator to another floor's. */
  ride: boolean;
  /** The request it was part of, or null for a walk between tasks. */
  request: string | null;
};

/** One stop on a task's walk: where the robot did something, or an elevator ride. */
export type TaskStep = {
  node: string;
  /** What the robot did there, in staff words, in order ("hent brett til 104", "melder fullført"). */
  actions: string[];
  /** An elevator ride between two floors; `node` is the elevator it got out at. */
  ride: { from: number; to: number } | null;
  /** Walked since the step before (or the task's start). */
  metres: number;
  /** Sim seconds since the step before; null without clocks. */
  seconds: number | null;
  clock: string | null;
  /** The nodes walked from the step before to here, both ends included. */
  path: string[];
};

export type RobotTask = {
  request: string;
  kind: string;
  room: string | null;
  outcome: "done" | "failed" | "open";
  start: string | null;
  end: string | null;
  metres: number;
  rides: number;
  /** Sim minutes from task_start to its result; null without clocks. */
  minutes: number | null;
  path: string[];
  /** Where the robot stood when the task started. */
  origin: string | null;
  /** The stops along the walk, in order. */
  steps: TaskStep[];
};

export type RobotNight = {
  moves: RobotMove[];
  tasks: RobotTask[];
  metres: number;
  rides: number;
  between: { metres: number; rides: number };
  /** Places the robot went that the map doesn't have: counted in the metres, not drawn. */
  offMap: string[];
};

const TASK_KIND: Record<string, string> = {
  amenity: "Utstyr til rom",
  lost_item: "Hittegods",
  message: "Beskjed",
  tray: "Romservice",
  room_check: "Romsjekk",
  bags: "Bagasje",
  followup: "Purring",
  noise: "Støyklage",
  spill: "Søl",
};

export const taskKindLabel = (kind: string) => TASK_KIND[kind] ?? kind;

const str = (v: unknown) => (typeof v === "string" ? v : null);
const rec = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : null);

/** Where a move ended: the server's `at`, its `outcome.at` (shift over), else where it was sent. */
function arrivedAt(args: unknown, result: unknown): string | null {
  const r = rec(result);
  return str(r?.at) ?? str(rec(r?.outcome)?.at) ?? str(rec(args)?.to);
}

function edgeMetres(map: HotelGraph, a: string, b: string): number {
  const edge = map.edges.find((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));
  return edge?.m ?? 0;
}

function secondsBetween(start: string | null, end: string | null): number | null {
  const a = nightSeconds(start);
  const b = nightSeconds(end);
  return a === null || b === null || b < a ? null : b - a;
}

function minutesBetween(start: string | null, end: string | null): number | null {
  const seconds = secondsBetween(start, end);
  return seconds === null ? null : Math.round(seconds / 60);
}

const lower = (node: string) => placeLabel(node).toLowerCase();

/** A call that does something at a place, said as staff would; null for calls that don't (look around, status). */
export function actionText(cmd: string, args: unknown): string | null {
  const a = rec(args);
  const item = str(a?.item);
  switch (cmd) {
    case "pick":
      return item ? `hent ${itemLabel(item)}` : "hent";
    case "place":
      return item ? `${str(a?.where) ? "lever" : "sett ut"} ${itemLabel(item)}` : "lever";
    case "use": {
      const on = str(a?.on);
      return on ? `lås opp ${lower(on)}` : item ? `bruk ${itemLabel(item)}` : null;
    }
    case "knock": {
      const door = str(a?.door);
      return door ? `bank på ${lower(door)}` : "bank på";
    }
    case "look": {
      const at = str(a?.at);
      return at ? `se på ${lower(at)}` : null;
    }
    case "scan":
      return "se etter gjenstander";
    case "say":
      return "snakk med gjesten";
    case "ask":
      return str(a?.person) === "clerk" ? "spør resepsjonen" : "spør";
    case "report":
      return str(a?.outcome) === "done" ? "meld fullført" : str(a?.outcome) === "failed" ? "meld feilet" : "meld fra";
    default:
      return null;
  }
}

export function robotWalk(lines: readonly RunLine[], map: HotelGraph): RobotNight {
  const moves: RobotMove[] = [];
  const tasks: RobotTask[] = [];
  const open = new Map<string, RobotTask>();
  let at: string | null = null;
  let clock: string | null = null;
  let current: RobotTask | null = null;
  const offMap = new Set<string>();
  // The current task's walk since its last step.
  let pending: { path: string[]; metres: number } = { path: [], metres: 0 };
  let stepClock: string | null = null;

  const pushStep = (task: RobotTask, node: string, actions: string[], ride: TaskStep["ride"]) => {
    task.steps.push({
      node,
      actions,
      ride,
      metres: Math.round(pending.metres),
      seconds: secondsBetween(stepClock, clock),
      clock,
      path: pending.path.length ? pending.path : [node],
    });
    pending = { path: [], metres: 0 };
    stepClock = clock;
  };

  const close = (task: RobotTask, outcome: RobotTask["outcome"]) => {
    task.outcome = outcome;
    task.end = clock;
    task.minutes = minutesBetween(task.start, task.end);
    // A walk after the last thing it did still ends somewhere: that is the last stop.
    if (current === task && pending.path.length > 1) pushStep(task, pending.path.at(-1)!, [], null);
    open.delete(task.request);
    if (current === task) current = null;
  };

  for (const line of lines) {
    if (line.type === "state") {
      if (line.clock) clock = line.clock;
      if (line.location) at = line.location;
      continue;
    }
    if (line.type === "call") {
      if (line.clock) clock = line.clock;
      if (line.cmd === "status") at = str(rec(line.result)?.location) ?? at;
      if (line.cmd !== "move") {
        const text = line.ok && current && at ? actionText(line.cmd, line.args) : null;
        if (current && at && text) {
          const last = current.steps.at(-1);
          // Several things done at one place, with no walk between, are one stop.
          if (last && !last.ride && last.node === at && pending.path.length <= 1) last.actions.push(text);
          else pushStep(current, at, [text], null);
        }
        continue;
      }
      if (!line.ok) continue;
      const to = arrivedAt(line.args, line.result);
      if (!to) continue;
      if (!map.nodes[to]) offMap.add(to);
      if (at && at !== to) {
        const a = map.nodes[at];
        const b = map.nodes[to];
        const ride = a?.kind === "elevator" && b?.kind === "elevator" && a.floor !== b.floor;
        const reported = rec(line.result)?.metres;
        const metres = ride ? 0 : typeof reported === "number" && reported >= 0 ? reported : edgeMetres(map, at, to);
        const move: RobotMove = { from: at, to, metres, clock, ride, request: current?.request ?? null };
        moves.push(move);
        if (current) {
          current.metres += metres;
          if (ride) current.rides += 1;
          if (current.path.at(-1) !== at) current.path.push(at);
          current.path.push(to);
          if (pending.path.at(-1) !== at) pending.path.push(at);
          pending.path.push(to);
          pending.metres += metres;
          if (ride && a && b) pushStep(current, to, [`heis til ${b.floor}. etasje`], { from: a.floor, to: b.floor });
        }
      }
      at = to;
      continue;
    }
    if (line.type !== "decision" || !line.data) continue;
    const request = str(line.data.request);
    if (!request) continue;
    if (line.kind === "task_start") {
      if (current) close(current, "open");
      const task: RobotTask = {
        request,
        kind: str(line.data.kind) ?? "annet",
        room: str(line.data.room),
        outcome: "open",
        start: clock,
        end: null,
        metres: 0,
        rides: 0,
        minutes: null,
        path: [],
        origin: at,
        steps: [],
      };
      tasks.push(task);
      open.set(request, task);
      current = task;
      pending = { path: [], metres: 0 };
      stepClock = clock;
    } else if (line.kind === "task_done" || line.kind === "task_failed") {
      const task = open.get(request);
      if (task) close(task, line.kind === "task_done" ? "done" : "failed");
    }
  }

  // A task still open when the log ends: its last walk still ends somewhere.
  if (current && pending.path.length > 1) pushStep(current, pending.path.at(-1)!, [], null);

  const sum = (list: RobotMove[], pick: (m: RobotMove) => number) => list.reduce((s, m) => s + pick(m), 0);
  const between = moves.filter((m) => m.request === null);
  return {
    moves,
    tasks,
    metres: Math.round(sum(moves, (m) => m.metres)),
    rides: moves.filter((m) => m.ride).length,
    between: { metres: Math.round(sum(between, (m) => m.metres)), rides: between.filter((m) => m.ride).length },
    offMap: [...offMap].sort(),
  };
}

export type KindTotal = { kind: string; label: string; tasks: number; metres: number; rides: number; minutes: number };

/** Tasks grouped by kind, most metres first: where the night's walking went. */
export function totalsByKind(tasks: readonly RobotTask[]): KindTotal[] {
  const byKind = new Map<string, KindTotal>();
  for (const t of tasks) {
    const total = byKind.get(t.kind) ?? { kind: t.kind, label: taskKindLabel(t.kind), tasks: 0, metres: 0, rides: 0, minutes: 0 };
    total.tasks += 1;
    total.metres += t.metres;
    total.rides += t.rides;
    total.minutes += t.minutes ?? 0;
    byKind.set(t.kind, total);
  }
  return [...byKind.values()]
    .map((t) => ({ ...t, metres: Math.round(t.metres) }))
    .sort((a, b) => b.metres - a.metres || a.label.localeCompare(b.label));
}
