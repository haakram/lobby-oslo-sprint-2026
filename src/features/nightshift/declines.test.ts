import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { clockToSim } from "@/features/replay/timeline";
import { declineKind, declineSplit, declineSplitPlain, declineSplitText } from "./declines";
import { nightOutcomes } from "./outcomes";
import { parseRunLog, type RunLine } from "./runlog";

const DEMO = parseRunLog(readFileSync(resolve(process.cwd(), "public/runs/demo.jsonl"), "utf8")).lines;

const state = (clock: string, score: number): RunLine => ({ v: 1, type: "state", clock, score });
const decision = (kind: string, data: Record<string, unknown>): RunLine => ({ v: 1, type: "decision", kind, data });
const report = (request: string, note: string, clock: string): RunLine => ({
  v: 1,
  type: "call",
  cmd: "report",
  args: { request, outcome: "declined", note },
  ok: true,
  clock,
  result: "Noted.",
});
const declined = (request: string, note: string): RunLine => decision("task_failed", { request, status: "declined", points: 0, note });

describe("declineSplit on the demo night (seed 16)", () => {
  const split = declineSplit(DEMO);

  it("counts the same refusals as every other screen (8), split by the referee: 7 credited, 1 not", () => {
    expect(split.total).toBe(nightOutcomes(DEMO).tally.declined);
    expect(split).toMatchObject({ total: 8, credited: 7, notCredited: 1, pending: 0 });
  });

  it("names R-036 (no new wet patch on floor 3) as the one the referee gave nothing", () => {
    const notCredited = split.checks.filter((check) => check.judged === "not_credited");
    expect(notCredited.map((check) => check.request)).toEqual(["R-036"]);
    expect(notCredited[0]).toMatchObject({ points: 0, kind: "nothingNew", clock: "02:21:34" });
  });

  it("reads each credited refusal's points, kind and room from the log", () => {
    expect(split.byRequest.get("R-060")).toMatchObject({ judged: "credited", points: 5, kind: "noOrder", room: "138", clock: "04:20:21" });
    expect(split.byRequest.get("R-070")).toMatchObject({ judged: "credited", kind: "alreadyDone", room: "136" });
    expect(split.checks.map((check) => check.request)).toEqual(["R-031", "R-034", "R-036", "R-038", "R-052", "R-060", "R-063", "R-070"]);
  });

  it("says it in one line for the card and the request list", () => {
    expect(declineSplitText(split)).toBe("7 falske klager avvist (godkjent av dommeren) · 1 ikke godkjent");
  });

  it("says it in a manager's words for the judgement card: by kind, no referee, no \"falske klager\"", () => {
    expect(declineSplitPlain(split)).toBe("6 meldinger uten bestilling og 1 alt levert · 1 ikke godkjent");
    expect(declineSplitPlain(declineSplit(DEMO, clockToSim("03:00:00")))).toBe("3 meldinger uten bestilling · 1 ikke godkjent");
    expect(declineSplitPlain(declineSplit([]))).toBe("Ingen meldinger avvist.");
  });

  it("follows the replay: by 03:00 only the first four refusals have happened", () => {
    const early = declineSplit(DEMO, clockToSim("03:00:00"));
    expect(early).toMatchObject({ total: 4, credited: 3, notCredited: 1 });
  });
});

describe("declineSplit on small logs", () => {
  it("is credited when the score rises after the report, not when it stays", () => {
    const lines = [
      state("01:00:00", 100),
      decision("request", { request: "R-001" }),
      report("R-001", "No pillow order from 308 on record tonight; nothing was ordered.", "01:01:00"),
      declined("R-001", "No pillow order from 308 on record tonight; nothing was ordered."),
      state("01:01:00", 105),
      decision("request", { request: "R-002" }),
      report("R-002", "No new wet patch on floor 2.", "01:05:00"),
      declined("R-002", "No new wet patch on floor 2."),
      state("01:05:00", 105),
    ];
    const split = declineSplit(lines);
    expect(split.byRequest.get("R-001")).toMatchObject({ judged: "credited", points: 5, room: "308" });
    expect(split.byRequest.get("R-002")).toMatchObject({ judged: "not_credited", points: 0 });
  });

  it("is pending while no score has been seen after the report (a live shift)", () => {
    const lines = [state("01:00:00", 100), decision("request", { request: "R-001" }), report("R-001", "No water-bottle order from 138 on record.", "01:01:00"), declined("R-001", "No water-bottle order from 138 on record.")];
    const split = declineSplit(lines);
    expect(split).toMatchObject({ total: 1, pending: 1, credited: 0 });
    expect(declineSplitText(split)).toBe("1 venter på dommeren");
  });

  it("words a night with nothing credited, and one with nothing declined", () => {
    const lines = [state("01:00:00", 100), decision("request", { request: "R-002" }), report("R-002", "No new wet patch.", "01:05:00"), declined("R-002", "No new wet patch."), state("01:05:00", 100)];
    expect(declineSplitText(declineSplit(lines))).toBe("1 avvist, ikke godkjent av dommeren");
    expect(declineSplitText(declineSplit([state("01:00:00", 0)]))).toBe("Ingen meldinger avvist.");
  });

  it("tells the kinds apart", () => {
    expect(declineKind("Do Not Disturb sign on room-118")).toBe("doNotDisturb");
    expect(declineKind("Duplicate of R-004")).toBe("alreadyDone");
    expect(declineKind(null)).toBe("other");
  });
});
