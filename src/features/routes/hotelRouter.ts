import type { HotelGraph } from "./hotelMap";
import type { RouteLeg, RouteMatrix } from "./types";

// A line-by-line port of Track A's router (agent/routing.py, shortest_route): Dijkstra in sim
// seconds, a guest room is never a way through, the cart never takes the stairs, any elevator
// reaches every other one. hotelRouter.test.ts checks it against router_parity.json, which
// fixtures/make_router_parity.py writes from the Python router itself.

export const MOVE_S_PER_M = 1;
export const DOOR_S = 3;
export const STAIRS_S_PER_M = 3;
export const ELEVATOR_CALL_S = 45;
export const ELEVATOR_RIDE_S = 15;

const DOOR_KINDS = new Set(["room", "service"]);

type Hop = { to: string; seconds: number; metres: number };
type Adjacency = Map<string, { to: string; metres: number; door: boolean; stairs: boolean }[]>;

const adjacencyCache = new WeakMap<HotelGraph, Adjacency>();

function adjacency(map: HotelGraph): Adjacency {
  const known = adjacencyCache.get(map);
  if (known) return known;
  // Keyed per node like Hotel._adj: a repeated edge replaces the earlier one.
  const byNode = new Map<string, Map<string, { to: string; metres: number; door: boolean; stairs: boolean }>>();
  const add = (from: string, to: string, metres: number, door: boolean, stairs: boolean) => {
    const row = byNode.get(from) ?? new Map();
    row.set(to, { to, metres, door, stairs });
    byNode.set(from, row);
  };
  for (const e of map.edges) {
    add(e.a, e.b, e.m, Boolean(e.door), Boolean(e.stairs));
    add(e.b, e.a, e.m, Boolean(e.door), Boolean(e.stairs));
  }
  const adj: Adjacency = new Map([...byNode].map(([id, row]) => [id, [...row.values()]]));
  adjacencyCache.set(map, adj);
  return adj;
}

function hops(map: HotelGraph, node: string, cart: boolean): Hop[] {
  const out: Hop[] = [];
  for (const e of adjacency(map).get(node) ?? []) {
    if (e.stairs && cart) continue;
    let seconds: number;
    if (e.stairs) seconds = e.metres * STAIRS_S_PER_M;
    else {
      seconds = e.metres * MOVE_S_PER_M;
      const doorKind = DOOR_KINDS.has(map.nodes[node]?.kind ?? "") || DOOR_KINDS.has(map.nodes[e.to]?.kind ?? "");
      if (e.door && doorKind) seconds += DOOR_S;
    }
    out.push({ to: e.to, seconds, metres: e.metres });
  }
  if (map.nodes[node]?.kind === "elevator") {
    for (const [id, n] of Object.entries(map.nodes)) {
      // A ride covers no floor metres (export_routes.py: a lift ride has no edge).
      if (n.kind === "elevator" && id !== node) out.push({ to: id, seconds: ELEVATOR_CALL_S + ELEVATOR_RIDE_S, metres: 0 });
    }
  }
  return out;
}

export type HotelRoute = { seconds: number; metres: number; path: string[] };

/** The quickest way from `src` to `dst`, or null when there is none. */
export function shortestRoute(map: HotelGraph, src: string, dst: string, { cart = false } = {}): HotelRoute | null {
  if (!map.nodes[src] || !map.nodes[dst]) return null;
  if (src === dst) return { seconds: 0, metres: 0, path: [src] };
  const dist = new Map<string, number>([[src, 0]]);
  const prev = new Map<string, { from: string; metres: number }>();
  const done = new Set<string>();
  for (;;) {
    // The open node with the smallest (seconds, id): the order Python's heapq pops (d, u) tuples in.
    let u: string | null = null;
    for (const [id, d] of dist) {
      if (done.has(id)) continue;
      if (u === null || d < dist.get(u)! || (d === dist.get(u)! && id < u)) u = id;
    }
    if (u === null) return null;
    done.add(u);
    if (u === dst) break;
    if (u !== src && map.nodes[u]?.kind === "room") continue; // a guest room is a destination, never a way through
    const du = dist.get(u)!;
    for (const hop of hops(map, u, cart)) {
      const nd = du + hop.seconds;
      if (nd < (dist.get(hop.to) ?? Number.POSITIVE_INFINITY)) {
        dist.set(hop.to, nd);
        prev.set(hop.to, { from: u, metres: hop.metres });
      }
    }
  }
  const path = [dst];
  let metres = 0;
  for (let at = dst; at !== src; ) {
    const step = prev.get(at)!;
    metres += step.metres;
    at = step.from;
    path.push(at);
  }
  path.reverse();
  return { seconds: dist.get(dst)!, metres: Math.round(metres * 10) / 10, path };
}

/**
 * The route matrix the tour engine reads, for a start and its stops: a leg for every ordered pair
 * that has a route. A missing pair stays missing, so bestTour reports it instead of guessing.
 */
export function hotelMatrix(map: HotelGraph, start: string, stops: string[], { cart = false } = {}): RouteMatrix {
  const places = [start, ...new Set(stops)].filter((id, i, all) => all.indexOf(id) === i);
  const legs: Record<string, RouteLeg> = {};
  for (const from of places) {
    for (const to of places) {
      if (from === to) continue;
      const route = shortestRoute(map, from, to, { cart });
      if (route) legs[`${from}|${to}`] = { metres: route.metres, seconds: route.seconds, path: route.path };
    }
  }
  return { map: "hotel_seed1", start, nodes: map.nodes, legs };
}
