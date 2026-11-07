"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { parseRunLog, parseRunValues, replayDelayMs, type RunLine, type RunSummary, SHIFT_ID, summarise } from "./runlog";

export type RunStatus = "loading" | "ready" | "empty" | "error";

export type RunView = {
  status: RunStatus;
  summary: RunSummary;
  /** Lines that couldn't be read and were left out. */
  skipped: number;
};

/**
 * The viewer server's base URL (NEXT_PUBLIC_VIEWER_URL, not secret), or null when it is unset or not
 * an http(s) URL. Null hides the Live tab.
 */
export function viewerBase(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

/** The recorded shift in `src`, and a replay of it at 10x. Starts on the finished shift. */
export function useReplay(src: string) {
  const [status, setStatus] = useState<RunStatus>("loading");
  const [lines, setLines] = useState<RunLine[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [shown, setShown] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch(src, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const parsed = parseRunLog(await response.text());
        setLines(parsed.lines);
        setSkipped(parsed.skipped);
        setShown(parsed.lines.length);
        setStatus(parsed.lines.length ? "ready" : "empty");
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
    return () => controller.abort();
  }, [src, attempt]);

  const running = playing && shown < lines.length;

  useEffect(() => {
    if (!running) return;
    const prev = lines[shown - 1];
    const next = lines[shown];
    const delay = prev && next ? replayDelayMs(prev, next) : 0;
    const timer = setTimeout(() => setShown((count) => count + 1), delay);
    return () => clearTimeout(timer);
  }, [running, shown, lines]);

  const summary = useMemo(() => summarise(lines.slice(0, shown)), [lines, shown]);

  const play = useCallback(() => {
    setShown(0);
    setPlaying(true);
  }, []);

  const retry = useCallback(() => {
    setStatus("loading");
    setPlaying(false);
    setAttempt((count) => count + 1);
  }, []);

  const view: RunView = { status, summary, skipped };
  return { ...view, playing: running, play, retry };
}

const POLL_MS = 2000;

/** `/api/runs`: newest first. Entries whose shift id we can't trust are dropped. */
const runEntry = z.object({ shift: z.string().regex(SHIFT_ID), live: z.boolean().optional() });
const runsResponse = z.array(z.unknown()).transform((entries) =>
  entries.flatMap((entry) => {
    const parsed = runEntry.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  }),
);
/** `/api/run/<shift>?from=n`. */
const runResponse = z.object({ lines: z.array(z.unknown()), next: z.number().int().nonnegative() });

async function getJson(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store", signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

/**
 * Follows the newest live shift (else the newest shift) on the local viewer server, polling every
 * 2 s while `active`. Errors keep polling, so the view recovers on its own when the server is back.
 */
export function useLive(base: string | null, active: boolean) {
  const [view, setView] = useState<RunView & { shift: string | null }>({
    status: "loading",
    summary: summarise([]),
    skipped: 0,
    shift: null,
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!base || !active) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let shift: string | null = null;
    let next = 0;
    let lines: RunLine[] = [];
    let skipped = 0;

    async function poll() {
      try {
        const runs = runsResponse.parse(await getJson(`${base}/api/runs`, controller.signal));
        const pick = runs.find((run) => run.live) ?? runs[0];
        if (!pick) {
          setView({ status: "empty", summary: summarise([]), skipped: 0, shift: null });
        } else {
          if (pick.shift !== shift) {
            shift = pick.shift;
            next = 0;
            lines = [];
            skipped = 0;
          }
          const run = runResponse.parse(
            await getJson(`${base}/api/run/${encodeURIComponent(shift)}?from=${next}`, controller.signal),
          );
          const parsed = parseRunValues(run.lines);
          lines = [...lines, ...parsed.lines];
          skipped += parsed.skipped;
          next = run.next;
          setView({ status: "ready", summary: summarise(lines), skipped, shift });
        }
      } catch {
        if (controller.signal.aborted) return;
        setView((current) => ({ ...current, status: "error" }));
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, POLL_MS);
    }

    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [base, active, attempt]);

  const retry = useCallback(() => {
    setView((current) => ({ ...current, status: "loading" }));
    setAttempt((count) => count + 1);
  }, []);

  return { ...view, retry };
}
