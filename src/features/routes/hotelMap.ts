import type { HotelMap } from "@/features/hotel";

// Ruter routes and draws on the night's hotel (`useHotelMap(lines)` from @/features/hotel, the same
// graph the agent routes on, reshaped by the run log). These helpers need only its nodes and edges.

/** The part of the hotel map the router and the floor plan read. */
export type HotelGraph = Pick<HotelMap, "nodes" | "edges">;

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
export function guestRooms(map: HotelGraph): string[] {
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

export function floorsOf(map: HotelGraph): number[] {
  return [...new Set(Object.values(map.nodes).map((n) => n.floor))].sort((a, b) => a - b);
}
