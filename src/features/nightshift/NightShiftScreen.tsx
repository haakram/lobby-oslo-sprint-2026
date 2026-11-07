"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Hotel3D, StatusLegend } from "@/features/hotel3d/Hotel3D";
import { PlaybackControls } from "@/features/hotel3d/PlaybackControls";
import { EventFeed, RoomCard, TaskCard, WorkOrderList } from "@/features/hotel3d/ReplayPanels";
import { RoomPicker } from "@/features/hotel3d/RoomPicker";
import { type HotelReplay, itemName, placeName, type ReplaySource, roomNumber, simToClock, type Task, taskKindName, useHotelReplay } from "@/features/replay";
import { Badge, Button, buttonClasses, Card, cx, EmptyState, ErrorState, PageHeader, RegenIcon, Skeleton, Stat } from "@/ui";
import { failures, forManagers } from "./eventFilter";
import { viewerBase } from "./useRun";

const MAX_EVENTS = 40;

/**
 * Natteskift, the night report for the robot manager: how the night went, what failed and why
 * (first), the faults for the morning, then the log in Norwegian, with the technical events behind
 * a toggle. The hotel and the scrubber sit further down, to see a moment of the night in place.
 * A replay of the demo night, or the live shift when a viewer URL is configured.
 */
export function NightShiftScreen({ viewerUrl }: { viewerUrl?: string }) {
  const base = viewerBase(viewerUrl);
  const [source, setSource] = useState<ReplaySource>("demo");
  const replay = useHotelReplay(source, { viewerUrl: base });
  const ready = replay.status === "ready";
  const snapshot = replay.snapshot;
  const [room, setRoom] = useState<string | null>(null);
  const [technical, setTechnical] = useState(false);
  const roomCard = useRef<HTMLDivElement>(null);
  const scrollToRoom = useRef(false);
  // The room's card opens right under the map it was chosen on, and comes into view.
  const chooseRoom = useCallback((roomId: string | null) => {
    scrollToRoom.current = roomId !== null;
    setRoom(roomId);
  }, []);
  useEffect(() => {
    if (!room || !scrollToRoom.current) return;
    scrollToRoom.current = false;
    roomCard.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [room]);

  const events = useMemo(() => {
    if (!replay.timeline || !snapshot) return [];
    const upTo = forManagers(replay.timeline.events.slice(0, snapshot.eventCount), technical);
    return upTo.slice(-MAX_EVENTS).reverse();
  }, [replay.timeline, snapshot, technical]);

  const failed = useMemo(
    () => (replay.timeline && snapshot ? failures(replay.timeline.tasks, replay.timeline.events, snapshot.eventCount, snapshot.t) : []),
    [replay.timeline, snapshot],
  );
  const open = useMemo(
    () => (replay.timeline && snapshot ? replay.timeline.tasks.filter((task) => task.start <= snapshot.t && task.outcome === null && snapshot.finished).length : 0),
    [replay.timeline, snapshot],
  );

  return (
    <main data-surface="dark" className="flex-1 bg-bg text-text">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-8 px-4 py-6 sm:px-6 lg:gap-10 lg:px-10 lg:py-10">
        <PageHeader
          title="Natteskift"
          meta={ready && <ShiftBadge replay={replay} />}
          lede="Rapporten fra robotens natt: hva som ble gjort, hva som feilet og hvorfor."
          actions={
            <>
              {base && <Tabs source={source} onChange={setSource} />}
              <Link href="/hotell" className={buttonClasses("secondary")}>
                Åpne hotellet i 3D
              </Link>
            </>
          }
        />

        {replay.status === "loading" && <LoadingRun />}
        {replay.status === "error" &&
          (source === "live" ? (
            <ErrorState
              title="Fikk ikke kontakt med viewer-serveren"
              body="Sjekk at viewer-serveren kjører på denne maskinen. Vi prøver igjen hvert andre sekund."
              action={
                <Button variant="secondary" onClick={replay.retry}>
                  Prøv igjen
                </Button>
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
          ))}
        {replay.status === "empty" &&
          (source === "live" ? (
            <EmptyState icon={<RegenIcon name="moon" size={32} />} title="Ingen skift ennå" body="Start et skift med agenten, så dukker det opp her." />
          ) : (
            <EmptyState
              icon={<RegenIcon name="moon" size={32} />}
              title="Opptaket er tomt"
              body="Legg inn en kjøringslogg fra roboten, så spilles skiftet av her."
            />
          ))}

        {ready && snapshot && (
          <>
            <StatRow replay={replay} open={open} />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-8">
              <div className="flex min-w-0 flex-col gap-6 lg:gap-8">
                <section aria-labelledby="failed-heading">
                  <div className="flex items-baseline gap-2">
                    <h2 id="failed-heading" className="text-lg font-semibold tracking-[-0.01em]">
                      Feilet
                    </h2>
                    <span className="text-sm text-muted tabular-nums">{failed.length}</span>
                  </div>
                  {failed.length === 0 ? (
                    <p className="mt-2 text-base text-muted">Ingen oppgaver har feilet så langt i natt.</p>
                  ) : (
                    <ol className="mt-2 divide-y divide-line rounded-md bg-surface">
                      {failed.map(({ task, reason, clock }) => (
                        <li key={task.id} className="flex flex-col gap-1 px-4 py-3">
                          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                            <span className="font-semibold">{taskName(task)}</span>
                            <span className="font-mono text-sm whitespace-nowrap text-muted tabular-nums">{clock.slice(0, 5)}</span>
                          </div>
                          {reason && <p className="text-sm text-danger">{reason}</p>}
                          {task.text && (
                            <p lang="en" className="text-sm text-muted">
                              «{task.text}»
                            </p>
                          )}
                          <span className="font-mono text-sm text-muted sm:text-xs">{task.id}</span>
                          <Link
                            href={`/hotell?t=${Math.round(task.start)}${task.room ? `&rom=${task.room}` : ""}`}
                            className="inline-flex min-h-11 items-center self-start text-sm font-semibold text-accent-text hover:underline"
                          >
                            Vis i 3D-kartet kl. {simToClock(task.start, false)}
                          </Link>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>

                <WorkOrderList orders={snapshot.workOrders} />
              </div>

              <section aria-labelledby="decisions-heading" className="min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <div className="flex items-baseline gap-2">
                    <h2 id="decisions-heading" className="text-lg font-semibold tracking-[-0.01em]">
                      Natten, steg for steg
                    </h2>
                    <span className="text-sm text-muted">siste først</span>
                  </div>
                  <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-muted">
                    <input
                      type="checkbox"
                      checked={technical}
                      onChange={(event) => setTechnical(event.currentTarget.checked)}
                      className="size-5 accent-accent"
                    />
                    Vis tekniske hendelser
                  </label>
                </div>
                <EventFeed id="decisions-list" title="" emptyText="Roboten har ikke gjort noe ennå." events={events} className="mt-1" />
              </section>
            </div>

            <section aria-labelledby="moment-heading" className="flex flex-col gap-4 border-t border-line pt-8">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="flex w-full flex-col gap-3 sm:w-auto">
                  <div>
                    <h2 id="moment-heading" className="text-lg font-semibold tracking-[-0.01em]">
                      Et øyeblikk av natten
                    </h2>
                    <p className="mt-1 text-sm text-muted">Spol i natten og se hvor roboten var. Trykk på et rom, eller velg det, for rommets natt.</p>
                  </div>
                  <RoomPicker map={replay.timeline?.map} snapshot={snapshot} value={room} onChange={chooseRoom} className="sm:max-w-xs" />
                </div>
                <TaskCard snapshot={snapshot} finished={snapshot.finished} className="w-full lg:w-[380px]" />
              </div>
              <Hotel3D replay={replay} variant="panel" selectedRoom={room} onSelectRoom={chooseRoom} />
              {room && (
                <div ref={roomCard} className="scroll-mt-4">
                  <RoomCard roomId={room} snapshot={snapshot} timeline={replay.timeline} onClose={() => setRoom(null)} />
                </div>
              )}
              <StatusLegend className="px-1 sm:hidden" />
              <Card>
                <PlaybackControls replay={replay} compact />
              </Card>
              {replay.skipped > 0 && (
                <p className="text-sm text-muted">
                  <span className="tabular-nums">{replay.skipped}</span> {replay.skipped === 1 ? "linje" : "linjer"} i loggen kunne ikke leses og er hoppet over.
                </p>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

/** "Romservice til 319", "Mobillader til 104": the task without its id. */
function taskName(task: Task): string {
  const what = task.kind === "amenity" && task.item ? capitalise(itemName(task.item)) : taskKindName(task.kind);
  return task.room ? `${what} til ${roomNumber(task.room)}` : what;
}

function capitalise(text: string): string {
  return text.charAt(0).toLocaleUpperCase("nb-NO") + text.slice(1);
}

function ShiftBadge({ replay }: { replay: HotelReplay }) {
  if (replay.live) return <Badge tone="accent">Pågår</Badge>;
  if (replay.playing) return <Badge tone="accent">Spilles av</Badge>;
  if (replay.t < replay.duration - 0.5) return <Badge tone="neutral">Pauset</Badge>;
  return <Badge tone="success">Ferdig</Badge>;
}

function Tabs({ source, onChange }: { source: ReplaySource; onChange: (source: ReplaySource) => void }) {
  const tabs: Array<{ id: ReplaySource; label: string }> = [
    { id: "demo", label: "Opptak" },
    { id: "live", label: "Direkte" },
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
            "min-h-10 rounded-sm px-4 text-sm font-semibold transition-colors duration-[120ms] ease-standard pointer-coarse:min-h-11",
            source === id ? "bg-surface text-text" : "text-muted hover:text-text",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function StatRow({ replay, open }: { replay: HotelReplay; open: number }) {
  const snapshot = replay.snapshot!;
  const low = snapshot.battery !== null && snapshot.battery < 20;
  return (
    <section role="group" aria-label="Skiftet i tall" className="border-y border-line py-5">
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Oppgaver fullført" value={snapshot.tasksDone} tone="success" />
        <Stat label={open > 0 ? `Feilet · ${open} ikke ferdig` : "Oppgaver feilet"} value={snapshot.tasksFailed} tone={snapshot.tasksFailed > 0 ? "danger" : "default"} />
        <Stat label="Avvik meldt" value={snapshot.workOrders.length} />
        <Stat label="Klokke" value={snapshot.clock} />
        <Stat label={low ? "Batteri · lavt" : "Batteri"} value={snapshot.battery === null ? "–" : Math.round(snapshot.battery)} unit={snapshot.battery === null ? undefined : "%"} tone={low ? "warning" : "default"} />
        <Stat label="Poeng" value={snapshot.score} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted">
        <dl className="flex gap-2">
          <dt>Roboten står ved</dt>
          <dd className="text-text">{placeName(snapshot.robot.node)}</dd>
        </dl>
        <details className="group">
          <summary className="cursor-pointer py-3 hover:text-text">Teknisk</summary>
          <div className="flex flex-wrap gap-x-6">
            <span>
              Skift <span className="font-mono text-sm break-all text-text sm:text-xs">{replay.shift ?? "–"}</span>
            </span>
            {replay.seed !== null && (
              <span>
                Seed <span className="font-mono text-sm text-text sm:text-xs">{replay.seed}</span>
              </span>
            )}
          </div>
        </details>
      </div>
    </section>
  );
}

function LoadingRun() {
  return (
    <div aria-busy="true" aria-label="Laster skiftet" className="flex flex-col gap-8">
      <div className="grid grid-cols-2 gap-6 border-y border-line py-5 sm:grid-cols-3 lg:grid-cols-6">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <div key={index} className="flex flex-col gap-2">
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map((index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
