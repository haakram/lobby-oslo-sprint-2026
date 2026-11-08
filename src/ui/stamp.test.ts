import { describe, expect, it } from "vitest";
import { actionStamp, relativeTime } from "./stamp";

const NOW = Date.parse("2026-11-08T14:15:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("action stamps: who and how long ago, never a wall-clock time", () => {
  it("says nå, minutes, hours, i går and days", () => {
    expect(relativeTime(ago(10_000), NOW)).toBe("nå");
    expect(relativeTime(ago(-20_000), NOW)).toBe("nå");
    expect(relativeTime(ago(3 * 60_000), NOW)).toBe("for 3 min siden");
    expect(relativeTime(ago(60 * 60_000), NOW)).toBe("for 1 time siden");
    expect(relativeTime(ago(5 * 60 * 60_000 + 59_000), NOW)).toBe("for 5 timer siden");
    expect(relativeTime(ago(30 * 60 * 60_000), NOW)).toBe("i går");
    expect(relativeTime(ago(3 * 24 * 60 * 60_000), NOW)).toBe("for 3 dager siden");
  });

  it("has no time for an old clock-only stamp or nothing at all", () => {
    expect(relativeTime("06:04", NOW)).toBeNull();
    expect(relativeTime(null, NOW)).toBeNull();
    expect(relativeTime("2026-11-08Tnonsense", NOW)).toBeNull();
  });

  it("puts the name first, and never prints a clock", () => {
    expect(actionStamp("Siri Haugen", ago(5_000), NOW)).toBe("Siri Haugen · nå");
    expect(actionStamp("Siri Haugen", ago(3 * 60_000), NOW)).toBe("Siri Haugen · for 3 min siden");
    expect(actionStamp("Siri Haugen", "06:04", NOW)).toBe("Siri Haugen");
    expect(actionStamp(null, ago(5_000), NOW)).toBe("Personalet · nå");
    expect(actionStamp("Siri Haugen", ago(3 * 60_000), NOW)).not.toMatch(/\d{2}:\d{2}/);
  });
});
