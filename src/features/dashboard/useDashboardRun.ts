"use client";

import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { parseRunLog, parseRunValues, type RunLine, SHIFT_ID } from "@/features/nightshift/runlog";
import { type RunStatus, viewerBase } from "@/features/nightshift/useRun";

/** The recorded demo night (seed 1, the agent's real practice shift). */
export const DEMO_RUN = "/runs/demo.jsonl";

export type RunSource = "demo" | "live";

export type DashboardRun = {
  status: RunStatus;
  lines: RunLine[];
  source: RunSource;
  /** Live only: the shift we were following has stopped running. Its last lines stay on screen. */
  ended: boolean;
  /** Live only: the viewer stopped answering. When it last answered (epoch ms); null while in contact. */
  lostAfter: number | null;
  retry: () => void;
};

/** A live shift once it has lines: kept on screen when it ends or the viewer goes quiet. */
type LiveNight = { lines: RunLine[]; ended: boolean; lostAfter: number | null };

/** While a shift is live on the local viewer: follow it closely. */
export const POLL_LIVE_MS = 3000;
/** No live shift, or the viewer is down: look again now and then. */
export const POLL_IDLE_MS = 30_000;
const runEntry = z.object({ shift: z.string().regex(SHIFT_ID), live: z.boolean().optional() });
const runResponse = z.object({ lines: z.array(z.unknown()), next: z.number().int().nonnegative() });

async function getJson(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store", signal });
  if (!response.ok) {
    await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * The night the overview shows: the recorded demo night by default; a shift that is running right
 * now on the local viewer server (NEXT_PUBLIC_VIEWER_URL) takes over while it runs. The viewer being
 * down is not an error here: the demo night stays on screen. Once a live shift has been shown it is
 * never swapped back for the recording: when it ends it stays (`ended`), and when the viewer stops
 * answering it stays with the time of the last answer (`lostAfter`), so 06:00 never shows another
 * night as tonight's.
 */
export function useDashboardRun(viewerUrl?: string): DashboardRun {
  const [demo, setDemo] = useState<{ status: RunStatus; lines: RunLine[] }>({ status: "loading", lines: [] });
  const [live, setLive] = useState<LiveNight | null>(null);
  const [attempt, setAttempt] = useState(0);
  const base = viewerBase(viewerUrl);

  useEffect(() => {
    const controller = new AbortController();
    fetch(DEMO_RUN, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const text = await response.text();
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const { lines } = parseRunLog(text);
        setDemo({ status: lines.length ? "ready" : "empty", lines });
      })
      .catch(() => {
        if (!controller.signal.aborted) setDemo({ status: "error", lines: [] });
      });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    // Unset on the deployed app: no polling at all.
    if (!base) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let shift: string | null = null;
    let next = 0;
    let lines: RunLine[] = [];
    let busy = false;
    let lastAnswer = Date.now();

    /** One look at the viewer; returns how long to wait before the next one. */
    async function look(): Promise<number> {
      try {
        const runs = z.array(z.unknown()).parse(await getJson(`${base}/api/runs`, controller.signal));
        lastAnswer = Date.now();
        const running = runs.map((run) => runEntry.safeParse(run)).find((run) => run.success && run.data.live);
        if (!running?.success) {
          shift = null;
          // The shift we followed is over: keep its night on screen, marked as ended.
          setLive((current) => (current && !current.ended ? { ...current, ended: true, lostAfter: null } : current));
          return POLL_IDLE_MS;
        }
        if (running.data.shift !== shift) {
          shift = running.data.shift;
          next = 0;
          lines = [];
        }
        const run = runResponse.parse(
          await getJson(`${base}/api/run/${encodeURIComponent(shift)}?from=${next}`, controller.signal),
        );
        const added = parseRunValues(run.lines).lines;
        next = run.next;
        if (added.length) lines = [...lines, ...added];
        const shown = lines;
        setLive((current) => {
          // Nothing of the live shift yet: the recorded night stays until there is.
          if (shown.length === 0) return current;
          if (!added.length && current && !current.ended && current.lostAfter === null) return current;
          return { lines: shown, ended: false, lostAfter: null };
        });
        return POLL_LIVE_MS;
      } catch {
        // Lost contact: keep what we had, and say since when.
        if (!controller.signal.aborted) {
          setLive((current) => (current && !current.ended && current.lostAfter === null ? { ...current, lostAfter: lastAnswer } : current));
        }
        return POLL_IDLE_MS;
      }
    }

    async function poll() {
      if (busy) return;
      busy = true;
      clearTimeout(timer);
      timer = undefined;
      const wait = await look();
      busy = false;
      // Paused while the tab is hidden; `onVisible` picks it up again.
      if (!controller.signal.aborted && !document.hidden) timer = setTimeout(poll, wait);
    }

    function onVisible() {
      if (!document.hidden && timer === undefined) void poll();
    }

    document.addEventListener("visibilitychange", onVisible);
    if (!document.hidden) void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [base]);

  const retry = useCallback(() => {
    setDemo({ status: "loading", lines: [] });
    setAttempt((count) => count + 1);
  }, []);

  if (live) return { status: "ready", lines: live.lines, source: "live", ended: live.ended, lostAfter: live.lostAfter, retry };
  return { status: demo.status, lines: demo.lines, source: "demo", ended: false, lostAfter: null, retry };
}
