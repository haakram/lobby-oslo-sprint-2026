import { z } from "zod";

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

/** What Claude returns. Loose on purpose; `cleanLandmarks` decides what survives. */
export const SceneModelOutput = z.object({
  landmarks: z.array(
    z.object({ label: z.string(), x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
  ),
});

const unit = z.number().min(0).max(1);

/** The /api/scene response, checked again in the browser. */
export const SceneResponse = z.object({
  landmarks: z
    .array(z.object({ label: z.enum(LANDMARK_LABELS), x: unit, y: unit, w: unit, h: unit }))
    .max(MAX_LANDMARKS),
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
