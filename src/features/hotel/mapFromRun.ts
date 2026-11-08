import type { RunLine } from "@/features/nightshift/runlog";
import seed from "./hotel_seed1.json";

/**
 * The hotel map for a given night. Every seed lays the floors out differently (seed 5's third floor
 * is rooms 321–334), so screens never draw the seed-1 json as is: `hotelForRun(lines)` starts from
 * that base and applies what the run log reveals (every `look`'s exits, every `move`), re-attaches
 * rooms to the corridor that listed them, removes base rooms the night proved absent, and places new
 * nodes along their corridor so the 3D and 2D views look right. Pure and deterministic.
 */

export type NodeKind = "room" | "corridor" | "hub" | "service" | "elevator" | "stairwell";

export type HotelNode = {
  id: string;
  floor: number;
  kind: NodeKind;
  x: number;
  z: number;
  /** Placed from the run log, not from the seed-1 base. */
  inferred?: boolean;
};

export type HotelEdge = { a: string; b: string; m: number; door?: boolean; stairs?: boolean };

export type HotelMap = {
  nodes: Record<string, HotelNode>;
  edges: HotelEdge[];
  stock: Record<string, Record<string, number>>;
  special: Record<string, string>;
  /** The run's seed, when the log said. */
  seed: number | null;
  /** True once a run log shaped it; false for the plain seed-1 base. */
  fromRun: boolean;
};

type Seed = {
  nodes: Record<string, { floor: number; kind: string; x: number; z: number }>;
  edges: HotelEdge[];
  stock: Record<string, Record<string, number>>;
  special: Record<string, string>;
};

const HUBS = new Set(["lobby", "front-desk", "lobby-bar", "charging-dock"]);
const ROOM_OFFSET = 4;
const MIN_GAP = 2.2;

function fromSeed(): HotelMap {
  const data = seed as Seed;
  return {
    nodes: Object.fromEntries(
      Object.entries(data.nodes).map(([id, node]) => [id, { id, floor: node.floor, kind: node.kind as NodeKind, x: node.x, z: node.z }]),
    ),
    edges: data.edges.map((edge) => ({ ...edge })),
    stock: data.stock,
    special: data.special,
    seed: 1,
    fromRun: false,
  };
}

/** The seed-1 layout, untouched. Screens use `hotelForRun` once they have a log. */
export const BASE_HOTEL: HotelMap = fromSeed();

export function kindOf(id: string): NodeKind {
  if (id.startsWith("room-")) return "room";
  if (id.startsWith("corridor-")) return "corridor";
  if (id.startsWith("elevator-")) return "elevator";
  if (id.startsWith("stairwell-")) return "stairwell";
  return HUBS.has(id) ? "hub" : "service";
}

/** "room-327" → 3, "corridor-2b" → 2, "elevator-1" → 1; null when the name does not say. */
export function floorFromId(id: string): number | null {
  const match = /^(?:room|corridor|elevator|stairwell)-(\d)/.exec(id);
  return match ? Number(match[1]) : null;
}

export function nodeFloorIn(map: HotelMap, id: string | null | undefined): number {
  if (!id) return 1;
  return map.nodes[id]?.floor ?? floorFromId(id) ?? 1;
}

export function roomsOf(map: HotelMap): HotelNode[] {
  return Object.values(map.nodes)
    .filter((node) => node.kind === "room")
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function floorsOf(map: HotelMap): number[] {
  return [...new Set(Object.values(map.nodes).map((node) => node.floor))].sort((a, b) => a - b);
}

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function rec(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

type Exit = { to: string; metres: number | null; door: boolean };

function exitsOf(result: Record<string, unknown>): Exit[] {
  if (!Array.isArray(result.exits)) return [];
  return result.exits.flatMap((entry) => {
    const exit = rec(entry);
    const to = str(exit?.to);
    if (!exit || !to) return [];
    return [{ to, metres: num(exit.metres), door: exit.door !== undefined && exit.door !== null && exit.door !== false }];
  });
}

export function hotelForRun(lines: readonly RunLine[]): HotelMap {
  const base = BASE_HOTEL;
  const nodes: Record<string, HotelNode> = Object.fromEntries(Object.entries(base.nodes).map(([id, node]) => [id, { ...node }]));
  const edges = new Map<string, HotelEdge>(base.edges.map((edge) => [edgeKey(edge.a, edge.b), { ...edge }]));
  const baseCorridorOf = new Map<string, string>();
  for (const edge of base.edges) {
    const a = base.nodes[edge.a];
    const b = base.nodes[edge.b];
    if (a?.kind === "room" && b?.kind === "corridor") baseCorridorOf.set(a.id, b.id);
    if (b?.kind === "room" && a?.kind === "corridor") baseCorridorOf.set(b.id, a.id);
  }

  const seen = new Set<string>();
  const lookedCorridors = new Set<string>();
  const corridorOf = new Map<string, string>();
  const placed = new Set<string>();
  let seedNo: number | null = null;
  let location: string | null = null;
  let hasRun = false;

  const ensure = (id: string, floor: number) => {
    if (!nodes[id]) {
      nodes[id] = { id, floor, kind: kindOf(id), x: Number.NaN, z: Number.NaN, inferred: true };
      placed.add(id);
    }
    seen.add(id);
  };
  const link = (a: string, b: string, m: number | null, door: boolean, stairs: boolean) => {
    if (a === b) return;
    const key = edgeKey(a, b);
    const current = edges.get(key);
    const metres = m ?? current?.m ?? 5;
    edges.set(key, { a, b, m: metres, ...(door || current?.door ? { door: true } : {}), ...(stairs || current?.stairs ? { stairs: true } : {}) });
  };
  const attachRoom = (room: string, corridor: string) => {
    const before = corridorOf.get(room);
    corridorOf.set(room, corridor);
    if (before !== corridor && baseCorridorOf.get(room) !== corridor) placed.add(room);
  };

  for (const line of lines) {
    if (line.type === "start") {
      seedNo = line.seed ?? null;
      hasRun = true;
      continue;
    }
    if (line.type === "state") {
      if (line.location) {
        ensure(line.location, floorFromId(line.location) ?? nodes[line.location]?.floor ?? 1);
        location = line.location;
      }
      continue;
    }
    if (line.type === "decision") {
      const room = str(line.data?.room);
      if (room && kindOf(room) === "room") seen.add(room);
      continue;
    }
    if (line.type !== "call" || !line.ok) continue;
    hasRun = true;
    const result = rec(line.result);
    const args = rec(line.args);

    if (line.cmd === "status" && result) {
      const at = str(result.location);
      if (at) {
        ensure(at, floorFromId(at) ?? nodes[at]?.floor ?? 1);
        location = at;
      }
    }

    if (line.cmd === "look" && result) {
      if (Array.isArray(result.exits)) {
        const at = str(result.location) ?? location;
        if (!at) continue;
        const floor = num(result.floor) ?? floorFromId(at) ?? nodes[at]?.floor ?? 1;
        ensure(at, floor);
        location = at;
        if (kindOf(at) === "corridor") lookedCorridors.add(at);
        for (const exit of exitsOf(result)) {
          const toFloor = floorFromId(exit.to) ?? nodes[exit.to]?.floor ?? floor;
          ensure(exit.to, toFloor);
          const stairs = kindOf(at) === "stairwell" && kindOf(exit.to) === "stairwell" && toFloor !== floor;
          link(at, exit.to, exit.metres, exit.door || kindOf(exit.to) === "room" || kindOf(at) === "room", stairs);
          if (kindOf(exit.to) === "room" && kindOf(at) === "corridor") attachRoom(exit.to, at);
        }
      } else {
        const door = str(result.door);
        if (door && kindOf(door) === "room") {
          ensure(door, floorFromId(door) ?? nodes[door]?.floor ?? nodeFloorIn({ ...base, nodes }, location));
          if (location && kindOf(location) === "corridor") {
            if (!corridorOf.has(door)) attachRoom(door, location);
            if (!edges.has(edgeKey(location, door))) link(location, door, 4, true, false);
          }
        }
      }
    }

    if (line.cmd === "move") {
      const to = str(result?.at) ?? str(rec(result?.outcome)?.at) ?? str(args?.to);
      if (!to) continue;
      const floor = floorFromId(to) ?? nodes[to]?.floor ?? (location ? nodes[location]?.floor : null) ?? 1;
      ensure(to, floor);
      if (location && location !== to) {
        const fromFloor = nodes[location]?.floor ?? floor;
        const vertical = kindOf(to) === kindOf(location) && (kindOf(to) === "elevator" || kindOf(to) === "stairwell") && fromFloor !== floor;
        if (!vertical) link(location, to, num(result?.metres), kindOf(to) === "room" || kindOf(location) === "room", false);
      }
      location = to;
    }
  }

  // A room listed by one corridor belongs to it alone: its seed-1 attachment goes.
  for (const [room, corridor] of corridorOf) {
    for (const [key, edge] of edges) {
      const other = edge.a === room ? edge.b : edge.b === room ? edge.a : null;
      if (other && other !== corridor && nodes[other]?.kind === "corridor") edges.delete(key);
    }
  }

  // Base rooms the night never mentioned, whose corridor was looked at and did not list them, are
  // not in this hotel.
  for (const [room, corridor] of baseCorridorOf) {
    if (seen.has(room) || !lookedCorridors.has(corridor)) continue;
    delete nodes[room];
    for (const [key, edge] of edges) if (edge.a === room || edge.b === room) edges.delete(key);
  }

  const edgeList = [...edges.values()].filter((edge) => nodes[edge.a] && nodes[edge.b]);
  placeNodes(nodes, edgeList, placed, corridorOf);

  return { nodes, edges: edgeList, stock: base.stock, special: base.special, seed: seedNo, fromRun: hasRun };
}

/** Coordinates for nodes the log added or moved: rooms along their corridor, other places beyond it. */
function placeNodes(nodes: Record<string, HotelNode>, edges: HotelEdge[], placed: Set<string>, corridorOf: Map<string, string>) {
  const neighbours = (id: string): string[] =>
    edges.flatMap((edge) => (edge.a === id ? [edge.b] : edge.b === id ? [edge.a] : [])).filter((other) => nodes[other]);
  const known = (id: string) => nodes[id] && Number.isFinite(nodes[id].x) && Number.isFinite(nodes[id].z);

  // Rooms first, grouped by corridor.
  const byCorridor = new Map<string, string[]>();
  for (const id of [...placed].sort()) {
    const node = nodes[id];
    if (!node || node.kind !== "room") continue;
    const corridor = corridorOf.get(id) ?? neighbours(id).find((other) => nodes[other].kind === "corridor");
    if (!corridor || !known(corridor)) continue;
    byCorridor.set(corridor, [...(byCorridor.get(corridor) ?? []), id]);
  }
  for (const [corridor, rooms] of byCorridor) {
    const c = nodes[corridor];
    const floorCorridors = Object.values(nodes).filter((node) => node.kind === "corridor" && node.floor === c.floor && known(node.id));
    const corridorNeighbours = neighbours(corridor).filter((other) => nodes[other].kind === "corridor" && known(other)).sort();
    const loop = floorCorridors.length >= 3 && floorCorridors.every((node) => neighbours(node.id).filter((o) => nodes[o].kind === "corridor").length >= 2);
    // Along the segment to the next corridor (a→b→c→d→a). The last corridor of a straight hall
    // (1a–1b–1c) has no next one: its rooms sit around it, on the line from its neighbour, so they
    // never land on the previous corridor's rooms (seed 16's 137/138 did, on top of 133).
    const end = corridorNeighbours.length === 1 && corridorNeighbours[0] < corridor ? corridorNeighbours[0] : null;
    const next = end ? undefined : (corridorNeighbours.find((other) => other > corridor) ?? corridorNeighbours[0]);
    let ax = 1;
    let az = 0;
    let length = 12;
    const toward = next ?? end;
    if (toward) {
      const n = nodes[toward];
      const dx = next ? n.x - c.x : c.x - n.x;
      const dz = next ? n.z - c.z : c.z - n.z;
      length = Math.hypot(dx, dz) || 12;
      ax = dx / length;
      az = dz / length;
    }
    const shift = end ? -length / 2 : 0;
    let px = -az;
    let pz = ax;
    if (loop) {
      const cx = floorCorridors.reduce((sum, node) => sum + node.x, 0) / floorCorridors.length;
      const cz = floorCorridors.reduce((sum, node) => sum + node.z, 0) / floorCorridors.length;
      const midX = c.x + (ax * length) / 2;
      const midZ = c.z + (az * length) / 2;
      if ((midX - cx) * px + (midZ - cz) * pz < 0) {
        px = -px;
        pz = -pz;
      }
    }
    const taken = Object.values(nodes).filter((node) => node.floor === c.floor && known(node.id) && !rooms.includes(node.id));
    rooms.forEach((room, index) => {
      let t = (length * (index + 1)) / (rooms.length + 1) + shift;
      const side = loop ? 1 : index % 2 === 0 ? 1 : -1;
      let x = c.x + ax * t + px * ROOM_OFFSET * side;
      let z = c.z + az * t + pz * ROOM_OFFSET * side;
      for (let tries = 0; tries < 4 && taken.some((node) => Math.hypot(node.x - x, node.z - z) < MIN_GAP); tries += 1) {
        t += 1.6;
        x = c.x + ax * t + px * ROOM_OFFSET * side;
        z = c.z + az * t + pz * ROOM_OFFSET * side;
      }
      nodes[room] = { ...nodes[room], x: round(x), z: round(z), inferred: true };
      taken.push(nodes[room]);
    });
  }

  // Anything else new: beyond the known neighbour, away from that neighbour's other neighbours.
  for (let pass = 0; pass < 3; pass += 1) {
    for (const id of [...placed].sort()) {
      if (known(id)) continue;
      const node = nodes[id];
      if (!node) continue;
      const anchor = neighbours(id).find((other) => known(other));
      if (!anchor) continue;
      const a = nodes[anchor];
      const others = neighbours(anchor).filter((other) => other !== id && known(other));
      let dx = 1;
      let dz = 0;
      if (others.length) {
        const ox = others.reduce((sum, other) => sum + nodes[other].x, 0) / others.length;
        const oz = others.reduce((sum, other) => sum + nodes[other].z, 0) / others.length;
        const len = Math.hypot(a.x - ox, a.z - oz);
        if (len > 0.01) {
          dx = (a.x - ox) / len;
          dz = (a.z - oz) / len;
        }
      }
      const metres = edges.find((edge) => edgeKey(edge.a, edge.b) === edgeKey(anchor, id))?.m ?? 6;
      nodes[id] = { ...node, x: round(a.x + dx * metres), z: round(a.z + dz * metres), inferred: true };
    }
  }
  // A node nothing anchors sits by its floor's first corridor, so it is at least drawn.
  for (const id of placed) {
    if (known(id)) continue;
    const node = nodes[id];
    if (!node) continue;
    const corridor = Object.values(nodes).find((other) => other.kind === "corridor" && other.floor === node.floor && known(other.id));
    nodes[id] = { ...node, x: corridor ? corridor.x + 6 : 0, z: corridor ? corridor.z - 6 : 0, inferred: true };
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
