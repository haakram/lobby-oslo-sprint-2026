"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { cropFrame } from "./cropFrame";
import { IdentifyError, requestScene } from "./requestIdentify";
import { freshLandmarks, shouldScan, type SeenLandmark } from "./sceneSchedule";
import type { Box } from "./smoothBoxes";

const NOTHING_TO_COVER = (): readonly Box[] => [];

const TICK_MS = 1000;
/** Landmarks need the room, not detail: a smaller frame is cheaper. */
const SCAN_MAX_SIDE = 640;

/**
 * Scans the whole frame for doors, lifts and signs every 10 s while `on` and not `paused`.
 * Returns the landmarks still fresh (they fade over 12 s), and `now` to fade them by.
 * `cover` gives the boxes (the people in view) to paint over on the phone before the frame is sent.
 */
export function useScene(
  video: RefObject<HTMLVideoElement | null>,
  {
    on,
    paused,
    stopped,
    onQuota,
    cover = NOTHING_TO_COVER,
  }: { on: boolean; paused: boolean; stopped: boolean; onQuota: () => void; cover?: () => readonly Box[] },
) {
  const [landmarks, setLandmarks] = useState<SeenLandmark[]>([]);
  const [now, setNow] = useState(0);

  // Latest options for the timer. `stopped`: the shared quota ran out (here or in identify).
  const outside = useRef({ paused: paused || !on, stopped, onQuota, cover });
  useEffect(() => {
    outside.current = { paused: paused || !on, stopped, onQuota, cover };
  }, [on, paused, stopped, onQuota, cover]);

  useEffect(() => {
    const controller = new AbortController();
    const book = { lastScanAt: null as number | null, inFlight: false, stopped: false, scans: 0 };

    const timer = setInterval(() => {
      const at = performance.now();
      setNow(at);
      setLandmarks((current) => {
        const fresh = freshLandmarks(current, at);
        return fresh.length === current.length ? current : fresh;
      });

      const element = video.current;
      const scan = shouldScan({
        now: at,
        lastScanAt: book.lastScanAt,
        inFlight: book.inFlight,
        paused: outside.current.paused || document.visibilityState === "hidden",
        stopped: book.stopped || outside.current.stopped,
      });
      if (!scan || !element || element.readyState < 2) return;

      // Crop before marking the scan as started: a throw here costs nothing and the next tick retries.
      let image: string;
      try {
        image = cropFrame(element, null, SCAN_MAX_SIDE, outside.current.cover());
      } catch {
        return;
      }
      book.lastScanAt = at;
      book.inFlight = true;
      const scanId = ++book.scans;
      requestScene(image, controller.signal)
        .then((found) => {
          const seenAt = performance.now();
          const next = found.map((mark, index) => ({ ...mark, id: `${scanId}-${index}`, at: seenAt }));
          // A scan that finds something replaces the old view; an empty one lets the old view fade out.
          if (next.length > 0) setLandmarks(next);
        })
        .catch((error: unknown) => {
          if (error instanceof IdentifyError && error.quota) {
            book.stopped = true;
            outside.current.onQuota();
          }
        })
        .finally(() => {
          book.inFlight = false;
        });
    }, TICK_MS);

    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [video]);

  return { landmarks: on ? landmarks : [], now };
}
