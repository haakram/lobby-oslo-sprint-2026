import { z } from "zod";
import raw from "@/features/hotel/hotel_seed1.json";

// The hotel the night-shift agent routes on (agent/data/hotel_seed1.json, copied for the app).
// Coordinates are metres on the floor plan; z grows towards the bottom of the drawing.

const HotelNodeSchema = z.object({
  floor: z.number().int(),
  kind: z.string().min(1),
  x: z.number(),
  z: z.number(),
});

const HotelEdgeSchema = z.object({
  a: z.string(),
  b: z.string(),
  m: z.number().nonnegative(),
  door: z.boolean().optional(),
  stairs: z.boolean().optional(),
});

export const HotelMapSchema = z.object({
  nodes: z.record(z.string(), HotelNodeSchema),
  edges: z.array(HotelEdgeSchema),
});

export type HotelNode = z.infer<typeof HotelNodeSchema>;
export type HotelEdge = z.infer<typeof HotelEdgeSchema>;
export type HotelMap = z.infer<typeof HotelMapSchema>;

let cached: HotelMap | null = null;

/** The hotel map, validated once. Throws if the bundled file is broken (a build error, not a user state). */
export function hotelMap(): HotelMap {
  cached ??= HotelMapSchema.parse(raw);
  return cached;
}

const PLACE: Record<string, string> = {
  laundry: "Vaskeri",
  storage: "Lager",
  "front-desk": "Resepsjon",
  "kitchen-pass": "Kjøkkenluke",
  "staff-room": "Personalrom",
  lobby: "Lobby",
  "lobby-bar": "Bar",
  "charging-dock": "Ladestasjon",
};

/** "room-201" → "201"; anything else → null. */
export function roomNumber(id: string): string | null {
  const match = /^room-(\d+)$/.exec(id);
  return match ? match[1] : null;
}

/** A Norwegian name for a node: "Rom 201", "Vaskeri", "Heis", "Korridor 2A". */
export function placeLabel(id: string): string {
  const room = roomNumber(id);
  if (room) return `Rom ${room}`;
  if (PLACE[id]) return PLACE[id];
  if (id.startsWith("elevator-")) return "Heis";
  if (id.startsWith("stairwell-")) return "Trapp";
  const corridor = /^corridor-(\d)([a-z])$/.exec(id);
  if (corridor) return `Korridor ${corridor[1]}${corridor[2].toUpperCase()}`;
  return id;
}

/** Guest rooms, in room-number order. */
export function guestRooms(map: HotelMap): string[] {
  return Object.keys(map.nodes)
    .filter((id) => map.nodes[id].kind === "room")
    .sort(byRoomNumber);
}

/** Room-number order for room ids; other ids after them, alphabetically. */
export function byRoomNumber(a: string, b: string): number {
  const na = Number(roomNumber(a) ?? Number.POSITIVE_INFINITY);
  const nb = Number(roomNumber(b) ?? Number.POSITIVE_INFINITY);
  return na === nb ? a.localeCompare(b) : na - nb;
}

export function floorsOf(map: HotelMap): number[] {
  return [...new Set(Object.values(map.nodes).map((n) => n.floor))].sort((a, b) => a - b);
}
