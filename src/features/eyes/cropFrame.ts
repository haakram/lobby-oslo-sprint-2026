import type { Box } from "./smoothBoxes";

/** Extra room around a tapped box, as a share of its size, so text at the edge of the pack survives. */
const PADDING = 0.1;
/** Extra room around a person before a whole frame leaves the phone, so an arm or a head at the edge is covered. */
const COVER_PADDING = 0.15;
/** A flat grey: nothing of the person can be read back out of it. */
const COVER_FILL = "#808080";

export type Rect = { x: number; y: number; w: number; h: number };

/** The boxes to paint over before a whole frame is sent: every person the detector sees. */
export function personBoxes(boxes: readonly Box[]): Box[] {
  return boxes.filter((box) => box.label === "person");
}

/**
 * Where `box` (video pixels) lands on a canvas that shows the video region starting at (sx, sy) scaled
 * by `scale`, padded on every side and clipped to the canvas.
 */
export function coverRect(box: Box, sx: number, sy: number, scale: number, canvas: { width: number; height: number }): Rect | null {
  const x0 = Math.max(0, (box.x - box.w * COVER_PADDING - sx) * scale);
  const y0 = Math.max(0, (box.y - box.h * COVER_PADDING - sy) * scale);
  const x1 = Math.min(canvas.width, (box.x + box.w * (1 + COVER_PADDING) - sx) * scale);
  const y1 = Math.min(canvas.height, (box.y + box.h * (1 + COVER_PADDING) - sy) * scale);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** The video region a crop of `box` takes: the box with PADDING on every side, before clipping to the frame. */
function paddedRegion(box: Box): Rect {
  return { x: box.x - box.w * PADDING, y: box.y - box.h * PADDING, w: box.w * (1 + 2 * PADDING), h: box.h * (1 + 2 * PADDING) };
}

/** The region painted over for a person: the box with COVER_PADDING on every side. */
function coverRegion(person: Box): Rect {
  return {
    x: person.x - person.w * COVER_PADDING,
    y: person.y - person.h * COVER_PADDING,
    w: person.w * (1 + 2 * COVER_PADDING),
    h: person.h * (1 + 2 * COVER_PADDING),
  };
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Whether a crop of `box` would hold any part of a person: a bottle in a hand, a cup at someone's mouth.
 * Live recognition never sends such a box on its own; a tap still can, with the person painted over.
 */
export function touchesPerson(box: Box, people: readonly Box[]): boolean {
  const region = paddedRegion(box);
  return people.some((person) => person !== box && overlaps(region, coverRegion(person)));
}

export type CropPlan = {
  /** The part of the video that is drawn, in video pixels. */
  source: Rect;
  /** Canvas pixels per video pixel (at most 1). */
  scale: number;
  width: number;
  height: number;
  /** Painted flat grey, in canvas pixels: every person in `cover`. */
  covers: Rect[];
  /** Drawn again over the covers, in canvas pixels: the tapped product itself, so a held item stays readable. */
  keep: Rect | null;
};

/**
 * What `cropFrame` draws, as numbers (testable without a canvas). The whole frame, or `box` with padding;
 * every person in `cover` is painted over, and on a product crop only the product's own box (no padding)
 * is drawn back on top: the hand around it and the person behind it stay grey.
 */
export function cropPlan(vw: number, vh: number, box: Box | null, maxSide = 768, cover: readonly Box[] = []): CropPlan {
  let source: Rect = { x: 0, y: 0, w: vw, h: vh };
  if (box) {
    const region = paddedRegion(box);
    const x = Math.max(0, region.x);
    const y = Math.max(0, region.y);
    source = { x, y, w: Math.min(vw, region.x + region.w) - x, h: Math.min(vh, region.y + region.h) - y };
  }
  const scale = Math.min(1, maxSide / Math.max(source.w, source.h));
  const canvas = { width: Math.max(1, Math.round(source.w * scale)), height: Math.max(1, Math.round(source.h * scale)) };
  const covers = cover
    .filter((person) => person !== box)
    .map((person) => coverRect(person, source.x, source.y, scale, canvas))
    .filter((rect): rect is Rect => rect !== null);
  let keep: Rect | null = null;
  if (box && covers.length > 0) {
    const x0 = Math.max(0, (box.x - source.x) * scale);
    const y0 = Math.max(0, (box.y - source.y) * scale);
    const x1 = Math.min(canvas.width, (box.x + box.w - source.x) * scale);
    const y1 = Math.min(canvas.height, (box.y + box.h - source.y) * scale);
    if (x1 > x0 && y1 > y0) keep = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  return { source, scale, ...canvas, covers, keep };
}

/**
 * The current video frame, or the part under `box`, as a JPEG data URL (quality 0.85) whose longest
 * side is at most `maxSide` px. `null` takes the whole frame. Every box in `cover` (the people in view,
 * on a whole frame and on a product crop alike) is painted flat grey on the phone before the image
 * exists, so no person leaves the device; on a product crop the product's own box is drawn back on top.
 */
export function cropFrame(video: HTMLVideoElement, box: Box | null, maxSide = 768, cover: readonly Box[] = []): string {
  const plan = cropPlan(video.videoWidth, video.videoHeight, box, maxSide, cover);
  const { source, scale } = plan;
  const canvas = document.createElement("canvas");
  canvas.width = plan.width;
  canvas.height = plan.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is not available.");
  context.drawImage(video, source.x, source.y, source.w, source.h, 0, 0, canvas.width, canvas.height);
  context.fillStyle = COVER_FILL;
  for (const rect of plan.covers) context.fillRect(rect.x, rect.y, rect.w, rect.h);
  if (plan.keep) {
    const { x, y, w, h } = plan.keep;
    context.drawImage(video, source.x + x / scale, source.y + y / scale, w / scale, h / scale, x, y, w, h);
  }
  return canvas.toDataURL("image/jpeg", 0.85);
}
