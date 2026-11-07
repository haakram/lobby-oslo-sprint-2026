import type { RegenName } from "./icons/regenPaths";

/**
 * The one place a room status gets its word, its colour token and its icon (UX audit X2). Oversikt's
 * rack, Ruter's plans and the 3D hotel all read from here, so a colour means the same thing on every
 * screen. "Avvik" is not a status: it is a marker drawn on top of whatever status the room has.
 */
export type RoomStatusKey = "klar" | "ma_vaskes" | "opptatt" | "ikke_forstyrr" | "ukjent";

export type RoomStatusLook = {
  word: string;
  /** The token that paints the status: a CSS variable name without the dashes. */
  token: "success" | "warning" | "line-strong" | "text" | "line";
  /** Tailwind background class for the same token. */
  fill: string;
  /** Tailwind text class for the status word. */
  ink: string;
  icon: RegenName;
  /** Needs someone: shown loud. Everything else stays quiet. */
  loud: boolean;
};

export const ROOM_STATUS: Record<RoomStatusKey, RoomStatusLook> = {
  klar: { word: "Klar", token: "success", fill: "bg-success", ink: "text-success", icon: "check", loud: false },
  ma_vaskes: { word: "Må vaskes", token: "warning", fill: "bg-warning", ink: "text-warning", icon: "flag", loud: true },
  opptatt: { word: "Opptatt", token: "line-strong", fill: "bg-line-strong", ink: "text-muted", icon: "user", loud: false },
  ikke_forstyrr: { word: "Ikke forstyrr", token: "text", fill: "bg-text", ink: "text-text", icon: "moon", loud: false },
  ukjent: { word: "Ikke sjekket", token: "line", fill: "bg-line", ink: "text-muted", icon: "help-circle", loud: false },
};

/** The marker for an open work order on a room, drawn over the status. */
export const AVVIK = { word: "Avvik", fill: "bg-danger", ink: "text-danger", icon: "alert-triangle" as RegenName } as const;

export const ROOM_STATUS_ORDER: readonly RoomStatusKey[] = ["ma_vaskes", "klar", "opptatt", "ikke_forstyrr", "ukjent"];

/** `var(--token)` for inline styles (SVG, canvas bridges). */
export function roomStatusVar(status: RoomStatusKey): string {
  return `var(--${ROOM_STATUS[status].token})`;
}
