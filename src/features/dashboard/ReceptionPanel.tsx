import Link from "next/link";
import { formatDate, formatDayClock } from "@/features/reception/format";
import { nightCalls } from "@/features/reception/nightCalls";
import { Badge, Button, buttonClasses, Card, EmptyState, ErrorState, Skeleton } from "@/ui";
import { type CallSummary, type CallsState, useReceptionCalls } from "./useReceptionCalls";

const SHOWN = 4;

/** Resepsjon: the latest calls, bookings and messages from ShirazIQ's receptionist. */
export function ReceptionPanel({ className }: { className?: string }) {
  const { state, retry } = useReceptionCalls();
  return <ReceptionPanelView state={state} retry={retry} className={className} />;
}

/**
 * The panel on calls someone else fetched (Oversikt passes its own, shared with the Nå band). It counts the
 * night's calls with owner E's `nightCalls`, the same source Overlevering counts (round 5): the live call log,
 * then last night's sample calls under one quiet "Eksempel" line, in every state, so it never says "Ingen
 * samtaler ennå" while Overlevering says 3.
 */
export function ReceptionPanelView({ state, retry, className }: { state: CallsState; retry: () => void; className?: string }) {
  const night = nightCalls(state.kind === "ready" ? state.calls : []);
  return (
    <section aria-labelledby="reception-heading" data-enter className={className}>
      <Card className="sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
          <h2 id="reception-heading" className="text-lg font-semibold tracking-[-0.01em]">
            Resepsjon
          </h2>
          {state.kind === "ready" && (
            <Link
              href="/resepsjon"
              className="flex min-h-11 items-center text-sm font-semibold text-accent-text hover:underline"
            >
              Åpne Resepsjon
            </Link>
          )}
        </div>

        <div className="mt-2">
          {state.kind === "loading" && (
            <div className="flex flex-col gap-5" aria-busy="true">
              <span className="sr-only">Henter samtalene</span>
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex flex-col gap-2">
                  <Skeleton className="h-5 w-2/5" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ))}
            </div>
          )}
          {state.kind === "not-set-up" && (
            <EmptyState
              as="h3"
              title="Resepsjonisten er ikke koblet til ennå"
              body="Når telefonagenten er satt opp, vises samtaler, bookinger og beskjeder her."
              action={
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="secondary" onClick={retry} aria-label="Prøv igjen: Resepsjon">
                    Prøv igjen
                  </Button>
                  <Link href="/resepsjon" className={buttonClasses("ghost")}>
                    Åpne Resepsjon
                  </Link>
                </div>
              }
            />
          )}
          {state.kind === "error" && (
            <ErrorState
              as="h3"
              title="Fikk ikke hentet samtalene"
              body="Sjekk nettet og prøv igjen."
              action={
                <Button variant="secondary" onClick={retry}>
                  Prøv igjen
                </Button>
              }
            />
          )}
          {state.kind === "ready" && night.total === 0 && (
            <EmptyState as="h3" title="Ingen samtaler ennå" body="Samtaler fra telefonen og nettleseren vises her." />
          )}
          {state.kind === "ready" && night.live.length > 0 && <CallList label="Siste samtaler" calls={night.live.slice(0, SHOWN)} />}
          {state.kind !== "loading" && state.kind !== "hidden" && night.samples.length > 0 && (
            <div className="mt-3 border-t border-line pt-3 first:mt-0 first:border-t-0 first:pt-0">
              <p className="text-sm text-muted">
                Eksempel: {night.samples.length} {night.samples.length === 1 ? "samtale" : "samtaler"} fra i natt (testdata)
              </p>
              <CallList label="Eksempelsamtaler fra i natt" calls={night.samples.map((sample) => sample.note)} />
            </div>
          )}
        </div>
      </Card>
    </section>
  );
}

function CallList({ label, calls }: { label: string; calls: readonly CallSummary[] }) {
  return (
    <ol aria-label={label}>
      {calls.map((call) => (
        <li key={call.id} className="flex flex-col gap-1 border-t border-line py-3 first:border-t-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm whitespace-nowrap text-muted tabular-nums">
              {formatDayClock(call.startedAt)}
            </span>
            <span className="text-base font-semibold">{call.title ?? call.requestType ?? "Samtale"}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {call.callerName && <span className="text-sm">{call.callerName}</span>}
            {call.arrival && (
              <Badge tone="success">
                Booking {formatDate(call.arrival)}
                {call.departure ? `–${formatDate(call.departure)}` : ""}
              </Badge>
            )}
            {call.needsCallback && <Badge>Ring tilbake</Badge>}
          </div>
          {call.summary && <p className="line-clamp-2 text-sm text-muted">{call.summary}</p>}
        </li>
      ))}
    </ol>
  );
}
