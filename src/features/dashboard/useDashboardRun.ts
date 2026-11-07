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

const POLL_MS = 3000;
const runEntry = z.object({ shift: z.string().regex(SHIFT_ID), live: z.boolean().optional() });
const runResponse = z.object({ lines: z.array(z.unknown()), next: z.number().int().nonnegative() });

async function getJson(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store", signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
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
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const { lines } = parseRunLog(await response.text());
        setDemo({ status: lines.length ? "ready" : "empty", lines });
      })
      .catch(() => {
        if (!controller.signal.aborted) setDemo({ status: "error", lines: [] });
      });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    if (!base) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let shift: string | null = null;
    let next = 0;
    let lines: RunLine[] = [];

    async function poll() {
      try {
        const runs = z.array(z.unknown()).parse(await getJson(`${base}/api/runs`, controller.signal));
        const running = runs.map((run) => runEntry.safeParse(run)).find((run) => run.success && run.data.live);
        if (!running?.success) {
          shift = null;
          setLive(null);
        } else {
          if (running.data.shift !== shift) {
            shift = running.data.shift;
            next = 0;
            lines = [];
          }
          const run = runResponse.parse(
            await getJson(`${base}/api/run/${encodeURIComponent(shift)}?from=${next}`, controller.signal),
          );
          lines = [...lines, ...parseRunValues(run.lines).lines];
          next = run.next;
          setLive(lines.length ? lines : null);
        }
      } catch {
        if (controller.signal.aborted) return;
        setLive(null);
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, POLL_MS);
    }

    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [base]);

  const retry = useCallback(() => {
    setDemo({ status: "loading", lines: [] });
    setAttempt((count) => count + 1);
  }, []);

  if (live) return { status: "ready", lines: live, source: "live", retry };
  return { status: demo.status, lines: demo.lines, source: "demo", retry };
}
