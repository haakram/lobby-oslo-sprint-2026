import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { parseRunLog } from "@/features/nightshift/runlog";
import type { RunLine } from "@/features/nightshift/runlog";
import { addDays, osloToday } from "@/features/reception/dates";
import { pmsLastNight, revenueLastNight } from "./pms";
import { markRoom, personAtDoor, reconcileNight, reconcileRooms, robotDeliveries, robotRoomChecks, ROOM_CHECK_MARKS } from "./reconcile";
import { TEST_NIGHT } from "./testNight";

const demoLines = () => parseRunLog(readFileSync(resolve(process.cwd(), "public/runs/demo.jsonl"), "utf8")).lines;

describe("the robot's room checks against the booking system", () => {
  it("keeps the robot's last word per room, with the shift clock and what it saw", () => {
    const checks = robotRoomChecks(TEST_NIGHT);
    expect(checks.size).toBe(4);
    expect(checks.get("room-311")).toEqual({ room: "room-311", status: "klar", source: "room_check", at: "03:14:30", note: "Nobody is here. The room is tidy." });
    expect(checks.get("room-301")?.at).toBe("22:40:13");
  });

  it("finds the rooms that can be sold, the guest without a booking, and leaves out a check before 01:00", () => {
    const result = reconcileRooms(robotRoomChecks(TEST_NIGHT), pmsLastNight());
    expect(result.sellable).toEqual([{ room: "room-311", guest: "Silje Mørk", at: "03:14:30", departure: addDays(osloToday(), 1) }]);
    expect(result.held).toEqual([]);
    expect(result.guestFound).toEqual([{ room: "room-210", at: "03:15:28", source: "knock", who: "Ms Bakke" }]);
    expect(result.tooEarly.map((row) => row.room)).toEqual(["room-301"]);
    expect(result).toMatchObject({ checked: 4, agree: 1 });
  });

  it("reads the recorded demo night: 213 to sell (due out yesterday, check-out never recorded), 209 held (the robot carried arrivals' bags in), 210 a guest without a booking", () => {
    const today = osloToday();
    const result = reconcileNight(demoLines(), pmsLastNight(today), today);
    // A real sleeper: the system still holds 213 tonight, so releasing it is a room-night that would stand unsold.
    expect(result.sellable).toEqual([{ room: "room-213", guest: "Ola Nygård", at: "04:24:42", departure: addDays(today, -1) }]);
    expect(result.dueOut).toEqual([]);
    expect(result.held).toHaveLength(1);
    const [held] = result.held;
    expect(held).toMatchObject({ room: "room-209", guest: "Hiroshi Sato", at: "03:47:31", departure: addDays(today, 1), deliveredAt: "05:16:33", arrival: true, arrivals: 3 });
    expect(held.deliveries.map((delivery) => delivery.at)).toEqual(["01:29:26", "04:35:26", "05:16:33"]);
    expect(result.guestFound.map((row) => row.room)).toEqual(["room-210"]);
    expect(result.agree).toBe(result.checked - 3);
  });

  it("flags rooms the robot carried bags into for more than one arrival, from its own log, 209 already held", () => {
    const result = reconcileNight(demoLines(), pmsLastNight(osloToday()), osloToday());
    expect(result.crowded).toEqual([
      { room: "room-212", arrivals: 3, at: ["00:31:11", "01:58:59", "04:43:43"] },
      { room: "room-304", arrivals: 2, at: ["00:50:35", "04:17:06"] },
    ]);
    // No booking system needed: the same flags with an empty one.
    expect(reconcileNight(demoLines(), new Map()).crowded.map((row) => row.room)).toEqual(["room-209", "room-212", "room-304"]);
  });

  it("does not sell a guest due out today: that room is already in tonight's inventory, an early clean at most", () => {
    const today = osloToday();
    const pms = new Map([["room-311", { room: "room-311", guest: "Silje Mørk", departure: today, rate: 1450 }]]);
    const result = reconcileRooms(robotRoomChecks(TEST_NIGHT), pms, new Map(), today);
    expect(result.sellable).toEqual([]);
    expect(result.dueOut).toEqual([{ room: "room-311", guest: "Silje Mørk", at: "03:14:30", departure: today }]);
    expect(result.agree).toBe(result.checked - result.dueOut.length - result.guestFound.length - result.tooEarly.length);
  });

  it("lists what the robot put in each room tonight, and which of it was an arriving guest's bags", () => {
    const deliveries = robotDeliveries(demoLines());
    expect(deliveries.get("room-209")?.map((delivery) => [delivery.at, delivery.item, delivery.arrival])).toEqual([
      ["01:29:26", "luggage-209", true],
      ["04:35:26", "luggage-209-64", true],
      ["05:16:33", "luggage-209-77", true],
    ]);
    expect(deliveries.get("room-136")?.every((delivery) => !delivery.arrival)).toBe(true);
    // A sign put down in a corridor is not a delivery into a room.
    expect([...deliveries.keys()].every((room) => room.startsWith("room-"))).toBe(true);
  });

  it("holds a room the robot delivered into after its check, and leaves one delivered to before the check for sale", () => {
    const place = (clock: string, item: string): RunLine => ({ v: 1, type: "call", cmd: "place", args: { item, where: "room-311" }, ok: true, clock });
    const after = reconcileNight([...TEST_NIGHT, place("04:10:00", "towel")], pmsLastNight());
    expect(after.sellable).toEqual([]);
    expect(after.held).toMatchObject([{ room: "room-311", deliveredAt: "04:10:00", arrival: false }]);
    // A towel at 23:00 says nothing about 03:14; the empty-and-tidy check stands.
    const before = reconcileNight([...TEST_NIGHT.slice(0, 3), place("23:00:00", "towel"), ...TEST_NIGHT.slice(3)], pmsLastNight());
    expect(before.sellable.map((row) => row.room)).toEqual(["room-311"]);
    // Bags for an arrival hold the room whenever they came.
    const bags = reconcileNight([...TEST_NIGHT.slice(0, 3), place("23:00:00", "luggage-311"), ...TEST_NIGHT.slice(3)], pmsLastNight());
    expect(bags.held.map((row) => row.room)).toEqual(["room-311"]);
    expect(bags.agree).toBe(1);
  });

  it("names the person who opened the door, and nothing else", () => {
    expect(personAtDoor("Dr Kowalski opens the door of room-104.")).toBe("Dr Kowalski");
    expect(personAtDoor("Nobody is here.")).toBeNull();
    expect(personAtDoor(null)).toBeNull();
  });

  it("works out last night's room revenue, average rate and revenue per available room", () => {
    const revenue = revenueLastNight(36);
    expect(revenue.roomsSold).toBe(31);
    expect(revenue.adr).toBe(Math.round(revenue.revenue / 31));
    expect(revenue.revpar).toBe(Math.round(revenue.revenue / 36));
    expect(revenueLastNight(0, new Map())).toEqual({ roomsSold: 0, revenue: 0, adr: 0, revpar: 0 });
  });
});

describe("the marks staff set per day", () => {
  beforeEach(() => localStorage.clear());

  it("stores a mark per day and room, takes it back, and ignores broken storage", () => {
    markRoom("2026-11-08", "room-311", { action: "released", at: "06:04", by: "Ana Pereira" });
    expect(JSON.parse(localStorage.getItem("lobby:room-check-marks") ?? "{}")).toEqual({ "2026-11-08": { "room-311": { action: "released", at: "06:04", by: "Ana Pereira" } } });
    markRoom("2026-11-08", "room-311", null);
    expect(ROOM_CHECK_MARKS.read()).toEqual({ "2026-11-08": {} });

    localStorage.setItem("lobby:room-check-marks", JSON.stringify({ "2026-11-08": { "room-1": { action: "nonsense" } }, x: 3 }));
    expect(ROOM_CHECK_MARKS.read()).toEqual({ "2026-11-08": {} });
  });

  it("keeps the two steps of a sale: confirmed, then released with the confirmation it stood on", () => {
    const confirmed = { action: "confirmed" as const, at: "06:02", by: "Siri Haugen", stamp: "2026-11-08T05:02:00.000Z" };
    markRoom("2026-11-08", "room-213", confirmed);
    expect(ROOM_CHECK_MARKS.read()["2026-11-08"]["room-213"]).toEqual(confirmed);
    const released = { action: "released" as const, at: "06:03", by: "Siri Haugen", stamp: "2026-11-08T05:03:00.000Z", confirmed: { at: "06:02", by: "Siri Haugen", stamp: confirmed.stamp } };
    markRoom("2026-11-08", "room-213", released);
    expect(ROOM_CHECK_MARKS.read()["2026-11-08"]["room-213"]).toEqual(released);
  });
});
