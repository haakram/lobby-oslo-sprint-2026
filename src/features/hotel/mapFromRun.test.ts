import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseRunLog } from "@/features/nightshift/runlog";
import { BASE_HOTEL, floorFromId, floorsOf, hotelForRun, nodeFloorIn, roomsOf } from "./mapFromRun";

const read = (path: string) => parseRunLog(readFileSync(resolve(process.cwd(), path), "utf8")).lines;
// The Saturday demo night (seed 5), trimmed to the lines that shape the map.
const SEED5 = read("src/features/hotel/fixtures/seed5-map.jsonl");
// Today's demo night: the final agent's seed-16 shift (2,680 points).
const SEED16 = read("public/runs/demo.jsonl");
const SEED1 = read("src/features/nightshift/fixtures/sample.jsonl");

const neighbours = (map: ReturnType<typeof hotelForRun>, id: string) =>
  map.edges.flatMap((edge) => (edge.a === id ? [edge.b] : edge.b === id ? [edge.a] : []));

describe("hotelForRun on the seed-5 night", () => {
  const map = hotelForRun(SEED5);

  it("is the night's hotel, not seed 1", () => {
    expect(map.seed).toBe(5);
    expect(map.fromRun).toBe(true);
    expect(BASE_HOTEL.nodes["room-327"]).toBeUndefined();
    expect(map.nodes["room-327"]).toMatchObject({ kind: "room", floor: 3, inferred: true });
  });

  it("has floor 3 as rooms 321–334 and none of seed 1's 311–320", () => {
    const floor3 = roomsOf(map)
      .filter((room) => room.floor === 3)
      .map((room) => room.id);
    expect(floor3).toEqual(Array.from({ length: 14 }, (_, i) => `room-${321 + i}`));
    for (let n = 311; n <= 320; n += 1) expect(map.nodes[`room-${n}`]).toBeUndefined();
    expect(roomsOf(map).length).toBe(36);
    expect(floorsOf(map)).toEqual([1, 2, 3]);
  });

  it("attaches each room to the corridor that listed it, and only that one", () => {
    expect(neighbours(map, "room-327")).toEqual(["corridor-3b"]);
    expect(neighbours(map, "room-324")).toEqual(["corridor-3b"]); // seed 1 had it on corridor-3d
    expect(neighbours(map, "room-321")).toEqual(["corridor-3a"]);
    expect(neighbours(map, "room-334")).toEqual(["corridor-3d"]);
    const edge = map.edges.find((e) => [e.a, e.b].includes("room-327") && [e.a, e.b].includes("corridor-3b"));
    expect(edge).toMatchObject({ m: 4, door: true });
  });

  it("places every node with finite coordinates near its corridor, no two rooms on top of each other", () => {
    for (const node of Object.values(map.nodes)) {
      expect(Number.isFinite(node.x) && Number.isFinite(node.z)).toBe(true);
    }
    const rooms = roomsOf(map);
    for (const room of rooms) {
      const corridor = neighbours(map, room.id).map((id) => map.nodes[id]).find((node) => node?.kind === "corridor");
      expect(corridor, room.id).toBeDefined();
      // Rooms sit on the corridor's segment, four metres to the side, so at most the segment's length away.
      expect(Math.hypot(room.x - corridor!.x, room.z - corridor!.z)).toBeLessThan(22);
    }
    for (const a of rooms) {
      for (const b of rooms) {
        if (a.id < b.id && a.floor === b.floor) expect(Math.hypot(a.x - b.x, a.z - b.z), `${a.id} vs ${b.id}`).toBeGreaterThan(1.5);
      }
    }
  });

  it("keeps floors 1 and 2 as the base, and the robot's own path on the map", () => {
    for (const room of roomsOf(BASE_HOTEL).filter((r) => r.floor < 3)) expect(map.nodes[room.id]).toMatchObject({ x: room.x, z: room.z });
    for (const line of SEED5) {
      if (line.type === "state" && line.location) expect(map.nodes[line.location], line.location).toBeDefined();
    }
    expect(nodeFloorIn(map, "room-327")).toBe(3);
    expect(nodeFloorIn(map, "room-999")).toBe(9);
    expect(floorFromId("lobby")).toBeNull();
  });

  it("is deterministic", () => {
    expect(hotelForRun(SEED5)).toEqual(map);
  });
});

describe("hotelForRun on the seed-16 demo night", () => {
  const map = hotelForRun(SEED16);
  const floor = (n: number) =>
    roomsOf(map)
      .filter((room) => room.floor === n)
      .map((room) => room.id);

  it("is the night's hotel: 131–138, 201–214 and 301–314", () => {
    expect(map.seed).toBe(16);
    expect(floor(1)).toEqual(Array.from({ length: 8 }, (_, i) => `room-${131 + i}`));
    expect(floor(2)).toEqual(Array.from({ length: 14 }, (_, i) => `room-${201 + i}`));
    expect(floor(3)).toEqual(Array.from({ length: 14 }, (_, i) => `room-${301 + i}`));
  });

  it("puts the rooms of the hall's last corridor around it, never on the rooms before it", () => {
    expect(neighbours(map, "room-137")).toEqual(["corridor-1c"]);
    const corridor = map.nodes["corridor-1c"];
    for (const id of ["room-137", "room-138"]) {
      expect(Math.hypot(map.nodes[id].x - corridor.x, map.nodes[id].z - corridor.z), id).toBeLessThan(8);
    }
    const rooms = roomsOf(map);
    for (const a of rooms) {
      for (const b of rooms) {
        if (a.id < b.id && a.floor === b.floor) expect(Math.hypot(a.x - b.x, a.z - b.z), `${a.id} vs ${b.id}`).toBeGreaterThan(1.5);
      }
    }
  });

  it("keeps the floor-3 loop's rooms on their own side (d→a)", () => {
    for (const id of ["room-311", "room-314"]) expect(map.nodes[id].x).toBeLessThan(0);
  });
});

describe("hotelForRun on the seed-1 fixture and without a log", () => {
  it("keeps every seed-1 room when the log matches the base", () => {
    const map = hotelForRun(SEED1);
    expect(map.seed).toBe(1);
    expect(roomsOf(map).map((room) => room.id)).toEqual(roomsOf(BASE_HOTEL).map((room) => room.id));
    for (const room of roomsOf(BASE_HOTEL)) expect(map.nodes[room.id]).toMatchObject({ x: room.x, z: room.z });
  });

  it("is the base when there is nothing to learn from", () => {
    const map = hotelForRun([]);
    expect(map.fromRun).toBe(false);
    expect(Object.keys(map.nodes).sort()).toEqual(Object.keys(BASE_HOTEL.nodes).sort());
  });
});
