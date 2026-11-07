"use client";

import Link from "next/link";
import { useRef } from "react";
import { Hotel3D, StatusLegend } from "@/features/hotel3d/Hotel3D";
import { PlaybackControls } from "@/features/hotel3d/PlaybackControls";
import { WorkOrderList } from "@/features/hotel3d/ReplayPanels";
import { itemName, placeName, useHotelReplay } from "@/features/replay";
import { Badge, Button, buttonClasses, Card, EmptyState, ErrorState, PageHeader, RegenIcon, type RegenName, Skeleton, Stat } from "@/ui";
import { useEntrance } from "./useEntrance";

const NEXT: Array<{ href: string; label: string; hint: string; icon: RegenName }> = [
  { href: "/hotell", label: "3D-kart", hint: "Gå rundt i hotellet og følg roboten", icon: "cube" },
  { href: "/natteskift", label: "Natteskift", hint: "Hver beslutning i natt, steg for steg", icon: "moon" },
  { href: "/oyne", label: "Øyne", hint: "Det roboten ser og kjenner igjen", icon: "eye" },
  { href: "/stemme", label: "Stemme", hint: "Snakk med gjester gjennom roboten", icon: "mic" },
];

/**
 * The robot manager's desk on `/`: the robot now (its task, place, battery, what it carries) set
 * large, the hotel in 3D with the night's replay, tonight's figures and faults, and the way into
 * the robot's own screens.
 */
export function RobotDesk({ viewerUrl }: { viewerUrl?: string }) {
  const replay = useHotelReplay("demo", { viewerUrl });
  const ready = replay.status === "ready";
  const snapshot = replay.snapshot;
  const scope = useRef<HTMLDivElement>(null);
  useEntrance(scope, ready);

  const robot = snapshot?.robot ?? null;
  const task = robot?.task ?? null;
  const headline = !snapshot
    ? null
    : task
      ? task.title.replace(/^[^·]+·\s*/, "")
      : snapshot.finished
        ? "Skiftet er ferdig"
        : robot?.node === "charging-dock"
          ? "Lader"
          : "Ledig";
  const state = !snapshot
    ? null
    : replay.live
      ? { word: "Pågår", tone: "accent" as const }
      : task
        ? { word: "Jobber", tone: "accent" as const }
        : snapshot.finished
          ? { word: "Skift slutt", tone: "neutral" as const }
          : { word: "Ledig", tone: "success" as const };

  return (
    <main className="flex-1">
      <div ref={scope} className="mx-auto flex w-full max-w-[1600px] flex-col gap-8 px-4 py-6 sm:px-6 lg:gap-10 lg:px-10 lg:py-10">
        <PageHeader
          title="Roboten"
          meta={state && <Badge tone={state.tone}>{state.word}</Badge>}
          lede="Hva roboten gjør nå, hvor den er, og hvordan natten gikk."
          actions={
            <Link href="/hotell" className={buttonClasses("primary")}>
              Åpne 3D-kart
            </Link>
          }
        />

        {replay.status === "error" && (
          <ErrorState
            title="Fikk ikke lastet natten"
            body="Kjøringsloggen svarte ikke, så roboten og hotellet vises ikke. Sjekk nettet og prøv igjen."
            action={
              <Button variant="secondary" onClick={replay.retry}>
                Prøv igjen
              </Button>
            }
          />
        )}
        {replay.status === "empty" && (
          <EmptyState title="Ingen natt å vise ennå" body="Når roboten har gått et skift, vises oppgavene, hotellet og avvikene her." />
        )}

        {(replay.status === "loading" || ready) && (
          <>
            <section aria-labelledby="now-heading" data-enter className="border-y border-line py-6">
              <h2 id="now-heading" className="text-xs font-medium text-muted">
                Nå
              </h2>
              {snapshot && robot ? (
                <>
                  <p className="mt-2 font-display text-2xl leading-tight font-medium tracking-[-0.01em] sm:text-3xl">{headline}</p>
                  {task?.text && (
                    <p lang="en" className="mt-2 max-w-[64ch] text-base text-muted">
                      «{task.text}»
                    </p>
                  )}
                  <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3 text-base">
                    <div className="flex gap-2">
                      <dt className="text-muted">Sted</dt>
                      <dd className="font-semibold">{placeName(robot.node)}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-muted">Batteri</dt>
                      <dd className="font-semibold tabular-nums">{snapshot.battery === null ? "–" : `${Math.round(snapshot.battery)} %`}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-muted">Klokka</dt>
                      <dd className="font-semibold tabular-nums">{snapshot.clock.slice(0, 5)}</dd>
                    </div>
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <dt className="text-muted">Har med</dt>
                      <dd className="flex flex-wrap gap-1.5">
                        {robot.carrying.length === 0 ? (
                          <span className="text-muted">ingenting</span>
                        ) : (
                          robot.carrying.map((item, index) => (
                            <Badge key={`${item}-${index}`} tone="neutral">
                              {itemName(item)}
                            </Badge>
                          ))
                        )}
                        {robot.cart && <Badge tone="neutral">renholdsvogn</Badge>}
                      </dd>
                    </div>
                  </dl>
                </>
              ) : (
                <div className="mt-2 flex flex-col gap-3">
                  <Skeleton className="h-11 w-2/3 max-w-md" />
                  <Skeleton className="h-5 w-1/2 max-w-sm" />
                </div>
              )}
            </section>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:items-start lg:gap-8">
              <div className="flex min-w-0 flex-col gap-4">
                <Hotel3D replay={replay} variant="full" />
                <StatusLegend className="px-1 sm:hidden" />
                <Card>
                  <PlaybackControls replay={replay} compact />
                </Card>
              </div>

              <aside className="flex min-w-0 flex-col gap-6" aria-label="Natten">
                <section aria-label="Natten i tall" data-enter>
                  <Card>
                    {snapshot ? (
                      <div className="grid grid-cols-2 gap-x-6 gap-y-5">
                        <Stat label="Oppgaver fullført" value={snapshot.tasksDone} tone="success" />
                        <Stat label="Oppgaver feilet" value={snapshot.tasksFailed} tone={snapshot.tasksFailed > 0 ? "danger" : "default"} />
                        <Stat label="Poeng" value={snapshot.score} />
                        <Stat label="Åpne avvik" value={snapshot.workOrders.length} />
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-6">
                        {[0, 1, 2, 3].map((i) => (
                          <div key={i} className="flex flex-col gap-2">
                            <Skeleton className="h-8 w-16" />
                            <Skeleton className="h-4 w-24" />
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                </section>

                {snapshot && (
                  <div data-enter>
                    <WorkOrderList orders={snapshot.workOrders} />
                  </div>
                )}

                <section aria-labelledby="next-heading" data-enter>
                  <h2 id="next-heading" className="text-lg font-semibold tracking-[-0.01em]">
                    Robotens skjermer
                  </h2>
                  <ul className="mt-3 flex flex-col divide-y divide-line rounded-md bg-surface">
                    {NEXT.map((item) => (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className="flex min-h-14 items-center gap-3 px-4 py-2 transition-colors duration-[120ms] ease-standard hover:bg-sunken focus-visible:outline-offset-[-2px]"
                        >
                          <RegenIcon name={item.icon} size={22} className="shrink-0 text-accent-text" />
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="font-semibold">{item.label}</span>
                            <span className="text-sm text-muted">{item.hint}</span>
                          </span>
                          <RegenIcon name="chevron-right" size={18} className="shrink-0 text-muted" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              </aside>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
