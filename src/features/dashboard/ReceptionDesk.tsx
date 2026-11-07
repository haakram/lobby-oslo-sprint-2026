"use client";

import Link from "next/link";
import { useMemo, useRef } from "react";
import { useHotelMap } from "@/features/hotel";
import { formatClock, formatDate, formatDayClock } from "@/features/reception/format";
import { Badge, Button, buttonClasses, Card, EmptyState, ErrorState, PageHeader, Skeleton, Stat } from "@/ui";
import { hhmm } from "./format";
import { itemLabel, OUTCOME, placeLabel, requestKindLabel } from "./labels";
import { foldNight, selectRobot, selectRooms, type RoomView, type Task } from "./selectors";
import { useDashboardRun } from "./useDashboardRun";
import { useEntrance } from "./useEntrance";
import { type CallSummary, useReceptionCalls } from "./useReceptionCalls";

const TODAY = new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", weekday: "long", day: "numeric", month: "long" });
const OSLO_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo", year: "numeric", month: "2-digit", day: "2-digit" });

const CALLS_SHOWN = 8;
const REQUESTS_SHOWN = 8;

/** The things a receptionist must know before the guest arrives, read off the call's own words. */
const SPECIAL: Array<{ word: string; test: RegExp }> = [
  { word: "Kjæledyr", test: /\b(hund|katt|kjæledyr|dyr|pet|dog|cat|puppy)\b/i },
  { word: "Allergi", test: /\b(allergi|allergisk|allergy|allergic|nøttefri|gluten|laktose)\b/i },
  { word: "Tilgjengelighet", test: /\b(rullestol|wheelchair|handikap|accessible|tilgjengelig|heis)\b/i },
  { word: "Barn", test: /\b(barneseng|crib|cot|baby|barn|children|kids)\b/i },
  { word: "Tidlig eller sen", test: /\b(tidlig innsjekk|sen utsjekk|early check|late check|sen ankomst|late arrival)\b/i },
];

function specialCases(calls: CallSummary[]): Array<{ call: CallSummary; words: string[] }> {
  return calls.flatMap((call) => {
    const text = `${call.title ?? ""} ${call.summary ?? ""} ${call.requestType ?? ""}`;
    const words = SPECIAL.filter((entry) => entry.test.test(text)).map((entry) => entry.word);
    return words.length ? [{ call, words }] : [];
  });
}

function isToday(iso: string): boolean {
  const at = new Date(iso);
  return !Number.isNaN(at.getTime()) && OSLO_DAY.format(at) === OSLO_DAY.format(new Date());
}

/**
 * The receptionist's desk on `/`: today's calls and bookings from the AI receptionist, who to
 * call back, rooms ready to sell after the night, what guests asked the robot for, and the
 * special cases (a pet, an allergy) to have ready before check-in. Dag surface: paper and ink.
 */
export function ReceptionDesk({ viewerUrl }: { viewerUrl?: string }) {
  const run = useDashboardRun(viewerUrl);
  const night = useMemo(() => (run.status === "ready" ? foldNight(run.lines) : null), [run.status, run.lines]);
  const map = useHotelMap(run.status === "ready" ? run.lines : null);
  const rooms = useMemo(() => (night ? selectRooms(night, undefined, map) : null), [night, map]);
  const robot = useMemo(() => (night ? selectRobot(night, map) : null), [night, map]);
  const requests = useMemo(() => (night ? guestRequests(night.tasks) : null), [night]);
  const { state: calls, retry } = useReceptionCalls();

  const ready = calls.kind !== "loading" && run.status !== "loading";
  const scope = useRef<HTMLDivElement>(null);
  useEntrance(scope, ready);

  const list = calls.kind === "ready" ? calls.calls : null;
  const today = list ? list.filter((call) => isToday(call.startedAt)) : null;
  const callbacks = list ? list.filter((call) => call.needsCallback) : null;
  const bookings = list ? list.filter((call) => call.arrival) : null;
  const special = list ? specialCases(list) : null;
  const sellable = rooms ? rooms.filter((room) => room.status === "klar") : null;
  const unchecked = rooms ? rooms.filter((room) => room.status === "ukjent").length : 0;

  return (
    <main data-surface="light" className="flex-1 bg-bg text-text">
      <div ref={scope} className="mx-auto flex w-full max-w-[1600px] flex-col gap-8 px-4 py-6 sm:px-6 lg:gap-10 lg:px-10 lg:py-10">
        <PageHeader
          title="Resepsjonen"
          lede={`${capitalise(TODAY.format(new Date()))}. Samtalene, bookingene og det gjestene ba roboten om i natt.`}
          actions={
            <Link href="/resepsjon" className={buttonClasses("primary")}>
              Åpne Resepsjon
            </Link>
          }
        />

        <section aria-label="Dagen i tall" data-enter>
          <div className="grid grid-cols-2 gap-x-6 gap-y-6 border-y border-line py-5 sm:grid-cols-4 lg:gap-x-10">
            <Figure label="Samtaler i dag" value={today?.length} loading={calls.kind === "loading"} />
            <Figure label="Å ringe tilbake" value={callbacks?.length} loading={calls.kind === "loading"} tone={callbacks && callbacks.length > 0 ? "danger" : "default"} />
            <Figure label="Bookinger å bekrefte" value={bookings?.length} loading={calls.kind === "loading"} />
            <Figure label="Rom klare å selge" value={sellable?.length} loading={run.status === "loading"} unit={rooms ? `av ${rooms.length}` : undefined} tone="success" />
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)] lg:items-start lg:gap-8">
          <div className="flex min-w-0 flex-col gap-6 lg:gap-8">
            <section aria-labelledby="calls-heading" data-enter>
              <Card className="sm:p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                  <h2 id="calls-heading" className="text-lg font-semibold tracking-[-0.01em]">
                    Dagens samtaler
                  </h2>
                  {list && list.length > 0 && <p className="text-sm text-muted">Siste først. Fra telefonen og nettleseren.</p>}
                </div>
                <CallsBody state={calls} retry={retry} list={list} />
              </Card>
            </section>

            <section aria-labelledby="requests-heading" data-enter>
              <Card className="sm:p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                  <h2 id="requests-heading" className="text-lg font-semibold tracking-[-0.01em]">
                    Gjestenes ønsker i natt
                  </h2>
                  <p className="text-sm text-muted">Det roboten ble bedt om, og hvordan det gikk.</p>
                </div>
                {run.status === "loading" ? (
                  <Rows />
                ) : run.status === "error" ? (
                  <ErrorState
                    className="mt-4"
                    title="Fikk ikke lastet natten"
                    body="Natteloggen svarte ikke. Sjekk nettet og prøv igjen."
                    action={
                      <Button variant="secondary" onClick={run.retry}>
                        Prøv igjen
                      </Button>
                    }
                  />
                ) : !requests || requests.length === 0 ? (
                  <EmptyState className="mt-4" title="Ingen ønsker i natt" body="Når gjester ber roboten om noe, står det her med rom og utfall." />
                ) : (
                  <ol className="mt-2 divide-y divide-line">
                    {requests.slice(0, REQUESTS_SHOWN).map((task) => {
                      const outcome = task.outcome === "running" && robot?.ended ? { word: "Ikke ferdig", tone: "neutral" as const } : OUTCOME[task.outcome];
                      return (
                        <li key={task.request} className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-baseline gap-x-3 py-3">
                          <span className="text-sm whitespace-nowrap text-muted tabular-nums">{hhmm(task.startedAt)}</span>
                          <span className="min-w-0">
                            <span className="font-semibold">{requestKindLabel(task.kind)}</span>
                            <span className="text-muted">
                              {task.room ? ` · ${placeLabel(task.room)}` : ""}
                              {task.item ? ` · ${itemLabel(task.item)}` : ""}
                            </span>
                            {task.text && (
                              <span lang="en" className="mt-0.5 block truncate text-sm text-muted">
                                {task.text}
                              </span>
                            )}
                          </span>
                          <Badge tone={outcome.tone}>{outcome.word}</Badge>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </Card>
            </section>
          </div>

          <div className="flex min-w-0 flex-col gap-6 lg:gap-8">
            <section aria-labelledby="callback-heading" data-enter>
              <Card className="sm:p-6">
                <h2 id="callback-heading" className="text-lg font-semibold tracking-[-0.01em]">
                  Ring tilbake
                </h2>
                {calls.kind === "loading" ? (
                  <Rows count={2} />
                ) : !callbacks ? (
                  <p className="mt-3 text-base text-muted">Vises når resepsjonisten er koblet til.</p>
                ) : callbacks.length === 0 ? (
                  <p className="mt-3 text-base text-muted">Ingen venter på å bli ringt. Alt er besvart.</p>
                ) : (
                  <ol className="mt-2 divide-y divide-line">
                    {callbacks.map((call) => (
                      <li key={call.id} className="flex flex-col gap-1 py-3">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="font-semibold">{call.callerName ?? call.title ?? "Ukjent innringer"}</span>
                          <span className="text-sm whitespace-nowrap text-muted tabular-nums">{formatClock(call.startedAt)}</span>
                        </div>
                        {call.summary && <p className="line-clamp-2 text-sm text-muted">{call.summary}</p>}
                      </li>
                    ))}
                  </ol>
                )}
              </Card>
            </section>

            <section aria-labelledby="sell-heading" data-enter>
              <Card className="sm:p-6">
                <h2 id="sell-heading" className="text-lg font-semibold tracking-[-0.01em]">
                  Rom klare å selge
                </h2>
                {!rooms ? (
                  <Rows count={2} />
                ) : (
                  <SellableRooms rooms={sellable ?? []} unchecked={unchecked} />
                )}
              </Card>
            </section>

            <section aria-labelledby="special-heading" data-enter>
              <Card className="sm:p-6">
                <h2 id="special-heading" className="text-lg font-semibold tracking-[-0.01em]">
                  Spesielle hensyn
                </h2>
                {calls.kind === "loading" ? (
                  <Rows count={2} />
                ) : !special ? (
                  <p className="mt-3 text-base text-muted">Vises når resepsjonisten er koblet til.</p>
                ) : special.length === 0 ? (
                  <p className="mt-3 text-base text-muted">Ingen kjæledyr, allergier eller andre hensyn meldt i samtalene.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-line">
                    {special.map(({ call, words }) => (
                      <li key={call.id} className="flex flex-col gap-1.5 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {words.map((word) => (
                            <Badge key={word} tone="warning">
                              {word}
                            </Badge>
                          ))}
                          <span className="text-sm font-semibold">{call.callerName ?? call.title ?? "Samtale"}</span>
                          {call.arrival && <span className="text-sm text-muted">ankommer {formatDate(call.arrival)}</span>}
                        </div>
                        {call.summary && <p className="line-clamp-2 text-sm text-muted">{call.summary}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

function CallsBody({ state, retry, list }: { state: ReturnType<typeof useReceptionCalls>["state"]; retry: () => void; list: CallSummary[] | null }) {
  if (state.kind === "loading") return <Rows count={4} />;
  if (state.kind === "not-set-up")
    return (
      <EmptyState
        className="mt-4"
        title="Resepsjonisten er ikke koblet til ennå"
        body="Når telefonagenten er satt opp, vises dagens samtaler, bookinger og beskjeder her."
        action={
          <Link href="/resepsjon" className={buttonClasses("secondary")}>
            Åpne Resepsjon
          </Link>
        }
      />
    );
  if (state.kind === "error")
    return (
      <ErrorState
        className="mt-4"
        title="Fikk ikke hentet samtalene"
        body="Sjekk nettet og prøv igjen."
        action={
          <Button variant="secondary" onClick={retry}>
            Prøv igjen
          </Button>
        }
      />
    );
  if (!list || list.length === 0) return <EmptyState className="mt-4" title="Ingen samtaler ennå i dag" body="Samtaler fra telefonen og nettleseren vises her etter hvert som de kommer." />;
  return (
    <ol aria-label="Siste samtaler" className="mt-2 divide-y divide-line">
      {list.slice(0, CALLS_SHOWN).map((call) => (
        <li key={call.id} className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-baseline gap-x-3 py-3 sm:grid-cols-[6.5rem_minmax(0,1fr)]">
          <span className="text-sm whitespace-nowrap text-muted tabular-nums">
            <span className="sm:hidden">{formatClock(call.startedAt)}</span>
            <span className="hidden sm:inline">{formatDayClock(call.startedAt)}</span>
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-semibold">{call.title ?? call.requestType ?? "Samtale"}</span>
              {call.callerName && <span className="text-sm text-muted">{call.callerName}</span>}
              {call.arrival && (
                <Badge tone="success">
                  Booking {formatDate(call.arrival)}
                  {call.departure ? `–${formatDate(call.departure)}` : ""}
                </Badge>
              )}
              {call.needsCallback && <Badge tone="warning">Ring tilbake</Badge>}
            </div>
            {call.summary && <p className="line-clamp-2 text-sm text-muted">{call.summary}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function SellableRooms({ rooms, unchecked }: { rooms: RoomView[]; unchecked: number }) {
  if (rooms.length === 0)
    return (
      <p className="mt-3 text-base text-muted">
        Ingen rom er bekreftet klare etter natten.{unchecked > 0 ? ` ${unchecked} rom er ikke sjekket.` : ""}
      </p>
    );
  return (
    <div className="mt-3 flex flex-col gap-3">
      <ul aria-label="Rom som er klare" className="flex flex-wrap gap-1.5">
        {rooms.map((room) => (
          <li key={room.id} className="rounded-sm bg-sunken px-2 py-1 font-display text-lg leading-none font-semibold tabular-nums">
            {room.number}
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted">
        Sett klare av roboten i natt.{unchecked > 0 ? ` ${unchecked} rom er ikke sjekket og kan være ledige.` : ""}
      </p>
    </div>
  );
}

/** A figure that is still loading shows a skeleton; one whose source isn't connected shows a dash. */
function Figure({
  label,
  value,
  loading,
  unit,
  tone,
}: {
  label: string;
  value: number | undefined;
  loading: boolean;
  unit?: string;
  tone?: "default" | "success" | "danger";
}) {
  return loading ? (
    <div className="flex flex-col gap-1">
      <Skeleton className="h-8 w-16" />
      <span className="text-xs text-muted">{label}</span>
    </div>
  ) : (
    <Stat label={label} value={value ?? "–"} unit={unit} tone={value === undefined ? "default" : tone} />
  );
}

function Rows({ count = 3 }: { count?: number }) {
  return (
    <div className="mt-4 flex flex-col gap-4" aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-5 w-2/5" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      ))}
    </div>
  );
}

/** The guests' requests the robot took on, newest first. */
function guestRequests(tasks: Map<string, Task>): Task[] {
  return [...tasks.values()].sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));
}

function capitalise(text: string): string {
  return text.charAt(0).toLocaleUpperCase("nb-NO") + text.slice(1);
}
