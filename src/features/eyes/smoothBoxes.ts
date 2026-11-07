/** A detection box in video pixels. `id` stays the same while the box tracks one object. */
export type Box = { id: string; x: number; y: number; w: number; h: number; label: string; score: number };

/** A box that no detection matched for this many frames in a row is dropped. */
export const MAX_MISSED_FRAMES = 10;
/** Two boxes overlapping at least this much (IoU) are the same object. */
export const MIN_IOU = 0.3;

// Frames in a row each box went unmatched, kept out of `Box` so callers see a clean shape.
const missed = new WeakMap<Box, number>();
let nextId = 0;

/** Frames in a row this box has gone without a matching detection (0 = seen in the latest frame). */
export function missedFrames(box: Box): number {
  return missed.get(box) ?? 0;
}

/** Intersection over union of two boxes, 0 to 1. */
export function iou(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  const overlap = w * h;
  return overlap / (a.w * a.h + b.w * b.h - overlap);
}

const lerp = (from: number, to: number, alpha: number) => from + (to - from) * alpha;

/**
 * Eases tracked boxes towards this frame's detections. Each previous box takes the best unclaimed
 * detection with IoU >= 0.3 and moves `alpha` of the way to it; a detection nobody claims becomes a
 * new box; a box unmatched for MAX_MISSED_FRAMES frames is dropped.
 */
export function smoothBoxes(prev: Box[], next: Box[], alpha = 0.35): Box[] {
  const claimed = new Set<number>();
  const result: Box[] = [];

  for (const old of prev) {
    let best = -1;
    let bestIou = MIN_IOU;
    next.forEach((candidate, index) => {
      if (claimed.has(index)) return;
      const score = iou(old, candidate);
      if (score >= bestIou) {
        best = index;
        bestIou = score;
      }
    });

    if (best === -1) {
      const count = (missed.get(old) ?? 0) + 1;
      if (count >= MAX_MISSED_FRAMES) continue;
      const kept = { ...old };
      missed.set(kept, count);
      result.push(kept);
      continue;
    }

    claimed.add(best);
    const target = next[best];
    result.push({
      id: old.id,
      x: lerp(old.x, target.x, alpha),
      y: lerp(old.y, target.y, alpha),
      w: lerp(old.w, target.w, alpha),
      h: lerp(old.h, target.h, alpha),
      label: target.label,
      score: target.score,
    });
  }

  next.forEach((detection, index) => {
    if (!claimed.has(index)) result.push({ ...detection, id: `box-${++nextId}` });
  });
  return result;
}
