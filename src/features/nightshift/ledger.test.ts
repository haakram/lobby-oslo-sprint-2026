import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { doneBasis, ownAgainstLog, selfContradictions } from "./conduct";
import {
  catchRate,
  crossNightPrecision,
  FAULT_BED,
  type FaultTypeRow,
  grouped,
  LEDGER_META,
  LEDGER_NIGHTS,
  type LedgerNight,
  missesByType,
  ownPrecision,
  percentText,
  precision,
  SLEEPING_GUEST,
  shiftOf,
} from "./ledger";
import { parseRunLog } from "./runlog";

const DEMO = parseRunLog(readFileSync(resolve(process.cwd(), "public/runs/demo.jsonl"), "utf8")).lines;

/** docs/runs/ledger.csv as rows keyed by column name (no quoted commas in the columns read here). */
function csvRows(): Record<string, string>[] {
  const [head, ...rows] = readFileSync(resolve(process.cwd(), "docs/runs/ledger.csv"), "utf8").trim().split("\n");
  const columns = head.split(",");
  return rows.map((row) => {
    const cells: string[] = [];
    let cell = "";
    let quoted = false;
    for (const char of row) {
      if (char === '"') quoted = !quoted;
      else if (char === "," && !quoted) {
        cells.push(cell);
        cell = "";
      } else cell += char;
    }
    cells.push(cell);
    return Object.fromEntries(columns.map((column, index) => [column, cells[index] ?? ""]));
  });
}

const night = (shift: string, commit: string, reported: number, credited: number): LedgerNight => ({
  shift,
  started: "2026-11-08T01:00:00+01:00",
  seed: 1,
  commit,
  complete: true,
  score: 2000,
  done_reports: reported,
  done_credited: credited,
  declines_credited: 0,
  declines_not_credited: 0,
});

describe("the evidence ledger the app reads", () => {
  it("is the same nights and numbers as docs/runs/ledger.csv (both from scripts/ledger.py)", () => {
    const byShift = new Map(csvRows().map((row) => [row.shift, row]));
    expect(LEDGER_NIGHTS.length).toBeGreaterThan(0);
    for (const entry of LEDGER_NIGHTS) {
      const row = byShift.get(entry.shift);
      expect(row, entry.shift).toBeDefined();
      expect(row!.commit).toBe(entry.commit);
      expect(row!.kind).toBe(entry.kind);
      // A board test is in the app's file only as a complete night.
      if (entry.kind === "board-test") expect(entry.complete).toBe(true);
      expect(Number(row!.done_reports)).toBe(entry.done_reports);
      expect(Number(row!.done_credited)).toBe(entry.done_credited);
      expect(row!.score === "" ? null : Number(row!.score)).toBe(entry.score);
    }
  });

  it("holds the demo night (seed 16): 73 of 73 credited, 7 refusals credited and 1 not", () => {
    const demo = LEDGER_NIGHTS.find((entry) => entry.shift === shiftOf(DEMO));
    expect(demo).toMatchObject({ seed: 16, score: 2680, done_reports: 73, done_credited: 73, declines_credited: 7, declines_not_credited: 1, commit: "cb72845" });
  });

  it("splits the demo night's done as the app's doneBasis does: 64 after the rise, 9 on its own judgement (5 room checks, 4 spills)", () => {
    const demo = LEDGER_NIGHTS.find((entry) => entry.shift === shiftOf(DEMO));
    const basis = doneBasis(DEMO);
    expect(demo).toMatchObject({
      done_after_rise: basis.afterRise.reported,
      done_own: basis.own.reported,
      done_own_credited: basis.own.confirmed,
      done_room_check: basis.own.roomChecks.reported,
      done_spill: basis.own.spills.reported,
    });
    expect([basis.afterRise.reported, basis.own.reported, basis.own.confirmed]).toEqual([64, 9, 9]);
  });

  it("holds the live-start count and the newest start for the card's source line", () => {
    expect(LEDGER_META.liveStarts).toBeGreaterThanOrEqual(LEDGER_NIGHTS.length);
    expect(LEDGER_META.latestStart).toMatch(/^2026-11-0\dT\d\d:\d\d:\d\d\+01:00$/);
  });

  it("computes the cross-night precision and the demo build's from the rows, not from a typed-in figure", () => {
    const { all, build } = crossNightPrecision(shiftOf(DEMO));
    const reported = LEDGER_NIGHTS.reduce((sum, entry) => sum + (entry.done_reports ?? 0), 0);
    expect(all?.reported).toBe(reported);
    expect(all!.credited).toBeLessThan(all!.reported);
    expect(build).toMatchObject({ commit: "cb72845", nights: 4, reported: 291, credited: 290, percent: 99.7 });
  });

  it("computes the own-judgement precision across all nights and for the demo build", () => {
    const { allOwn, buildOwn } = crossNightPrecision(shiftOf(DEMO));
    const own = LEDGER_NIGHTS.reduce((sum, entry) => sum + (entry.done_own ?? 0), 0);
    expect(allOwn?.reported).toBe(own);
    expect(allOwn!.roomChecks.reported).toBeLessThanOrEqual(allOwn!.reported);
    expect(buildOwn).toMatchObject({ nights: 4, reported: 43, credited: 42 });
  });

  it("counts the score-blind runs (kind=experiment) on their own, from the rows", () => {
    const { blind } = crossNightPrecision(shiftOf(DEMO));
    const rows = LEDGER_NIGHTS.filter((entry) => entry.kind === "experiment" && (entry.done_reports ?? 0) > 0);
    expect(blind?.nights).toBe(rows.length);
    expect(blind?.reported).toBe(rows.reduce((sum, entry) => sum + (entry.done_reports ?? 0), 0));
    expect(rows.every((entry) => entry.done_after_rise === 0)).toBe(true); // a blind agent never rested a done on the score
  });
});

describe("ownPrecision", () => {
  it("counts only the done said on the robot's own judgement, room checks among them", () => {
    const a = { ...night("a", "x", 70, 70), done_own: 9, done_own_credited: 9, done_room_check: 5, done_room_check_credited: 5 };
    const b = { ...night("b", "x", 70, 69), done_own: 10, done_own_credited: 9, done_room_check: 4, done_room_check_credited: 4 };
    expect(ownPrecision([a, b, night("c", "x", 3, 3)])).toEqual({ nights: 2, reported: 19, credited: 18, percent: 94.7, roomChecks: { reported: 9, credited: 9 } });
    expect(ownPrecision([night("c", "x", 3, 3)])).toBeNull();
  });
});

describe("precision", () => {
  it("never rounds a miss up to 100 %, and skips nights without a done", () => {
    expect(precision([night("a", "x", 2000, 1999), night("b", "x", 0, 0)])).toEqual({ nights: 1, reported: 2000, credited: 1999, percent: 99.9 });
    expect(precision([night("a", "x", 10, 10)])?.percent).toBe(100);
    expect(precision([])).toBeNull();
  });

  it("leaves board tests out of a build's figure though they carry its commit, and counts them across all nights", () => {
    const board = { ...night("b", "8eac151", 70, 70), kind: "board-test" as const };
    const nights = [{ ...night("a", "8eac151", 72, 71), kind: "build" as const }, board, { ...night("c", "8eac151", 73, 73), kind: "build" as const }];
    expect(crossNightPrecision("a", nights)).toMatchObject({
      all: { nights: 3, reported: 215, credited: 214, percent: 99.5 },
      build: { commit: "8eac151", nights: 2, reported: 145, credited: 144, percent: 99.3 },
    });
    expect(crossNightPrecision("b", nights).build).toBeNull();
  });

  it("knows no build for a shift the ledger has not seen", () => {
    expect(crossNightPrecision("w2-unknown", [night("a", "x", 3, 3)])).toEqual({
      all: { nights: 1, reported: 3, credited: 3, percent: 100 },
      build: null,
      allOwn: null,
      buildOwn: null,
      blind: null,
    });
  });

  it("writes figures the Norwegian way", () => {
    expect(grouped(4340)).toBe("4 340");
    expect(percentText(99.2)).toBe("99,2 %");
  });
});

describe("the 209 rule over every night (round 6)", () => {
  it("agrees with the card on the demo night: scripts/ledger.py's done_own_holds_log is ownAgainstLog's 8 of 9", () => {
    const shift = shiftOf(DEMO);
    const row = LEDGER_NIGHTS.find((entry) => entry.shift === shift)!;
    const basis = doneBasis(DEMO);
    const held = ownAgainstLog(basis, selfContradictions(DEMO));
    expect(row.done_own_holds_log).toBe(held.holds);
    expect(row.room_checks_contradicted).toBe(selfContradictions(DEMO).length);
    expect(held.holds).toBe(8);
    expect(csvRows().find((entry) => entry.shift === shift)!.contradicted).toBe("R-049:209");
  });
});

describe("the fault bed's catch rate (round 6)", () => {
  const rows: FaultTypeRow[] = [
    { type: "place.outside", mode: "blind", rate: 0.05, hit: 10, caught: 10, missed: 0, repaired: 0, lost: 0 },
    { type: "room.occupied", mode: "blind", rate: 0.05, hit: 4, caught: 0, missed: 4, repaired: 0, lost: 0 },
    { type: "say.misheard", mode: "blind", rate: 0.05, hit: 6, caught: 1, missed: 1, repaired: 4, lost: 0 },
    { type: "room.occupied", mode: "sighted", rate: 0.05, hit: 4, caught: 4, missed: 0, repaired: 0, lost: 0 },
  ];

  it("counts caught over caught + missed, leaving repaired faults out, per mode, rate and without a type", () => {
    expect(catchRate(rows, { rate: 0.05 })).toEqual({ caught: 11, missed: 5, share: 11 / 16 });
    expect(catchRate(rows, { rate: 0.05, without: [SLEEPING_GUEST] })).toEqual({ caught: 11, missed: 1, share: 11 / 12 });
    expect(catchRate(rows, { mode: "sighted" })!.share).toBe(1);
    expect(catchRate(rows, { rate: 0.3 })).toBeNull();
  });

  it("names the types the check misses, the worst first", () => {
    expect(missesByType(rows)).toEqual([
      { type: "room.occupied", hit: 4, missed: 4 },
      { type: "say.misheard", hit: 6, missed: 1 },
    ]);
  });

  it("reads the committed table: 79 % at 5 %, 88 % without the sleeping guest", () => {
    const types = FAULT_BED.types ?? [];
    expect(types).toHaveLength(78);
    const all = catchRate(types, { rate: 0.05 })!;
    const awake = catchRate(types, { rate: 0.05, without: [SLEEPING_GUEST] })!;
    expect([all.caught, all.caught + all.missed, Math.round(all.share * 100)]).toEqual([251, 317, 79]);
    expect(Math.round(awake.share * 100)).toBe(88);
  });
});
