import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { formatKroner } from "@/features/dashboard/format";
import { parseRunLog } from "@/features/nightshift/runlog";
import { moneyHeadline, releasedLine, roomMoney, shortDate } from "./money";
import { pmsLastNight, revenueLastNight, sellableValue } from "./pms";
import { reconcileNight, type RoomCheckMark } from "./reconcile";

const TODAY = "2026-11-08";
const lines = parseRunLog(readFileSync(resolve(process.cwd(), "public/runs/demo.jsonl"), "utf8")).lines;
const pms = pmsLastNight(TODAY);
const revenue = revenueLastNight(36, pms);
const reconciliation = reconcileNight(lines, pms);
const ONE = formatKroner(sellableValue(1, revenue));
const stamp = { at: "06:02", by: "Siri Haugen" };
// The rooms the robot saw ready on the demo night (314 free in the system; 209 and 213 booked), the rest not ready.
const rooms = ["room-314", "room-209", "room-213", "room-135", "room-201"].map((id) => ({ id, status: id === "room-135" ? ("ma_vaskes" as const) : id === "room-201" ? ("opptatt" as const) : ("klar" as const) }));

const money = (marks: Record<string, RoomCheckMark> = {}) => roomMoney({ reconciliation, marks, revenue, rooms, pms });

describe("the room check's money: one reading for Oversikt, Rom and Overlevering", () => {
  it("on the demo night: 213 can be sold after confirmation, 209 is held, and only 314 is ready to sell now", () => {
    const night = money();
    expect(moneyHeadline(night)).toBe(`1 rom kan selges etter bekreftelse · ca. ${ONE} kr · 1 holdt tilbake`);
    expect(releasedLine(night)).toBe("Frigitt i dag: ingen ennå");
    expect(night.readyToSell).toBe(1);
    expect(night.roomsTotal).toBe(5);
  });

  it("a confirmation alone sells nothing; the release moves the headline, the running total and Klare til salg", () => {
    const confirmed = money({ "room-213": { action: "confirmed", ...stamp } });
    expect(confirmed.confirmed).toEqual(["room-213"]);
    expect(moneyHeadline(confirmed)).toBe(`1 rom kan selges etter bekreftelse · ca. ${ONE} kr · 1 holdt tilbake`);
    expect(confirmed.readyToSell).toBe(1);

    const released = money({ "room-213": { action: "released", ...stamp, confirmed: stamp } });
    expect(moneyHeadline(released)).toBe(`1 rom frigitt for salg i dag · ca. ${ONE} kr · 1 holdt tilbake`);
    expect(releasedLine(released)).toBe(`Frigitt i dag: 1 rom · ca. ${ONE} kr`);
    expect(released.readyToSell).toBe(2);
  });

  it("a held room never counts as ready to sell, and a closed room neither", () => {
    const closed = roomMoney({ reconciliation, marks: {}, revenue, rooms: rooms.map((room) => (room.id === "room-314" ? { ...room, closed: true } : room)), pms });
    expect(closed.readyToSell).toBe(0);
    expect(roomMoney({ reconciliation, marks: {}, revenue, rooms: null, pms }).readyToSell).toBeNull();
  });

  it("says nothing when there is nothing to sell or hold, and writes dates the way a desk does", () => {
    expect(moneyHeadline(roomMoney({ reconciliation: { ...reconciliation, sellable: [], held: [] }, marks: {}, revenue, rooms, pms }))).toBeNull();
    expect(moneyHeadline(roomMoney({ reconciliation: { ...reconciliation, sellable: [] }, marks: {}, revenue, rooms, pms }))).toBe("Ingen rom å selge i dag · 1 holdt tilbake");
    expect(shortDate("2026-11-09")).toBe("9.11");
    expect(shortDate(null)).toBe("");
  });
});
