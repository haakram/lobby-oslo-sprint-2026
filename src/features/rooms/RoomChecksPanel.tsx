"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { canAccess, useSession } from "@/features/auth";
import { hhmm } from "@/features/dashboard/format";
import type { RoomView } from "@/features/dashboard/selectors";
import { PanelHead } from "@/features/modules/ModulePage";
import { SourceNote } from "@/features/modules/SourceNote";
import type { RunLine } from "@/features/nightshift/runlog";
import { osloToday } from "@/features/reception/dates";
import { formatClock } from "@/features/reception/format";
import { Badge, Button, Card, RegenIcon, Skeleton } from "@/ui";
import { actionStamp, stampNow, useNowMs } from "@/ui/stamp";
import { BookingEvidence, TestBookingWord } from "./BookingEvidence";
import { bookedTonight } from "./pms";
import { moneyHeadline, moneyMethod, releasedLine, shortDate } from "./money";
import { type Contradiction, type Crowded, type GuestFound, type Held, markRoom, type RoomCheckMark, type Sellable } from "./reconcile";
import { SellSteps } from "./SellSteps";
import { useRoomCheck } from "./useRoomCheck";

const number = (room: string) => room.replace(/^room-/, "");

/** "01:29, 04:35 og 05:16". */
function clocks(times: readonly (string | null)[]): string {
  const list = times.flatMap((time) => (time ? [hhmm(time)] : []));
  return list.length <= 1 ? list.join("") : `${list.slice(0, -1).join(", ")} og ${list.at(-1)}`;
}

/**
 * Rom og renhold's panel for the robot's room checks against the booking system: the rooms the system
 * holds tonight that can be sold after reception confirms (two steps, never one tap), the rooms Fettero
 * held back because the robot delivered into them tonight (a double allocation caught), the rooms where
 * the robot met a guest the system doesn't have, and, from the robot's log alone, rooms that got bags
 * for more than one arrival. The panel says once that the bookings are test data, and where a pilot gets
 * the evidence without the robot opening a booked room; each row resting on them carries "testbooking".
 * Marked per day in this browser. The pilot reads the PMS and never writes it: *Send til resepsjonen*
 * hands the check-out to reception. TODO(phase-3): the PMS connector reads the check-out back; the task
 * goes to the shared request desk.
 */
export function RoomChecksPanel({ lines, today = osloToday(), rooms = null }: { lines: readonly RunLine[] | null; today?: string; rooms?: readonly RoomView[] | null }) {
  const { user, effectiveRole } = useSession();
  const requestsLink = effectiveRole === null || canAccess(effectiveRole, "/foresporsler");
  const guestsLink = effectiveRole === null || canAccess(effectiveRole, "/gjester");
  const { reconciliation: result, money, marks } = useRoomCheck(lines, rooms, today);
  const list = useRef<HTMLDivElement>(null);
  const refocus = useRef<string | null>(null);

  // The guest row's button swaps for its result (or back): keep the keyboard on that row.
  useEffect(() => {
    if (!refocus.current) return;
    list.current?.querySelector<HTMLElement>(`[data-room-action="${refocus.current}"]`)?.focus();
    refocus.current = null;
  });

  const task = (room: string, on: boolean) => {
    refocus.current = room;
    markRoom(today, room, on ? { action: "task", at: formatClock(new Date().toISOString()), by: user?.name ?? null, stamp: stampNow() } : null);
  };

  const sellable = result?.sellable.length ?? 0;
  const heldRooms = new Set(result?.held.map((row) => row.room));
  // A room check the robot's own log contradicts, on a room the system has free: held back too (209's rule without a booking).
  const ownOnly = result?.contradicted.filter((row) => !heldRooms.has(row.room)) ?? [];
  const held = (result?.held.length ?? 0) + ownOnly.length;
  const tonight = { booked: bookedTonight(today), rooms: rooms?.length || 36 };
  const crowded = result?.crowded.length ?? 0;
  const headline = money ? moneyHeadline(money) : null;


  return (
    <section aria-labelledby="room-checks-heading" data-enter>
      <Card className="sm:p-6">
        <PanelHead
          id="room-checks-heading"
          title="Robotens romsjekk mot bookingsystemet"
          note={result ? `${result.agree} av ${result.checked} sjekkede rom stemmer med systemet.` : undefined}
        />
        {result && (sellable > 0 || held > 0 || result.guestFound.length > 0) && <BookingEvidence className="mt-1" />}

        {!result || !money ? (
          <div role="status" aria-busy="true" className="mt-4 flex flex-col gap-3">
            <span className="sr-only">Henter robotens romsjekk</span>
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : result.checked === 0 ? (
          <div className="mt-3 flex max-w-xl flex-col gap-1">
            <h3 className="text-base font-semibold">Roboten har ikke sjekket noen rom ennå</h3>
            <p className="text-base text-muted">Når roboten sjekker rom i natt, sammenligner Fettero det den finner med bookingsystemet her.</p>
          </div>
        ) : sellable === 0 && held === 0 && crowded === 0 && result.guestFound.length === 0 ? (
          <p className="mt-3 flex items-start gap-2 text-base">
            <RegenIcon name="circle-check" size={20} className="mt-0.5 shrink-0 text-success" />
            <span>
              Alt stemmer. Roboten sjekket {result.checked} rom i natt, og bookingsystemet har de samme rommene som opptatt og ledige.
            </span>
          </p>
        ) : (
          <div ref={list} className="mt-4 flex flex-col gap-5">
            {headline && (
              <div className="flex items-start gap-2">
                {/* Never green here: a room sent to reception waits for the booking system (jury round 4, the product juror). */}
                <RegenIcon name="key" size={22} className="mt-0.5 shrink-0 text-muted" />
                <div className="flex flex-col gap-0.5">
                  <p aria-live="polite" className="text-lg font-semibold tracking-[-0.01em]">
                    {headline}
                  </p>
                  {(sellable > 0 || money.released.length > 0) && (
                    <p className="text-sm text-muted">
                      {releasedLine(money)}. {moneyMethod(money, tonight)}
                    </p>
                  )}
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-10 xl:grid-cols-3">
              {sellable > 0 && (
                <div className="min-w-0">
                  <h3 className="flex items-baseline gap-2 text-sm font-semibold">
                    Kan selges etter bekreftelse <span className="font-normal text-muted tabular-nums">{sellable}</span>
                  </h3>
                  <ul className="mt-1 divide-y divide-line">
                    {result.sellable.map((row) => (
                      <SellableRow key={row.room} row={row} mark={marks[row.room]} today={today} />
                    ))}
                  </ul>
                </div>
              )}
              {held > 0 && (
                <div className="min-w-0">
                  <h3 className="flex items-baseline gap-2 text-sm font-semibold">
                    Holdt tilbake <span className="font-normal text-muted tabular-nums">{held}</span>
                  </h3>
                  <ul className="mt-1 divide-y divide-line">
                    {result.held.map((row) => (
                      <HeldRow key={row.room} row={row} today={today} guestsLink={guestsLink} />
                    ))}
                    {ownOnly.map((row) => (
                      <OwnContradictionRow key={row.room} row={row} />
                    ))}
                  </ul>
                </div>
              )}
              {result.guestFound.length > 0 && (
                <div className="min-w-0">
                  <h3 className="flex items-baseline gap-2 text-sm font-semibold">
                    Gjest uten booking <span className="font-normal text-muted tabular-nums">{result.guestFound.length}</span>
                  </h3>
                  <ul className="mt-1 divide-y divide-line">
                    {result.guestFound.map((row) => (
                      <GuestRow key={row.room} row={row} mark={marks[row.room]} onTask={task} requestsLink={requestsLink} />
                    ))}
                  </ul>
                </div>
              )}
              {crowded > 0 && (
                <div className="min-w-0">
                  <h3 className="flex items-baseline gap-2 text-sm font-semibold">
                    Flere ankomster i samme rom <span className="font-normal text-muted tabular-nums">{crowded}</span>
                  </h3>
                  <ul className="mt-1 divide-y divide-line">
                    {result.crowded.map((row) => (
                      <CrowdedRow key={row.room} row={row} guestsLink={guestsLink} />
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {result && result.dueOut.length > 0 && (
          <p className="mt-4 text-sm text-muted">
            Reiser i dag: {result.dueOut.map((row) => `rom ${number(row.room)} (tomt ${hhmm(row.at)})`).join(", ")}. Rommet er allerede ledig for salg i natt i
            systemet, så det er ingen ekstra romnatt: det kan vaskes først og være klart for tidlig innsjekk.
          </p>
        )}

        {result && result.tooEarly.length > 0 && (
          <p className="mt-4 text-sm text-muted">
            Teller ikke: {result.tooEarly.map((row) => `rom ${number(row.room)} (sjekket ${hhmm(row.at)})`).join(", ")}. Et rom må være tomt etter kl.
            01:00 før Fettero foreslår å selge det, så en gjest som er ute på kvelden ikke mister rommet.
          </p>
        )}
        <SourceNote className="mt-3" sources={["run-log", "test", "local"]} />
      </Card>
    </section>
  );
}

/** What the booking system says about a booked room: who, and until when ("skulle reist 7.11. Utsjekk ikke registrert"). */
export function bookingLine(row: Pick<Sellable, "guest" | "departure">, today: string): string {
  const who = row.guest ? ` (${row.guest})` : "";
  if (!row.departure) return `Systemet: opptatt${who}`;
  if (row.departure < today) return `Systemet: opptatt i natt${who}, skulle reist ${shortDate(row.departure)}. Utsjekk ikke registrert`;
  if (row.departure === today) return `Systemet: opptatt${who}, reiser i dag ${shortDate(row.departure)}`;
  return `Systemet: opptatt${who} til ${shortDate(row.departure)}`;
}

/** "Bagasje for 3 ankomster i natt (00:31, 01:58 og 04:43)." */
export function crowdedLine(row: Crowded): string {
  const at = clocks(row.at);
  return `Bagasje for ${row.arrivals} ankomster i natt${at ? ` (${at})` : ""}.`;
}

/** "Meldt tomt og ryddig kl. 03:47, men roboten satte inn bagasje her kl. 01:29.": the robot's own log against its check (the Wybe engineer). */
export function contradictionLine(row: Contradiction): string {
  return `Meldt tomt og ryddig kl. ${hhmm(row.checkedAt)}, men roboten satte inn ${row.arrival ? "bagasje" : "noe"} her kl. ${hhmm(row.placedAt)}.`;
}

/** Rom's held row: "Bagasje for 3 ankomster levert, sist 05:16, men bookingen har gjest til 9.11. Dobbelt tildelt?" */
export function heldRowLine(row: Held): string {
  const until = row.departure ? ` til ${shortDate(row.departure)}` : "";
  if (row.arrival && row.arrivals > 1) return `Bagasje for ${row.arrivals} ankomster levert, sist ${hhmm(row.deliveredAt)}, men bookingen har gjest${until}. Dobbelt tildelt?`;
  return heldLine(row);
}

/** "Bagasje levert 05:16 for dagens ankomst, men bookingen har gjest til 9.11. Dobbelt tildelt?" (3D-kart's room card reads it too). */
export function heldLine(row: Held): string {
  const until = row.departure ? ` til ${shortDate(row.departure)}` : "";
  if (row.arrival) return `Bagasje levert ${hhmm(row.deliveredAt)} for dagens ankomst, men bookingen har gjest${until}. Dobbelt tildelt?`;
  return `Roboten leverte noe inn på rommet kl. ${hhmm(row.deliveredAt)}, etter sjekken: rommet er i bruk.`;
}

function RowFrame({ room, children, action }: { room: string; children: React.ReactNode; action: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 py-3">
      <span className="mt-0.5 self-start rounded-sm bg-sunken px-2 py-1 font-mono text-sm font-medium tabular-nums">{number(room)}</span>
      <div className="min-w-0 text-sm">{children}</div>
      {/* Under the text, not beside it: the result (badge, time, Angre) needs the width. */}
      <div className="col-start-2 flex flex-wrap items-center gap-2">{action}</div>
    </li>
  );
}

function Done({ room, label, mark, onUndo, extra }: { room: string; label: string; mark: RoomCheckMark; onUndo: () => void; extra?: React.ReactNode }) {
  const now = useNowMs();
  return (
    <>
      <span aria-live="polite" className="flex flex-wrap items-center gap-2">
        <Badge>{label}</Badge>
        <span className="text-sm whitespace-nowrap text-muted">{actionStamp(mark.by, mark.stamp, now)}</span>
      </span>
      {extra}
      <Button variant="ghost" size="sm" data-room-action={room} onClick={onUndo} aria-label={`Angre: rom ${number(room)}`}>
        Angre
      </Button>
    </>
  );
}

function SellableRow({ row, mark, today }: { row: Sellable; mark: RoomCheckMark | undefined; today: string }) {
  return (
    <RowFrame room={row.room} action={<SellSteps room={row.room} mark={mark} today={today} />}>
      <p className="font-semibold">{bookingLine(row, today)}.</p>
      <p className="text-muted">
        Roboten fant rommet tomt og ryddig <span className="whitespace-nowrap">kl. {hhmm(row.at)}</span>.
      </p>
      <TestBookingWord />
    </RowFrame>
  );
}

/** A room the system has as free whose room check the robot's own log contradicts: never offered, from the log alone. */
function OwnContradictionRow({ row }: { row: Contradiction }) {
  return (
    <RowFrame
      room={row.room}
      action={
        <Badge tone="success">
          <RegenIcon name="shield-check" size={14} className="mr-1 inline-block align-[-0.15em]" />
          Fettero holdt rommet tilbake
        </Badge>
      }
    >
      <p className="font-semibold">{contradictionLine(row)}</p>
      <p className="text-muted">Kameraet og robotens egen logg er uenige: se på rommet før det selges.</p>
    </RowFrame>
  );
}

/** From the robot's log alone: more arrivals' bags in one room than it holds (jury round 3, the Wybe juror). */
function CrowdedRow({ row, guestsLink }: { row: Crowded; guestsLink: boolean }) {
  return (
    <RowFrame
      room={row.room}
      action={
        guestsLink ? (
          <Link href="/gjester" className="flex min-h-11 items-center text-sm font-semibold text-accent-text hover:underline">
            Åpne Gjester
          </Link>
        ) : null
      }
    >
      <p className="font-semibold">{crowdedLine(row)}</p>
      <p className="text-muted">Ett rom tar én ankomst: sjekk med resepsjonen hvem som skal bo der.</p>
    </RowFrame>
  );
}

/** The robot's catch: it found the room empty, but it had carried bags in for an arrival. Never for sale. */
function HeldRow({ row, today, guestsLink }: { row: Held; today: string; guestsLink: boolean }) {
  const earlier = row.deliveries.slice(0, -1).map((delivery) => delivery.at);
  return (
    <RowFrame
      room={row.room}
      action={
        <>
          <Badge tone="success">
            <RegenIcon name="shield-check" size={14} className="mr-1 inline-block align-[-0.15em]" />
            Fettero holdt rommet tilbake
          </Badge>
          {guestsLink && (
            <Link href="/gjester" className="flex min-h-11 items-center text-sm font-semibold text-accent-text hover:underline">
              Åpne Gjester
            </Link>
          )}
        </>
      }
    >
      {/* The robot's own contradiction leads, no booking needed; the double allocation is its consequence. */}
      {row.contradiction && <p className="font-semibold">{contradictionLine(row.contradiction)}</p>}
      <p className={row.contradiction ? "text-muted" : "font-semibold"}>{heldRowLine(row)}</p>
      <p className="text-muted">
        {bookingLine(row, today)}. Roboten fant rommet tomt og ryddig <span className="whitespace-nowrap">kl. {hhmm(row.at)}</span>
        {earlier.length > 0 ? `, og bar inn bagasje også kl. ${clocks(earlier)}` : ""}. Flytt én av dem før innsjekk kl. 15:00.
      </p>
      <TestBookingWord />
    </RowFrame>
  );
}

function GuestRow({
  row,
  mark,
  onTask,
  requestsLink,
}: {
  row: GuestFound;
  mark: RoomCheckMark | undefined;
  onTask: (room: string, on: boolean) => void;
  requestsLink: boolean;
}) {
  const seen =
    row.source === "door_sign"
      ? "Roboten så et ikke forstyrr-skilt på døren"
      : row.source === "knock"
        ? `Roboten banket på, og ${row.who ?? "en gjest"} åpnet`
        : "Roboten så en gjest på rommet";
  return (
    <RowFrame
      room={row.room}
      action={
        mark?.action === "task" ? (
          <Done
            room={row.room}
            label="Oppgave til resepsjonen"
            mark={mark}
            onUndo={() => onTask(row.room, false)}
            extra={
              requestsLink ? (
                <Link href="/foresporsler" className="flex min-h-11 items-center text-sm font-semibold text-accent-text hover:underline">
                  Åpne Forespørsler
                </Link>
              ) : null
            }
          />
        ) : (
          <Button variant="secondary" size="sm" data-room-action={row.room} onClick={() => onTask(row.room, true)} aria-label={`Lag oppgave for resepsjonen: rom ${number(row.room)}`}>
            Lag oppgave for resepsjonen
          </Button>
        )
      }
    >
      <p>
        <span className="font-semibold">Systemet: ledig</span>
        <span className="text-muted"> (ingen booking)</span>
      </p>
      <p className="text-muted">
        {seen} <span className="whitespace-nowrap">kl. {hhmm(row.at)}</span>.
      </p>
      <TestBookingWord />
    </RowFrame>
  );
}
