"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton } from "@/ui";
import type { CallNote } from "./callLog";
import { formatDate, formatDayClock, formatDuration } from "./format";

type LogState =
  | { kind: "loading" }
  | { kind: "ready"; calls: CallNote[] }
  | { kind: "error" }
  | { kind: "not-set-up" };

const nullableText = z.string().nullable();

// The route already cleans the notes; the screen still checks the shape before it renders anything.
const noteSchema = z.object({
  id: z.string(),
  startedAt: z.string(),
  durationSecs: z.number(),
  status: z.string(),
  title: nullableText,
  summary: nullableText,
  language: nullableText,
  callerName: nullableText,
  callbackNumber: nullableText,
  requestType: nullableText,
  arrival: nullableText,
  departure: nullableText,
  roomType: nullableText,
  guests: z.number().nullable(),
  needsCallback: z.boolean(),
}) satisfies z.ZodType<CallNote>;

async function fetchCalls(): Promise<LogState> {
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

/**
 * Samtalelogg: the latest calls to the receptionist, from the browser and the phone. Loads on
 * open, on Oppdater, and once when a call on this screen ends. No polling.
 */
export function CallLogPanel({ callActive }: { callActive: boolean }) {
  const [state, setState] = useState<LogState>({ kind: "loading" });
  // Only the newest request may set the state, so a slow old answer never overwrites a new one.
  const latest = useRef(0);

  const load = useCallback(async () => {
    const request = ++latest.current;
    const next = await fetchCalls();
    if (request === latest.current) setState(next);
  }, []);

  // A call that just ended bumps the version: one fresh load, on the spot.
  const [seenActive, setSeenActive] = useState(callActive);
  const [version, setVersion] = useState(0);
  if (callActive !== seenActive) {
    setSeenActive(callActive);
    if (!callActive) setVersion((v) => v + 1);
  }

  useEffect(() => {
    void load();
  }, [load, version]);

  const refresh = () => {
    setState({ kind: "loading" });
    void load();
  };

  return (
    <section aria-labelledby="call-log-heading" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="call-log-heading" className="text-2xl font-bold tracking-[-0.02em]">
          Samtalelogg
        </h2>
        <Button variant="secondary" loading={state.kind === "loading"} onClick={refresh}>
          Oppdater
        </Button>
      </div>
      <Card>
        <CallLogBody state={state} onRetry={refresh} />
      </Card>
    </section>
  );
}

function CallLogBody({ state, onRetry }: { state: LogState; onRetry: () => void }) {
  switch (state.kind) {
    case "loading":
      return (
        <div className="flex flex-col gap-5" aria-busy="true">
          <span className="sr-only">Henter samtaleloggen</span>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-5 w-2/5" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/5" />
            </div>
          ))}
        </div>
      );
    case "not-set-up":
      return (
        <ErrorState
          title="Resepsjonen er ikke satt opp"
          body="Agenten er ikke koblet til serveren ennå."
          action={
            <Button variant="secondary" onClick={onRetry}>
              Prøv igjen
            </Button>
          }
        />
      );
    case "error":
      return (
        <ErrorState
          title="Fikk ikke hentet samtaleloggen"
          body="Sjekk nettet og prøv igjen."
          action={
            <Button variant="secondary" onClick={onRetry}>
              Prøv igjen
            </Button>
          }
        />
      );
    case "ready":
      if (state.calls.length === 0) {
        return <EmptyState title="Ingen samtaler ennå" body="Samtaler fra nettleseren og telefonen vises her." />;
      }
      return (
        <ol aria-label="Siste samtaler" className="flex flex-col">
          {state.calls.map((call) => (
            <CallItem key={call.id} call={call} />
          ))}
        </ol>
      );
  }
}

function CallItem({ call }: { call: CallNote }) {
  const when = formatDayClock(call.startedAt);
  const stay =
    call.arrival && call.departure ? `${formatDate(call.arrival)}–${formatDate(call.departure)}` : null;
  return (
    <li className="flex flex-col gap-2 border-t border-line py-4 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 text-lg font-semibold break-words">{call.callerName ?? call.title ?? "Samtale"}</p>
        {when && <span className="font-mono text-sm text-muted tabular-nums">{when}</span>}
      </div>
      {call.summary && <p className="text-base break-words text-muted">{call.summary}</p>}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
        <span>
          Varighet <span className="font-mono text-text tabular-nums">{formatDuration(call.durationSecs)}</span>
        </span>
        {call.callbackNumber && <span className="font-mono text-text tabular-nums">{call.callbackNumber}</span>}
        {call.roomType && <span className="text-text">{call.roomType}</span>}
        {stay && <span className="font-mono text-text tabular-nums">{stay}</span>}
        {call.guests !== null && (
          <span>
            <span className="font-mono text-text tabular-nums">{call.guests}</span>{" "}
            {call.guests === 1 ? "gjest" : "gjester"}
          </span>
        )}
        {call.needsCallback && <Badge tone="accent">Ring tilbake</Badge>}
      </div>
    </li>
  );
}
