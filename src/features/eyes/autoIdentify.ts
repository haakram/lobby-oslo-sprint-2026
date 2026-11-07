import { isProductClass } from "./cocoLabels";
import type { IdentifyResult } from "./schema";
import { MIN_IOU, iou, type Box } from "./smoothBoxes";

// Every identify call costs money (about a cent), so live recognition is rationed.

/** A box must be tracked this long before it is worth identifying. */
export const STABLE_MS = 800;
/** At least this long between two automatic requests. */
export const MIN_SPACING_MS = 2000;
/** A catalogue match this recent is reused for a new box in the same place. */
export const REUSE_WINDOW_MS = 10_000;

export type RecentResult = { box: Box; result: IdentifyResult; at: number };

export type AutoInput = {
  /** Boxes seen in the latest frame. */
  boxes: Box[];
  now: number;
  /** When each box id was first seen (`trackFirstSeen`). */
  firstSeen: ReadonlyMap<string, number>;
  /** Box ids already identified, tried or reused: each gets one automatic go. */
  attempted: ReadonlySet<string>;
  inFlight: boolean;
  lastRequestAt: number | null;
  /** A sheet is open, the tab is hidden, or live recognition is switched off. */
  paused: boolean;
  /** The quota ran out (429): no more automatic requests. */
  stopped: boolean;
  recent: readonly RecentResult[];
};

export type AutoDecision =
  | { kind: "identify"; box: Box }
  | { kind: "reuse"; box: Box; result: IdentifyResult }
  | null;

/** The first-seen time of every current box; boxes that are gone are forgotten. */
export function trackFirstSeen(prev: ReadonlyMap<string, number>, boxes: Box[], now: number): Map<string, number> {
  return new Map(boxes.map((box) => [box.id, prev.get(box.id) ?? now]));
}

/**
 * Which box to recognise now, if any: only product-like classes qualify; reuse a recent nearby
 * match for free, else one request.
 */
export function nextAutoIdentify(input: AutoInput): AutoDecision {
  if (input.paused) return null;

  const candidates = input.boxes
    .filter((box) => isProductClass(box.label))
    .filter((box) => !input.attempted.has(box.id))
    .filter((box) => input.now - (input.firstSeen.get(box.id) ?? input.now) >= STABLE_MS)
    .sort((a, b) => b.w * b.h - a.w * a.h);
  if (candidates.length === 0) return null;

  for (const box of candidates) {
    const match = input.recent.find(
      (entry) =>
        entry.result.product !== null &&
        input.now - entry.at <= REUSE_WINDOW_MS &&
        iou(entry.box, box) >= MIN_IOU,
    );
    if (match) return { kind: "reuse", box, result: match.result };
  }

  if (input.stopped || input.inFlight) return null;
  if (input.lastRequestAt !== null && input.now - input.lastRequestAt < MIN_SPACING_MS) return null;
  return { kind: "identify", box: candidates[0] };
}
