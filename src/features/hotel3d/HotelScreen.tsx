"use client";

import { useEffect, useState } from "react";
import { probeViewer, type ReplaySource, resolveViewerUrl, useHotelReplay } from "@/features/replay";
import { Badge, Button, Card, cx, EmptyState, ErrorState, Skeleton, Stat } from "@/ui";
import { Hotel3D, StatusLegend } from "./Hotel3D";
import { PlaybackControls } from "./PlaybackControls";
import { EventFeed, TaskCard } from "./ReplayPanels";

/**
 * /hotell: the whole hotel in 3D with the robot's night played back. Follows the live viewer server
 * when it answers on this machine; otherwise the recorded demo night, and the screen says which.
 */
export function HotelScreen({ viewerUrl }: { viewerUrl?: string }) {
  const base = resolveViewerUrl(viewerUrl);
  const [viewerUp, setViewerUp] = useState<boolean | null>(null);
  const [source, setSource] = useState<ReplaySource>("demo");

  // Only a local app can reach the local viewer server; the deployed app never probes it.
  useEffect(() => {
    let cancelled = false;
    detectViewer(base).then((up) => {
      if (cancelled) return;
      setViewerUp(up);
      if (up) setSource("live");
    });
    return () => {
      cancelled = true;
    };
  }, [base]);

  const replay = useHotelReplay(source, { viewerUrl: base });
  const ready = replay.status === "ready";
  const snapshot = replay.snapshot;

  return (
    <main data-surface="dark" className="flex-1 bg-bg px-4 pt-8 pb-12 text-text sm:px-8 lg:px-12 lg:pt-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-extrabold tracking-[-0.03em]">Hotellet</h1>
            <SourceBadge source={source} live={replay.live} playing={replay.playing} ready={ready} seed={replay.seed} />
          </div>
          <p className="mt-2 max-w-[52ch] text-lg text-muted">Roboten i natt, rom for rom. Følg den der den går.</p>
        </div>
        {viewerUp && <SourceTabs source={source} onChange={setSource} />}
      </header>

      {replay.status === "error" && (
        <div className="mt-8 max-w-2xl">
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
        <div className="mt-8 max-w-2xl">
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
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
          <div className="flex min-w-0 flex-col gap-4">
            <Hotel3D replay={replay} variant="full" />
            <StatusLegend className="px-1 sm:hidden" />
            <Card>
              <PlaybackControls replay={replay} />
            </Card>
          </div>

          <aside className="flex min-w-0 flex-col gap-4" aria-label="Status nå">
            {ready && snapshot ? (
              <>
                <TaskCard snapshot={snapshot} finished={snapshot.finished} />
                <Card role="group" aria-label="Natten i tall">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4 lg:grid-cols-2">
                    <Stat label="Poeng" value={snapshot.score} tone="accent" />
                    <Stat label="Batteri" value={snapshot.battery === null ? "–" : Math.round(snapshot.battery)} unit={snapshot.battery === null ? undefined : "%"} />
                    <Stat label="Fullført" value={snapshot.tasksDone} tone="success" />
                    <Stat label="Feilet" value={snapshot.tasksFailed} />
                  </div>
                </Card>
                <EventFeed
                  id="recent-heading"
                  title="Nylig"
                  emptyText="Roboten har ikke gjort noe ennå."
                  events={snapshot.recent}
                  className="min-w-0"
                />
              </>
            ) : (
              <LoadingAside />
            )}
          </aside>
        </div>
      )}
      {ready && replay.skipped > 0 && (
        <p className="mt-6 text-sm text-muted">
          <span className="font-mono tabular-nums">{replay.skipped}</span> {replay.skipped === 1 ? "linje" : "linjer"} i loggen kunne
          ikke leses og er hoppet over.
        </p>
      )}
    </main>
  );
}

async function detectViewer(base: string): Promise<boolean> {
  const host = window.location.hostname;
  const local = host === "localhost" || host === "127.0.0.1" || /^(10|192\.168)\./.test(host);
  return local ? probeViewer(base) : false;
}

function SourceBadge({
  source,
  live,
  playing,
  ready,
  seed,
}: {
  source: ReplaySource;
  live: boolean;
  playing: boolean;
  ready: boolean;
  seed: number | null;
}) {
  if (!ready) return null;
  if (source === "live") return <Badge tone={live ? "danger" : "success"}>{live ? "Live · pågår" : "Live · ferdig"}</Badge>;
  return <Badge tone={playing ? "accent" : "neutral"}>{playing ? "Demo-natt · spilles av" : `Demo-natt${seed !== null ? ` · seed ${seed}` : ""}`}</Badge>;
}

function SourceTabs({ source, onChange }: { source: ReplaySource; onChange: (source: ReplaySource) => void }) {
  const tabs: Array<{ id: ReplaySource; label: string }> = [
    { id: "live", label: "Live" },
    { id: "demo", label: "Demo-natt" },
  ];
  return (
    <div role="tablist" aria-label="Kilde" className="inline-flex gap-1 rounded-md border border-line bg-surface p-1">
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

function LoadingAside() {
  return (
    <div aria-busy="true" aria-label="Laster natten" className="flex flex-col gap-4">
      <div className="rounded-lg border border-line bg-surface p-5">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-3 h-7 w-56" />
        <Skeleton className="mt-2 h-5 w-40" />
      </div>
      <div className="grid grid-cols-2 gap-6 rounded-lg border border-line bg-surface p-5">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="flex flex-col gap-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-7 w-20" />
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
