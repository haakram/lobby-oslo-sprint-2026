import { describe, expect, it } from "vitest";
import { SHIFTS, shiftAt } from "./testData";

describe("shiftAt", () => {
  it("follows the shift plan: the day starts at the 06:00 handover, the evening ends when the night starts", () => {
    expect([0, 5, 6, 13, 14, 21, 22, 23].map(shiftAt)).toEqual(["natt", "natt", "dag", "dag", "kveld", "kveld", "natt", "natt"]);
  });

  it("has shifts that meet, so there is no hour without one and no hour with two", () => {
    for (const [index, shift] of SHIFTS.entries()) expect(SHIFTS[(index + 1) % SHIFTS.length].from).toBe(shift.to);
  });
});
