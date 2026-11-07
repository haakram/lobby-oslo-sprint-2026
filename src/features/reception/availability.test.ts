import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkAvailability,
  defaultOccupancy,
  FULLY_BOOKED_DATES,
} from "./availability";
import type { Occupancy } from "./availability";
import { addDays } from "./dates";
import { ROOM_TYPES } from "./hotel";

const today = "2026-11-07";
const free: Occupancy = () => 0;
const check = (q: Parameters<typeof checkAvailability>[0], occupancy: Occupancy = free) =>
  checkAvailability(q, { today, occupancy });
const base = { arrival: "2026-11-20", departure: "2026-11-22", guests: 2 };
const problem = (q: Parameters<typeof checkAvailability>[0]) => {
  const r = check(q);
  if (r.ok) throw new Error("expected a problem");
  return r.problem;
};

describe("checkAvailability", () => {
  it("offers rooms for a free stay and prices them", () => {
    const r = check(base);
    if (!r.ok) throw new Error("expected ok");
    expect(r.nights).toBe(2);
    expect(r.offers.map((o) => o.room.id)).not.toContain("enkeltrom");
    const dobbel = r.offers.find((o) => o.room.id === "dobbeltrom")!;
    expect(dobbel.directTotal).toBe(3042);
    expect(dobbel.otaTotal).toBe(3380);
  });

  it("rejects room too small and bad guest counts", () => {
    expect(problem({ ...base, room: "suite", guests: 3 })).toMatchObject({ kind: "room-too-small" });
    for (const guests of [9, 0, -1, 2.5, "two"]) {
      expect(problem({ ...base, guests })).toEqual({ kind: "guests" });
    }
  });

  it("rejects bad dates", () => {
    expect(problem({ ...base, arrival: "2026-02-31" })).toEqual({ kind: "bad-date", field: "arrival" });
    expect(problem({ ...base, departure: "soon" })).toEqual({ kind: "bad-date", field: "departure" });
  });

  it("checks past, order, length and horizon", () => {
    expect(problem({ ...base, arrival: "2026-11-06" })).toEqual({ kind: "past" });
    expect(problem({ ...base, departure: base.arrival })).toEqual({ kind: "order" });
    expect(problem({ ...base, departure: "2026-11-19" })).toEqual({ kind: "order" });
    expect(problem({ ...base, departure: "2026-12-21" })).toEqual({ kind: "too-long" });
    expect(problem({ ...base, arrival: "2027-11-08", departure: "2027-11-10" })).toEqual({ kind: "too-far" });
    expect(check({ arrival: today, departure: "2026-11-08", guests: 1 }).ok).toBe(true);
  });

  it("rejects unknown rooms", () => {
    expect(problem({ ...base, room: "penthouse" })).toEqual({ kind: "unknown-room", room: "penthouse" });
  });

  it("reports sold-out dates and the next free arrival", () => {
    const r = checkAvailability(
      { arrival: "2026-11-13", departure: "2026-11-15", guests: 2 },
      { today, occupancy: defaultOccupancy },
    );
    if (!r.ok) throw new Error("expected ok");
    expect(r.offers).toEqual([]);
    expect(r.nextFreeArrival! > "2026-11-13").toBe(true);
    expect(r.nextFreeArrival! <= addDays("2026-11-13", 14)).toBe(true);
  });

  it("returns no next arrival when everything is full", () => {
    const r = check(base, () => 999);
    if (!r.ok) throw new Error("expected ok");
    expect(r.offers).toEqual([]);
    expect(r.nextFreeArrival).toBeNull();
  });
});

describe("defaultOccupancy", () => {
  it("is deterministic and within 0..rooms", () => {
    for (let i = 0; i < 400; i++) {
      const date = addDays("2026-11-07", i);
      for (const room of ROOM_TYPES) {
        const n = defaultOccupancy(date, room.id);
        expect(n).toBe(defaultOccupancy(date, room.id));
        expect(Number.isInteger(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(room.rooms);
      }
    }
  });

  it("is full on the fully booked dates", () => {
    for (const d of FULLY_BOOKED_DATES) {
      for (const room of ROOM_TYPES) expect(defaultOccupancy(d, room.id)).toBe(room.rooms);
    }
  });
});

describe("checkAvailability default today", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses the Oslo date, not the UTC date", () => {
    // 23:30 UTC on 7 Nov is already 8 Nov in Oslo.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-07T23:30:00Z"));
    const r = checkAvailability(
      { arrival: "2026-11-07", departure: "2026-11-09", guests: 1 },
      { occupancy: free },
    );
    expect(r.today).toBe("2026-11-08");
    expect(r.ok).toBe(false);
  });
});
