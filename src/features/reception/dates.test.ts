import { describe, expect, it } from "vitest";
import { addDays, daysBetween, osloToday, parseIsoDate } from "./dates";

describe("dates", () => {
  it("osloToday uses the Oslo calendar day", () => {
    expect(osloToday(new Date("2026-11-07T23:30:00Z"))).toBe("2026-11-08");
  });

  it("parseIsoDate is strict and checks the calendar", () => {
    expect(parseIsoDate("2027-02-29")).toBeNull();
    expect(parseIsoDate("2028-02-29")).toBe("2028-02-29");
    expect(parseIsoDate("2026-11-7")).toBeNull();
    expect(parseIsoDate("7. november")).toBeNull();
    expect(parseIsoDate(20261107)).toBeNull();
    expect(parseIsoDate(undefined)).toBeNull();
  });

  it("does calendar math in UTC, unaffected by DST", () => {
    expect(daysBetween("2027-03-27", "2027-03-29")).toBe(2);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-11-07", -7)).toBe("2026-10-31");
  });
});
