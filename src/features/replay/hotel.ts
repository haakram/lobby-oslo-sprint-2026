import seed from "@/features/hotel/hotel_seed1.json";

/**
 * The hotel map the agent routes on (`src/features/hotel/hotel_seed1.json`), typed, plus the
 * Norwegian names the screens use for its places. Read-only; the json is the source of truth.
 */

export type NodeKind = "room" | "corridor" | "hub" | "service" | "elevator" | "stairwell";

export type HotelNode = { id: string; floor: number; kind: NodeKind; x: number; z: number };
export type HotelEdge = { a: string; b: string; m: number; door?: boolean; stairs?: boolean };

type Seed = {
  nodes: Record<string, { floor: number; kind: string; x: number; z: number }>;
  edges: HotelEdge[];
  stock: Record<string, Record<string, number>>;
  special: Record<string, string>;
};

const data = seed as Seed;

export const HOTEL_NODES: Record<string, HotelNode> = Object.fromEntries(
  Object.entries(data.nodes).map(([id, node]) => [id, { id, ...node, kind: node.kind as NodeKind }]),
);
export const HOTEL_EDGES: HotelEdge[] = data.edges;
export const HOTEL_FLOORS: number[] = [...new Set(Object.values(HOTEL_NODES).map((node) => node.floor))].sort();
export const HOTEL_ROOMS: HotelNode[] = Object.values(HOTEL_NODES)
  .filter((node) => node.kind === "room")
  .sort((a, b) => a.id.localeCompare(b.id));
export const DOCK_NODE: string = data.special.dock ?? "charging-dock";

export function nodeFloor(id: string | null | undefined): number {
  return (id && HOTEL_NODES[id]?.floor) || 1;
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

/** "water-bottle" → "vannflaske", "tray-323" → "brett (323)". */
export function itemName(item: string | null | undefined): string {
  if (!item) return "";
  if (ITEM_NAMES[item]) return ITEM_NAMES[item];
  if (item.startsWith("tray-")) return `brett (${item.slice(5)})`;
  if (item.startsWith("luggage-")) return `bagasje (${item.slice(8)})`;
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
