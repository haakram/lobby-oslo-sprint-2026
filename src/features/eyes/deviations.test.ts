import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { productBySku } from "@/features/catalog/products";
import { runLine, type RunLine } from "@/features/nightshift/runlog";
import { appendEyesLine, EYES_LOG, eyesAvvikLine, eyesOpenItem, isEyesAvvik, KEEP_DAYS, pruneEyesLog, removeEyesLine, storedEyesLines } from "./deviations";

const shampoo = productBySku("FT-1001")!;
const shower = productBySku("FT-1003")!;
// 05:41:10 in Oslo (CET, UTC+1).
const morning = new Date("2026-11-08T04:41:10Z");
const who = { by: "Siri Haugen", now: morning, id: "e-test" };

describe("eyesAvvikLine", () => {
  it("is a run-log v1 work_order from Øyne: what was shown, what the package said, who and when, no room", () => {
    const line = eyesAvvikLine({ candidates: [shampoo, shower], name: "Hvit flaske", textSeen: ["Mild", "250 ml", "", "a", "b", "c"] }, who);
    expect(runLine.safeParse(line).success).toBe(true);
    expect(line).toMatchObject({ v: 1, type: "decision", kind: "work_order" });
    expect(line.type === "decision" && line.data).toEqual({
      id: "e-test",
      type: "annet",
      room: null,
      place: null,
      text: "Ukjent vare: ingen av forslagene stemte (Sjampo 250 ml og Dusjsåpe 250 ml).",
      candidates: ["FT-1001", "FT-1003"],
      seen: ["Mild", "250 ml", "a", "b"],
      source: "eyes",
      by: "Siri Haugen",
      at: "05:41:10",
      stamp: "2026-11-08T04:41:10.000Z",
    });
  });

  it("says what the camera saw when the item is not in the catalogue", () => {
    const line = eyesAvvikLine({ candidates: [], name: "Hvit sprayflaske", textSeen: [] }, who);
    expect(line.type === "decision" && line.data?.text).toBe("Ukjent vare: finnes ikke i katalogen (kameraet så hvit sprayflaske).");
  });
});

describe("isEyesAvvik", () => {
  it("tells Øyne's avvik from the robot's work orders and the night clerk's lines", () => {
    const robot: RunLine = { v: 1, type: "decision", kind: "work_order", data: { type: "sol", text: "Vått gulv", room: null, place: "corridor-2b" } };
    const clerk: RunLine = { v: 1, type: "decision", kind: "hazard", data: { source: "staff", place: "lobby", hazard: "wet" } };
    expect(isEyesAvvik(eyesAvvikLine({ candidates: [], name: "", textSeen: [] }, who))).toBe(true);
    expect(isEyesAvvik(robot)).toBe(false);
    expect(isEyesAvvik(clerk)).toBe(false);
  });
});

describe("pruneEyesLog", () => {
  it(`drops days older than ${KEEP_DAYS} days and keys that are not days`, () => {
    const log = { "2026-10-08": [1], "2026-10-09": [2], "2026-11-08": [3], junk: [4] };
    expect(pruneEyesLog(log, "2026-11-08")).toEqual({ "2026-10-09": [2], "2026-11-08": [3] });
  });
});

describe("the avvik log on this device", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(morning);
  });
  afterEach(() => vi.useRealTimers());

  it("stores a line on today's handover, from 21:00 on tomorrow's, and Angre takes it out", () => {
    const line = eyesAvvikLine({ candidates: [shampoo], name: "Hvit flaske", textSeen: [] }, who);
    expect(appendEyesLine(line, morning)).toBe("2026-11-08");
    expect(storedEyesLines(EYES_LOG.read(), "2026-11-08")).toEqual([line]);
    const evening = new Date("2026-11-08T21:30:00Z");
    expect(appendEyesLine(eyesAvvikLine({ candidates: [], name: "", textSeen: [] }, { by: "Hanne Vold", now: evening, id: "e-late" }), evening)).toBe("2026-11-09");
    removeEyesLine("2026-11-08", "e-test");
    expect(storedEyesLines(EYES_LOG.read(), "2026-11-08")).toEqual([]);
    expect(storedEyesLines(EYES_LOG.read(), "2026-11-09")).toHaveLength(1);
  });

  it("reads nothing that is not an avvik from Øyne", () => {
    localStorage.setItem("lobby:oyne-avvik", JSON.stringify({ "2026-11-08": [{ v: 1, type: "decision", kind: "work_order", data: { text: "x" } }, "junk"] }));
    EYES_LOG.set((current) => current);
    expect(storedEyesLines(JSON.parse(localStorage.getItem("lobby:oyne-avvik")!), "2026-11-08")).toEqual([]);
  });
});

describe("eyesOpenItem", () => {
  it("is one Åpent nå row with an owner, a deadline, what to do and the evidence on its own line", () => {
    const item = eyesOpenItem(eyesAvvikLine({ candidates: [shampoo, shower], name: "Hvit flaske", textSeen: ["Mild", "250 ml"] }, who));
    expect(item).toEqual({
      id: "eyes-e-test",
      text: "Ukjent vare: ingen av forslagene stemte (Sjampo 250 ml og Dusjsåpe 250 ml). Finn ut hva det er før varen legges på hylla.",
      lines: ["Tekst på pakken: «Mild», «250 ml» · meldt av Siri Haugen kl. 05:41"],
      owner: "Renhold",
      due: "10:00",
      href: "/lager",
      linkLabel: "Åpne Lager og lin",
    });
  });
});
