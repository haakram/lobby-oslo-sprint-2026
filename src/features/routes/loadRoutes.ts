import { z } from "zod";
// TODO(phase-2): replace with npm run routes when agent/ is on main. Until then this is a hand-made stub map.
import stub from "./data/hotel.routes.json";
import { RouteMatrixSchema, type RouteMatrix } from "./types";

export type LoadedRoutes = { ok: true; matrix: RouteMatrix } | { ok: false; error: string };

const fail = (error: string): LoadedRoutes => ({ ok: false, error });

/** Validates a route file: its shape, then that every id it uses is a node and every path matches its key. */
export function parseRouteMatrix(input: unknown): LoadedRoutes {
  const parsed = RouteMatrixSchema.safeParse(input);
  if (!parsed.success) return fail(z.prettifyError(parsed.error));
  const m = parsed.data;
  if (!m.nodes[m.start]) return fail(`Start "${m.start}" is not a node.`);
  for (const [legKey, leg] of Object.entries(m.legs)) {
    const ends = legKey.split("|");
    if (ends.length !== 2) return fail(`Leg key "${legKey}" is not "from|to".`);
    if (leg.path[0] !== ends[0] || leg.path.at(-1) !== ends[1]) return fail(`Leg "${legKey}" has a path that does not match.`);
    const unknown = leg.path.find((id) => !m.nodes[id]);
    if (unknown) return fail(`Leg "${legKey}" goes through unknown node "${unknown}".`);
  }
  return { ok: true, matrix: m };
}

let cached: LoadedRoutes | null = null;

/** The app's route matrix, parsed once. */
export function loadRoutes(): LoadedRoutes {
  cached ??= parseRouteMatrix(stub);
  return cached;
}
