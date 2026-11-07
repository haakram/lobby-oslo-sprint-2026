import type { Box } from "./smoothBoxes";

/** Extra room around a tapped box, as a share of its size, so text at the edge of the pack survives. */
const PADDING = 0.1;

/**
 * The current video frame, or the part under `box`, as a JPEG data URL (quality 0.85) whose longest
 * side is at most `maxSide` px. `null` takes the whole frame.
 */
export function cropFrame(video: HTMLVideoElement, box: Box | null, maxSide = 768): string {
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
  return canvas.toDataURL("image/jpeg", 0.85);
}
