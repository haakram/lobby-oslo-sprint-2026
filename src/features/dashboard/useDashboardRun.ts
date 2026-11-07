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
  retry: () => void;
};

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
 * down is not an error here: the demo night stays on screen.
 */
export function useDashboardRun(viewerUrl?: string): DashboardRun {
  const [demo, setDemo] = useState<{ status: RunStatus; lines: RunLine[] }>({ status: "loading", lines: [] });
  const [live, setLive] = useState<RunLine[] | null>(null);
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

    /** One look at the viewer; returns how long to wait before the next one. */
    async function look(): Promise<number> {
      try {
        const runs = z.array(z.unknown()).parse(await getJson(`${base}/api/runs`, controller.signal));
        const running = runs.map((run) => runEntry.safeParse(run)).find((run) => run.success && run.data.live);
        if (!running?.success) {
          shift = null;
          setLive(null);
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
        if (added.length) {
          lines = [...lines, ...added];
          setLive(lines);
        }
        return POLL_LIVE_MS;
      } catch {
        if (!controller.signal.aborted) setLive(null);
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

  if (live) return { status: "ready", lines: live, source: "live", retry };
  return { status: demo.status, lines: demo.lines, source: "demo", retry };
}
