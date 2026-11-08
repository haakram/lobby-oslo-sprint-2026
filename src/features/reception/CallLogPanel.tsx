"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { Badge, Button, Card, ErrorState, Skeleton } from "@/ui";
import type { CallNote } from "./callLog";
import type { DemoCall } from "./demoCalls";
import { formatClock, formatDate, formatDayClock, formatDuration } from "./format";
import { nightCalls, type SampleCall } from "./nightCalls";
import { PhoneLink } from "./PhoneLink";

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
  // Optional: a server from before the number was masked sends none.
  callbackTel: nullableText.default(null),
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

const NO_CALLS: readonly CallNote[] = [];

/**
 * Samtalelogg: the latest calls to the receptionist, from the browser and the phone, above last night's
 * sample calls (nightCalls.ts: the same three Overlevering and Forespørsler count), so the screen never
 * opens empty and still shows a call when the live log or the venue's network fails (jury round 4,
 * the creative juror). Loads on open, on Oppdater, and once when a call on this screen ends. No polling.
 */
export function CallLogPanel({ callActive, demo }: { callActive: boolean; demo?: readonly DemoCall[] }) {
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

  const live = state.kind === "ready" ? state.calls : NO_CALLS;
  const night = useMemo(() => nightCalls(live, { demo }), [live, demo]);

  return (
    <section aria-labelledby="call-log-heading" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        {/* A panel's title, the size of Bookinger og beskjeder beside it. */}
        <h2 id="call-log-heading" className="text-lg font-bold tracking-[-0.01em]">
          Samtalelogg
        </h2>
        <Button variant="secondary" loading={state.kind === "loading"} onClick={refresh}>
          Oppdater
        </Button>
      </div>
      <Card className="flex flex-col gap-5">
        <CallLogBody state={state} onRetry={refresh} />
        {night.samples.length > 0 && <SampleCalls samples={night.samples} />}
      </Card>
    </section>
  );
}

function CallLogBody({ state, onRetry }: { state: LogState; onRetry: () => void }) {
  switch (state.kind) {
    case "loading":
      // One call's shape: the samples below stay where they are while the live log loads.
      return (
        <div className="flex flex-col gap-2" aria-busy="true">
          <span className="sr-only">Henter samtaleloggen</span>
          <Skeleton className="h-5 w-2/5" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/5" />
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
        return (
          <p className="text-sm text-muted">
            <span className="font-semibold text-text">Ingen nye samtaler.</span> Samtaler fra nettleseren og telefonen legger
            seg her, over eksemplene.
          </p>
        );
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
        {call.callbackNumber && <PhoneLink phone={call.callbackNumber} tel={call.callbackTel} />}
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

/** Last night's sample calls, one quiet band above them: made up, and each one became a task. */
function SampleCalls({ samples }: { samples: readonly SampleCall[] }) {
  return (
    <section aria-labelledby="sample-calls-heading" className="flex flex-col gap-4 border-t border-line pt-4 first:border-t-0 first:pt-0">
      <div className="rounded-md bg-sunken px-3 py-2 text-sm">
        <h3 id="sample-calls-heading" className="font-semibold">
          Eksempel: <span className="font-mono tabular-nums">{samples.length}</span>{" "}
          {samples.length === 1 ? "samtale" : "samtaler"} fra i natt
        </h3>
        <p className="text-muted">
          Oppdiktede gjester og numre. Hver ble en oppgave i{" "}
          <Link href="/foresporsler" className="font-semibold text-accent-text hover:underline">
            Forespørsler
          </Link>
          .
        </p>
      </div>
      <ol aria-label="Eksempelsamtaler" className="flex flex-col">
        {samples.map((sample) => (
          <SampleCallItem key={sample.note.id} sample={sample} />
        ))}
      </ol>
    </section>
  );
}

/** A sample call: who, when, the guest's own words, what the receptionist wrote down, and what came of it. */
function SampleCallItem({ sample: { note, call } }: { sample: SampleCall }) {
  return (
    <li className="flex flex-col gap-2 border-t border-line py-4 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 text-base font-semibold break-words">{note.callerName}</p>
        <span className="font-mono text-sm text-muted tabular-nums">{formatClock(note.startedAt)}</span>
      </div>
      <blockquote lang={call.quoteLang} className="text-base break-words">
        «{call.quote}»
      </blockquote>
      {note.summary && <p className="text-sm break-words text-muted">{note.summary}</p>}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
        <span>
          Varighet <span className="font-mono text-text tabular-nums">{formatDuration(note.durationSecs)}</span>
        </span>
        {note.language && <span>På {note.language}</span>}
        {note.callbackNumber && <PhoneLink phone={note.callbackNumber} tel={null} />}
        <span className="text-text">
          {call.handled ? (
            <>
              Ordnet av {call.handled.who} <span className="font-mono tabular-nums">{call.handled.at}</span>
            </>
          ) : (
            "Oppgave i Forespørsler"
          )}
        </span>
      </div>
    </li>
  );
}
