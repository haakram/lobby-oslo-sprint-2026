import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { parseRunLog } from "@/features/nightshift/runlog";
import { pmsLastNight, revenueLastNight } from "./pms";
import { markRoom, personAtDoor, reconcileRooms, robotRoomChecks, ROOM_CHECK_MARKS } from "./reconcile";
import { TEST_NIGHT } from "./testNight";

describe("the robot's room checks against the booking system", () => {
  it("keeps the robot's last word per room, with the shift clock and what it saw", () => {
    const checks = robotRoomChecks(TEST_NIGHT);
    expect(checks.size).toBe(4);
    expect(checks.get("room-331")).toEqual({ room: "room-331", status: "klar", source: "room_check", at: "03:14:30", note: "Nobody is here. The room is tidy." });
    expect(checks.get("room-321")?.at).toBe("22:40:13");
  });

  it("finds the rooms that can be sold, the guest without a booking, and leaves out a check before 01:00", () => {
    const result = reconcileRooms(robotRoomChecks(TEST_NIGHT), pmsLastNight());
    expect(result.sellable).toEqual([{ room: "room-331", guest: "Silje Mørk", at: "03:14:30" }]);
    expect(result.guestFound).toEqual([{ room: "room-328", at: "03:15:28", source: "knock", who: "Ms Bakke" }]);
    expect(result.tooEarly.map((row) => row.room)).toEqual(["room-321"]);
    expect(result).toMatchObject({ checked: 4, agree: 1 });
  });

  it("reads the recorded demo night: 2 rooms to sell (212, 331), 1 guest without a booking (328)", () => {
    const { lines } = parseRunLog(readFileSync(resolve(process.cwd(), "public/runs/demo.jsonl"), "utf8"));
    const result = reconcileRooms(robotRoomChecks(lines), pmsLastNight());
    expect(result.sellable.map((row) => row.room)).toEqual(["room-212", "room-331"]);
    expect(result.guestFound.map((row) => row.room)).toEqual(["room-328"]);
    expect(result.agree).toBeGreaterThan(20);
  });

  it("names the person who opened the door, and nothing else", () => {
    expect(personAtDoor("Dr Kowalski opens the door of room-104.")).toBe("Dr Kowalski");
    expect(personAtDoor("Nobody is here.")).toBeNull();
    expect(personAtDoor(null)).toBeNull();
  });

  it("works out last night's room revenue, average rate and revenue per available room", () => {
    const revenue = revenueLastNight(36);
    expect(revenue.roomsSold).toBe(28);
    expect(revenue.adr).toBe(Math.round(revenue.revenue / 28));
    expect(revenue.revpar).toBe(Math.round(revenue.revenue / 36));
    expect(revenueLastNight(0, new Map())).toEqual({ roomsSold: 0, revenue: 0, adr: 0, revpar: 0 });
  });
});

describe("the marks staff set per day", () => {
  beforeEach(() => localStorage.clear());

  it("stores a mark per day and room, takes it back, and ignores broken storage", () => {
    markRoom("2026-11-08", "room-331", { action: "released", at: "06:04", by: "Ana Pereira" });
    expect(JSON.parse(localStorage.getItem("lobby:room-check-marks") ?? "{}")).toEqual({ "2026-11-08": { "room-331": { action: "released", at: "06:04", by: "Ana Pereira" } } });
    markRoom("2026-11-08", "room-331", null);
    expect(ROOM_CHECK_MARKS.read()).toEqual({ "2026-11-08": {} });

    localStorage.setItem("lobby:room-check-marks", JSON.stringify({ "2026-11-08": { "room-1": { action: "nonsense" } }, x: 3 }));
    expect(ROOM_CHECK_MARKS.read()).toEqual({ "2026-11-08": {} });
  });
});
