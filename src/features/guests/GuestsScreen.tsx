"use client";

import Link from "next/link";
import { useMemo } from "react";
import { STATUS_LOOK } from "@/features/dashboard/labels";
import { RunBadge } from "@/features/dashboard/TopBar";
import { useNight } from "@/features/dashboard/useNight";
import { type CallSummary, useReceptionCalls } from "@/features/dashboard/useReceptionCalls";
import { FigureRow, ModulePage, PanelHead } from "@/features/modules/ModulePage";
import { SourceNote } from "@/features/modules/SourceNote";
import { formatDate, formatDayClock } from "@/features/reception/format";
import { pmsLastNight, revenueLastNight } from "@/features/rooms/pms";
import { useRoomCheck } from "@/features/rooms/useRoomCheck";
import { Badge, Button, buttonClasses, Card, EmptyState, ErrorState, Skeleton, Stat } from "@/ui";
import { nights, selectGuestDay, type Stay } from "./testData";

const ROOMS_IN_HOTEL = 36;

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

const DAY = new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", weekday: "long", day: "numeric", month: "long" });

function roomWord(room: string | null): string {
  return room ? `Rom ${room.replace(/^room-/, "")}` : "Rom ikke tildelt";
}

/**
 * Gjester og bookinger: who arrives and leaves today, who sleeps here tonight, what the AI
 * receptionist booked and who to call back, and the special cases to have ready at the desk.
 */
export function GuestsScreen({ viewerUrl }: { viewerUrl?: string }) {
  const day = useMemo(() => selectGuestDay(), []);
  const { run, rooms } = useNight(viewerUrl);
  const { state: calls, retry } = useReceptionCalls();
  const list = calls.kind === "ready" ? calls.calls : null;
  const bookings = list ? list.filter((call) => call.arrival) : null;
  const callbacks = list ? list.filter((call) => call.needsCallback) : null;
  const special = list ? specialCases(list) : [];
  const roomStatus = useMemo(() => new Map((rooms ?? []).map((room) => [room.id, room.status])), [rooms]);
  const total = rooms?.length ?? ROOMS_IN_HOTEL;
  // Last night's rooms sold, from the one booking system Oversikt and Overlevering read too.
  const sold = useMemo(() => revenueLastNight(total, pmsLastNight(day.today)).roomsSold, [total, day.today]);
  // "Klar" is one number everywhere (round 3, design review): the room check's Klare til salg, the figure
  // Oversikt and Rom show, so a room held back (209) or not yet released (213) is never offered here.
  const { money } = useRoomCheck(run.status === "ready" ? run.lines : null, rooms, day.today);
  const readyRooms = rooms && money ? money.readyToSell : null;
  const nightMissing = run.status === "error" || run.status === "empty";
  const ready = calls.kind !== "loading" && run.status !== "loading";

  return (
    <ModulePage
      module="gjester"
      ready={ready}
      lede={`${capitalise(DAY.format(new Date()))}. Ankomster, avreiser, hvem som bor her, og det resepsjonisten har tatt imot.`}
      meta={run.source === "live" ? <RunBadge run={run} /> : undefined}
      actions={
        <Link href="/resepsjon" className={buttonClasses("secondary")}>
          Åpne Resepsjon
        </Link>
      }
    >
      <FigureRow label="Dagen i tall">
        <Stat label="Ankomster i dag" value={day.arrivals.length} />
        <Stat label="Avreiser i dag" value={day.departures.length} />
        <Stat label="Belegg i natt" value={sold} unit={`av ${total} rom`} />
        {calls.kind === "loading" ? (
          <div className="flex flex-col gap-1">
            <Skeleton className="h-8 w-16" />
            <span className="text-sm text-muted">Bookinger fra resepsjonisten</span>
          </div>
        ) : (
          <Stat label="Bookinger fra resepsjonisten" value={bookings ? bookings.length : "–"} unit={callbacks && callbacks.length > 0 ? `${callbacks.length} å ringe` : undefined} tone={callbacks && callbacks.length > 0 ? "warning" : "default"} />
        )}
      </FigureRow>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)] lg:items-start lg:gap-8">
        <div className="flex min-w-0 flex-col gap-6 lg:gap-8">
          <section aria-labelledby="arrivals-heading" data-enter>
            <Card className="sm:p-6">
              <PanelHead id="arrivals-heading" title="Ankomster i dag" count={day.arrivals.length} note="Innsjekk fra 15:00." />
              <StayList stays={day.arrivals} empty="Ingen ankomster i dag." roomStatus={roomStatus} readyRooms={readyRooms} />
              <SourceNote className="mt-3" sources="test" />
            </Card>
          </section>

          <section aria-labelledby="departures-heading" data-enter>
            <Card className="sm:p-6">
              <PanelHead id="departures-heading" title="Avreiser i dag" count={day.departures.length} note="Utsjekk til 11:00. Rommets status er slik roboten sist så det." />
              <StayList stays={day.departures} empty="Ingen avreiser i dag." roomStatus={roomStatus} readyRooms={readyRooms} showStatus statusUnknown={nightMissing} />
              <SourceNote className="mt-3" sources={["test", "run-log"]} />
            </Card>
          </section>

          <section aria-labelledby="inhouse-heading" data-enter>
            <Card className="sm:p-6">
              <PanelHead id="inhouse-heading" title="På huset i natt" count={day.inHouse.length} note="Etter rom." />
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th scope="col" className="py-1 pr-3 font-medium">Rom</th>
                    <th scope="col" className="py-1 pr-3 font-medium">Gjest</th>
                    <th scope="col" className="hidden py-1 pr-3 font-medium sm:table-cell">Til</th>
                    <th scope="col" className="py-1 font-medium">Hensyn</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {day.inHouse.map((stay) => (
                    <tr key={stay.id}>
                      <td className="py-2 pr-3 font-mono text-sm tabular-nums">{stay.room ? stay.room.replace(/^room-/, "") : "–"}</td>
                      <td className="py-2 pr-3 font-semibold">
                        {stay.name}
                        <span className="font-normal text-muted"> · {stay.guests}</span>
                      </td>
                      <td className="hidden py-2 pr-3 text-muted tabular-nums sm:table-cell">{formatDate(stay.departure)}</td>
                      <td className="py-2">
                        {stay.notes.length === 0 ? <span className="text-muted">–</span> : stay.notes.map((note) => <Badge key={note} tone="warning" className="mr-1">{note}</Badge>)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <SourceNote className="mt-3" sources="test" />
            </Card>
          </section>

          <section aria-labelledby="booked-heading" data-enter>
            <Card className="sm:p-6">
              <PanelHead id="booked-heading" title="Kommende bookinger" count={day.booked.length} />
              <ol className="mt-2 divide-y divide-line">
                {day.booked.map((stay) => (
                  <li key={stay.id} className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
                    <span className="font-semibold">{stay.name}</span>
                    <span className="whitespace-nowrap text-muted tabular-nums">
                      {formatDate(stay.arrival)} · {nights(stay)} {nights(stay) === 1 ? "natt" : "netter"}
                    </span>
                  </li>
                ))}
              </ol>
              <SourceNote className="mt-3" sources="test" />
            </Card>
          </section>
        </div>

        {/* On a phone the call-backs and special needs come before the long lists (order-first). */}
        <div className="order-first flex min-w-0 flex-col gap-6 lg:order-none lg:gap-8">
          <section aria-labelledby="reception-heading" data-enter>
            <Card className="sm:p-6">
              <PanelHead id="reception-heading" title="Fra resepsjonisten" note="Bookinger og beskjeder tatt på telefonen." />
              {calls.kind === "loading" && (
                <div className="mt-4 flex flex-col gap-3" aria-busy="true">
                  <Skeleton className="h-5 w-2/5" />
                  <Skeleton className="h-4 w-4/5" />
                </div>
              )}
              {calls.kind === "not-set-up" && (
                <EmptyState
                  as="h3"
                  className="mt-4"
                  title="Resepsjonisten er ikke koblet til ennå"
                  body="Når telefonagenten er satt opp, vises bookinger og hvem som må ringes tilbake her."
                  action={
                    <Link href="/resepsjon" className={buttonClasses("secondary", "sm")}>
                      Åpne Resepsjon
                    </Link>
                  }
                />
              )}
              {calls.kind === "error" && (
                <ErrorState
                  as="h3"
                  className="mt-4"
                  title="Fikk ikke hentet samtalene"
                  body="Sjekk nettet og prøv igjen."
                  action={
                    <Button variant="secondary" size="sm" onClick={retry}>
                      Prøv igjen
                    </Button>
                  }
                />
              )}
              {list && list.length === 0 && <p className="mt-3 text-base text-muted">Ingen samtaler ennå i dag.</p>}
              {list && list.length > 0 && (
                <ol className="mt-2 divide-y divide-line">
                  {list.slice(0, 8).map((call) => (
                    <li key={call.id} className="flex flex-col gap-1 py-3">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="text-sm whitespace-nowrap text-muted tabular-nums">{formatDayClock(call.startedAt)}</span>
                        <span className="font-semibold">{call.callerName ?? call.title ?? "Samtale"}</span>
                        {call.arrival && (
                          <Badge tone="success">
                            {formatDate(call.arrival)}
                            {call.departure ? `–${formatDate(call.departure)}` : ""}
                          </Badge>
                        )}
                        {call.needsCallback && (
                          // The number and the "Ringt tilbake" mark live on Resepsjon.
                          <Link href="/resepsjon" className={buttonClasses("secondary", "sm")}>
                            Ring tilbake
                          </Link>
                        )}
                      </div>
                      {call.summary && <p className="line-clamp-2 text-sm text-muted">{call.summary}</p>}
                    </li>
                  ))}
                </ol>
              )}
              <SourceNote className="mt-3" sources="reception" />
            </Card>
          </section>

          <section aria-labelledby="special-heading" data-enter>
            <Card className="sm:p-6">
              <PanelHead id="special-heading" title="Spesielle hensyn" count={day.withNotes.length + special.length} />
              {day.withNotes.length + special.length === 0 ? (
                <p className="mt-3 text-base text-muted">Ingen kjæledyr, allergier eller andre hensyn i dag.</p>
              ) : (
                <ul className="mt-2 divide-y divide-line">
                  {day.withNotes.map((stay) => (
                    <li key={stay.id} className="flex flex-col gap-1 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {stay.notes.map((note) => (
                          <Badge key={note} tone="warning">
                            {note}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-sm">
                        <span className="font-semibold">{stay.name}</span>
                        <span className="text-muted"> · {roomWord(stay.room)}</span>
                      </p>
                    </li>
                  ))}
                  {special.map(({ call, words }) => (
                    <li key={call.id} className="flex flex-col gap-1 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {words.map((word) => (
                          <Badge key={word} tone="warning">
                            {word}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-sm">
                        <span className="font-semibold">{call.callerName ?? call.title ?? "Samtale"}</span>
                        {call.arrival && <span className="text-muted"> · ankommer {formatDate(call.arrival)}</span>}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <SourceNote className="mt-3" sources={["test", "reception"]} />
            </Card>
          </section>

        </div>
      </div>
    </ModulePage>
  );
}

function StayList({
  stays,
  empty,
  roomStatus,
  readyRooms,
  showStatus = false,
  statusUnknown = false,
}: {
  stays: Stay[];
  empty: string;
  roomStatus: Map<string, keyof typeof STATUS_LOOK>;
  /** Rooms ready to sell tonight, offered beside a guest with no room (null until the night is in). */
  readyRooms: number | null;
  showStatus?: boolean;
  /** The night failed or is empty: say the status is unknown rather than leave a blank. */
  statusUnknown?: boolean;
}) {
  if (stays.length === 0) return <p className="mt-3 text-base text-muted">{empty}</p>;
  return (
    <ol className="mt-2 divide-y divide-line">
      {stays.map((stay) => {
        const status = stay.room ? roomStatus.get(stay.room) : undefined;
        const look = status ? STATUS_LOOK[status] : null;
        return (
          <li key={stay.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="font-semibold">{stay.name}</span>
                <span className="text-sm text-muted">
                  {stay.guests} {stay.guests === 1 ? "gjest" : "gjester"} · {nights(stay)} {nights(stay) === 1 ? "natt" : "netter"}
                </span>
                {stay.source === "resepsjonist" && <Badge tone="neutral">Tatt av resepsjonen</Badge>}
              </div>
              {stay.notes.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {stay.notes.map((note) => (
                    <Badge key={note} tone="warning">
                      {note}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-col items-end gap-0.5 text-right">
              <span className={stay.room ? "font-mono text-sm tabular-nums" : "text-sm font-semibold text-warning"}>{roomWord(stay.room)}</span>
              {!stay.room && (
                <Link href="/rom" className="py-1 text-sm font-semibold text-accent-text hover:underline">
                  {readyRooms === null ? "Se rommene" : readyRooms === 1 ? "1 klart rom" : `${readyRooms} klare rom`}
                </Link>
              )}
              {showStatus && stay.room && look && <span className={`text-sm ${look.word_class}`}>{look.word}</span>}
              {showStatus && stay.room && !look && statusUnknown && <span className="text-sm text-muted">Status ukjent</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function capitalise(text: string): string {
  return text.charAt(0).toLocaleUpperCase("nb-NO") + text.slice(1);
}
