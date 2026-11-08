import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { crossNightPrecision, grouped, LEDGER_NIGHTS, type LedgerNight, percentText, precision, shiftOf } from "./ledger";
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
      expect(Number(row!.done_reports)).toBe(entry.done_reports);
      expect(Number(row!.done_credited)).toBe(entry.done_credited);
      expect(row!.score === "" ? null : Number(row!.score)).toBe(entry.score);
    }
  });

  it("holds the demo night (seed 16): 73 of 73 credited, 7 refusals credited and 1 not", () => {
    const demo = LEDGER_NIGHTS.find((entry) => entry.shift === shiftOf(DEMO));
    expect(demo).toMatchObject({ seed: 16, score: 2680, done_reports: 73, done_credited: 73, declines_credited: 7, declines_not_credited: 1, commit: "cb72845" });
  });

  it("computes the cross-night precision and the demo build's from the rows, not from a typed-in figure", () => {
    const { all, build } = crossNightPrecision(shiftOf(DEMO));
    const reported = LEDGER_NIGHTS.reduce((sum, entry) => sum + (entry.done_reports ?? 0), 0);
    expect(all?.reported).toBe(reported);
    expect(all!.credited).toBeLessThan(all!.reported);
    expect(build).toMatchObject({ commit: "cb72845", nights: 4, reported: 291, credited: 290, percent: 99.7 });
  });
});

describe("precision", () => {
  it("never rounds a miss up to 100 %, and skips nights without a done", () => {
    expect(precision([night("a", "x", 2000, 1999), night("b", "x", 0, 0)])).toEqual({ nights: 1, reported: 2000, credited: 1999, percent: 99.9 });
    expect(precision([night("a", "x", 10, 10)])?.percent).toBe(100);
    expect(precision([])).toBeNull();
  });

  it("knows no build for a shift the ledger has not seen", () => {
    expect(crossNightPrecision("w2-unknown", [night("a", "x", 3, 3)])).toEqual({ all: { nights: 1, reported: 3, credited: 3, percent: 100 }, build: null });
  });

  it("writes figures the Norwegian way", () => {
    expect(grouped(4340)).toBe("4 340");
    expect(percentText(99.2)).toBe("99,2 %");
  });
});
