import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { foldNight, selectWorkOrders } from "@/features/dashboard/selectors";
import { selectMaintenance } from "@/features/maintenance/select";
import { parseRunLog, type RunLine } from "@/features/nightshift/runlog";
import { corridorName, nightSafety, openWetFloors } from "./safety";

const lines = parseRunLog(readFileSync(resolve(process.cwd(), "public/runs/demo.jsonl"), "utf8")).lines;

describe("nightSafety: what can hurt a guest, from the run log", () => {
  it("finds the demo night's three wet floors without a sign at 06:00, with since when and why", () => {
    const { wetFloors } = nightSafety(lines);
    expect(wetFloors.map((floor) => floor.place).sort()).toEqual(["corridor-1c", "corridor-2b", "corridor-3d"]);
    const at = Object.fromEntries(wetFloors.map((floor) => [floor.place, floor]));
    // 2B: the robot slipped there at 23:51 and no sign was ever put down.
    expect(at["corridor-2b"]).toMatchObject({ since: "23:51:33", slippedAt: "23:51:33", signMoved: null });
    // 3D: signed at 00:39, then the robot moved that sign to a new spill in 3C at 04:38.
    expect(at["corridor-3d"]).toMatchObject({ since: "04:38:18", slippedAt: null, signMoved: { at: "04:38:18", to: "corridor-3c" } });
    expect(at["corridor-1c"]).toMatchObject({ since: "05:52:59", signMoved: null });
  });

  it("agrees with Vedlikehold and the bell on which floors are unsigned (one rule, two readers)", () => {
    const orders = selectWorkOrders(foldNight(lines));
    const unsigned = selectMaintenance({ orders, statusOf: () => "ny", assignee: null, manual: [] }).filter((order) => order.safety);
    const ids = nightSafety(lines).wetFloors.flatMap((floor) => floor.orderIds);
    expect(new Set(ids)).toEqual(new Set(unsigned.map((order) => order.id)));
  });

  it("drops a floor once every order behind it is marked Løst", () => {
    const { wetFloors } = nightSafety(lines);
    const twoB = wetFloors.find((floor) => floor.place === "corridor-2b");
    const resolved = new Set(twoB?.orderIds);
    expect(openWetFloors(wetFloors, (id) => resolved.has(id)).map((floor) => floor.place).sort()).toEqual(["corridor-1c", "corridor-3d"]);
  });

  it("names the stranger's incident once: seven refusals between 01:17 and 05:11, the doors, the waits", () => {
    const { stranger } = nightSafety(lines);
    expect(stranger?.refusals).toHaveLength(7);
    expect(stranger?.first.slice(0, 5)).toBe("01:17");
    expect(stranger?.last.slice(0, 5)).toBe("05:11");
    expect(stranger?.rooms).toEqual(["308", "209", "203", "202", "304", "137", "205"]);
    expect(stranger?.keycardWaits).toEqual(["room-209", "room-304"]);
  });

  it("a quiet night has nothing to say", () => {
    const quiet: RunLine[] = [{ v: 1, type: "state", clock: "22:00:00", location: "charging-dock", score: 0 }];
    expect(nightSafety(quiet)).toEqual({ wetFloors: [], stranger: null });
    expect(corridorName("corridor-2b")).toBe("korridor 2B");
  });
});

describe("nightSafety: the night clerk's entries are added to the robot's, never dropped", () => {
  const staff = (id: string, kind: string, data: Record<string, unknown>): RunLine => ({ v: 1, type: "decision", kind, data: { id, ...data, source: "staff", by: "Kjersti Lund" } });

  it("reads the robot alone without her log (the bell, Oversikt and Vedlikehold read it so)", () => {
    const { wetFloors, staff: extra } = nightSafety(lines);
    expect(wetFloors.every((floor) => floor.source === "robot" && floor.reported === null)).toBe(true);
    expect(extra).toBeUndefined();
  });

  it("adds her wet floor where the robot reported none, with her answer to «Skilt satt ut?», and keeps it open (no work order to close)", () => {
    const lobby = staff("l1", "hazard", { place: "lobby", hazard: "wet", since: "02:15:00", at: "02:15:00", signed: false });
    const { wetFloors } = nightSafety(lines, [lobby]);
    const floor = wetFloors.find((entry) => entry.place === "lobby");
    expect(floor).toMatchObject({ source: "staff", orderIds: [], since: "02:15:00", signed: false, sign: "uten skilt siden 02:15", reported: { by: "Kjersti Lund", at: "02:15:00" }, waited: null });
    expect(openWetFloors(wetFloors, () => true).map((entry) => entry.place)).toEqual(["lobby"]);
  });

  it("times each robot hazard to the first person who knew, else to 06:00", () => {
    const { wetFloors, stranger } = nightSafety(lines);
    expect(wetFloors.find((floor) => floor.place === "corridor-2b")?.waited).toMatchObject({ minutes: 369, acknowledged: false });
    expect(stranger?.waited).toMatchObject({ minutes: 283, acknowledged: false });
  });
});
