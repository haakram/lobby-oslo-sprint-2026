import { z } from "zod";

// The route matrix: written by export_routes.py from Track A's router, read by the Ruter screen.
// One schema, one inferred type (AI_RULES R4.2).

export const RouteNodeSchema = z.object({
  floor: z.number().int(),
  /** Track A's node kinds (room, corridor, hub, service, elevator, stairwell) plus "shelf" on the stub. */
  kind: z.string().min(1),
  /** Metres on the floor plan; z grows towards the bottom of the drawing. */
  x: z.number(),
  z: z.number(),
  label: z.string().optional(),
});

export const RouteLegSchema = z.object({
  metres: z.number().nonnegative(),
  seconds: z.number().nonnegative(),
  /** Node ids from the leg's start to its end, both included. */
  path: z.array(z.string()).min(2),
});

export const RouteMatrixSchema = z.object({
  map: z.string(),
  nodes: z.record(z.string(), RouteNodeSchema),
  start: z.string(),
  /** Keyed "from|to". */
  legs: z.record(z.string(), RouteLegSchema),
});

export type RouteNode = z.infer<typeof RouteNodeSchema>;
export type RouteLeg = z.infer<typeof RouteLegSchema>;
export type RouteMatrix = z.infer<typeof RouteMatrixSchema>;

export type Tour = { order: string[]; metres: number; seconds: number; path: string[] };
export type NoRoute = { error: "no-route"; from: string; to: string };
export type TourLeg = RouteLeg & { from: string; to: string };
export type FloorRun = { floor: number; nodes: string[] };
