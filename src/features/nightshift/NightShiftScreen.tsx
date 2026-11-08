"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Hotel3D, StatusLegend } from "@/features/hotel3d/Hotel3D";
import { PlaybackControls } from "@/features/hotel3d/PlaybackControls";
import { EventFeed, RoomCard, TaskCard, WorkOrderList } from "@/features/hotel3d/ReplayPanels";
import { RoomPicker } from "@/features/hotel3d/RoomPicker";
import { useHeldReplay } from "@/features/hotel3d/useHeldReplay";
import { type HotelReplay, itemName, placeName, type ReplaySource, roomNumber, simToClock, type Task, taskKindName, useHotelReplay } from "@/features/replay";
import { Badge, Button, buttonClasses, Card, cx, EmptyState, ErrorState, PageHeader, RegenIcon, Skeleton, Stat } from "@/ui";
import { doneBasis, ownAgainstLog, type SelfContradiction, selfContradictions } from "./conduct";
import { forManagers } from "./eventFilter";
import { HANDED_BACK, type NightOutcomes, type OutcomeRow, outcomeRows, outcomesAt, reasonGroups, RIGHTLY_NOT_DONE } from "./outcomes";
import rmfSample from "./fixtures/open-rmf-night.json";
import { fromOpenRmf, type RmfSample, rmfTiles } from "./openRmf";
import { RobotJudgementCard } from "./RobotJudgementCard";
import type { RunLine } from "./runlog";
import { viewerBase } from "./useRun";

const MAX_EVENTS = 40;
/** The hotel-rules night (round 6): the same seed as the demo night, played live by hamad/hotelrules 70d5be4 (NS_HOTEL_RULES=1). */
export const HOTEL_RULES_RUN_URL = "/runs/hotel-rules-seed16.jsonl";

/**
 * Natteskift, the night report for the robot manager: how the night went, what failed and why
 * (first), the faults for the morning, then the log in Norwegian, with the technical events behind
 * a toggle. The hotel and the scrubber sit further down, to see a moment of the night in place.
 * A replay of the demo night, or the live shift when a viewer URL is configured.
 */
export function NightShiftScreen({ viewerUrl }: { viewerUrl?: string }) {
  const base = viewerBase(viewerUrl);
  const [source, setSource] = useState<ReplaySource>("demo");
  // Which robot log the whole page reads (round 6): the night played for points, the same night under the hotel's
  // rules, or a second producer's sample through the Open-RMF adapter. Only for the recording; Direkte is the live shift.
  const [logChoice, setLog] = useState<LogSource>("wybe");
  const log: LogSource = source === "demo" ? logChoice : "wybe";
  // The room check applied to the map and the room card (hotel3d/held.ts): 209, held back, never a green Klar.
  const replay = useHeldReplay(useHotelReplay(source, { viewerUrl: base, demoUrl: log === "hotelrules" ? HOTEL_RULES_RUN_URL : undefined }));
  const ready = replay.status === "ready";
  const snapshot = replay.snapshot;
  const [room, setRoom] = useState<string | null>(null);
  const [technical, setTechnical] = useState(false);
  const rmfLines = useMemo(() => fromOpenRmf(rmfSample as RmfSample), []);
  const rmf = log === "rmf";
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

  // How each request ended at this point of the night: the same reading Oversikt, Forespørsler and Overlevering count with.
  const verdicts = useMemo(
    () => (replay.timeline && snapshot ? outcomesAt(replay.timeline, snapshot.eventCount, snapshot.t) : null),
    [replay.timeline, snapshot],
  );
  const handedBack = useMemo(
    () => (replay.timeline && snapshot && verdicts ? outcomeRows(replay.timeline, snapshot.eventCount, verdicts.outcomes, HANDED_BACK) : []),
    [replay.timeline, snapshot, verdicts],
  );
  const rightlyNot = useMemo(
    () => (replay.timeline && snapshot && verdicts ? outcomeRows(replay.timeline, snapshot.eventCount, verdicts.outcomes, RIGHTLY_NOT_DONE) : []),
    [replay.timeline, snapshot, verdicts],
  );

  return (
    <main data-surface="dark" className="flex-1 bg-bg text-text">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-8 px-4 py-6 sm:px-6 lg:gap-10 lg:px-10 lg:py-10">
        <PageHeader
          title="Natteskift"
          meta={ready && !rmf && <ShiftBadge replay={replay} />}
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

        {source === "demo" && <LogSwitch value={log} onChange={setLog} />}

        {rmf && (
          <>
            <RmfStatRow lines={rmfLines} />
            <RobotJudgementCard lines={rmfLines} id="vurderinger-rmf" />
            <p className="text-sm text-muted">
              Open-RMF-eksempelet har ingen hotellkart og ingen avspilling, så resten av siden hører til Wybe-nettene. Velg en av dem for å se natten steg for steg.
            </p>
          </>
        )}

        {!rmf && replay.status === "loading" && <LoadingRun />}
        {!rmf && replay.status === "error" &&
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
        {!rmf && replay.status === "empty" &&
          (source === "live" ? (
            <EmptyState icon={<RegenIcon name="moon" size={32} />} title="Ingen skift ennå" body="Start et skift med agenten, så dukker det opp her." />
          ) : (
            <EmptyState
              icon={<RegenIcon name="moon" size={32} />}
              title="Opptaket er tomt"
              body="Legg inn en kjøringslogg fra roboten, så spilles skiftet av her."
            />
          ))}

        {!rmf && ready && snapshot && (
          <>
            {verdicts && <StatRow replay={replay} verdicts={verdicts} />}

            {replay.timeline && (
              <RobotJudgementCard
                key={log}
                lines={replay.timeline.lines}
                until={snapshot.t}
                asOf={snapshot.finished ? null : snapshot.clock}
              />
            )}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-8">
              <div className="flex min-w-0 flex-col gap-6 lg:gap-8">
                <section aria-labelledby="failed-heading">
                  <div className="flex items-baseline gap-2">
                    <h2 id="failed-heading" className="text-lg font-semibold tracking-[-0.01em]">
                      Trenger en person
                    </h2>
                    <span className="text-sm text-muted tabular-nums">{handedBack.length}</span>
                  </div>
                  {/* "Feilet", split by reason: what the robot could not do, apart from what it was right not to do. */}
                  {handedBack.length > 0 && (
                    <p className="mt-1 text-sm text-muted">{reasonGroups([...(verdicts?.outcomes.values() ?? [])].filter((outcome) => HANDED_BACK.has(outcome.verdict)))
                        .map((group) => `${group.label} ${group.count}`)
                        .join(" · ")}</p>
                  )}
                  {handedBack.length === 0 ? (
                    <p className="mt-2 text-base text-muted">Roboten har ikke gitt noe videre så langt i natt.</p>
                  ) : (
                    <ol className="mt-2 divide-y divide-line rounded-md bg-surface">
                      {handedBack.map((row) => (
                        <OutcomeItem key={row.request} row={row} />
                      ))}
                    </ol>
                  )}
                  {rightlyNot.length > 0 && (
                    <details className="mt-4 group">
                      <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold">
                        Avvist eller avlyst, ikke feil
                        <span className="font-normal text-muted tabular-nums">{rightlyNot.length}</span>
                      </summary>
                      <p className="text-sm text-muted">Roboten sjekket og fant ingen bestilling, eller nattsjefen avlyste. Ingen trenger å ta over disse.</p>
                      <ol className="mt-2 divide-y divide-line rounded-md bg-surface">
                        {rightlyNot.map((row) => (
                          <OutcomeItem key={row.request} row={row} />
                        ))}
                      </ol>
                    </details>
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

/** One request the robot did not finish: what, when, why in Norwegian, the guest's words, the way into the 3D map. */
function OutcomeItem({ row }: { row: OutcomeRow }) {
  return (
    <li className="flex flex-col gap-1 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-semibold">{row.task ? taskName(row.task) : "Ikke startet"}</span>
        <span className="font-mono text-sm whitespace-nowrap text-muted tabular-nums">{simToClock(row.t, false)}</span>
      </div>
      {row.reason && <p className="text-sm">{row.reason}</p>}
      {row.text && (
        <p lang="en" className="text-sm text-muted">
          «{row.text}»
        </p>
      )}
      <span className="font-mono text-sm text-muted sm:text-xs">{row.request}</span>
      <Link
        href={`/hotell?t=${Math.round(row.t)}${row.task?.room ? `&rom=${row.task.room}` : ""}`}
        className="inline-flex min-h-11 items-center self-start text-sm font-semibold text-accent-text hover:underline"
      >
        Vis i 3D-kartet kl. {simToClock(row.t, false)}
      </Link>
    </li>
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

type LogSource = "wybe" | "hotelrules" | "rmf";

const LOGS: Array<{ id: LogSource; label: string; about: string }> = [
  { id: "wybe", label: "Spillbygget", about: "Natten roboten spilte for poeng på Wybes simulator." },
  {
    id: "hotelrules",
    label: "Hotellregler",
    about: "Samme natt, live, med hotellets regler: banker på før hver inngang med nøkkelkort og flytter aldri et skilt fra et vått gulv. Bygget vi ville kjørt i et hotell.",
  },
  { id: "rmf", label: "Open-RMF (eksempel)", about: "En annen robots oppgavelogg i Open-RMF-format: testdata skrevet av teamet, ingen dommer og ingen poeng." },
];

/** Which robot log the whole page reads: the figures, the card and (for the two Wybe nights) the night itself. */
function LogSwitch({ value, onChange }: { value: LogSource; onChange: (source: LogSource) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-sm text-muted">Robotlogg</span>
        <div role="group" aria-label="Robotlogg" className="inline-flex max-w-full flex-wrap gap-0.5 rounded-sm bg-sunken p-0.5">
          {LOGS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              aria-pressed={value === id}
              onClick={() => onChange(id)}
              className={cx(
                "min-h-10 rounded-sm px-4 text-sm font-semibold transition-colors duration-[120ms] ease-standard pointer-coarse:min-h-11",
                value === id ? "bg-surface text-text" : "text-muted hover:text-text",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className="max-w-[80ch] text-sm text-muted">{LOGS.find((entry) => entry.id === value)?.about}</p>
    </div>
  );
}

/** The figures for the Open-RMF sample: tasks, what an outside signal confirmed, what is unfinished, the battery. No score. */
function RmfStatRow({ lines }: { lines: readonly RunLine[] }) {
  const tiles = useMemo(() => rmfTiles(lines), [lines]);
  return (
    <section role="group" aria-label="Skiftet i tall" className="border-y border-line py-5">
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 xl:grid-cols-6">
        <Stat label="Oppdrag fullført" value={tiles.done} unit={`av ${tiles.tasks}`} />
        <Stat label="«Ferdig» bekreftet utenfra" value={tiles.confirmed} unit={`av ${tiles.reported}`} />
        <Stat label="Robotens egen observasjon" value={tiles.robotOnly} />
        <Stat label="Ikke fullført" value={tiles.unfinished} />
        <Stat label="Siste melding" value={tiles.clock ? tiles.clock.slice(0, 5) : "–"} />
        <Stat label="Batteri" value={tiles.battery === null ? "–" : Math.round(tiles.battery)} unit={tiles.battery === null ? undefined : "%"} />
      </div>
      <p className="mt-4 text-sm text-muted">Ingen poeng: Open-RMF har ingen dommer, bare robotens egne meldinger og signalene i dem.</p>
    </section>
  );
}

/**
 * "1 motsagt av egen logg (rom 209)": why a reported "done" does not hold (round 7, data and robot-domain reviews:
 * the tile read "73 av 73 «Ferdig» bekreftet" above the card's 209). Null when every one holds.
 */
export function notHoldingLine(tally: { done: number; reported: number }, contradicted: readonly Pick<SelfContradiction, "room">[]): string | null {
  const rooms = contradicted.map((entry) => entry.room);
  const parts = [
    rooms.length > 0 ? `${rooms.length} motsagt av egen logg (rom\u00a0${rooms.length < 2 ? rooms.join("") : `${rooms.slice(0, -1).join(", ")} og ${rooms.at(-1)}`})` : null,
    tally.reported > tally.done ? `${tally.reported - tally.done} ikke godkjent av simulatoren` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function StatRow({ replay, verdicts }: { replay: HotelReplay; verdicts: NightOutcomes }) {
  const snapshot = replay.snapshot!;
  const low = snapshot.battery !== null && snapshot.battery < 20;
  const { tally } = verdicts;
  // The robot's own log against its own "done", up to the scrubber (the judgement card's rule): 209 on the demo night.
  const lines = replay.timeline?.lines;
  const contradicted = useMemo(() => (lines ? ownAgainstLog(doneBasis(lines, snapshot.t), selfContradictions(lines, snapshot.t)).contradicted : []), [lines, snapshot.t]);
  const notHolding = notHoldingLine(tally, contradicted);
  return (
    <section role="group" aria-label="Skiftet i tall" className="border-y border-line py-5">
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4 2xl:grid-cols-8">
        {/* Task state, in ink (round 7): the 73 hold one "done" the robot's own log contradicts. */}
        <Stat label="Oppdrag fullført" value={tally.done} unit={`av ${tally.total}`} />
        {/* The result: a "done" holds when the simulator credited it and the robot's own log does not contradict it. */}
        <div className="min-w-0">
          <Stat label="«Ferdig» som holder" value={tally.done - contradicted.length} unit={`av ${tally.reported}`} />
          {notHolding && <p className="mt-1 text-sm text-muted">{notHolding}</p>}
        </div>
        {/* Plain counts: the night's misses are part of its total, not an alarm. */}
        <Stat label="Ga videre til en person" value={tally.handedBack} />
        <Stat label="Avvist eller avlyst" value={tally.declined + tally.cancelled} />
        <Stat label="Avvik meldt" value={snapshot.workOrders.length} />
        <Stat label="Klokke" value={snapshot.clock} />
        <Stat label={low ? "Batteri · lavt" : "Batteri"} value={snapshot.battery === null ? "–" : Math.round(snapshot.battery)} unit={snapshot.battery === null ? undefined : "%"} />
        <Stat label="Wybe-poeng (simulering)" value={snapshot.score} />
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
