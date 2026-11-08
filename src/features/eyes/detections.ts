import type { Box } from "./smoothBoxes";

/**
 * What the detector is asked for. `maxResults: -1` returns every detection the model makes (MediaPipe's
 * own default), so a sixth person is never cut off by a cap; the screen still shows at most MAX_SHOWN.
 */
export const DETECTOR_MAX_RESULTS = -1;
/** A person this likely is painted over before an image leaves the phone: lower than the screen's bar, so cover errs wide. */
export const COVER_SCORE = 0.3;
/** A box this likely is drawn on screen. */
export const SHOW_SCORE = 0.4;
/** The screen draws at most this many boxes, the most likely first, so the view stays readable. */
export const MAX_SHOWN = 5;

/** One detection as MediaPipe gives it: only the fields we read. */
export type RawDetection = {
  boundingBox?: { originX: number; originY: number; width: number; height: number };
  categories: { categoryName?: string; score?: number }[];
};

/** MediaPipe's detections as boxes (video pixels, no id yet), dropping any without a box. */
export function toBoxes(detections: readonly RawDetection[]): Box[] {
  return detections.flatMap((detection) => {
    const box = detection.boundingBox;
    if (!box) return [];
    const top = detection.categories[0];
    return [
      {
        id: "",
        x: box.originX,
        y: box.originY,
        w: box.width,
        h: box.height,
        label: top?.categoryName ?? "",
        score: top?.score ?? 0,
      },
    ];
  });
}

/**
 * Splits one frame's boxes: `shown` are the boxes the screen draws (at least SHOW_SCORE, the MAX_SHOWN most
 * likely), `people` is every person at least COVER_SCORE, however many, to paint over before anything is sent.
 */
export function splitDetections(found: readonly Box[]): { shown: Box[]; people: Box[] } {
  const shown = found
    .filter((box) => box.score >= SHOW_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SHOWN);
  const people = found.filter((box) => box.label === "person" && box.score >= COVER_SCORE);
  return { shown, people };
}
