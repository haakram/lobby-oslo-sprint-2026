"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Hotel3D, StatusLegend } from "@/features/hotel3d/Hotel3D";
import { PlaybackControls } from "@/features/hotel3d/PlaybackControls";
import { EventFeed, RoomCard, TaskCard, WorkOrderList } from "@/features/hotel3d/ReplayPanels";
import { type HotelReplay, placeName, type ReplaySource, useHotelReplay } from "@/features/replay";
import { Badge, Button, buttonClasses, Card, cx, EmptyState, ErrorState, MoonIcon, Skeleton, Stat } from "@/ui";
import { viewerBase } from "./useRun";

const MAX_DECISIONS = 40;

/**
 * The robot's night shift, from run log v1: the hotel in 3D, the clock, and every decision the agent
 * took (tasks done or failed, refusals, hypotheses). A replay of the demo night, or the live shift
 * when a viewer URL is configured.
 */
export function NightShiftScreen({ viewerUrl }: { viewerUrl?: string }) {
  const base = viewerBase(viewerUrl);
  const [source, setSource] = useState<ReplaySource>("demo");
  const replay = useHotelReplay(source, { viewerUrl: base });
  const ready = replay.status === "ready";
  const snapshot = replay.snapshot;
  const [room, setRoom] = useState<string | null>(null);

  const decisions = useMemo(() => {
    if (!replay.timeline || !snapshot) return [];
    const upTo = replay.timeline.events.slice(0, snapshot.eventCount);
    const picked = [];
    for (let index = upTo.length - 1; index >= 0 && picked.length < MAX_DECISIONS; index -= 1) {
      if (upTo[index].decision) picked.push(upTo[index]);
    }
    return picked;
  }, [replay.timeline, snapshot]);

  return (
    <main data-surface="dark" className="flex-1 bg-bg px-4 pt-10 pb-12 text-text sm:px-8 lg:px-12 lg:pt-16">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-extrabold tracking-[-0.03em]">Natteskift</h1>
            {ready && <ShiftBadge replay={replay} />}
          </div>
          <p className="mt-3 max-w-[48ch] text-lg text-muted">Robotens skift i natt, steg for steg.</p>
        </div>
        <Link href="/hotell" className={buttonClasses("secondary")}>
          Åpne hotellet i 3D
        </Link>
      </header>

      {base && <Tabs source={source} onChange={setSource} />}

      <div className="mt-8">
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
            <EmptyState icon={<MoonIcon className="size-8" />} title="Ingen skift ennå" body="Start et skift med agenten, så dukker det opp her." />
          ) : (
            <EmptyState
              icon={<MoonIcon className="size-8" />}
              title="Opptaket er tomt"
              body="Legg inn en kjøringslogg fra roboten, så spilles skiftet av her."
            />
          ))}
        {ready && snapshot && (
          <>
            <StatRow replay={replay} />
            <div className="mt-6 flex flex-col gap-4">
              <Hotel3D replay={replay} variant="panel" selectedRoom={room} onSelectRoom={setRoom} />
              <StatusLegend className="px-1 sm:hidden" />
              <Card>
                <PlaybackControls replay={replay} compact />
              </Card>
            </div>
            {replay.skipped > 0 && (
              <p className="mt-4 text-sm text-muted">
                <span className="font-mono tabular-nums">{replay.skipped}</span> {replay.skipped === 1 ? "linje" : "linjer"} i loggen kunne
                ikke leses og er hoppet over.
              </p>
            )}
            <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
              <div className="flex min-w-0 flex-col gap-8">
                {room && <RoomCard roomId={room} snapshot={snapshot} timeline={replay.timeline} onClose={() => setRoom(null)} />}
                <TaskCard snapshot={snapshot} finished={snapshot.finished} />
                <WorkOrderList orders={snapshot.workOrders} />
              </div>
              <EventFeed
                id="decisions-heading"
                title="Beslutninger"
                emptyText="Roboten har ikke tatt noen valg ennå."
                events={decisions}
                className="min-w-0"
              />
            </div>
          </>
        )}
      </div>
    </main>
  );
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
    { id: "live", label: "Live" },
  ];
  return (
    <div role="tablist" aria-label="Kilde" className="mt-8 inline-flex gap-1 rounded-md border border-line bg-surface p-1">
      {tabs.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={source === id}
          onClick={() => onChange(id)}
          className={cx(
            "relative min-h-12 rounded-md px-5 text-base font-semibold transition-colors duration-150 ease-standard",
            source === id ? "bg-sunken text-text" : "text-muted hover:text-text",
          )}
        >
          {label}
          {source === id && <span aria-hidden="true" className="absolute inset-x-4 bottom-1 h-0.5 rounded-sm bg-accent" />}
        </button>
      ))}
    </div>
  );
}

function StatRow({ replay }: { replay: HotelReplay }) {
  const snapshot = replay.snapshot!;
  return (
    <Card role="group" aria-label="Skiftet i tall">
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
        <Stat label="Poeng" value={snapshot.score} tone="accent" />
        <Stat label="Klokke" value={snapshot.clock} />
        <Stat label="Oppgaver fullført" value={snapshot.tasksDone} tone="success" />
        <Stat label="Oppgaver feilet" value={snapshot.tasksFailed} />
      </div>
      <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-1 border-t border-line pt-4 text-sm text-muted">
        <div className="flex gap-2">
          <dt>Posisjon</dt>
          <dd className="text-text">{placeName(snapshot.robot.node)}</dd>
        </div>
        <div className="flex gap-2">
          <dt>Batteri</dt>
          <dd className="font-mono tabular-nums text-text">{snapshot.battery === null ? "–" : `${Math.round(snapshot.battery)} %`}</dd>
        </div>
        <div className="flex gap-2">
          <dt>Skift</dt>
          <dd className="max-w-[24ch] truncate font-mono text-text">{replay.shift ?? "–"}</dd>
        </div>
        {replay.seed !== null && (
          <div className="flex gap-2">
            <dt>Seed</dt>
            <dd className="font-mono tabular-nums text-text">{replay.seed}</dd>
          </div>
        )}
      </dl>
    </Card>
  );
}

function LoadingRun() {
  return (
    <div aria-busy="true" aria-label="Laster skiftet">
      <div className="grid grid-cols-2 gap-6 rounded-lg border border-line bg-surface p-5 sm:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="flex flex-col gap-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-7 w-24" />
          </div>
        ))}
      </div>
      <Skeleton className="mt-6 h-[300px] w-full rounded-lg" />
      <Skeleton className="mt-4 h-14 w-36" />
      <div className="mt-10 flex flex-col gap-2">
        {[0, 1, 2, 3, 4].map((index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}
