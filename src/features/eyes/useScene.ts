"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { cropFrame } from "./cropFrame";
import { IdentifyError, requestScene } from "./requestIdentify";
import { freshLandmarks, shouldScan, type SeenLandmark, type SeenThing } from "./sceneSchedule";

const TICK_MS = 1000;
/** Landmarks need the room, things a little detail (a remote in a hand): big enough, still cheap. */
const SCAN_MAX_SIDE = 800;

/** A thing, and whether its scan asked about people (what they wear or hold). */
type ScannedThing = SeenThing & { withPeople: boolean };

/** Drops what has faded; the same array when nothing did, so React skips a render. */
function keepFresh<T extends { at: number }>(current: T[], at: number): T[] {
  const fresh = freshLandmarks(current, at);
  return fresh.length === current.length ? current : fresh;
}

/**
 * Scans the whole frame for doors, lifts and signs, and loose things (a cap, a pillow), every 10 s
 * while `on` and not `paused`. Returns those still fresh (they fade over 12 s), and `now` to fade
 * them by. `people: false` asks Claude to leave out what people wear or hold.
 */
export function useScene(
  video: RefObject<HTMLVideoElement | null>,
  {
    on,
    paused,
    stopped,
    people,
    onQuota,
  }: { on: boolean; paused: boolean; stopped: boolean; people: boolean; onQuota: () => void },
) {
  const [landmarks, setLandmarks] = useState<SeenLandmark[]>([]);
  const [things, setThings] = useState<ScannedThing[]>([]);
  const [now, setNow] = useState(0);

  // Latest options for the timer. `stopped`: the shared quota ran out (here or in identify).
  const outside = useRef({ paused: paused || !on, stopped, people, onQuota });
  useEffect(() => {
    outside.current = { paused: paused || !on, stopped, people, onQuota };
  }, [on, paused, stopped, people, onQuota]);

  useEffect(() => {
    const controller = new AbortController();
    const book = { lastScanAt: null as number | null, inFlight: false, stopped: false, scans: 0 };

    const timer = setInterval(() => {
      const at = performance.now();
      setNow(at);
      setLandmarks((current) => keepFresh(current, at));
      setThings((current) => keepFresh(current, at));

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
        image = cropFrame(element, null, SCAN_MAX_SIDE);
      } catch {
        return;
      }
      book.lastScanAt = at;
      book.inFlight = true;
      const scanId = ++book.scans;
      const withPeople = outside.current.people;
      requestScene(image, controller.signal, withPeople)
        .then((found) => {
          const seenAt = performance.now();
          // A scan that finds something replaces the old view; an empty one lets the old view fade out.
          if (found.landmarks.length > 0) {
            setLandmarks(found.landmarks.map((mark, index) => ({ ...mark, id: `${scanId}-${index}`, at: seenAt })));
          }
          if (found.things.length > 0) {
            setThings(found.things.map((thing, index) => ({ ...thing, id: `scan-${scanId}-${index}`, at: seenAt, withPeople })));
          }
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

  // People switched off: what an earlier scan saw on them (glasses, a cap) goes at once, not in 12 s.
  const shown = useMemo<SeenThing[]>(() => (people ? things : things.filter((thing) => !thing.withPeople)), [people, things]);
  return { landmarks: on ? landmarks : [], things: on ? shown : [], now };
}
