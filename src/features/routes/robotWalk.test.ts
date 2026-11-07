import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseRunLog, parseRunValues } from "@/features/nightshift/runlog";
import { BASE_HOTEL } from "@/features/hotel";
import { robotWalk, totalsByKind } from "./robotWalk";

const map = BASE_HOTEL;

const state = (clock: string, location: string) => ({ v: 1, type: "state", clock, location, score: 0 });
const move = (clock: string, to: string, result: unknown, ok = true) => ({
  v: 1,
  type: "call",
  cmd: "move",
  args: { to },
  ok,
  clock,
  result,
});
const decision = (kind: string, data: Record<string, unknown>) => ({ v: 1, type: "decision", kind, data });

const NIGHT = parseRunValues([
  state("22:00:00", "charging-dock"),
  move("22:00:08", "lobby", { at: "lobby", metres: 8 }),
  decision("task_start", { request: "R-001", kind: "amenity", room: "room-201", item: "towel" }),
  move("22:00:14", "elevator-1", { at: "elevator-1", metres: 6 }),
  { v: 1, type: "call", cmd: "call_elevator", args: { floor: 2 }, ok: true, clock: "22:00:59", result: "Ding." },
  move("22:01:14", "elevator-2", { at: "elevator-2" }),
  move("22:01:18", "corridor-2a", { at: "corridor-2a", metres: 4 }),
  move("22:01:20", "room-999", { error: "no such place" }, false),
  move("22:01:25", "room-201", { at: "room-201" }), // no metres reported: the map's edge (4 m)
  decision("task_done", { request: "R-001", status: "done", points: 23 }),
  move("22:01:30", "corridor-2a", { at: "corridor-2a", metres: 4 }),
  decision("task_start", { request: "R-002", kind: "tray", room: "room-104" }),
  move("22:20:00", "elevator-2", { outcome: { at: "elevator-2" }, shift_over: true }),
  decision("task_failed", { request: "R-002", status: "failed" }),
]).lines;

describe("robotWalk", () => {
  it("follows every successful move and cuts the night into tasks and walks between them", () => {
    const night = robotWalk(NIGHT, map);
    expect(night.moves.map((m) => [m.from, m.to, m.metres, m.request])).toEqual([
      ["charging-dock", "lobby", 8, null],
      ["lobby", "elevator-1", 6, "R-001"],
      ["elevator-1", "elevator-2", 0, "R-001"],
      ["elevator-2", "corridor-2a", 4, "R-001"],
      ["corridor-2a", "room-201", 4, "R-001"],
      ["room-201", "corridor-2a", 4, null],
      ["corridor-2a", "elevator-2", 4, "R-002"],
    ]);
    expect(night.metres).toBe(30);
    expect(night.rides).toBe(1);
    expect(night.between).toEqual({ metres: 12, rides: 0 });
  });

  it("gives each task its metres, rides, minutes, outcome and path", () => {
    const [first, second] = robotWalk(NIGHT, map).tasks;
    expect(first).toMatchObject({
      request: "R-001",
      kind: "amenity",
      room: "room-201",
      outcome: "done",
      start: "22:00:08",
      end: "22:01:25",
      metres: 14,
      rides: 1,
      minutes: 1,
      path: ["lobby", "elevator-1", "elevator-2", "corridor-2a", "room-201"],
    });
    expect(second).toMatchObject({ request: "R-002", outcome: "failed", metres: 4, minutes: 19 });
  });

  it("counts a walk into a room the map lacks, and lists that room", () => {
    const night = robotWalk(
      parseRunValues([
        state("22:00:00", "corridor-3a"),
        move("22:00:05", "room-327", { at: "room-327", metres: 4 }),
        move("22:00:10", "corridor-3a", { at: "corridor-3a", metres: 4 }),
      ]).lines,
      map,
    );
    expect(night.metres).toBe(8);
    expect(night.offMap).toEqual(["room-327"]);
    expect(night.moves.map((m) => [m.from, m.to])).toEqual([
      ["corridor-3a", "room-327"],
      ["room-327", "corridor-3a"],
    ]);
  });

  it("totals the tasks by kind, most metres first", () => {
    expect(totalsByKind(robotWalk(NIGHT, map).tasks)).toEqual([
      { kind: "amenity", label: "Utstyr til rom", tasks: 1, metres: 14, rides: 1, minutes: 1 },
      { kind: "tray", label: "Romservice", tasks: 1, metres: 4, rides: 0, minutes: 19 },
    ]);
  });

  it("is empty for a log without moves", () => {
    expect(robotWalk([], map)).toEqual({
      moves: [],
      tasks: [],
      metres: 0,
      rides: 0,
      between: { metres: 0, rides: 0 },
      offMap: [],
    });
  });

  it("reads the demo night: the task metres and the walks between add up to the whole", () => {
    const text = readFileSync(resolve(process.cwd(), "src/features/nightshift/fixtures/sample.jsonl"), "utf8");
    const night = robotWalk(parseRunLog(text).lines, map);
    expect(night.moves.length).toBeGreaterThan(100);
    expect(night.tasks.length).toBeGreaterThan(10);
    const taskMetres = night.tasks.reduce((s, t) => s + t.metres, 0);
    expect(Math.round(taskMetres + night.between.metres)).toBeCloseTo(night.metres, -1);
    expect(night.tasks.reduce((s, t) => s + t.rides, 0) + night.between.rides).toBe(night.rides);
  });
});
