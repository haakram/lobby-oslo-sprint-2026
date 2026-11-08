"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { probeViewer, type ReplaySource, resolveViewerUrl, useHotelReplay } from "@/features/replay";
import { Badge, Button, cx, EmptyState, ErrorState, RegenIcon, Skeleton, Stat } from "@/ui";
import { Hotel3D, StatusLegend } from "./Hotel3D";
import { PlaybackControls } from "./PlaybackControls";
import { forManagers } from "@/features/nightshift/eventFilter";
import { outcomesAt } from "@/features/nightshift/outcomes";
import { EventFeed, RoomCard, TaskCard } from "./ReplayPanels";
import { RoomPicker } from "./RoomPicker";
import { useHeldReplay } from "./useHeldReplay";

/** Where the robot's events a manager can read come from; the full log lives on Natteskift. */
const RECENT_SHOWN = 8;

/**
 * /hotell: the 3D map of the whole hotel, the page itself (UX audit, Hotell 5). The map fills the
 * viewport under a thin toolbar, the scrubber is docked under it, and the task, the chosen room and
 * the night's figures live in a drawer at the right that can be closed. Follows the live viewer server
 * when it answers on this machine; otherwise the recorded demo night, and the toolbar says which.
 * `?t=<sim seconds>` opens the night at that moment, `?rom=<room-id>` with that room chosen.
 */
export function HotelScreen({ viewerUrl }: { viewerUrl?: string }) {
  const base = resolveViewerUrl(viewerUrl);
  const [viewerUp, setViewerUp] = useState<boolean | null>(null);
  const [source, setSource] = useState<ReplaySource>("demo");
  // `?rom=` from the night report or a room sheet chooses the room from the start.
  const [room, setRoom] = useState<string | null>(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("rom"),
  );
  const [drawer, setDrawer] = useState(true);
  const roomCard = useRef<HTMLDivElement>(null);
  const scrollToRoom = useRef(false);
  // A room chosen on the map or in the list: its card comes into view (on a phone it sits under the map).
  const chooseRoom = useCallback((roomId: string | null) => {
    scrollToRoom.current = roomId !== null;
    setRoom(roomId);
  }, []);
  useEffect(() => {
    if (!room || !scrollToRoom.current) return;
    scrollToRoom.current = false;
    roomCard.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [room]);

  // The live viewer is asked for only when NEXT_PUBLIC_VIEWER_URL names it (as on Oversikt and Natteskift);
  // unset, the recorded night plays and nothing knocks on a closed port (a red line in the console).
  const configured = Boolean(viewerUrl?.trim());
  useEffect(() => {
    let cancelled = false;
    detectViewer(base, configured).then((up) => {
      if (cancelled) return;
      setViewerUp(up);
      if (up) setSource("live");
    });
    return () => {
      cancelled = true;
    };
  }, [base, configured]);

  // The room check applied once for the map and the drawer: a room held back reads "Holdt tilbake" in both.
  const replay = useHeldReplay(useHotelReplay(source, { viewerUrl: base }));
  const ready = replay.status === "ready";
  const snapshot = replay.snapshot;
  // The one tally of the robot's night (nightshift/outcomes.ts), as Oversikt, Natteskift and Overlevering count it
  // (round 5, the Wybe juror and the Wybe engineer: 3D-kart said "9 Ikke fullført" where the others said 4 to a person and 8 declined).
  const tally = useMemo(
    () => (replay.timeline && snapshot ? outcomesAt(replay.timeline, snapshot.eventCount, snapshot.t).tally : null),
    [replay.timeline, snapshot],
  );

  // `?t=<sim seconds>` from the night report opens the night at that moment.
  const { setT } = replay;
  useEffect(() => {
    if (!ready || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const t = Number(params.get("t"));
    if (params.has("t") && Number.isFinite(t) && t >= 0) setT(t);
  }, [ready, setT]);

  return (
    // lg:max-h-dvh: flex-1 alone sizes main to its content, so a long drawer (a room's card) would stretch
    // the page and the map with it; capped, the drawer scrolls on its own beside a map that stays put.
    <main data-surface="dark" className="flex min-h-0 flex-1 flex-col bg-bg text-text lg:h-dvh lg:max-h-dvh">
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-line px-4 py-2 sm:px-6 lg:px-6">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-xl font-bold tracking-[-0.02em]">3D-kart</h1>
          <span className="hidden text-sm text-muted sm:inline">Gå rundt i hotellet og følg roboten.</span>
          <SourceBadge source={source} live={replay.live} playing={replay.playing} ready={ready} />
        </div>
        <div className="flex items-center gap-2">
          {viewerUp && <SourceTabs source={source} onChange={setSource} />}
          {/* The drawer only closes beside the map (lg); on a phone it is the page below, so no button. */}
          <div className="hidden lg:block">
            <Button variant="ghost" size="sm" aria-pressed={drawer} aria-controls="hotel-drawer" onClick={() => setDrawer((value) => !value)}>
              <RegenIcon name={drawer ? "sidebar-right-close" : "sidebar-right-open"} size={18} />
              {drawer ? "Skjul panel" : "Vis panel"}
            </Button>
          </div>
        </div>
      </div>

      {replay.status === "error" && (
        <div className="max-w-2xl px-4 py-8 sm:px-6">
          {source === "live" ? (
            <ErrorState
              title="Fikk ikke kontakt med viewer-serveren"
              body={`Sjekk at «python -m agent viewer» kjører på ${base}. Vi prøver igjen hvert andre sekund.`}
              action={
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={replay.retry}>
                    Prøv igjen
                  </Button>
                  <Button variant="ghost" onClick={() => setSource("demo")}>
                    Vis demo-natten
                  </Button>
                </div>
              }
            />
          ) : (
            <ErrorState
              title="Fikk ikke lastet opptaket"
              body="Sjekk nettet og prøv igjen."
              action={
                <Button variant="secondary" onClick={replay.retry}>
                  Prøv igjen
                </Button>
              }
            />
          )}
        </div>
      )}
      {replay.status === "empty" && (
        <div className="max-w-2xl px-4 py-8 sm:px-6">
          <EmptyState
            title={source === "live" ? "Ingen skift ennå" : "Opptaket er tomt"}
            body={source === "live" ? "Start et skift med agenten, så dukker roboten opp her." : "Legg inn en kjøringslogg fra roboten, så spilles natten av her."}
            action={
              source === "live" ? (
                <Button variant="secondary" onClick={() => setSource("demo")}>
                  Vis demo-natten
                </Button>
              ) : undefined
            }
          />
        </div>
      )}

      {(replay.status === "loading" || ready) && (
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {/* Below lg the column has no height of its own, so the map gets one (h-full would be 0 px). */}
            <div className="relative flex-1 lg:min-h-0">
              <Hotel3D replay={replay} variant="full" selectedRoom={room} onSelectRoom={chooseRoom} className="h-[56dvh]! max-h-none! min-h-0! rounded-none! border-0! lg:h-full!" />
            </div>
            <StatusLegend className="px-4 pt-2 sm:hidden" />
            <div className="border-t border-line bg-surface px-4 py-3 sm:px-6">
              <PlaybackControls replay={replay} compact />
            </div>
          </div>

          <aside
            id="hotel-drawer"
            aria-label="Status nå"
            className={cx(
              // relative: sr-only text inside is positioned against the drawer, so it can't stretch the page.
              "relative flex min-w-0 flex-col gap-4 overflow-y-auto border-t border-line bg-bg p-4 sm:p-6",
              "lg:w-[400px] lg:shrink-0 lg:border-t-0 lg:border-l lg:p-5",
              !drawer && "lg:hidden",
            )}
          >
            {ready && snapshot ? (
              <>
                <RoomPicker map={replay.timeline?.map} snapshot={snapshot} value={room} onChange={chooseRoom} />
                {room && (
                  <div ref={roomCard} className="scroll-mt-4">
                    <RoomCard roomId={room} snapshot={snapshot} timeline={replay.timeline} onClose={() => setRoom(null)} />
                  </div>
                )}
                <TaskCard snapshot={snapshot} finished={snapshot.finished} />
                <section role="group" aria-label="Natten i tall" className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-line py-4">
                  <Stat label="Oppdrag fullført" value={tally?.done ?? snapshot.tasksDone} unit={tally ? `av ${tally.total}` : undefined} tone="success" />
                  {/* Plain beside the green one: misses are part of the night, not an alarm (red and amber live in the bell). */}
                  <Stat label="Ga videre til en person" value={tally?.handedBack ?? snapshot.tasksFailed} />
                  <Stat
                    label={snapshot.battery !== null && snapshot.battery < 20 ? "Batteri · lavt" : "Batteri"}
                    value={snapshot.battery === null ? "–" : Math.round(snapshot.battery)}
                    unit={snapshot.battery === null ? undefined : "%"}
                  />
                  <Stat label="Avvik meldt" value={snapshot.workOrders.length} />
                </section>
                <EventFeed
                  id="recent-heading"
                  title="Nylig"
                  emptyText="Roboten har ikke gjort noe ennå."
                  events={forManagers(snapshot.recent, false).slice(0, RECENT_SHOWN)}
                  className="min-w-0"
                />
              </>
            ) : (
              <LoadingAside />
            )}
          </aside>
        </div>
      )}
    </main>
  );
}

/** Only a configured viewer, and from a deployed (https) page only an https one: the browser blocks the rest. */
async function detectViewer(base: string, configured: boolean): Promise<boolean> {
  if (!configured) return false;
  const host = window.location.hostname;
  const local = host === "localhost" || host === "127.0.0.1" || /^(10|192\.168)\./.test(host);
  return local || base.startsWith("https://") ? probeViewer(base) : false;
}

function SourceBadge({ source, live, playing, ready }: { source: ReplaySource; live: boolean; playing: boolean; ready: boolean }) {
  if (!ready) return null;
  if (source === "live") return <Badge tone={live ? "danger" : "success"}>{live ? "Direkte · pågår" : "Direkte · ferdig"}</Badge>;
  return <Badge tone={playing ? "accent" : "neutral"}>{playing ? "Opptak · spilles av" : "Opptak"}</Badge>;
}

function SourceTabs({ source, onChange }: { source: ReplaySource; onChange: (source: ReplaySource) => void }) {
  const tabs: Array<{ id: ReplaySource; label: string }> = [
    { id: "live", label: "Direkte" },
    { id: "demo", label: "Opptak" },
  ];
  return (
    <div role="group" aria-label="Kilde" className="inline-flex gap-0.5 rounded-sm bg-sunken p-0.5">
      {tabs.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          aria-pressed={source === id}
          onClick={() => onChange(id)}
          className={cx(
            "min-h-10 rounded-sm px-3 text-sm font-semibold transition-colors duration-[120ms] ease-standard pointer-coarse:min-h-11",
            source === id ? "bg-surface text-text" : "text-muted hover:text-text",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function LoadingAside() {
  return (
    <div aria-busy="true" aria-label="Laster natten" className="flex flex-col gap-4">
      <div className="rounded-md bg-surface p-5">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-3 h-7 w-56" />
        <Skeleton className="mt-2 h-5 w-40" />
      </div>
      <div className="grid grid-cols-2 gap-6 py-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="flex flex-col gap-2">
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3, 4].map((index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}
