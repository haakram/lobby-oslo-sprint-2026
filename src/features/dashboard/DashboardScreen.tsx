"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHotelMap } from "@/features/hotel";
import { useHotelReplay } from "@/features/replay";
import { Button, buttonClasses, Card, EmptyState, ErrorState } from "@/ui";
import { Cleaning } from "./Cleaning";
import { nightLabel } from "./format";
import { KpiStrip } from "./KpiStrip";
import { NowBand } from "./NowBand";
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
import { TopBar } from "./TopBar";
import { useDashboardRun } from "./useDashboardRun";
import { useEntrance } from "./useEntrance";
import { WorkOrders } from "./WorkOrders";

const STATUS_KEY = "lobby:work-orders";

type Statuses = Record<string, OrderStatus>;

function readStatuses(): Statuses {
  try {
    const raw = typeof window === "undefined" ? null : localStorage.getItem(STATUS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter((entry): entry is [string, OrderStatus] => entry[1] === "tildelt" || entry[1] === "lost"),
    );
  } catch {
    return {};
  }
}

/**
 * Oversikt, the admin's desk: the whole hotel at the 06:00 handover (or live, while a shift runs).
 * Layer cake: the top bar, what needs a person now (with the one primary action), the night's
 * figures, then the key rack and the robot in the hotel, then the lists. On a phone the panels stack
 * in that order; the DOM order is the priority order.
 */
export function DashboardScreen({ viewerUrl }: { viewerUrl?: string }) {
  const run = useDashboardRun(viewerUrl);
  const ready = run.status === "ready";
  const night = useMemo(() => (ready ? foldNight(run.lines) : null), [ready, run.lines]);
  // Tonight's hotel, built from the run log: the rooms the night mentions, not a fixed seed.
  const map = useHotelMap(ready ? run.lines : null);
  // The 3D hotel follows the same night; it stands at the end of it, like the figures.
  const replay = useHotelReplay(run.source === "live" ? "live" : "demo", { viewerUrl });

  // TODO(phase-3): no backend for work orders yet; Tildelt and Løst live in this browser (localStorage).
  const [statuses, setStatuses] = useState<Statuses>(readStatuses);
  useEffect(() => {
    try {
      localStorage.setItem(STATUS_KEY, JSON.stringify(statuses));
    } catch {
      // Storage blocked: the statuses still hold for this tab.
    }
  }, [statuses]);
  const resolved = useMemo(
    () => new Set(Object.entries(statuses).flatMap(([id, status]) => (status === "lost" ? [id] : []))),
    [statuses],
  );
  const advance = useCallback(
    (id: string) => setStatuses((current) => ({ ...current, [id]: nextOrderStatus(current[id] ?? "ny") })),
    [],
  );
  const undo = useCallback((id: string) => setStatuses((current) => ({ ...current, [id]: "tildelt" })), []);

  const rooms = useMemo(() => (night ? selectRooms(night, resolved, map) : null), [night, resolved, map]);
  const orders = useMemo(() => (night ? selectWorkOrders(night) : null), [night]);
  const kpis = useMemo(() => (night ? selectKpis(night, resolved, map) : null), [night, resolved, map]);
  const robot = useMemo(() => (night ? selectRobot(night, map) : null), [night, map]);

  const [sheet, setSheet] = useState<{ room: string; open: boolean } | null>(null);
  const openRoom = useCallback((room: string | null) => {
    if (room) setSheet({ room, open: true });
  }, []);
  const sheetRoom = sheet && rooms ? (rooms.find((room) => room.id === sheet.room) ?? null) : null;
  const sheetEntries = useMemo(() => (night && sheet ? selectRoomNight(night, sheet.room) : []), [night, sheet]);

  const scope = useRef<HTMLDivElement>(null);
  useEntrance(scope, ready);

  return (
    <main className="flex-1">
      <TopBar night={night ? nightLabel(night.startedAt) : null} robot={robot} source={run.source} loading={run.status === "loading"} />

      <div ref={scope} className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-6 sm:px-6 lg:gap-8 lg:px-10 lg:py-8">
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
            <NowBand rooms={rooms} orders={orders} resolved={resolved} robot={robot} />
            <KpiStrip kpis={kpis} />
            {/* Desktop: the rack over work orders on the left; the robot, cleaning and reception stacked on the right. */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:grid-rows-[auto_auto_1fr] lg:items-start lg:gap-8">
              <RoomBoard rooms={rooms} clock={robot?.clock ?? null} onOpen={openRoom} className="lg:col-start-1 lg:row-start-1" />
              <RobotNow
                robot={robot}
                replay={replay}
                selectedRoom={sheet?.open ? sheet.room : null}
                onSelectRoom={openRoom}
                className="lg:col-start-2 lg:row-start-1"
              />
              <Cleaning rooms={rooms} className="lg:col-start-2 lg:row-start-2" />
              <WorkOrders orders={orders} statuses={statuses} onAdvance={advance} onUndo={undo} className="lg:col-start-1 lg:row-span-2 lg:row-start-2" />
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
