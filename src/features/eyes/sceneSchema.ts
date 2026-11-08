import { z } from "zod";
import { ITEM_KINDS, type ItemKind } from "./schema";

// Shared with the browser: no server imports in this file.

/** Fixed things in a building that the robot cares about. Claude may only use these words. */
export const LANDMARK_LABELS = [
  "Dør",
  "Heis",
  "Trapp",
  "Nødutgang",
  "Skilt",
  "Brannslukker",
  "Vindu",
  "Resepsjon",
  "Hylle",
  "Tralle",
  "Søppelbøtte",
  "Rømningsvei",
] as const;

export type LandmarkLabel = (typeof LANDMARK_LABELS)[number];

export const MAX_LANDMARKS = 6;

/** A landmark box, normalised 0–1 to the image, top-left origin. */
export type Landmark = { label: LandmarkLabel; x: number; y: number; w: number; h: number };

export const MAX_THINGS = 8;
/** A thing's name is a few Norwegian words; longer is cut. */
export const MAX_THING_NAME = 40;

const THING_CATEGORIES = ["hygiene", "food", "linen", "other", "unknown"] as const;

/**
 * A loose thing Claude found in the whole frame (a cap, a pillow, a remote), normalised 0–1 like a
 * landmark. These are what the local detector cannot see: it knows only 80 COCO classes.
 */
export type Thing = {
  name: string;
  category: (typeof THING_CATEGORIES)[number];
  kind: ItemKind;
  x: number;
  y: number;
  w: number;
  h: number;
};

/** What Claude returns. Loose on purpose; `cleanLandmarks` and `cleanThings` decide what survives. */
export const SceneModelOutput = z.object({
  landmarks: z.array(
    z.object({ label: z.string(), x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
  ),
  things: z.array(
    z.object({
      name: z.string(),
      category: z.enum(THING_CATEGORIES),
      kind: z.enum(ITEM_KINDS),
      x: z.number(),
      y: z.number(),
      w: z.number(),
      h: z.number(),
    }),
  ),
});

const unit = z.number().min(0).max(1);

/** The /api/scene response, checked again in the browser. */
export const SceneResponse = z.object({
  landmarks: z
    .array(z.object({ label: z.enum(LANDMARK_LABELS), x: unit, y: unit, w: unit, h: unit }))
    .max(MAX_LANDMARKS),
  things: z
    .array(
      z.object({
        name: z.string().min(1).max(MAX_THING_NAME),
        category: z.enum(THING_CATEGORIES),
        kind: z.enum(ITEM_KINDS),
        x: unit,
        y: unit,
        w: unit,
        h: unit,
      }),
    )
    .max(MAX_THINGS),
});

const LABEL_SET = new Set<string>(LANDMARK_LABELS);
const clamp = (value: number) => Math.min(1, Math.max(0, value));

/** Clamps one axis' [start, start + size] into [0, 1]; a span already inside is returned unchanged. */
function clampSpan(start: number, size: number): [number, number] {
  if (start >= 0 && start + size <= 1) return [start, size];
  const from = clamp(start);
  return [from, clamp(start + size) - from];
}

/** Allowlisted labels only, boxes clamped into the image, empty boxes dropped, at most six. */
export function cleanLandmarks(raw: z.infer<typeof SceneModelOutput>["landmarks"]): Landmark[] {
  const clean: Landmark[] = [];
  for (const mark of raw) {
    if (!LABEL_SET.has(mark.label)) continue;
    const [x, w] = clampSpan(mark.x, mark.w);
    const [y, h] = clampSpan(mark.y, mark.h);
    if (!(w > 0 && h > 0)) continue;
    clean.push({ label: mark.label as LandmarkLabel, x, y, w, h });
    if (clean.length === MAX_LANDMARKS) break;
  }
  return clean;
}

/**
 * Things with a name, boxes clamped into the image, empty boxes dropped, at most eight. Never a
 * person: the detector draws people, and the "Personer" switch decides whether it does.
 */
export function cleanThings(raw: z.infer<typeof SceneModelOutput>["things"]): Thing[] {
  const clean: Thing[] = [];
  for (const thing of raw) {
    const name = thing.name.trim().slice(0, MAX_THING_NAME).trim();
    if (!name || thing.kind === "person") continue;
    const [x, w] = clampSpan(thing.x, thing.w);
    const [y, h] = clampSpan(thing.y, thing.h);
    if (!(w > 0 && h > 0)) continue;
    clean.push({ name, category: thing.category, kind: thing.kind, x, y, w, h });
    if (clean.length === MAX_THINGS) break;
  }
  return clean;
}
