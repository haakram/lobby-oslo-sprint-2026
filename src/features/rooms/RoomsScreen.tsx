"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { canAccess, useSession } from "@/features/auth";
import { Cleaning } from "@/features/dashboard/Cleaning";
import { placeLabel } from "@/features/dashboard/labels";
import { RoomBoard } from "@/features/dashboard/RoomBoard";
import { RoomSheet } from "@/features/dashboard/RoomSheet";
import { RunBadge } from "@/features/dashboard/TopBar";
import { cleaningHref, countRooms, DAY_ROUND, selectRoomNight, withClosed, withHeld } from "@/features/dashboard/selectors";
import { useNight } from "@/features/dashboard/useNight";
import { useOrderStatuses } from "@/features/dashboard/useOrderStatuses";
import { outOfOrderRooms, selectMaintenance } from "@/features/maintenance/select";
import { FigureRow, ModulePage, PanelHead } from "@/features/modules/ModulePage";
import { SourceNote } from "@/features/modules/SourceNote";
import { byRole, cleanersToday } from "@/features/staff/testData";
import { Badge, Button, buttonClasses, Card, EmptyState, ErrorState, Monogram, Skeleton, Stat } from "@/ui";
import { assignRooms } from "./housekeeping";
import { RoomChecksPanel } from "./RoomChecksPanel";
import { useRoomCheck } from "./useRoomCheck";

/**
 * Rom og renhold: the key rack (every room's status as the robot last saw it), today's cleaning
 * round split between the cleaners, the rooms out of order, and the one action: the cleaning route,
 * in the header so a phone has it above the rack. `initialRoom` (`?rom=`) opens that room's night.
 */
export function RoomsScreen({ viewerUrl, initialRoom = null }: { viewerUrl?: string; initialRoom?: string | null }) {
  const { resolved, statusOf } = useOrderStatuses();
  const { run, night, rooms, orders, robot } = useNight(viewerUrl, resolved);
  // Vedlikehold is the robot manager's: a receptionist would land on "Ingen tilgang", so its link is not shown.
  const { effectiveRole } = useSession();
  const maintenanceLink = effectiveRole === null || canAccess(effectiveRole, "/vedlikehold");
  const ready = run.status === "ready";
  const counts = rooms ? countRooms(rooms) : null;

  const technician = byRole("Vedlikehold").find((member) => member.shift === "dag") ?? null;
  const maintenance = useMemo(() => selectMaintenance({ orders, statusOf, assignee: technician?.name ?? null }), [orders, statusOf, technician]);
  const outOfOrder = useMemo(() => outOfOrderRooms(maintenance), [maintenance]);
  const rackRooms = useMemo(() => (rooms ? withClosed(rooms, outOfOrder) : null), [rooms, outOfOrder]);
  const assignments = useMemo(() => (rooms ? assignRooms(rooms, cleanersToday()) : null), [rooms]);
  // "Klare til salg" is the one figure Oversikt shows too: ready, free in the booking system or released today.
  const { money } = useRoomCheck(ready ? run.lines : null, rackRooms);
  // The rack says what the room check says: a room held back is taken, one still to confirm is not a green Klar,
  // and one sent to reception reads "Venter på PMS-en" until the booking system confirms it (as Oversikt and the 3D map).
  const boardRooms = useMemo(
    () =>
      rackRooms && money
        ? withHeld(
            rackRooms,
            money.held.map((row) => row.room),
            money.toSell.map((row) => row.room),
            money.released.map((row) => row.room),
          )
        : rackRooms,
    [rackRooms, money],
  );

  const [sheet, setSheet] = useState<{ room: string; open: boolean } | null>(initialRoom ? { room: initialRoom, open: true } : null);
  const openRoom = useCallback((room: string | null) => {
    if (room) setSheet({ room, open: true });
  }, []);
  const closeRoom = useCallback(() => {
    setSheet((current) => (current ? { ...current, open: false } : null));
    // Opened from a link (?rom=): closing leaves the plain rack, so a reload doesn't open it again.
    if (new URLSearchParams(window.location.search).has("rom")) window.history.replaceState(null, "", window.location.pathname);
  }, []);
  const dirty = useMemo(() => rooms?.filter((room) => room.status === "ma_vaskes") ?? [], [rooms]);
  const unchecked = rooms?.filter((room) => room.status === "ukjent") ?? [];
  const dirtyIds = useMemo(() => dirty.map((room) => room.id), [dirty]);
  const sheetRoom = sheet && rooms ? (rooms.find((room) => room.id === sheet.room) ?? null) : null;
  const sheetEntries = useMemo(() => (night && sheet ? selectRoomNight(night, sheet.room) : []), [night, sheet]);

  if (run.status === "error" || run.status === "empty") {
    return (
      <ModulePage module="rom">
        <Card className="sm:p-6">
          {run.status === "error" ? (
            <ErrorState
              title="Fikk ikke lastet natten"
              body="Natteloggen svarte ikke, så romstatusen vises ikke. Sjekk nettet og prøv igjen."
              action={
                <Button variant="secondary" onClick={run.retry}>
                  Prøv igjen
                </Button>
              }
            />
          ) : (
            <EmptyState title="Ingen natt å vise ennå" body="Når roboten har sjekket rommene, står statusen per rom her." />
          )}
        </Card>
      </ModulePage>
    );
  }

  return (
    <ModulePage
      module="rom"
      ready={ready}
      lede="Slik roboten sist så rommene, hva som kan selges i dag, og hvem som vasker."
      meta={run.source === "live" ? <RunBadge run={run} /> : undefined}
      actions={
        dirty.length > 0 ? (
          <Link href={DAY_ROUND} className={buttonClasses("primary")}>
            Lag renholdsrute
          </Link>
        ) : unchecked.length > 0 ? (
          <Link href={cleaningHref(unchecked.map((room) => room.id))} className={buttonClasses("secondary")}>
            Lag sjekkrunde for {unchecked.length} rom
          </Link>
        ) : null
      }
    >
      <FigureRow label="Rommene i tall">
        {/* Ready rooms in green; the rest are plain counts. The rooms to clean are the header's action. */}
        <Figure
          label="Klare til salg"
          value={money?.readyToSell ?? undefined}
          unit={rooms ? `av ${rooms.length}` : undefined}
          tone={money?.readyToSell ? "success" : "default"}
        />
        <Figure label="Må vaskes" value={counts?.ma_vaskes} />
        <Figure label="Ikke sjekket" value={counts?.ukjent} />
        <Figure label="Ute av drift" value={rooms ? outOfOrder.length : undefined} />
      </FigureRow>

      {/* Good news first: rooms the booking system thought were taken that can be sold today. */}
      <RoomChecksPanel lines={ready ? run.lines : null} rooms={rackRooms} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)] lg:items-start lg:gap-8">
        <RoomBoard rooms={boardRooms} clock={robot?.clock ?? null} onOpen={openRoom} />

        <div className="flex min-w-0 flex-col gap-6 lg:gap-8">
          {/* The route itself is the header's action; the panel says what it will cover. */}
          <Cleaning rooms={rooms} withAction={false} />

          <section aria-labelledby="housekeeping-heading" data-enter>
            <Card className="sm:p-6">
              <PanelHead id="housekeeping-heading" title="Renholdere i dag" note="Dagvakten, med rommene fra natten." />
              {!assignments ? (
                <div className="mt-4 flex flex-col gap-3">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : assignments.length === 0 ? (
                <EmptyState as="h3" className="mt-4" title="Ingen renholdere på vakt" body="Sett opp dagvakten under Ansatte og vakter." />
              ) : (
                <ul className="mt-3 divide-y divide-line">
                  {assignments.map(({ cleaner, rooms: own }) => (
                    <li key={cleaner.id} className="flex items-start gap-3 py-3">
                      <Monogram name={cleaner.name} size={32} />
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <span className="font-semibold">{cleaner.name}</span>
                          <span className="text-sm text-muted">{cleaner.area}</span>
                        </div>
                        <p className="text-sm">
                          {own.length === 0 ? (
                            <span className="text-muted">Ingen rom fra natten</span>
                          ) : (
                            <>
                              <span className="font-semibold tabular-nums">{own.length}</span> rom:{" "}
                              <span className="font-mono text-sm tabular-nums">{own.map((room) => room.number).join(" ")}</span>
                            </>
                          )}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <SourceNote className="mt-3" sources={["run-log", "test"]} />
            </Card>
          </section>

          <section aria-labelledby="ooo-heading" data-enter>
            <Card className="sm:p-6">
              <PanelHead
                id="ooo-heading"
                title="Ute av drift"
                count={outOfOrder.length}
                action={
                  maintenanceLink ? (
                    <Link href="/vedlikehold" className="flex min-h-11 items-center text-sm font-semibold text-accent-text hover:underline">
                      Åpne Vedlikehold
                    </Link>
                  ) : undefined
                }
              />
              {outOfOrder.length === 0 ? (
                <p className="mt-3 text-base text-muted">Alle rom kan selges. Ingen åpne arbeidsordre stenger et rom.</p>
              ) : (
                <ul className="mt-2 divide-y divide-line">
                  {maintenance
                    .filter((order) => order.outOfOrder && order.status !== "lost")
                    .map((order) => (
                      <li key={order.id} className="flex flex-col gap-1 py-3">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <span className="font-semibold">{placeLabel(order.room)}</span>
                          <Badge tone="danger">Stengt</Badge>
                        </div>
                        <p className="text-sm text-muted">{order.text}</p>
                        <p className="text-sm">{order.assignee ? `Hos ${order.assignee}` : "Ingen har tatt den ennå"}</p>
                      </li>
                    ))}
                </ul>
              )}
              <SourceNote className="mt-3" sources="test" />
            </Card>
          </section>

          <p className="text-sm text-muted">
            Ruter finner korteste runde mellom etasjene.{" "}
            <Link href="/ruter" className={buttonClasses("ghost", "sm")}>
              Åpne Ruter
            </Link>
          </p>
        </div>
      </div>

      <RoomSheet
        open={sheet?.open ?? false}
        room={sheetRoom}
        entries={sheetEntries}
        ended={robot?.ended ?? false}
        dirtyIds={dirtyIds}
        onClose={closeRoom}
      />
    </ModulePage>
  );
}

function Figure({ label, value, unit, tone }: { label: string; value: number | undefined; unit?: string; tone?: "default" | "success" | "warning" | "danger" }) {
  return value === undefined ? (
    <div className="flex flex-col gap-1">
      <Skeleton className="h-8 w-16" />
      <span className="text-sm text-muted">{label}</span>
    </div>
  ) : (
    <Stat label={label} value={value} unit={unit} tone={tone} />
  );
}
