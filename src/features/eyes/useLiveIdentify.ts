"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { nextAutoIdentify, trackFirstSeen, type RecentResult } from "./autoIdentify";
import { cropFrame } from "./cropFrame";
import { IdentifyError, requestIdentify } from "./requestIdentify";
import type { IdentifyResult } from "./schema";
import { missedFrames, type Box } from "./smoothBoxes";

const TICK_MS = 200;

/** Answers to a request that let Claude look at people: they may name what a person wears. */
const withPeople = new WeakSet<IdentifyResult>();

/** The attempted box ids, minus those whose answer looked at people. */
function withoutPeopleAnswers(attempted: Set<string>, results: Record<string, IdentifyResult>): Set<string> {
  return new Set([...attempted].filter((id) => !(results[id] && withPeople.has(results[id]))));
}

/**
 * Identify results per box id, shared by taps, the shutter and live recognition. While `auto` is on
 * and nothing `paused` it, stable boxes are identified on their own, rationed by `nextAutoIdentify`.
 */
export function useLiveIdentify(
  video: RefObject<HTMLVideoElement | null>,
  boxes: Box[],
  {
    auto,
    paused,
    stopped,
    people,
    onQuota,
  }: { auto: boolean; paused: boolean; stopped: boolean; people: boolean; onQuota: () => void },
) {
  const [results, setResults] = useState<Record<string, IdentifyResult>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  // Latest options for the timer and callbacks. `stopped`: the shared quota ran out (here or in the scene scan).
  const outside = useRef({ paused: paused || !auto, stopped, people, onQuota });
  useEffect(() => {
    outside.current = { paused: paused || !auto, stopped, people, onQuota };
  }, [paused, auto, stopped, people, onQuota]);

  const latestResults = useRef(results);
  useEffect(() => {
    latestResults.current = results;
  }, [results]);

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

  /** `at`: when the answer was given (a reuse keeps the original time). */
  const record = useCallback((box: Box, result: IdentifyResult, at = performance.now()) => {
    book.current.attempted.add(box.id);
    book.current.recent = [...book.current.recent.slice(-9), { box, result, at }];
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
        const askedPeople = outside.current.people;
        const result = await requestIdentify(image, signal, askedPeople);
        if (askedPeople) withPeople.add(result);
        if (box) record(box, result);
        return result;
      } catch (error) {
        if (error instanceof IdentifyError && error.quota) {
          state.stopped = true;
          outside.current.onQuota();
        }
        throw error;
      } finally {
        state.inFlight -= 1;
        if (box) setBusyFor(box.id, false);
      }
    },
    [record, setBusyFor],
  );

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
        // People off: a box whose answer looked at them is hidden, so it may be asked again without them.
        attempted: outside.current.people ? state.attempted : withoutPeopleAnswers(state.attempted, latestResults.current),
        inFlight: state.inFlight > 0,
        lastRequestAt: state.lastRequestAt,
        paused: outside.current.paused || document.visibilityState === "hidden",
        stopped: state.stopped || outside.current.stopped,
        // People off: never reuse an answer that looked at them.
        recent: outside.current.people ? state.recent : state.recent.filter((entry) => !withPeople.has(entry.result)),
      });
      if (decision?.kind === "reuse") record(decision.box, decision.result, decision.at);
      if (decision?.kind === "identify" && video.current) {
        const image = cropFrame(video.current, decision.box);
        // A failed live attempt stays quiet: the box keeps its class name and a tap tries again.
        send(image, decision.box, controller.signal).catch(() => {});
      }
    }, TICK_MS);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [video, record, send]);

  // People switched off: answers that looked at them go at once; a tap asks again without them.
  const shown = useMemo(() => {
    if (people) return results;
    return Object.fromEntries(Object.entries(results).filter(([, result]) => !withPeople.has(result)));
  }, [people, results]);

  return { results: shown, busy, send };
}
