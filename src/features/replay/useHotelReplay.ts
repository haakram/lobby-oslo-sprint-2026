"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { parseRunLog, parseRunValues, type RunLine, SHIFT_ID } from "@/features/nightshift/runlog";
import { buildTimeline, type Snapshot, snapshotAt, type Timeline } from "./timeline";

/**
 * The replay clock over a run log: loads the demo night (or follows the live viewer server), builds
 * the timeline and runs sim time at 30×, 120× or 600×. `t` and `snapshot` update at most ~10 times
 * a second for the HUD; `now()` reads the precise clock for a render loop.
 */

export type ReplaySource = "demo" | "live";
export type ReplayStatus = "loading" | "ready" | "empty" | "error";

export const SPEEDS = [30, 120, 600] as const;
export type Speed = (typeof SPEEDS)[number];
export const DEFAULT_SPEED: Speed = 120;

export const DEMO_RUN_URL = "/runs/demo.jsonl";
/** Where `python -m agent viewer` listens unless NEXT_PUBLIC_VIEWER_URL says otherwise. */
export const DEFAULT_VIEWER_URL = "http://127.0.0.1:8765";

const POLL_MS = 2000;
const HUD_INTERVAL_MS = 100;

export type HotelReplay = {
  status: ReplayStatus;
  error?: string;
  source: ReplaySource;
  /** The shift has no `end` line yet. */
  live: boolean;
  shift: string | null;
  seed: number | null;
  timeline: Timeline | null;
  /** Lines in the log that could not be read. */
  skipped: number;
  /** Sim seconds from 22:00 to the last line. */
  duration: number;
  /** Sim seconds, throttled for the HUD. */
  t: number;
  setT: (t: number) => void;
  /** Precise sim time, for render loops. */
  now: () => number;
  playing: boolean;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  speed: Speed;
  setSpeed: (speed: Speed) => void;
  /** Live only: keep `t` at the newest line as lines arrive. */
  followLive: boolean;
  setFollowLive: (follow: boolean) => void;
  snapshot: Snapshot | null;
  retry: () => void;
};

/** What a load attempt produced, keyed so a stale answer never overwrites a newer request. */
type Load = {
  key: string;
  status: ReplayStatus;
  error?: string;
  timeline: Timeline | null;
  skipped: number;
  shift: string | null;
};

const runEntry = z.object({ shift: z.string().regex(SHIFT_ID), live: z.boolean().optional() });
const runsResponse = z.array(z.unknown()).transform((entries) =>
  entries.flatMap((entry) => {
    const parsed = runEntry.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  }),
);
const runResponse = z.object({ lines: z.array(z.unknown()), next: z.number().int().nonnegative() });

async function getJson(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store", signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

/** The viewer server's base URL: NEXT_PUBLIC_VIEWER_URL, else the local default. */
export function resolveViewerUrl(raw: string | null | undefined): string {
  if (!raw?.trim()) return DEFAULT_VIEWER_URL;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return DEFAULT_VIEWER_URL;
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return DEFAULT_VIEWER_URL;
  }
}

/** True when the viewer server answers `/api/runs`. One try, short timeout. */
export async function probeViewer(base: string, timeoutMs = 1500): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${base}/api/runs`, { cache: "no-store", signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

const raf: (cb: (time: number) => void) => number =
  typeof requestAnimationFrame === "function" ? (cb) => requestAnimationFrame(cb) : (cb) => Number(setTimeout(() => cb(Date.now()), 16));
const cancelRaf: (id: number) => void = typeof cancelAnimationFrame === "function" ? (id) => cancelAnimationFrame(id) : (id) => clearTimeout(id);

export function useHotelReplay(
  source: ReplaySource = "demo",
  options: { viewerUrl?: string | null; demoUrl?: string } = {},
): HotelReplay {
  const demoUrl = options.demoUrl ?? DEMO_RUN_URL;
  const viewerBase = resolveViewerUrl(options.viewerUrl);
  const [attempt, setAttempt] = useState(0);
  const key = `${source}|${source === "demo" ? demoUrl : viewerBase}|${attempt}`;

  const [load, setLoad] = useState<Load>({ key: "", status: "loading", timeline: null, skipped: 0, shift: null });
  const [speed, setSpeed] = useState<Speed>(DEFAULT_SPEED);
  const [playing, setPlaying] = useState(false);
  const [followLive, setFollowLive] = useState(true);
  const [t, setTState] = useState(0);
  const tRef = useRef(0);
  const playingRef = useRef(false);
  const followRef = useRef(true);

  useEffect(() => {
    playingRef.current = playing;
    followRef.current = followLive;
  }, [playing, followLive]);

  const jumpTo = useCallback((value: number) => {
    tRef.current = value;
    setTState(value);
  }, []);

  // Loading: the recording once, or the viewer server every 2 s. A new key (source, URL or retry)
  // starts over; its first lines put the clock on the end of what is known.
  useEffect(() => {
    const controller = new AbortController();
    let first = true;
    const settle = (next: Omit<Load, "key">) => {
      if (controller.signal.aborted) return;
      setLoad({ key, ...next });
      if (!next.timeline) return;
      if (first) {
        first = false;
        jumpTo(next.timeline.duration);
        setPlaying(false);
        setFollowLive(true);
      } else if (next.timeline.live && followRef.current && !playingRef.current) {
        jumpTo(next.timeline.duration);
      }
    };
    const fail = (cause: unknown) => {
      if (controller.signal.aborted) return;
      const error = cause instanceof Error ? cause.message : String(cause);
      setLoad((current) => ({ ...current, key, status: "error", error }));
    };

    if (source === "demo") {
      fetch(demoUrl, { cache: "no-store", signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const parsed = parseRunLog(await response.text());
          const timeline = parsed.lines.length ? buildTimeline(parsed.lines) : null;
          settle({ status: timeline ? "ready" : "empty", timeline, skipped: parsed.skipped, shift: timeline?.shift ?? null });
        })
        .catch(fail);
      return () => controller.abort();
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    let shift: string | null = null;
    let next = 0;
    let lines: RunLine[] = [];
    let skipped = 0;

    async function poll() {
      try {
        const runs = runsResponse.parse(await getJson(`${viewerBase}/api/runs`, controller.signal));
        const pick = runs.find((run) => run.live) ?? runs[0];
        if (!pick) {
          settle({ status: "empty", timeline: null, skipped: 0, shift: null });
        } else {
          if (pick.shift !== shift) {
            shift = pick.shift;
            next = 0;
            lines = [];
            skipped = 0;
          }
          const run = runResponse.parse(
            await getJson(`${viewerBase}/api/run/${encodeURIComponent(shift)}?from=${next}`, controller.signal),
          );
          if (run.lines.length || next === 0) {
            const parsed = parseRunValues(run.lines);
            lines = [...lines, ...parsed.lines];
            skipped += parsed.skipped;
            const timeline = lines.length ? buildTimeline(lines) : null;
            settle({ status: timeline ? "ready" : "empty", timeline, skipped, shift });
          }
          next = run.next;
        }
      } catch (cause: unknown) {
        if (controller.signal.aborted) return;
        fail(cause);
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, POLL_MS);
    }

    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [key, source, demoUrl, viewerBase, jumpTo]);

  const current = load.key === key ? load : null;
  const status: ReplayStatus = current?.status ?? "loading";
  const timeline = current?.timeline ?? null;
  const duration = timeline?.duration ?? 0;
  const live = timeline?.live ?? false;

  // The clock.
  useEffect(() => {
    if (!playing || !timeline) return;
    let frame = 0;
    let last = performance.now();
    let pushed = last;
    const tick = (time: number) => {
      const dt = Math.min(0.25, (time - last) / 1000);
      last = time;
      const end = timeline.duration;
      let nextT = tRef.current + dt * speed;
      let done = false;
      if (nextT >= end) {
        nextT = end;
        done = true;
      }
      tRef.current = nextT;
      if (done || time - pushed >= HUD_INTERVAL_MS) {
        pushed = time;
        setTState(nextT);
      }
      if (done) {
        setPlaying(false);
        if (timeline.live) setFollowLive(true);
        return;
      }
      frame = raf(tick);
    };
    frame = raf(tick);
    return () => cancelRaf(frame);
  }, [playing, speed, timeline]);

  const setT = useCallback(
    (value: number) => {
      const clamped = Math.max(0, Math.min(duration, value));
      jumpTo(clamped);
      if (live) setFollowLive(clamped >= duration - 1);
    },
    [duration, live, jumpTo],
  );

  const play = useCallback(() => {
    if (!timeline) return;
    if (tRef.current >= timeline.duration - 0.5) jumpTo(0);
    setFollowLive(false);
    setPlaying(true);
  }, [timeline, jumpTo]);

  const pause = useCallback(() => setPlaying(false), []);
  const toggle = useCallback(() => (playing ? pause() : play()), [playing, pause, play]);
  const now = useCallback(() => tRef.current, []);

  const retry = useCallback(() => {
    setPlaying(false);
    setAttempt((count) => count + 1);
  }, []);

  const snapshot = useMemo(() => (timeline ? snapshotAt(timeline, t) : null), [timeline, t]);

  return {
    status,
    error: current?.error,
    source,
    live,
    shift: timeline?.shift ?? current?.shift ?? null,
    seed: timeline?.seed ?? null,
    timeline,
    skipped: current?.skipped ?? 0,
    duration,
    t,
    setT,
    now,
    playing,
    play,
    pause,
    toggle,
    speed,
    setSpeed,
    followLive,
    setFollowLive,
    snapshot,
    retry,
  };
}
