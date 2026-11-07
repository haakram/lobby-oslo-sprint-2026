import type { FloorRun, NoRoute, RouteMatrix, Tour, TourLeg } from "./types";

// Ordering only: every distance comes from the matrix (Track A's router).
// Tours start and end at the matrix start; the best one has the fewest metres, then the fewest seconds.

const EXACT_MAX_STOPS = 7;

type Cost = [metres: number, seconds: number];

const key = (from: string, to: string) => `${from}|${to}`;

const better = (a: Cost, b: Cost) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);

/** First occurrence wins; the start itself is never a stop. */
function uniqueStops(m: RouteMatrix, stops: string[]): string[] {
  return [...new Set(stops)].filter((s) => s !== m.start);
}

function firstMissing(m: RouteMatrix, places: string[]): NoRoute | null {
  for (const from of places) {
    for (const to of places) {
      if (from !== to && !m.legs[key(from, to)]) return { error: "no-route", from, to };
    }
  }
  return null;
}

function cost(m: RouteMatrix, order: string[]): Cost {
  if (order.length === 0) return [0, 0];
  let metres = 0;
  let seconds = 0;
  let at = m.start;
  for (const next of [...order, m.start]) {
    const leg = m.legs[key(at, next)];
    metres += leg.metres;
    seconds += leg.seconds;
    at = next;
  }
  return [metres, seconds];
}

function* permutations<T>(items: T[]): Generator<T[]> {
  if (items.length <= 1) {
    yield items;
    return;
  }
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const tail of permutations(rest)) yield [items[i], ...tail];
  }
}

/** Tries every order. The list order comes first, so it wins a tie. */
function exactOrder(m: RouteMatrix, stops: string[]): string[] {
  let best = stops;
  let bestCost = cost(m, stops);
  for (const order of permutations(stops)) {
    const c = cost(m, order);
    if (better(c, bestCost)) {
      best = order;
      bestCost = c;
    }
  }
  return best;
}

function nearestNeighbour(m: RouteMatrix, stops: string[]): string[] {
  const left = new Set(stops);
  const order: string[] = [];
  let at = m.start;
  while (left.size > 0) {
    let next = "";
    for (const s of left) {
      if (!next || m.legs[key(at, s)].metres < m.legs[key(at, next)].metres) next = s;
    }
    order.push(next);
    left.delete(next);
    at = next;
  }
  return order;
}

/** Reverses stretches of the tour while that makes it shorter. Recomputes the whole cost, so one-way legs are fine. */
function twoOpt(m: RouteMatrix, start: string[]): string[] {
  let best = start;
  let bestCost = cost(m, best);
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const candidate = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)];
        const c = cost(m, candidate);
        if (better(c, bestCost)) {
          best = candidate;
          bestCost = c;
          improved = true;
        }
      }
    }
  }
  return best;
}

/** The legs of a tour: start → each stop → start. Throws if the matrix lacks one. */
export function tourLegs(m: RouteMatrix, order: string[]): TourLeg[] {
  if (order.length === 0) return [];
  const places = [m.start, ...order, m.start];
  return places.slice(1).map((to, i) => {
    const from = places[i];
    const leg = m.legs[key(from, to)];
    if (!leg) throw new Error(`No leg ${key(from, to)} in map ${m.map}.`);
    return { from, to, ...leg };
  });
}

function walk(m: RouteMatrix, order: string[]): Tour {
  const legs = tourLegs(m, order);
  return {
    order,
    metres: legs.reduce((sum, l) => sum + l.metres, 0),
    seconds: legs.reduce((sum, l) => sum + l.seconds, 0),
    path: [m.start, ...legs.flatMap((l) => l.path.slice(1))],
  };
}

/**
 * The shortest round trip from `m.start` through every stop and back.
 * Exact for up to 7 unique stops; nearest neighbour + 2-opt above that.
 * A pair the matrix lacks is reported, never thrown.
 */
export function bestTour(m: RouteMatrix, stops: string[]): Tour | NoRoute {
  const unique = uniqueStops(m, stops);
  const missing = firstMissing(m, [m.start, ...unique]);
  if (missing) return missing;
  const order =
    unique.length <= EXACT_MAX_STOPS ? exactOrder(m, unique) : twoOpt(m, nearestNeighbour(m, unique));
  return walk(m, order);
}

/** Metres for walking the stops in the order given, from the start and back. */
export function listOrderMetres(m: RouteMatrix, stops: string[]): number {
  return walk(m, uniqueStops(m, stops)).metres;
}

/** How much shorter the best tour is than the naive one; percent is a whole number. */
export function savings(best: number, naive: number): { metres: number; percent: number } {
  const metres = Math.max(0, Math.round(naive - best));
  return { metres, percent: naive > 0 ? Math.round((metres / naive) * 100) : 0 };
}

/** Cuts a node path into stretches on one floor each. */
export function floorRuns(m: RouteMatrix, path: string[]): FloorRun[] {
  const runs: FloorRun[] = [];
  for (const id of path) {
    const floor = m.nodes[id].floor;
    const last = runs.at(-1);
    if (last && last.floor === floor) last.nodes.push(id);
    else runs.push({ floor, nodes: [id] });
  }
  return runs;
}
