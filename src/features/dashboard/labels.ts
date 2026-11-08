import { ROOM_STATUS, ROOM_STATUS_ORDER } from "@/ui/roomStatus";
import type { BadgeTone } from "@/ui";

/**
 * Norwegian words for what the run log writes in English or as ids. The log stays the source; these
 * only translate it for the screen (DESIGN.md: every status is a word and a colour).
 */

export const KNOWN_STATUSES = ["klar", "ma_vaskes", "opptatt", "ikke_forstyrr"] as const;
export type KnownStatus = (typeof KNOWN_STATUSES)[number];
/** `ukjent`: the robot never looked at the room tonight. Never shown as ready. */
export type RoomStatus = KnownStatus | "ukjent";

export const STATUS_ORDER: readonly RoomStatus[] = ROOM_STATUS_ORDER;

type StatusLook = {
  word: string;
  /** The pigeonhole: a plane, or an outline for a hanger / an unchecked room. */
  tile: string;
  /** The key tag along the top edge, in the status colour (from the shared map). */
  tag: string;
  word_class: string;
  loud: boolean;
};

const TILE: Record<RoomStatus, string> = {
  // Ready to sell reads green at a glance: the good news on the rack (team lead 2026-11-08).
  klar: "bg-success-soft",
  ma_vaskes: "bg-warning-soft",
  opptatt: "bg-sunken",
  ikke_forstyrr: "bg-sunken ring-1 ring-inset ring-text/70",
  ukjent: "border border-dashed border-line-strong",
};

/** Oversikt's tiles, built on the one status map every screen shares (src/ui/roomStatus.ts). */
export const STATUS_LOOK: Record<RoomStatus, StatusLook> = Object.fromEntries(
  (Object.keys(ROOM_STATUS) as RoomStatus[]).map((status) => [
    status,
    {
      word: ROOM_STATUS[status].word,
      tile: TILE[status],
      tag: status === "ukjent" ? "border border-dashed border-line-strong" : ROOM_STATUS[status].fill,
      word_class: ROOM_STATUS[status].ink,
      loud: ROOM_STATUS[status].loud,
    },
  ]),
) as Record<RoomStatus, StatusLook>;

export const SOURCE_WORD: Record<string, string> = {
  room_check: "Romsjekk",
  knock: "Banket på",
  door_sign: "Dørskilt",
};

const ORDER_TYPE: Record<string, string> = {
  stoy: "Støy",
  sol: "Søl",
  gjesteklage: "Gjesteklage",
  teknisk: "Teknisk",
  lin: "Lin",
  annet: "Annet",
};

export function orderTypeLabel(type: string): string {
  return ORDER_TYPE[type] ?? "Annet";
}

const REQUEST_KIND: Record<string, string> = {
  amenity: "Utstyr",
  tray: "Romservice",
  message: "Beskjed",
  followup: "Oppfølging",
  noise: "Støy",
  lost_item: "Mistet gjenstand",
  room_check: "Romsjekk",
  bags: "Bagasje",
  spill: "Søl",
};

export function requestKindLabel(kind: string | null | undefined): string {
  return (kind && REQUEST_KIND[kind]) || "Oppgave";
}

const ITEM: Record<string, string> = {
  "phone-charger": "mobillader",
  "water-bottle": "vannflaske",
  pillow: "pute",
  towel: "håndkle",
  "toiletry-kit": "toalettsett",
  glasses: "briller",
  toy: "leke",
  wallet: "lommebok",
  keycard: "nøkkelkort",
  cart: "renholdsvogn",
  "wet-floor-sign": "varselskilt",
};

/** "tray-208" → "brett til 208", "toy-2" → "leke", "phone-charger" → "mobillader". */
export function itemLabel(item: string): string {
  const owned = /^(tray|luggage)-(\d+)$/.exec(item);
  if (owned) return `${owned[1] === "tray" ? "brett" : "bagasje"} til ${owned[2]}`;
  const base = item.replace(/-\d+$/, "");
  return ITEM[item] ?? ITEM[base] ?? base.replace(/-/g, " ");
}

const PLACE: Record<string, string> = {
  "charging-dock": "Ladestasjon",
  lobby: "Lobby",
  "front-desk": "Resepsjon",
  "lobby-bar": "Lobbybar",
  "kitchen-pass": "Kjøkkenluke",
  storage: "Lager",
  laundry: "Vaskeri",
  "staff-room": "Personalrom",
};

/** A map node as staff say it: "room-201" → "Rom 201", "corridor-2a" → "Korridor 2A". */
export function placeLabel(node: string | null | undefined): string {
  if (!node) return "Ukjent sted";
  const room = /^room-(\d+)$/.exec(node);
  if (room) return `Rom ${room[1]}`;
  const corridor = /^corridor-(\d)([a-z])$/.exec(node);
  if (corridor) return `Korridor ${corridor[1]}${corridor[2].toUpperCase()}`;
  const floorPlace = /^(elevator|stairwell)-(\d)$/.exec(node);
  if (floorPlace) return `${floorPlace[1] === "elevator" ? "Heis" : "Trapp"}, ${floorPlace[2]}. etasje`;
  return PLACE[node] ?? node;
}

export const OUTCOME: Record<"running" | "done" | "failed", { word: string; tone: BadgeTone }> = {
  running: { word: "Pågår", tone: "accent" },
  done: { word: "Fullført", tone: "success" },
  failed: { word: "Feilet", tone: "danger" },
};

/** Map ids inside the agent's Norwegian texts, said the way staff say them: "ved corridor-3a" → "ved korridor 3A". */
export function humanizeText(text: string): string {
  return text.replace(/\b(?:room|corridor|elevator|stairwell)-\d[0-9a-z]*\b/g, (node) => {
    const label = placeLabel(node);
    return label === node ? node : label.charAt(0).toLowerCase() + label.slice(1);
  });
}
