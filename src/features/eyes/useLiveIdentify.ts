"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { nextAutoIdentify, trackFirstSeen, type RecentResult } from "./autoIdentify";
import { cropFrame } from "./cropFrame";
import { IdentifyError, requestIdentify } from "./requestIdentify";
import type { IdentifyResult } from "./schema";
import { missedFrames, type Box } from "./smoothBoxes";

const TICK_MS = 200;

/**
 * Identify results per box id, shared by taps, the shutter and live recognition. While `auto` is on
 * and nothing `paused` it, stable boxes are identified on their own, rationed by `nextAutoIdentify`.
 */
export function useLiveIdentify(
  video: RefObject<HTMLVideoElement | null>,
  boxes: Box[],
  { auto, paused }: { auto: boolean; paused: boolean },
) {
  const [results, setResults] = useState<Record<string, IdentifyResult>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [quotaReached, setQuotaReached] = useState(false);

  const latestBoxes = useRef(boxes);
  useEffect(() => {
    latestBoxes.current = boxes;
  }, [boxes]);

  // Scheduler bookkeeping: read and written only from callbacks, never during render.
  const book = useRef({
    firstSeen: new Map<string, number>(),
    attempted: new Set<string>(),
    inFlight: 0,
    lastRequestAt: null as number | null,
    stopped: false,
    recent: [] as RecentResult[],
  });

  const record = useCallback((box: Box, result: IdentifyResult) => {
    book.current.attempted.add(box.id);
    book.current.recent = [...book.current.recent.slice(-9), { box, result, at: performance.now() }];
    setResults((current) => ({ ...current, [box.id]: result }));
  }, []);

  const setBusyFor = useCallback((id: string, value: boolean) => {
    setBusy((current) => {
      const next = { ...current };
      if (value) next[id] = true;
      else delete next[id];
      return next;
    });
  }, []);

  /** Sends one image; the result is remembered for `box` so its label updates live. */
  const send = useCallback(
    async (image: string, box: Box | null, signal?: AbortSignal): Promise<IdentifyResult> => {
      const state = book.current;
      state.inFlight += 1;
      state.lastRequestAt = performance.now();
      if (box) {
        state.attempted.add(box.id);
        setBusyFor(box.id, true);
      }
      try {
        const result = await requestIdentify(image, signal);
        if (box) record(box, result);
        return result;
      } catch (error) {
        if (error instanceof IdentifyError && error.quota) {
          state.stopped = true;
          setQuotaReached(true);
        }
        throw error;
      } finally {
        state.inFlight -= 1;
        if (box) setBusyFor(box.id, false);
      }
    },
    [record, setBusyFor],
  );

  const pausedRef = useRef(paused || !auto);
  useEffect(() => {
    pausedRef.current = paused || !auto;
  }, [paused, auto]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setInterval(() => {
      const state = book.current;
      const now = performance.now();
      const seen = latestBoxes.current.filter((box) => missedFrames(box) === 0);
      state.firstSeen = trackFirstSeen(state.firstSeen, seen, now);
      const decision = nextAutoIdentify({
        boxes: seen,
        now,
        firstSeen: state.firstSeen,
        attempted: state.attempted,
        inFlight: state.inFlight > 0,
        lastRequestAt: state.lastRequestAt,
        paused: pausedRef.current || document.visibilityState === "hidden",
        stopped: state.stopped,
        recent: state.recent,
      });
      if (decision?.kind === "reuse") record(decision.box, decision.result);
      if (decision?.kind === "identify" && video.current) {
        const image = cropFrame(video.current, decision.box);
        // A failed live attempt stays quiet: the box keeps "trykk" and a tap tries again.
        send(image, decision.box, controller.signal).catch(() => {});
      }
    }, TICK_MS);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [video, record, send]);

  return { results, busy, quotaReached, send };
}
