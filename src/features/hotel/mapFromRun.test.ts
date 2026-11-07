import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseRunLog } from "@/features/nightshift/runlog";
import { BASE_HOTEL, floorFromId, floorsOf, hotelForRun, nodeFloorIn, roomsOf } from "./mapFromRun";

const read = (path: string) => parseRunLog(readFileSync(resolve(process.cwd(), path), "utf8")).lines;
const SEED5 = read("public/runs/demo.jsonl");
const SEED1 = read("src/features/nightshift/fixtures/sample.jsonl");

const neighbours = (map: ReturnType<typeof hotelForRun>, id: string) =>
  map.edges.flatMap((edge) => (edge.a === id ? [edge.b] : edge.b === id ? [edge.a] : []));

describe("hotelForRun on the seed-5 demo night", () => {
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
