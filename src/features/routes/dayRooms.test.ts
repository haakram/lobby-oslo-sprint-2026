import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { hotelForRun } from "@/features/hotel";
import { parseRunLog } from "@/features/nightshift/runlog";
import { planCleaning } from "./cleaningPlan";
import { dayRooms } from "./dayRooms";
import { roomStatusAt } from "./nightRooms";
import { cleaningSavings } from "./SavingBand";

// Today's departures as the booking system's test data has them for the demo hotel.
vi.mock("@/features/guests/testData", () => ({
  selectGuestDay: () => ({
    departures: ["room-201", "room-203", "room-206", "room-214", "room-305", "room-313"].map((room) => ({
      room,
      notes: room === "room-203" ? ["Sen utsjekk 14:00"] : [],
    })),
  }),
}));

const DEMO = parseRunLog(readFileSync(resolve(process.cwd(), "public/runs/demo.jsonl"), "utf8")).lines;

describe("dayRooms on the demo night", () => {
  const day = dayRooms(roomStatusAt(DEMO));

  it("leads with the room the robot found dirty, then the departures by checkout time, the late one last", () => {
    expect(day.map((entry) => entry.room)).toEqual(["room-135", "room-206", "room-313", "room-201", "room-305", "room-214", "room-203"]);
    expect(day[0]).toEqual({ room: "room-135", why: "natt", at: "05:02" });
    expect(day.at(-1)).toEqual({ room: "room-203", why: "utsjekk", at: "14:00" });
  });

  it("saves time and lift rides against walking them as they come free, across three floors", () => {
    const plan = planCleaning(hotelForRun(DEMO), { start: "laundry", rooms: day.map((entry) => entry.room), cart: true });
    if (!plan || "error" in plan) throw new Error("expected a plan");
    expect(plan.elevatorRides).toBe(3);
    expect(plan.givenRides).toBe(6);
    expect(plan.saved.metres).toBeGreaterThan(0);
    const win = cleaningSavings(plan);
    expect(win).toMatchObject({ lead: "time", rides: 3 });
    expect(win.minutes).toBeGreaterThanOrEqual(3);
    expect(win.timePercent).toBeGreaterThanOrEqual(25);
  });

  it("leaves out a departure behind a Do-Not-Disturb sign, and never lists a room twice", () => {
    const statuses = new Map([
      ["room-206", { room: "room-206", status: "ikke_forstyrr" as const, clock: "03:00:00", note: null }],
      ["room-201", { room: "room-201", status: "ma_vaskes" as const, clock: "02:00:00", note: null }],
    ]);
    expect(dayRooms(statuses).map((entry) => entry.room)).toEqual(["room-201", "room-313", "room-305", "room-214", "room-203"]);
  });
});
