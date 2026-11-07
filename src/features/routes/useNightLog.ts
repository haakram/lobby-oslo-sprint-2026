"use client";

import { useCallback, useEffect, useState } from "react";
import { parseRunLog, type RunLine } from "@/features/nightshift/runlog";

export type NightLogStatus = "loading" | "ready" | "empty" | "error";

export type NightLog = { status: NightLogStatus; lines: RunLine[]; retry: () => void };

/** The night's run log (the demo night by default), parsed with the Natteskift parser. */
export function useNightLog(src = "/runs/demo.jsonl", enabled = true): NightLog {
  const [status, setStatus] = useState<NightLogStatus>("loading");
  const [lines, setLines] = useState<RunLine[]>([]);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetch(src, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const parsed = parseRunLog(await response.text());
        setLines(parsed.lines);
        setStatus(parsed.lines.length ? "ready" : "empty");
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
    return () => controller.abort();
  }, [src, enabled, attempt]);

  const retry = useCallback(() => {
    setStatus("loading");
    setAttempt((count) => count + 1);
  }, []);

  return { status, lines, retry };
}
