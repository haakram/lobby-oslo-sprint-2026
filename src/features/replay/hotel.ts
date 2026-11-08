import { BASE_HOTEL, floorsOf, type HotelEdge, type HotelMap, type HotelNode, type NodeKind, nodeFloorIn, roomsOf } from "@/features/hotel/mapFromRun";

/**
 * The hotel's names in Norwegian, plus the seed-1 base map for code that has no run log yet. Screens
 * with a log draw `hotelForRun(lines)` (`src/features/hotel/mapFromRun.ts`): the replay carries it as
 * `timeline.map`.
 */

export type { HotelEdge, HotelMap, HotelNode, NodeKind };

/** The seed-1 base. Prefer `timeline.map` / `useHotelMap(lines)` for the night being shown. */
export const HOTEL_NODES: Record<string, HotelNode> = BASE_HOTEL.nodes;
export const HOTEL_EDGES: HotelEdge[] = BASE_HOTEL.edges;
export const HOTEL_FLOORS: number[] = floorsOf(BASE_HOTEL);
export const HOTEL_ROOMS: HotelNode[] = roomsOf(BASE_HOTEL);
export const DOCK_NODE: string = BASE_HOTEL.special.dock ?? "charging-dock";

/** The floor of a node in `map` (the base when omitted); a name like "room-327" says 3 on its own. */
export function nodeFloor(id: string | null | undefined, map: HotelMap = BASE_HOTEL): number {
  return nodeFloorIn(map, id);
}

/** "room-319" → "319"; anything else unchanged. */
export function roomNumber(id: string | null | undefined): string {
  if (!id) return "";
  return id.startsWith("room-") ? id.slice(5) : id;
}

const PLACE_NAMES: Record<string, string> = {
  "charging-dock": "Ladestasjon",
  lobby: "Lobby",
  "front-desk": "Resepsjon",
  "lobby-bar": "Bar",
  "staff-room": "Personalrom",
  storage: "Lager",
  laundry: "Vaskeri",
  "kitchen-pass": "Kjøkkenluke",
};

/** The place as the screen says it: "Rom 319", "Korridor 3a", "Heis 2", "Kjøkkenluke". */
export function placeName(id: string | null | undefined): string {
  if (!id) return "–";
  if (PLACE_NAMES[id]) return PLACE_NAMES[id];
  if (id.startsWith("room-")) return `Rom ${id.slice(5)}`;
  if (id.startsWith("corridor-")) return `Korridor ${id.slice(9)}`;
  if (id.startsWith("elevator-")) return `Heis ${id.slice(9)}`;
  if (id.startsWith("stairwell-")) return `Trapp ${id.slice(10)}`;
  return id;
}

const ITEM_NAMES: Record<string, string> = {
  "water-bottle": "vannflaske",
  pillow: "pute",
  "phone-charger": "lader",
  towel: "håndkle",
  "toiletry-kit": "toalettsett",
  glasses: "briller",
  toy: "leke",
  wallet: "lommebok",
  "wet-floor-sign": "skilt for vått gulv",
  keycard: "nøkkelkort",
  cart: "tralle",
};

/** "water-bottle" → "vannflaske", "tray-323" → "brett (323)", "toy-3" → "leke" (a numbered lost item). */
export function itemName(item: string | null | undefined): string {
  if (!item) return "";
  if (ITEM_NAMES[item]) return ITEM_NAMES[item];
  if (item.startsWith("tray-")) return `brett (${item.slice(5)})`;
  if (item.startsWith("luggage-")) return `bagasje (${item.slice(8)})`;
  const base = item.replace(/(?:-\d+)+$/, "");
  if (ITEM_NAMES[base]) return ITEM_NAMES[base];
  return item.replace(/-/g, " ");
}

const TASK_KINDS: Record<string, string> = {
  amenity: "Levering",
  tray: "Romservice",
  message: "Beskjed",
  followup: "Oppfølging",
  noise: "Støy",
  lost_item: "Gjenglemt",
  room_check: "Romsjekk",
  bags: "Bagasje",
  spill: "Søl",
};

export function taskKindName(kind: string | null | undefined): string {
  if (!kind) return "Oppgave";
  return TASK_KINDS[kind] ?? kind.replace(/_/g, " ");
}
