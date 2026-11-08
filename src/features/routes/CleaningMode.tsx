"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { UndoStatus } from "@/features/requests/UndoStatus";
import { Button, Card, EmptyState, ErrorState, RegenIcon, Skeleton } from "@/ui";
import { CleaningControls } from "./CleaningControls";
import { CleaningStops } from "./CleaningStops";
import { planCleaning } from "./cleaningPlan";
import { placeLabel, type HotelGraph } from "./hotelMap";
import { HotelPlan } from "./HotelPlan";
import { OffMapRooms } from "./OffMapRooms";
import { dayRooms } from "./dayRooms";
import { cleaningPresets, roomStatusAt, type RoomPreset, type RoomReport } from "./nightRooms";
import type { CleaningStart } from "./query";
import { SavingBand } from "./SavingBand";
import type { NightLog } from "./useNightLog";
import { replaceQuery } from "./urlState";

export type CleaningInitial = { rooms: string[]; unknown: string[]; start: CleaningStart | null; cart: boolean | null };

const NO_STATUSES: ReadonlyMap<string, RoomReport> = new Map();

/** No way to a room on the map. The advice and the actions follow the real cause. */
function NoRouteError({
  room,
  from,
  to,
  stairsOnly,
  onCartOff,
  onRemove,
}: {
  room: string;
  from: string;
  to: string;
  stairsOnly: boolean;
  onCartOff: () => void;
  onRemove: (room: string) => void;
}) {
  const name = placeLabel(room);
  return (
    <ErrorState
      title="Ingen rute funnet"
      body={
        stairsOnly
          ? `${name} kan bare nås via trapp, og med vogn går ruten ikke i trapp. Slå av vogn, eller ta rommet ut av ruten.`
          : `Kartet har ingen vei mellom ${placeLabel(from)} og ${placeLabel(to)}. Ta ${name.toLowerCase()} ut av ruten og besøk det manuelt.`
      }
      action={
        <div className="flex flex-wrap gap-2">
          {stairsOnly && <Button onClick={onCartOff}>Slå av vogn</Button>}
          <Button variant={stairsOnly ? "secondary" : "primary"} onClick={() => onRemove(room)}>
            Fjern {name.toLowerCase()}
          </Button>
        </div>
      }
    />
  );
}

/** Renhold: pick rooms (from the night or on the map), get the best round across floors. */
export function CleaningMode({ map, log, initial }: { map: HotelGraph; log: NightLog; initial: CleaningInitial }) {
  const statuses = useMemo(() => (log.status === "ready" ? roomStatusAt(log.lines) : NO_STATUSES), [log.status, log.lines]);
  const { presets: nightPresets, doNotDisturb } = useMemo(() => cleaningPresets(statuses), [statuses]);
  // Dagens renhold: the night's dirty rooms and today's departures, in the order they come free.
  const day = useMemo(() => (log.status === "ready" ? dayRooms(statuses) : []), [log.status, statuses]);
  const presets = useMemo<RoomPreset[]>(
    () => [{ id: "dag", label: "Dagens renhold", hint: "Nattens Må vaskes og dagens utsjekk, i den rekkefølgen rommene blir ledige", rooms: day.map((entry) => entry.room) }, ...nightPresets],
    [day, nightPresets],
  );

  const [rooms, setRooms] = useState(initial.rooms);
  // Where the list came from says what the best round is compared with.
  const [source, setSource] = useState<"lenke" | "dag" | "valgt">(initial.rooms.length > 0 ? "lenke" : "dag");
  // "Fjern alle rom" keeps the round it cleared until the next change, for Angre.
  const [cleared, setCleared] = useState<string[] | null>(null);
  const [start, setStart] = useState<CleaningStart>(initial.start ?? "laundry");
  const [cart, setCart] = useState(initial.cart ?? true);
  // Rooms from the link draw themselves on arrival; taps change the route without replaying it.
  const [drawToken, setDrawToken] = useState(initial.rooms.length > 0 ? 1 : 0);
  const redraw = () => setDrawToken((t) => t + 1);

  // Only rooms on tonight's map can be routed; the rest are listed apart, never dropped.
  const routable = useMemo(() => rooms.filter((r) => map.nodes[r]?.kind === "room"), [map, rooms]);
  const offMap = useMemo(() => rooms.filter((r) => map.nodes[r]?.kind !== "room"), [map, rooms]);
  const plan = useMemo(() => planCleaning(map, { start, rooms: routable, cart }), [map, start, routable, cart]);
  // With the cart on, would the same rooms work by the stairs? Then that is the advice, and the action.
  const stairsOnly = useMemo(() => {
    if (!cart || !plan || !("error" in plan)) return false;
    const byStairs = planCleaning(map, { start, rooms: routable, cart: false });
    return byStairs !== null && !("error" in byStairs);
  }, [map, start, routable, cart, plan]);
  const selected = useMemo(() => new Set(rooms), [rooms]);

  const firstSync = useRef(true);
  useEffect(() => {
    if (firstSync.current) {
      firstSync.current = false;
      return;
    }
    replaceQuery({ rom: rooms.length ? rooms.join(",") : null, start, vogn: cart ? "1" : "0" });
  }, [rooms, start, cart]);

  // Opened without rooms (from the menu): the day's round loads itself once the night is read.
  const dayLoaded = useRef(initial.rooms.length > 0);
  useEffect(() => {
    if (dayLoaded.current || day.length === 0) return;
    dayLoaded.current = true;
    setRooms(day.map((entry) => entry.room));
    setSource("dag");
    setDrawToken((t) => t + 1);
  }, [day]);

  const toggle = (room: string) => {
    setCleared(null);
    setSource("valgt");
    setRooms((current) => (current.includes(room) ? current.filter((r) => r !== room) : [...current, room]));
  };
  const load = (preset: RoomPreset) => {
    setCleared(null);
    setSource(preset.id === "dag" ? "dag" : "valgt");
    setRooms(preset.rooms);
    redraw();
  };
  const clearAll = () => {
    setCleared(rooms);
    setRooms([]);
  };
  const undoClear = () => {
    if (cleared) setRooms(cleared);
    setCleared(null);
  };

  const dayPreset = presets.find((p) => p.id === "dag");
  const mustClean = presets.find((p) => p.id === "ma_vaskes");
  const occupied = presets.find((p) => p.id === "opptatt");
  const suggested = dayPreset?.rooms.length ? dayPreset : mustClean?.rooms.length ? mustClean : occupied?.rooms.length ? occupied : null;

  const ok = plan && !("error" in plan) ? plan : null;
  // The map is tonight's only once the log is in; route nothing on the stand-in map before that.
  const waiting = log.status === "loading";

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      {initial.unknown.length > 0 && (
        <p role="status" className="rounded-md border-l-4 border-warning bg-warning-soft px-4 py-3 text-base text-warning">
          Lenken hadde noe som ikke er et romnummer: {initial.unknown.join(", ")}. Rommene i lenken er med.
        </p>
      )}

      {cleared && rooms.length === 0 && (
        <UndoStatus
          message={cleared.length === 1 ? "Rommet er fjernet fra runden." : `${cleared.length} rom er fjernet fra runden.`}
          onUndo={undoClear}
          undoLabel="Angre: legg rommene tilbake"
        />
      )}

      {rooms.length === 0 ? (
        <Card className="p-4 sm:p-5">
          <EmptyState
            title="Ingen rom valgt"
            body="Velg rom på kartet eller hent rommene som må vaskes."
            action={
              log.status === "loading" ? (
                <Button loading>Henter nattens romstatus</Button>
              ) : suggested ? (
                <div className="flex flex-col items-start gap-2">
                  <Button onClick={() => load(suggested)}>
                    {suggested.id === "dag" ? "Hent dagens renhold" : suggested.id === "ma_vaskes" ? "Hent rommene som må vaskes" : "Hent rommene med gjester i natt"}
                    <span className="font-mono text-sm tabular-nums">{suggested.rooms.length}</span>
                  </Button>
                  {suggested.id === "opptatt" && (
                    <p className="text-sm text-muted">Ingen rom står som Må vaskes etter natten.</p>
                  )}
                </div>
              ) : undefined
            }
          />
        </Card>
      ) : waiting ? (
        <Card className="flex flex-col gap-3 p-4 sm:p-5" aria-busy="true" aria-label="Henter nattens hotellkart">
          <Skeleton className="h-10 w-2/3 max-w-lg" />
          <Skeleton className="h-5 w-1/3 max-w-xs" />
        </Card>
      ) : ok ? (
        <SavingBand
          plan={ok}
          given={
            source === "dag"
              ? "Mot rekkefølgen rommene blir ledige i"
              : source === "lenke"
                ? "Mot rekkefølgen i lenken"
                : "Mot rekkefølgen rommene ble valgt i"
          }
        />
      ) : plan && "error" in plan ? (
        <Card className="p-4 sm:p-5">
          <NoRouteError
            room={plan.to === start ? plan.from : plan.to}
            from={plan.from}
            to={plan.to}
            stairsOnly={stairsOnly}
            onCartOff={() => {
              setCart(false);
              redraw();
            }}
            onRemove={toggle}
          />
        </Card>
      ) : null}

      {!waiting && offMap.length > 0 && <OffMapRooms rooms={offMap} statuses={statuses} onRemove={toggle} />}

      <div className="lg:order-first">
        <CleaningControls
          start={start}
          onStart={(s) => {
            setStart(s);
            redraw();
          }}
          cart={cart}
          onCart={(on) => {
            setCart(on);
            redraw();
          }}
          logStatus={log.status}
          presets={presets}
          doNotDisturb={doNotDisturb}
          onPreset={load}
          onRetry={log.retry}
        />
      </div>

      <Card className="p-4 sm:p-5">
        <h2 className="sr-only">Hotellet</h2>
        {waiting ? (
          <Skeleton className="aspect-[94/29] w-full" />
        ) : (
          <HotelPlan
            map={map}
            label="Hotellkart med ruten"
            statuses={statuses}
            route={ok ? ok.legs.map((l) => l.path) : []}
            pins={ok ? ok.tour.order.map((node, i) => ({ node, label: String(i + 1), step: i })) : []}
            start={start}
            selected={selected}
            onToggleRoom={toggle}
            drawToken={drawToken}
            legend={
              <li className="flex items-center gap-2">
                <span aria-hidden="true" className="h-1 w-6 rounded-full bg-accent" />
                Rute
              </li>
            }
            footer={
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <p className="text-sm text-muted">Trykk på et rom for å legge det til eller ta det bort.</p>
                {ok && (
                  <Button variant="secondary" onClick={redraw}>
                    <RegenIcon name="refresh" size={20} />
                    Tegn ruten igjen
                  </Button>
                )}
              </div>
            }
          />
        )}
      </Card>

      {ok && !waiting && (
        <Card className="p-4 sm:p-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <div>
              <h2 className="text-lg font-semibold tracking-[-0.01em]">Rekkefølge</h2>
              <p className="text-sm text-muted">
                Start og slutt: <span className="text-text">{placeLabel(start)}</span>
                {cart ? " · med vogn" : ""}
              </p>
            </div>
            <Button variant="ghost" onClick={clearAll}>
              Fjern alle rom
            </Button>
          </div>
          <CleaningStops
            map={map}
            start={start}
            order={ok.tour.order}
            legs={ok.legs}
            statuses={statuses}
            onRemove={toggle}
          />
        </Card>
      )}
    </div>
  );
}
