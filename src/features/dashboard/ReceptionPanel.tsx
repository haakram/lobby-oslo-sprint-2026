import Link from "next/link";
import { formatDate, formatDayClock } from "@/features/reception/format";
import { Badge, Button, buttonClasses, Card, EmptyState, ErrorState, Skeleton } from "@/ui";
import { type CallsState, useReceptionCalls } from "./useReceptionCalls";

const SHOWN = 4;

/** Resepsjon: the latest calls, bookings and messages from ShirazIQ's receptionist. */
export function ReceptionPanel({ className }: { className?: string }) {
  const { state, retry } = useReceptionCalls();
  return <ReceptionPanelView state={state} retry={retry} className={className} />;
}

/** The panel on calls someone else fetched (Oversikt passes its own, shared with the Nå band). */
export function ReceptionPanelView({ state, retry, className }: { state: CallsState; retry: () => void; className?: string }) {
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
          {state.kind === "ready" && state.calls.length === 0 && (
            <EmptyState as="h3" title="Ingen samtaler ennå" body="Samtaler fra telefonen og nettleseren vises her." />
          )}
          {state.kind === "ready" && state.calls.length > 0 && (
            <ol aria-label="Siste samtaler">
              {state.calls.slice(0, SHOWN).map((call) => (
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
          )}
        </div>
      </Card>
    </section>
  );
}
