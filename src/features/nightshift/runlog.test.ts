import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseRunLog, parseRunValues, replayDelayMs, summarise } from "./runlog";

const SHIFT = "w2-3fa94c1d07be4e2a9c55d1e8b6a0f217";

const START = { v: 1, t: 100, type: "start", shift: SHIFT, mode: "practice", seed: 1 };
const CALL_STATUS = {
  v: 1,
  t: 100.4,
  type: "call",
  cmd: "status",
  args: {},
  ok: true,
  clock: "22:00:00",
  result: { location: "charging-dock", score: 0 },
  events: [],
  latency_ms: 71,
  status: 200,
};
const CALL_MOVE = {
  ...CALL_STATUS,
  t: 101,
  cmd: "move",
  args: { to: "lobby" },
  clock: "22:00:16",
  result: "The robot moves to lobby.",
};
const DONE = { v: 1, t: 102, type: "decision", kind: "task_done", data: { request: "R-001", note: "Placed it." } };
const FAILED = {
  v: 1,
  t: 103,
  type: "decision",
  kind: "task_failed",
  data: { request: "R-003", reason: "Do Not Disturb on room-208." },
};
const STATE = {
  v: 1,
  t: 104,
  type: "state",
  clock: "22:14:05",
  location: "corridor-3c",
  score: 21,
  battery: 93.5,
  hands: [],
  cart: ["towel"],
};
const END = { v: 1, t: 105, type: "end", score: 57, requests_served: 2, reason: "ended" };

const jsonl = (...values: unknown[]) => values.map((value) => JSON.stringify(value)).join("\n");

describe("parseRunLog", () => {
  it("reads every line of a full shift", () => {
    const { lines, skipped } = parseRunLog(jsonl(START, CALL_STATUS, CALL_MOVE, DONE, FAILED, STATE, END));
    expect(skipped).toBe(0);
    expect(lines.map((line) => line.type)).toEqual(["start", "call", "call", "decision", "decision", "state", "end"]);
  });

  it("skips and counts a garbage line and a v2 line", () => {
    const text = [JSON.stringify(START), "{not json", JSON.stringify({ ...STATE, v: 2 }), JSON.stringify(END)].join("\n");
    const { lines, skipped } = parseRunLog(text);
    expect(skipped).toBe(2);
    expect(lines.map((line) => line.type)).toEqual(["start", "end"]);
  });

  it("ignores an unknown line type without counting it as skipped", () => {
    const { lines, skipped } = parseRunLog(jsonl(START, { v: 1, type: "heartbeat", at: 3 }, END));
    expect(skipped).toBe(0);
    expect(lines.map((line) => line.type)).toEqual(["start", "end"]);
  });

  it("ignores blank lines and Windows line endings", () => {
    const { lines, skipped } = parseRunLog(`${JSON.stringify(START)}\r\n\r\n${JSON.stringify(END)}\r\n`);
    expect(skipped).toBe(0);
    expect(lines).toHaveLength(2);
  });

  it("skips a known type with a broken field", () => {
    const { lines, skipped } = parseRunLog(jsonl({ ...STATE, score: "lots" }, END));
    expect(skipped).toBe(1);
    expect(lines).toHaveLength(1);
  });

  it("skips a start line whose shift id is not a Wybe shift id", () => {
    const { lines, skipped } = parseRunLog(jsonl({ ...START, shift: "../../.env" }));
    expect(skipped).toBe(1);
    expect(lines).toHaveLength(0);
  });
});

describe("parseRunValues", () => {
  it("takes already parsed objects, as the viewer server sends them", () => {
    const { lines, skipped } = parseRunValues([START, "nope", { ...END, v: 2 }, DONE]);
    expect(skipped).toBe(2);
    expect(lines.map((line) => line.type)).toEqual(["start", "decision"]);
  });
});

describe("summarise", () => {
  it("sums up a finished shift", () => {
    const summary = summarise(parseRunLog(jsonl(START, CALL_STATUS, CALL_MOVE, DONE, FAILED, STATE, END)).lines);
    expect(summary).toMatchObject({
      shift: SHIFT,
      mode: "practice",
      seed: 1,
      score: 57,
      clock: "22:14:05",
      location: "corridor-3c",
      tasksDone: 1,
      tasksFailed: 1,
      live: false,
    });
  });

  it("is live while there is no end line, scoring from the latest state", () => {
    const summary = summarise(parseRunLog(jsonl(START, CALL_STATUS, DONE, STATE)).lines);
    expect(summary.live).toBe(true);
    expect(summary.score).toBe(21);
  });

  it("takes the clock from a call that comes after the last state", () => {
    const summary = summarise(parseRunLog(jsonl(START, STATE, { ...CALL_MOVE, clock: "22:15:00" })).lines);
    expect(summary.clock).toBe("22:15:00");
    expect(summary.location).toBe("corridor-3c");
  });

  it("starts empty", () => {
    expect(summarise([])).toEqual({
      shift: null,
      mode: null,
      seed: null,
      score: 0,
      clock: null,
      location: null,
      tasksDone: 0,
      tasksFailed: 0,
      live: true,
      decisions: [],
    });
  });

  it("lists decisions newest first, as request plus detail", () => {
    const { decisions } = summarise(parseRunLog(jsonl(START, DONE, FAILED)).lines);
    expect(decisions.map(({ kind, text }) => ({ kind, text }))).toEqual([
      { kind: "task_failed", text: "R-003 · Do Not Disturb on room-208." },
      { kind: "task_done", text: "R-001 · Placed it." },
    ]);
  });

  it("keeps only the 20 newest decisions", () => {
    const notes = Array.from({ length: 25 }, (_, index) => ({
      v: 1,
      type: "decision",
      kind: "note",
      data: { text: `note ${index}` },
    }));
    const { decisions } = summarise(parseRunValues(notes).lines);
    expect(decisions).toHaveLength(20);
    expect(decisions[0]?.text).toBe("note 24");
    expect(decisions[19]?.text).toBe("note 5");
  });

  it("gives each decision a stable id from its line position", () => {
    const { decisions } = summarise(parseRunLog(jsonl(START, DONE, FAILED)).lines);
    expect(decisions.map((decision) => decision.id)).toEqual([2, 1]);
  });

  it("falls back to an empty text when the data has nothing readable", () => {
    const { decisions } = summarise(parseRunValues([{ v: 1, type: "decision", kind: "plan", data: { n: 3 } }]).lines);
    expect(decisions[0]).toMatchObject({ kind: "plan", text: "" });
  });
});

describe("replayDelayMs", () => {
  it("plays the recorded gap at 10x", () => {
    expect(replayDelayMs({ t: 100 }, { t: 105 })).toBe(500);
  });

  it("caps a long idle gap at one second", () => {
    expect(replayDelayMs({ t: 100 }, { t: 400 })).toBe(1000);
  });

  it("uses a short fixed step when a line has no timestamp or time goes backwards", () => {
    expect(replayDelayMs({}, { t: 5 })).toBe(100);
    expect(replayDelayMs({ t: 9 }, { t: 5 })).toBe(100);
  });
});

describe("the demo run", () => {
  const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

  it("is a clean, finished run log v1", () => {
    const { lines, skipped } = parseRunLog(read("src/features/nightshift/fixtures/sample.jsonl"));
    expect(skipped).toBe(0);
    const summary = summarise(lines);
    expect(summary.live).toBe(false);
    expect(summary.shift).toMatch(/^w2-[0-9a-f]{8,64}$/);
    expect(summary.tasksDone).toBeGreaterThan(0);
    expect(summary.tasksFailed).toBeGreaterThan(0);
  });

  it("what the deployed app serves is a clean, finished run log v1 too", () => {
    // The published demo night is swapped for better live runs; the fixture above stays fixed for the tests.
    const { lines, skipped } = parseRunLog(read("public/runs/demo.jsonl"));
    expect(skipped).toBe(0);
    const summary = summarise(lines);
    expect(summary.live).toBe(false);
    expect(summary.shift).toMatch(/^w2-[0-9a-f]{8,64}$/);
    expect(summary.tasksDone).toBeGreaterThan(0);
  });
});
