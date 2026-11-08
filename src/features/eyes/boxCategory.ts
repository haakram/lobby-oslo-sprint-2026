import { isTrustedLabel } from "./cocoLabels";
import type { IdentifyResult } from "./schema";

/**
 * What kind of thing a box holds, for its colour: each kind has its own colour on the corners and
 * the tag (tokens `--box-<kind>` in globals.css), so boxes side by side are told apart at a glance.
 */
export type BoxCategory = "person" | "linen" | "hygiene" | "food" | "other" | "unknown";

const HYGIENE = new Set(["bottle", "toothbrush", "hair drier"]);
const FOOD = new Set([
  "banana",
  "apple",
  "orange",
  "sandwich",
  "carrot",
  "broccoli",
  "hot dog",
  "pizza",
  "donut",
  "cake",
  "cup",
  "wine glass",
  "bowl",
  "fork",
  "knife",
  "spoon",
]);

/**
 * Claude's answer decides when there is one (the catalogue's category first); before that, the
 * detector's class, and only when the detector is sure of it.
 */
export function boxCategory(label: string, score: number, result?: IdentifyResult): BoxCategory {
  if (label === "person") return "person";
  if (result) return result.product?.category ?? result.category;
  if (!isTrustedLabel(label, score)) return "unknown";
  if (HYGIENE.has(label)) return "hygiene";
  if (FOOD.has(label)) return "food";
  return "other";
}

/**
 * One colour per category, `light-dark(light surface, dark surface)`: `color-scheme` follows
 * `data-surface`, so the pair flips with the theme. Light: deep tones under white ink (≥ 6:1);
 * dark: light tints under dark ink (≥ 8:1). Kept here, not in globals.css, as only Øyne uses them.
 */
const COLORS: Record<BoxCategory, string> = {
  person: "light-dark(#0b5cad, #6cb8ff)",
  linen: "light-dark(#6a3cc2, #c8a6ff)",
  hygiene: "light-dark(#0a6e65, #3fd8c6)",
  food: "light-dark(#566300, #d2e04a)",
  other: "light-dark(#a8306c, #ff8cc8)",
  unknown: "light-dark(#4f5a63, #b3c0c9)",
};

/** The text colour on any category colour. */
export const BOX_INK = "light-dark(#ffffff, #121c24)";

export const categoryColor = (category: BoxCategory) => COLORS[category];
