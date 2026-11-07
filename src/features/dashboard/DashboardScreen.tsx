"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { Button, buttonClasses, Card, EmptyState, ErrorState } from "@/ui";
import { Cleaning } from "./Cleaning";
import { DashboardHeader } from "./DashboardHeader";
import { nightLabel } from "./format";
import { KpiStrip } from "./KpiStrip";
import { ReceptionPanel } from "./ReceptionPanel";
import { RobotNow } from "./RobotNow";
import { RoomBoard } from "./RoomBoard";
import { RoomSheet } from "./RoomSheet";
import {
  foldNight,
  nextOrderStatus,
  type OrderStatus,
  selectKpis,
  selectRobot,
  selectRoomNight,
  selectRooms,
  selectWorkOrders,
} from "./selectors";
import { useDashboardRun } from "./useDashboardRun";
import { useEntrance } from "./useEntrance";
import { WorkOrders } from "./WorkOrders";

/**
 * Oversikt, the app's home: the whole hotel at the 06:00 handover (or live, while a shift runs).
 * Layer cake: the header and four numbers, then rooms and the robot, then what needs a person.
 * On a phone the panels stack in that order; the DOM order is the priority order.
 */
export function DashboardScreen({ viewerUrl }: { viewerUrl?: string }) {
  const run = useDashboardRun(viewerUrl);
  const ready = run.status === "ready";
  const night = useMemo(() => (ready ? foldNight(run.lines) : null), [ready, run.lines]);

  // TODO(phase-3): no backend for work orders yet; Tildelt and Løst are kept in this tab only.
  const [statuses, setStatuses] = useState<Record<string, OrderStatus>>({});
  const resolved = useMemo(
    () => new Set(Object.entries(statuses).flatMap(([id, status]) => (status === "lost" ? [id] : []))),
    [statuses],
  );
  const advance = useCallback(
    (id: string) => setStatuses((current) => ({ ...current, [id]: nextOrderStatus(current[id] ?? "ny") })),
    [],
  );
  const undo = useCallback((id: string) => setStatuses((current) => ({ ...current, [id]: "tildelt" })), []);

  const rooms = useMemo(() => (night ? selectRooms(night, resolved) : null), [night, resolved]);
  const orders = useMemo(() => (night ? selectWorkOrders(night) : null), [night]);
  const kpis = useMemo(() => (night ? selectKpis(night, resolved) : null), [night, resolved]);
  const robot = useMemo(() => (night ? selectRobot(night) : null), [night]);

  const [sheet, setSheet] = useState<{ room: string; open: boolean } | null>(null);
  const sheetRoom = sheet && rooms ? (rooms.find((room) => room.id === sheet.room) ?? null) : null;
  const sheetEntries = useMemo(() => (night && sheet ? selectRoomNight(night, sheet.room) : []), [night, sheet]);

  const scope = useRef<HTMLDivElement>(null);
  useEntrance(scope, ready);

  return (
    <main className="flex-1">
      <DashboardHeader
        night={night ? nightLabel(night.startedAt) : null}
        robot={robot}
        source={run.source}
        loading={run.status === "loading"}
      />

      <div ref={scope} className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-6 sm:px-8 lg:px-12 lg:py-8">
        {run.status === "error" || run.status === "empty" ? (
          <>
            <Card className="sm:p-6">
              {run.status === "error" ? (
                <ErrorState
                  title="Fikk ikke lastet natten"
                  body="Natteloggen svarte ikke, så rom, robot og arbeidsordre vises ikke. Sjekk nettet og prøv igjen."
                  action={
                    <Button variant="secondary" onClick={run.retry}>
                      Prøv igjen
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  title="Ingen natt å vise ennå"
                  body="Når roboten har gått et skift, vises rom, oppgaver og arbeidsordre her."
                  action={
                    <Link href="/natteskift" className={buttonClasses("secondary")}>
                      Åpne Natteskift
                    </Link>
                  }
                />
              )}
            </Card>
            <ReceptionPanel />
          </>
        ) : (
          <>
            <KpiStrip kpis={kpis} />
            {/* Desktop: rooms over work orders on the left; robot, cleaning and reception stacked on the right. */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)] lg:grid-rows-[auto_auto_1fr] lg:items-start">
              <RoomBoard
                rooms={rooms}
                onOpen={(room) => setSheet({ room, open: true })}
                className="lg:col-start-1 lg:row-start-1"
              />
              <RobotNow robot={robot} rooms={rooms} className="lg:col-start-2 lg:row-start-1" />
              <Cleaning rooms={rooms} className="lg:col-start-2 lg:row-start-2" />
              <WorkOrders
                orders={orders}
                statuses={statuses}
                onAdvance={advance}
                onUndo={undo}
                className="lg:col-start-1 lg:row-span-2 lg:row-start-2"
              />
              <ReceptionPanel className="lg:col-start-2 lg:row-start-3" />
            </div>
          </>
        )}
      </div>

      <RoomSheet
        open={sheet?.open ?? false}
        room={sheetRoom}
        entries={sheetEntries}
        ended={robot?.ended ?? false}
        onClose={() => setSheet((current) => (current ? { ...current, open: false } : null))}
      />
    </main>
  );
}
