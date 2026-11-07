import type { RoomStatus } from "@/features/replay";

/** The design tokens the 3D scene paints with, read from the surface it is mounted on. */
export type SceneTokens = {
  bg: string;
  surface: string;
  sunken: string;
  line: string;
  lineStrong: string;
  text: string;
  muted: string;
  accent: string;
  success: string;
  warning: string;
  danger: string;
};

const NAMES: Record<keyof SceneTokens, string> = {
  bg: "--bg",
  surface: "--surface",
  sunken: "--sunken",
  line: "--line",
  lineStrong: "--line-strong",
  text: "--text",
  muted: "--muted",
  accent: "--accent",
  success: "--success",
  warning: "--warning",
  danger: "--danger",
};

// DESIGN.md dark surface, used only if a variable is missing (never in the app itself).
const FALLBACK: SceneTokens = {
  bg: "#121c24",
  surface: "#1a2630",
  sunken: "#22313d",
  line: "#2e3e4a",
  lineStrong: "#6a7c89",
  text: "#e8edf0",
  muted: "#9aaab5",
  accent: "#ff7a2b",
  success: "#4cc27a",
  warning: "#f0b43c",
  danger: "#ff7666",
};

export function readTokens(element: Element): SceneTokens {
  const style = getComputedStyle(element);
  const tokens = { ...FALLBACK };
  for (const key of Object.keys(NAMES) as Array<keyof SceneTokens>) {
    const value = style.getPropertyValue(NAMES[key]).trim();
    if (value) tokens[key] = value;
  }
  return tokens;
}

/**
 * Which token paints a room in each status. The word is always shown next to the colour
 * (legend, labels), so colour is never the only signal.
 */
export const STATUS_TOKEN: Record<RoomStatus, keyof SceneTokens> = {
  klar: "success",
  ma_vaskes: "warning",
  opptatt: "lineStrong",
  ikke_forstyrr: "text",
  avvik: "danger",
  ukjent: "line",
};

/** The same mapping as CSS variables, for the 2D plan and the legend. */
export const STATUS_CSS_VAR: Record<RoomStatus, string> = {
  klar: "var(--success)",
  ma_vaskes: "var(--warning)",
  opptatt: "var(--line-strong)",
  ikke_forstyrr: "var(--text)",
  avvik: "var(--danger)",
  ukjent: "var(--line)",
};
