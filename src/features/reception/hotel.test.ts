import { describe, expect, it } from "vitest";
import { directPrice, findRoomType, ROOM_TYPES } from "./hotel";

describe("hotel", () => {
  it("applies the direct discount, rounded", () => {
    const dobbel = findRoomType("dobbeltrom")!;
    expect(directPrice(dobbel)).toBe(1521);
  });

  it("has the four room types with the spec numbers", () => {
    expect(ROOM_TYPES.map((r) => [r.id, r.maxGuests, r.rooms, r.otaPrice])).toEqual([
      ["enkeltrom", 1, 10, 1290],
      ["dobbeltrom", 2, 20, 1690],
      ["familierom", 4, 6, 2390],
      ["suite", 2, 2, 3490],
    ]);
  });

  it("finds room types case- and accent-insensitively, including aliases", () => {
    expect(findRoomType("Double room")?.id).toBe("dobbeltrom");
    expect(findRoomType("FAMILIEROM")?.id).toBe("familierom");
    expect(findRoomType("enkel")?.id).toBe("enkeltrom");
    expect(findRoomType("family")?.id).toBe("familierom");
    expect(findRoomType("Suíte")?.id).toBe("suite");
  });

  it("returns undefined for unknown or empty input", () => {
    expect(findRoomType("penthouse")).toBeUndefined();
    expect(findRoomType("")).toBeUndefined();
  });
});
