import type { HotelMap } from "./hotelMap";

// How the floor plan is drawn from the routing graph: corridors are the edges between open nodes
// (corridors, hubs, elevators, stairs), every room and service room gets a door on the nearest
// corridor, and a route is drawn corridor → door → room instead of straight across the floor.

export type Point = { x: number; z: number };
export type Frame = { minX: number; minZ: number; width: number; height: number };

/** Room tiles are this many metres square. */
export const TILE = 2.8;
const PAD = 2.4;
const DOOR_KINDS = new Set(["room", "service"]);

const isDoorKind = (map: HotelMap, id: string) => DOOR_KINDS.has(map.nodes[id]?.kind ?? "");

/** The floor's bounds: room around the outermost nodes, and every extra point (labels) inside. */
export function floorFrame(map: HotelMap, floor: number, extra: Point[] = []): Frame {
  const nodes = Object.values(map.nodes).filter((n) => n.floor === floor);
  const minX = Math.min(...nodes.map((n) => n.x - PAD), ...extra.map((p) => p.x));
  const minZ = Math.min(...nodes.map((n) => n.z - PAD), ...extra.map((p) => p.z));
  const maxX = Math.max(...nodes.map((n) => n.x + PAD), ...extra.map((p) => p.x));
  const maxZ = Math.max(...nodes.map((n) => n.z + PAD), ...extra.map((p) => p.z));
  return { minX, minZ, width: maxX - minX, height: maxZ - minZ };
}

/** Where a service room's name goes: just outside its tile, on the side away from its door. */
export function labelPoint(centre: Point, door: Point): Point {
  const dx = centre.x - door.x;
  const dz = centre.z - door.z;
  const len = Math.hypot(dx, dz) || 1;
  return { x: centre.x + (dx / len) * (TILE / 2 + 0.9), z: centre.z + (dz / len) * (TILE / 2 + 0.9) };
}

type Segment = { a: string; b: string };

function openSegments(map: HotelMap, floor: number): Segment[] {
  return map.edges
    .filter((e) => !e.stairs && !isDoorKind(map, e.a) && !isDoorKind(map, e.b))
    .filter((e) => map.nodes[e.a]?.floor === floor && map.nodes[e.b]?.floor === floor)
    .map((e) => ({ a: e.a, b: e.b }));
}

/** Where `p` falls on the line through a and b: t (0..1 inside the segment) and the foot point. */
function project(p: Point, a: Point, b: Point): { t: number; foot: Point; distance: number } {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lengthSq = dx * dx + dz * dz || 1;
  const t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / lengthSq;
  const foot = { x: a.x + t * dx, z: a.z + t * dz };
  return { t, foot, distance: Math.hypot(p.x - foot.x, p.z - foot.z) };
}

export type FloorGeometry = {
  frame: Frame;
  /** Corridor bands, stretched to reach every door on them. */
  corridors: [Point, Point][];
  /** Door → room centre, for every room and service room. */
  doors: Map<string, Point>;
};

const cache = new WeakMap<HotelMap, Map<number, FloorGeometry>>();

/**
 * A room's door is on a corridor that touches the node it connects to: preferably one it sits
 * beside (its foot falls inside the corridor), else the corridor's straight continuation.
 */
export function floorGeometry(map: HotelMap, floor: number): FloorGeometry {
  const byFloor = cache.get(map) ?? new Map<number, FloorGeometry>();
  cache.set(map, byFloor);
  const known = byFloor.get(floor);
  if (known) return known;

  const segments = openSegments(map, floor);
  const corridorOnly = segments.filter((s) => map.nodes[s.a].kind === "corridor" && map.nodes[s.b].kind === "corridor");
  const reach = new Map<Segment, { lo: number; hi: number }>(segments.map((s) => [s, { lo: 0, hi: 1 }]));
  const doors = new Map<string, Point>();

  for (const [id, node] of Object.entries(map.nodes)) {
    if (node.floor !== floor || !isDoorKind(map, id)) continue;
    const neighbours = map.edges.flatMap((e) => (e.a === id ? [e.b] : e.b === id ? [e.a] : []));
    const touching = (list: Segment[]) => list.filter((s) => neighbours.includes(s.a) || neighbours.includes(s.b));
    const candidates = touching(corridorOnly).length ? touching(corridorOnly) : touching(segments);
    let best: { segment: Segment; t: number; foot: Point; score: number } | null = null;
    for (const segment of candidates) {
      const p = project(node, map.nodes[segment.a], map.nodes[segment.b]);
      // Beside the corridor beats its continuation; then the nearer one.
      const score = (p.t >= 0 && p.t <= 1 ? 0 : 1000) + p.distance;
      if (!best || score < best.score) best = { segment, t: p.t, foot: p.foot, score };
    }
    if (best) {
      doors.set(id, best.foot);
      const r = reach.get(best.segment)!;
      r.lo = Math.min(r.lo, best.t);
      r.hi = Math.max(r.hi, best.t);
    } else {
      const neighbour = map.nodes[neighbours[0]];
      doors.set(id, neighbour ? { x: neighbour.x, z: neighbour.z } : { x: node.x, z: node.z });
    }
  }

  const corridors = segments.map((s): [Point, Point] => {
    const a = map.nodes[s.a];
    const b = map.nodes[s.b];
    const { lo, hi } = reach.get(s)!;
    const at = (t: number) => ({ x: a.x + t * (b.x - a.x), z: a.z + t * (b.z - a.z) });
    return [at(lo), at(hi)];
  });

  // Service names sit outside their tiles; the frame grows to keep them on the plan.
  const labels = [...doors]
    .filter(([id]) => map.nodes[id].kind === "service")
    .map(([id, door]) => labelPoint(map.nodes[id], door))
    .flatMap((p) => [
      { x: p.x, z: p.z - 0.9 },
      { x: p.x, z: p.z + 0.9 },
    ]);
  const geometry = { frame: floorFrame(map, floor, labels), corridors, doors };
  byFloor.set(floor, geometry);
  return geometry;
}

const near = (a: Point, b: Point) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.z - b.z) < 1e-6;
const collinear = (p: Point, q: Point, s: Point) => Math.abs((q.x - p.x) * (s.z - p.z) - (q.z - p.z) * (s.x - p.x)) < 1e-6;

/**
 * The points to draw for a stretch of route on one floor. A room is entered and left through its
 * door; a corridor point the walk only passes to come straight back (or passes in a straight
 * line) is dropped, so the line runs along the corridor to the door and turns in.
 */
export function runPoints(map: HotelMap, nodes: string[]): Point[] {
  if (nodes.length === 0) return [];
  const floor = map.nodes[nodes[0]].floor;
  const { doors } = floorGeometry(map, floor);
  const raw: Point[] = [];
  nodes.forEach((id, i) => {
    const n = map.nodes[id];
    const centre = { x: n.x, z: n.z };
    const door = doors.get(id);
    if (!door) raw.push(centre);
    else if (nodes.length === 1) raw.push(centre);
    else if (i === 0) raw.push(centre, door);
    else if (i === nodes.length - 1) raw.push(door, centre);
    else raw.push(door, centre, door);
  });
  const points = raw.filter((p, i) => i === 0 || !near(p, raw[i - 1]));
  for (let changed = true; changed; ) {
    changed = false;
    for (let i = 1; i < points.length - 1; i++) {
      if (!near(points[i - 1], points[i + 1]) && collinear(points[i - 1], points[i], points[i + 1])) {
        points.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return points;
}

/** SVG path data in frame coordinates. */
export function pathData(points: Point[], frame: Frame): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${round(p.x - frame.minX)} ${round(p.z - frame.minZ)}`).join(" ");
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Percent position of a point over the frame, for HTML laid over the drawing. */
export function percentOf(p: Point, frame: Frame): { left: number; top: number } {
  return { left: ((p.x - frame.minX) / frame.width) * 100, top: ((p.z - frame.minZ) / frame.height) * 100 };
}
