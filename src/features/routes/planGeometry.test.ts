import { describe, expect, it } from "vitest";
import { hotelMap } from "./hotelMap";
import { floorFrame, floorGeometry, pathData, runPoints } from "./planGeometry";

const map = hotelMap();

describe("floorGeometry", () => {
  it("puts each room's door on the corridor it sits beside", () => {
    const { doors } = floorGeometry(map, 2);
    expect(doors.get("room-201")).toEqual({ x: 3.25, z: 0 }); // north side of 2a–2b
    expect(doors.get("room-206")).toEqual({ x: 13, z: 9.6 }); // east side of 2b–2c
    expect(doors.get("room-211")).toMatchObject({ x: 0 }); // west side of 2d–2a
  });

  it("stretches a corridor past its end node to reach doors beyond it", () => {
    const { doors, corridors } = floorGeometry(map, 1);
    expect(doors.get("room-101")).toEqual({ x: -4, z: 9 });
    const main = corridors.find(([a, b]) => a.z === 9 && b.z === 9 && Math.min(a.x, b.x) < 0);
    expect(main && Math.min(main[0].x, main[1].x)).toBe(-4);
  });
});

describe("runPoints", () => {
  it("walks along the corridor to the door and turns in, without going to the corner first", () => {
    // room-206 → corridor-2b (the corner) → corridor-2c → room-208.
    expect(runPoints(map, ["room-206", "corridor-2b", "corridor-2c", "room-208"])).toEqual([
      { x: 17, z: 9.6 },
      { x: 13, z: 9.6 },
      { x: 13, z: 16 },
      { x: 9.75, z: 16 },
      { x: 9.75, z: 20 },
    ]);
  });

  it("keeps a room the walk goes into and out of", () => {
    const points = runPoints(map, ["corridor-1a", "corridor-1b", "laundry", "corridor-1b", "corridor-1c"]);
    expect(points).toContainEqual({ x: 9, z: 5 });
  });

  it("draws a single node as one point and nothing as nothing", () => {
    expect(runPoints(map, ["lobby"])).toEqual([{ x: 0, z: 0 }]);
    expect(runPoints(map, [])).toEqual([]);
  });
});

describe("pathData", () => {
  it("writes the points in frame coordinates", () => {
    const frame = floorFrame(map, 2);
    const d = pathData([{ x: frame.minX, z: frame.minZ }, { x: frame.minX + 1, z: frame.minZ + 2 }], frame);
    expect(d).toBe("M0 0 L1 2");
  });
});
