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

async function fetchCalls(): Promise<CallsState> {
  try {
    const response = await fetch("/api/reception/calls", { cache: "no-store" });
    if (response.status === 503) return { kind: "not-set-up" };
    if (!response.ok) return { kind: "error" };
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

/** Loads once on open and on retry. No polling: the Resepsjon screen is where calls are followed live. */
export function useReceptionCalls() {
  const [state, setState] = useState<CallsState>({ kind: "loading" });
  const latest = useRef(0);

  const load = useCallback(async () => {
    const request = ++latest.current;
    const next = await fetchCalls();
    if (request === latest.current) setState(next);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const retry = useCallback(() => {
    setState({ kind: "loading" });
    void load();
  }, [load]);

  return { state, retry };
}
