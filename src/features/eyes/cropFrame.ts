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

/**
 * The current video frame, or the part under `box`, as a JPEG data URL (quality 0.85) whose longest
 * side is at most `maxSide` px. `null` takes the whole frame. Every box in `cover` (people, on a whole
 * frame) is painted flat grey on the phone before the image exists, so it never leaves the device.
 */
export function cropFrame(video: HTMLVideoElement, box: Box | null, maxSide = 768, cover: readonly Box[] = []): string {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  let sx = 0;
  let sy = 0;
  let sw = vw;
  let sh = vh;
  if (box) {
    sx = Math.max(0, box.x - box.w * PADDING);
    sy = Math.max(0, box.y - box.h * PADDING);
    sw = Math.min(vw, box.x + box.w * (1 + PADDING)) - sx;
    sh = Math.min(vh, box.y + box.h * (1 + PADDING)) - sy;
  }

  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is not available.");
  context.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  context.fillStyle = COVER_FILL;
  for (const person of cover) {
    const rect = coverRect(person, sx, sy, scale, canvas);
    if (rect) context.fillRect(rect.x, rect.y, rect.w, rect.h);
  }
  return canvas.toDataURL("image/jpeg", 0.85);
}
