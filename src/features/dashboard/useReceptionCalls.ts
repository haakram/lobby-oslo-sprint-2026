"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";

/** The few fields of ShirazIQ's call notes (`GET /api/reception/calls`) the overview shows. */
const noteSchema = z.object({
  id: z.string(),
  startedAt: z.string(),
  title: z.string().nullable(),
  summary: z.string().nullable(),
  callerName: z.string().nullable(),
  requestType: z.string().nullable(),
  arrival: z.string().nullable(),
  departure: z.string().nullable(),
  guests: z.number().nullable(),
  needsCallback: z.boolean(),
});

export type CallSummary = z.infer<typeof noteSchema>;

export type CallsState =
  | { kind: "loading" }
  | { kind: "ready"; calls: CallSummary[] }
  | { kind: "not-set-up" }
  | { kind: "error" };

export const CALLS_URL = "/api/reception/calls";

/**
 * After a 503 the overview does not ask again on its own for this long, not even across page
 * reloads in the same tab (the public /api is rate limited per IP). "Prøv igjen" always asks.
 */
export const NOT_SET_UP_QUIET_MS = 60_000;
const QUIET_KEY = "lobby:reception-not-set-up-until";

function quietUntil(): number {
  try {
    return Number(sessionStorage.getItem(QUIET_KEY)) || 0;
  } catch {
    return 0;
  }
}

function setQuiet(until: number | null) {
  try {
    if (until === null) sessionStorage.removeItem(QUIET_KEY);
    else sessionStorage.setItem(QUIET_KEY, String(until));
  } catch {
    // Storage blocked: the panel still asks only once per mount.
  }
}

async function fetchCalls(): Promise<CallsState> {
  try {
    const response = await fetch(CALLS_URL, { cache: "no-store" });
    if (!response.ok) {
      // Read the error body too: an unread response keeps the request open in the browser.
      await response.text().catch(() => "");
      return { kind: response.status === 503 ? "not-set-up" : "error" };
    }
    const body: unknown = await response.json();
    const list = body && typeof body === "object" && "calls" in body ? body.calls : null;
    if (!Array.isArray(list)) return { kind: "error" };
    const calls = list.flatMap((item) => {
      const parsed = noteSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    });
    return { kind: "ready", calls };
  } catch {
    return { kind: "error" };
  }
}

/** Mounts that ask at the same moment (React's dev double mount) share one request. */
let inflight: Promise<CallsState> | null = null;

function fetchShared(): Promise<CallsState> {
  inflight ??= fetchCalls().finally(() => {
    inflight = null;
  });
  return inflight;
}

/**
 * One request when the panel mounts, one per "Prøv igjen", nothing else: no polling, no retry loop
 * (the Resepsjon screen is where calls are followed live). The effect runs on mount only, so no
 * re-render can start another request.
 */
export function useReceptionCalls() {
  const [state, setState] = useState<CallsState>({ kind: "loading" });
  const latest = useRef(0);

  /** `force`: "Prøv igjen" always asks; a mount stays quiet for a minute after a 503. */
  const load = useCallback(async (force: boolean) => {
    const request = ++latest.current;
    const quiet = !force && quietUntil() > Date.now();
    const next: CallsState = quiet ? { kind: "not-set-up" } : await fetchShared();
    if (!quiet) setQuiet(next.kind === "not-set-up" ? Date.now() + NOT_SET_UP_QUIET_MS : null);
    if (request === latest.current) setState(next);
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const retry = useCallback(() => {
    setState({ kind: "loading" });
    void load(true);
  }, [load]);

  return { state, retry };
}
