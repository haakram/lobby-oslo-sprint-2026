"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { canAccess, useSession } from "@/features/auth";
import { hhmm } from "@/features/dashboard/format";
import { PanelHead } from "@/features/modules/ModulePage";
import { SourceNote } from "@/features/modules/SourceNote";
import type { RunLine } from "@/features/nightshift/runlog";
import { osloToday } from "@/features/reception/dates";
import { formatClock } from "@/features/reception/format";
import { Badge, Button, Card, RegenIcon, Skeleton } from "@/ui";
import { pmsLastNight } from "./pms";
import { type GuestFound, markRoom, reconcileRooms, robotRoomChecks, ROOM_CHECK_MARKS, type RoomCheckMark, type Sellable } from "./reconcile";

const number = (room: string) => room.replace(/^room-/, "");

/**
 * Rom og renhold's panel for the robot's room checks against the booking system: the rooms the system
 * thought were occupied that can be sold today (good news first), and the rooms where the robot met a
 * guest the system doesn't have. One action each, marked per day in this browser.
 * TODO(phase-3): *Merk som ledig for salg* writes the room status to the PMS; the task goes to the
 * shared request desk.
 */
export function RoomChecksPanel({ lines, today = osloToday() }: { lines: readonly RunLine[] | null; today?: string }) {
  const { user, effectiveRole } = useSession();
  const requestsLink = effectiveRole === null || canAccess(effectiveRole, "/foresporsler");
  const marks = ROOM_CHECK_MARKS.use()[today] ?? {};
  const result = useMemo(() => (lines ? reconcileRooms(robotRoomChecks(lines), pmsLastNight()) : null), [lines]);
  const list = useRef<HTMLDivElement>(null);
  const refocus = useRef<string | null>(null);

  // The row's button swaps for its result (or back): keep the keyboard on that row.
  useEffect(() => {
    if (!refocus.current) return;
    list.current?.querySelector<HTMLElement>(`[data-room-action="${refocus.current}"]`)?.focus();
    refocus.current = null;
  });

  const act = (room: string, action: RoomCheckMark["action"] | null) => {
    refocus.current = room;
    markRoom(today, room, action ? { action, at: formatClock(new Date().toISOString()), by: user?.name ?? null } : null);
  };

  const sellable = result?.sellable.length ?? 0;
  const released = result?.sellable.filter((row) => marks[row.room]?.action === "released").length ?? 0;
  const headline =
    sellable === 0
      ? null
      : released === sellable
        ? `${sellable === 1 ? "Rommet" : `Alle ${sellable} rom`} er merket ledig for salg i dag.`
        : `${sellable} rom kan selges i dag som systemet trodde var opptatt.`;

  return (
    <section aria-labelledby="room-checks-heading" data-enter>
      <Card className="sm:p-6">
        <PanelHead
          id="room-checks-heading"
          title="Robotens romsjekk mot bookingsystemet"
          note={result ? `${result.agree} av ${result.checked} sjekkede rom stemmer med systemet.` : undefined}
        />

        {!result ? (
          <div role="status" aria-busy="true" className="mt-4 flex flex-col gap-3">
            <span className="sr-only">Henter robotens romsjekk</span>
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : result.checked === 0 ? (
          <div className="mt-3 flex max-w-xl flex-col gap-1">
            <h3 className="text-base font-semibold">Roboten har ikke sjekket noen rom ennå</h3>
            <p className="text-base text-muted">Når roboten sjekker rom i natt, sammenligner Lobby det den finner med bookingsystemet her.</p>
          </div>
        ) : sellable === 0 && result.guestFound.length === 0 ? (
          <p className="mt-3 flex items-start gap-2 text-base">
            <RegenIcon name="circle-check" size={20} className="mt-0.5 shrink-0 text-success" />
            <span>
              Alt stemmer. Roboten sjekket {result.checked} rom i natt, og bookingsystemet har de samme rommene som opptatt og ledige.
            </span>
          </p>
        ) : (
          <div ref={list} className="mt-4 flex flex-col gap-5">
            {headline && (
              <p className="flex items-start gap-2 text-lg font-semibold tracking-[-0.01em]">
                <RegenIcon name="circle-check" size={22} className="mt-0.5 shrink-0 text-success" />
                <span>{headline}</span>
              </p>
            )}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-10">
              {sellable > 0 && (
                <div className="min-w-0">
                  <h3 className="flex items-baseline gap-2 text-sm font-semibold">
                    Kan selges i dag <span className="font-normal text-muted tabular-nums">{sellable}</span>
                  </h3>
                  <ul className="mt-1 divide-y divide-line">
                    {result.sellable.map((row) => (
                      <SellableRow key={row.room} row={row} mark={marks[row.room]} onAct={act} />
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
                      <GuestRow key={row.room} row={row} mark={marks[row.room]} onAct={act} requestsLink={requestsLink} />
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {result && result.tooEarly.length > 0 && (
          <p className="mt-4 text-sm text-muted">
            Teller ikke: {result.tooEarly.map((row) => `rom ${number(row.room)} (sjekket ${hhmm(row.at)})`).join(", ")}. Et rom må være tomt etter kl.
            01:00 før Lobby foreslår å selge det, så en gjest som er ute på kvelden ikke mister rommet.
          </p>
        )}
        <SourceNote className="mt-3" sources={["run-log", "test", "local"]} />
      </Card>
    </section>
  );
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

function Done({ room, label, tone, mark, onUndo, extra }: { room: string; label: string; tone: "success" | "neutral"; mark: RoomCheckMark; onUndo: () => void; extra?: React.ReactNode }) {
  return (
    <>
      <span aria-live="polite" className="flex flex-wrap items-center gap-2">
        <Badge tone={tone}>{label}</Badge>
        <span className="text-sm whitespace-nowrap text-muted">
          {mark.at}
          {mark.by ? ` · ${mark.by}` : ""}
        </span>
      </span>
      {extra}
      <Button variant="ghost" size="sm" data-room-action={room} onClick={onUndo} aria-label={`Angre: rom ${number(room)}`}>
        Angre
      </Button>
    </>
  );
}

function SellableRow({ row, mark, onAct }: { row: Sellable; mark: RoomCheckMark | undefined; onAct: (room: string, action: RoomCheckMark["action"] | null) => void }) {
  return (
    <RowFrame
      room={row.room}
      action={
        mark?.action === "released" ? (
          <Done room={row.room} label="Ledig for salg" tone="success" mark={mark} onUndo={() => onAct(row.room, null)} />
        ) : (
          <Button variant="secondary" size="sm" data-room-action={row.room} onClick={() => onAct(row.room, "released")} aria-label={`Merk rom ${number(row.room)} som ledig for salg`}>
            Merk som ledig for salg
          </Button>
        )
      }
    >
      <p>
        <span className="font-semibold">Systemet: opptatt</span>
        {row.guest ? <span className="text-muted"> ({row.guest})</span> : null}
      </p>
      <p className="text-muted">
        Roboten fant rommet tomt og ryddig <span className="whitespace-nowrap">kl. {hhmm(row.at)}</span>.
      </p>
    </RowFrame>
  );
}

function GuestRow({
  row,
  mark,
  onAct,
  requestsLink,
}: {
  row: GuestFound;
  mark: RoomCheckMark | undefined;
  onAct: (room: string, action: RoomCheckMark["action"] | null) => void;
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
            tone="neutral"
            mark={mark}
            onUndo={() => onAct(row.room, null)}
            extra={
              requestsLink ? (
                <Link href="/foresporsler" className="flex min-h-11 items-center text-sm font-semibold text-accent-text hover:underline">
                  Åpne Forespørsler
                </Link>
              ) : null
            }
          />
        ) : (
          <Button variant="secondary" size="sm" data-room-action={row.room} onClick={() => onAct(row.room, "task")} aria-label={`Lag oppgave for resepsjonen: rom ${number(row.room)}`}>
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
    </RowFrame>
  );
}
