import type { RunLine } from "@/features/nightshift/runlog";
import type { HotelMap } from "./hotelMap";
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

function edgeMetres(map: HotelMap, a: string, b: string): number {
  const edge = map.edges.find((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));
  return edge?.m ?? 0;
}

function minutesBetween(start: string | null, end: string | null): number | null {
  const a = nightSeconds(start);
  const b = nightSeconds(end);
  return a === null || b === null || b < a ? null : Math.round((b - a) / 60);
}

export function robotWalk(lines: readonly RunLine[], map: HotelMap): RobotNight {
  const moves: RobotMove[] = [];
  const tasks: RobotTask[] = [];
  const open = new Map<string, RobotTask>();
  let at: string | null = null;
  let clock: string | null = null;
  let current: RobotTask | null = null;
  const offMap = new Set<string>();

  const close = (task: RobotTask, outcome: RobotTask["outcome"]) => {
    task.outcome = outcome;
    task.end = clock;
    task.minutes = minutesBetween(task.start, task.end);
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
      if (line.cmd !== "move" || !line.ok) continue;
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
      };
      tasks.push(task);
      open.set(request, task);
      current = task;
    } else if (line.kind === "task_done" || line.kind === "task_failed") {
      const task = open.get(request);
      if (task) close(task, line.kind === "task_done" ? "done" : "failed");
    }
  }

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
