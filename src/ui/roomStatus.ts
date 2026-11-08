import type { BadgeTone } from "./Badge";
import type { RegenName } from "./icons/regenPaths";

/**
 * The one place a room status gets its word, its colour token, its icon and its look (UX audit X2;
 * jury round 1: four visual languages for the same states). Rom og renhold's rack, Oversikt's widget,
 * the room sheet, Ruter's plans and the 3D hotel all read from here, so a state looks and reads the same
 * on every screen: a coloured key tag (`tag`) beside the word, on a tile (`tile`) where there is room.
 * `RoomStatusTag` (src/ui/RoomStatusTag.tsx) draws exactly that for lists, sheets and panels.
 *
 * "Avvik" is not a status: it is a quiet ink marker (`AVVIK`, `AvvikMark`) drawn over whatever status the
 * room has; never red. What it needs is on Vedlikehold and in the bell.
 */
export type RoomStatusKey = "klar" | "ma_vaskes" | "opptatt" | "ikke_forstyrr" | "ukjent";

/** The design tokens a room is painted with (CSS variable names without the dashes). */
export type RoomToken = "success" | "warning" | "line-strong" | "text" | "line";

export type RoomStatusLook = {
  word: string;
  /** The token that paints the status. */
  token: RoomToken;
  /** Tailwind background class for the same token. */
  fill: string;
  /** Tailwind text class for the status word. */
  ink: string;
  icon: RegenName;
  /** Needs someone: shown loud. Everything else stays quiet. */
  loud: boolean;
  /** The key tag: a short bar in the status colour beside the word (an outline for "not checked"). */
  tag: string;
  /** The pigeonhole behind the room number on a rack: a plane, or an outline for a hanger / an unchecked room. */
  tile: string;
  /** The tone when the state has to sit in a `Badge`; prefer `RoomStatusTag`. */
  badge: BadgeTone;
};

export const ROOM_STATUS: Record<RoomStatusKey, RoomStatusLook> = {
  // Ready to sell reads green at a glance: the good news on the rack (team lead 2026-11-08).
  klar: { word: "Klar", token: "success", fill: "bg-success", ink: "text-success", icon: "check", loud: false, tag: "bg-success", tile: "bg-success-soft", badge: "success" },
  ma_vaskes: { word: "Må vaskes", token: "warning", fill: "bg-warning", ink: "text-warning", icon: "flag", loud: true, tag: "bg-warning", tile: "bg-warning-soft", badge: "warning" },
  opptatt: { word: "Opptatt", token: "line-strong", fill: "bg-line-strong", ink: "text-muted", icon: "user", loud: false, tag: "bg-line-strong", tile: "bg-sunken", badge: "neutral" },
  // A door hanger, not a job: an ink outline, never amber.
  ikke_forstyrr: { word: "Ikke forstyrr", token: "text", fill: "bg-text", ink: "text-text", icon: "moon", loud: false, tag: "bg-text", tile: "bg-sunken ring-1 ring-inset ring-text/70", badge: "neutral" },
  ukjent: {
    word: "Ikke sjekket",
    token: "line",
    fill: "bg-line",
    ink: "text-muted",
    icon: "help-circle",
    loud: false,
    tag: "border border-dashed border-line-strong",
    tile: "border border-dashed border-line-strong",
    badge: "neutral",
  },
};

/**
 * The marker for an open work order on a room, drawn over the status: ink, not red (DESIGN.md, room
 * states). `edge` is the 3 px ink edge on a tile or a row; in 3D and on plans it is an ink outline
 * (`token`), the room keeping its own status colour underneath.
 */
export const AVVIK = {
  word: "Avvik",
  token: "text",
  ink: "text-text",
  icon: "alert-triangle",
  edge: "shadow-[inset_3px_0_0_0_var(--text)]",
  badge: "neutral",
} as const satisfies { word: string; token: RoomToken; ink: string; icon: RegenName; edge: string; badge: BadgeTone };

export const ROOM_STATUS_ORDER: readonly RoomStatusKey[] = ["ma_vaskes", "klar", "opptatt", "ikke_forstyrr", "ukjent"];

/** `var(--token)` for inline styles (SVG, canvas bridges). */
export function roomStatusVar(status: RoomStatusKey): string {
  return `var(--${ROOM_STATUS[status].token})`;
}

export function isRoomStatusKey(value: unknown): value is RoomStatusKey {
  return typeof value === "string" && value in ROOM_STATUS;
}

/**
 * How a plan or the 3D hotel paints a room, for status sets that also carry "avvik" as a state (the
 * replay's): the fill token, and an ink outline when the room has an avvik. A room known only by its
 * avvik is painted "not checked" with the outline, never red.
 */
export function roomPaint(status: string, avvik = false): { fill: RoomToken; outline: RoomToken | null; word: string } {
  const key: RoomStatusKey = isRoomStatusKey(status) ? status : "ukjent";
  const marked = avvik || status === "avvik";
  const word = status === "avvik" ? AVVIK.word : ROOM_STATUS[key].word;
  return { fill: ROOM_STATUS[key].token, outline: marked ? AVVIK.token : null, word };
}
