// The Ruter screen's URL: /ruter?modus=renhold&rom=room-201,room-214&start=laundry&vogn=1
// (the dashboard's "Send renholderne" sends ?rom=), and ?sku= from Øyne opens the pick list.
// Every value is checked against a fixed list or the hotel map before it is used.

export type RouteMode = "renhold" | "robot" | "plukk";
export const ROUTE_MODES: readonly RouteMode[] = ["renhold", "robot", "plukk"];

export type CleaningStart = "laundry" | "storage" | "front-desk";
export const CLEANING_STARTS: readonly { id: CleaningStart; label: string }[] = [
  { id: "laundry", label: "Vaskeri" },
  { id: "storage", label: "Lager" },
  { id: "front-desk", label: "Resepsjon" },
];

type Param = string | string[] | undefined;

const MAX_TOKENS = 64;
const MAX_TOKEN_LENGTH = 32;

const first = (raw: Param) => (Array.isArray(raw) ? raw[0] : raw);

/**
 * The rooms in ?rom=, in the order given, each once. Takes "room-201", "rom-201" or "201", split by
 * commas or spaces (repeated ?rom= values too). Anything that isn't a guest room on the map comes
 * back in `unknown` (cut to 32 characters) so the screen can say so.
 */
export function parseRoomQuery(raw: Param, known: ReadonlySet<string>): { rooms: string[]; unknown: string[] } {
  const values = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  const tokens = values
    .flatMap((v) => v.split(/[\s,;]+/))
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, MAX_TOKENS);
  const rooms: string[] = [];
  const unknown: string[] = [];
  for (const token of tokens) {
    const digits = /^(?:room-|rom-|rom)?(\d{1,4})$/.exec(token);
    const id = digits ? `room-${digits[1]}` : token;
    if (known.has(id)) {
      if (!rooms.includes(id)) rooms.push(id);
    } else {
      const shown = token.slice(0, MAX_TOKEN_LENGTH);
      if (!unknown.includes(shown)) unknown.push(shown);
    }
  }
  return { rooms, unknown };
}

export function parseStart(raw: Param): CleaningStart | null {
  const value = first(raw)?.trim().toLowerCase();
  return CLEANING_STARTS.find((s) => s.id === value)?.id ?? null;
}

export function parseMode(raw: Param): RouteMode | null {
  const value = first(raw)?.trim().toLowerCase();
  return ROUTE_MODES.find((m) => m === value) ?? null;
}

/** ?vogn=1/ja/true → true, 0/nei/false → false, anything else → null (keep the default). */
export function parseCart(raw: Param): boolean | null {
  const value = first(raw)?.trim().toLowerCase();
  if (value === "1" || value === "ja" || value === "true") return true;
  if (value === "0" || value === "nei" || value === "false") return false;
  return null;
}
