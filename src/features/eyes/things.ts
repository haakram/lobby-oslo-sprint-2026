import type { SeenThing } from "./sceneSchedule";
import { MIN_IOU, iou, type Box } from "./smoothBoxes";

/** The detector label of a box drawn from the scan, not from the detector. */
export const SCAN_LABEL = "scan";

const toBox = (thing: SeenThing, size: { width: number; height: number }): Box => ({
  id: thing.id,
  x: thing.x * size.width,
  y: thing.y * size.height,
  w: thing.w * size.width,
  h: thing.h * size.height,
  label: SCAN_LABEL,
  score: 1,
});

/**
 * The scan's things as boxes in video pixels, for what the detector did not box itself (a cap, a
 * pillow). A thing on top of a detector box is the same object: the detector box tracks it better,
 * so the thing only lends it its name (`thingOver`). A person box never counts: a jacket or a bag
 * on a person overlaps them, but is not them.
 */
export function thingBoxes(things: readonly SeenThing[], size: { width: number; height: number }, detected: readonly Box[]): Box[] {
  return things.map((thing) => toBox(thing, size)).filter((box) => !detected.some((other) => other.label !== "person" && iou(box, other) >= MIN_IOU));
}

/** The scanned thing that best covers a detector box, if any. */
export function thingOver(box: Box, things: readonly SeenThing[], size: { width: number; height: number }): SeenThing | undefined {
  let best: SeenThing | undefined;
  let bestIou = MIN_IOU;
  for (const thing of things) {
    const overlap = iou(box, toBox(thing, size));
    if (overlap >= bestIou) {
      best = thing;
      bestIou = overlap;
    }
  }
  return best;
}
