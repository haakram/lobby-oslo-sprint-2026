"use client";

import Link from "next/link";
import { useReducedMotion } from "motion/react";
import { useId, useMemo, useRef, useState } from "react";
import { Badge, Button, buttonClasses, Card, cx, EmptyState, ErrorState, RegenIcon, Skeleton, Stat } from "@/ui";
import { placeLabel, type HotelGraph } from "./hotelMap";
import { HotelPlan, type PlanTrace } from "./HotelPlan";
import { roomStatusAt, type RoomReport } from "./nightRooms";
import { robotWalk, taskKindLabel, totalsByKind, type RobotTask } from "./robotWalk";
import type { NightLog } from "./useNightLog";

const nb = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 });
const NO_STATUSES: ReadonlyMap<string, RoomReport> = new Map();

const OUTCOME: Record<RobotTask["outcome"], { label: string; tone: "success" | "danger" | "neutral" }> = {
  done: { label: "Utført", tone: "success" },
  failed: { label: "Feilet", tone: "danger" },
  open: { label: "Ikke ferdig", tone: "neutral" },
};

function rides(n: number): string {
  return `${n} ${n === 1 ? "heistur" : "heisturer"}`;
}

function Loading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Henter nattens logg">
      <Card className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4 sm:p-5">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </Card>
      <Card className="p-4 sm:p-5">
        <Skeleton className="aspect-[94/29] w-full" />
      </Card>
      <Card className="flex flex-col gap-3 p-4 sm:p-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </Card>
    </div>
  );
}

/** Robot: where the robot walked tonight, the whole night or one task, and where the metres went. */
export function RobotMode({ map, log }: { map: HotelGraph; log: NightLog }) {
  const reduced = useReducedMotion();
  const selectId = useId();
  const mapCard = useRef<HTMLDivElement>(null);
  const night = useMemo(() => (log.status === "ready" ? robotWalk(log.lines, map) : null), [log.status, log.lines, map]);
  const statuses = useMemo(() => (log.status === "ready" ? roomStatusAt(log.lines) : NO_STATUSES), [log.status, log.lines]);
  const [picked, setPicked] = useState<string | null>(null);
  const [drawToken, setDrawToken] = useState(0);

  const trace = useMemo<PlanTrace[]>(() => {
    if (!night) return [];
    const counts = new Map<string, PlanTrace>();
    for (const m of night.moves) {
      if (m.ride) continue;
      const [from, to] = [m.from, m.to].sort();
      const key = `${from}|${to}`;
      const known = counts.get(key);
      if (known) known.count += 1;
      else counts.set(key, { from, to, count: 1 });
    }
    return [...counts.values()];
  }, [night]);

  if (log.status === "loading") return <Loading />;
  if (log.status === "error") {
    return (
      <Card className="p-4 sm:p-5">
        <ErrorState
          title="Fikk ikke lest nattens logg"
          body="Uten loggen vet vi ikke hvor roboten gikk. Sjekk nettet og prøv igjen."
          action={
            <Button variant="secondary" onClick={log.retry}>
              Prøv igjen
            </Button>
          }
        />
      </Card>
    );
  }
  if (!night || night.moves.length === 0) {
    return (
      <Card className="p-4 sm:p-5">
        <EmptyState
          icon={<RegenIcon name="agent" size={32} />}
          title="Roboten har ikke gått noen steder ennå"
          body="Når natteskiftet er i gang, ser du veien den gikk her."
          action={
            <Link href="/natteskift" className={buttonClasses("primary")}>
              Åpne Natteskift
            </Link>
          }
        />
      </Card>
    );
  }

  const task = night.tasks.find((t) => t.request === picked) ?? null;
  const done = night.tasks.filter((t) => t.outcome === "done").length;
  const kinds = totalsByKind(night.tasks);
  const maxKind = Math.max(1, ...kinds.map((k) => k.metres));

  const pick = (request: string | null, scroll = false) => {
    setPicked(request);
    setDrawToken((t) => t + 1);
    if (scroll) mapCard.current?.scrollIntoView?.({ block: "start", behavior: reduced ? "auto" : "smooth" });
  };

  const taskMoves = task ? night.moves.filter((m) => m.request === task.request) : [];

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      {night.offMap.length > 0 && (
        <p role="status" className="rounded-md border-l-4 border-warning bg-warning-soft px-4 py-3 text-base text-warning">
          Roboten var i {night.offMap.length === 1 ? "et rom" : `${night.offMap.length} rom`} som ikke finnes på kartet for i
          natt: {night.offMap.map((id) => placeLabel(id)).join(", ")}. Metrene dit er talt med, men veien er ikke tegnet.
        </p>
      )}

      <section aria-label="Natten i tall">
        <Card className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4 sm:p-5">
          <Stat label="Gått i natt" value={nb.format(night.metres)} unit="m" />
          <Stat label="Heisturer" value={night.rides} />
          <Stat label="Oppgaver utført" value={done} unit={`av ${night.tasks.length}`} />
          <Stat label="Mellom oppgaver" value={nb.format(night.between.metres)} unit="m" />
        </Card>
      </section>

      <div ref={mapCard} className="scroll-mt-4">
        <Card className="p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-xl font-semibold tracking-tight">
                {task ? `${task.request} · ${taskKindLabel(task.kind)}` : "Hele natten"}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {task ? (
                  <>
                    {task.room ? `${placeLabel(task.room)} · ` : ""}
                    <span className="font-mono whitespace-nowrap text-text tabular-nums">{nb.format(task.metres)} m</span> ·{" "}
                    {rides(task.rides)}
                    {task.minutes !== null && (
                      <>
                        {" · "}
                        <span className="font-mono whitespace-nowrap tabular-nums">{task.minutes}</span> min
                      </>
                    )}
                    {task.start && ` · fra ${task.start.slice(0, 5)}`}
                  </>
                ) : (
                  "Tykkere strek der roboten gikk oftere."
                )}
              </p>
            </div>
            <div className="flex w-full flex-col gap-1 sm:w-auto">
              <label htmlFor={selectId} className="text-sm text-muted">
                Vis
              </label>
              <select
                id={selectId}
                value={picked ?? ""}
                onChange={(e) => pick(e.target.value || null)}
                className="min-h-12 w-full rounded-md border border-line-strong bg-surface px-3 text-base sm:w-80"
              >
                <option value="">Hele natten</option>
                {night.tasks.map((t) => (
                  <option key={t.request} value={t.request}>
                    {t.request} · {taskKindLabel(t.kind)}
                    {t.room ? ` · ${placeLabel(t.room)}` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <HotelPlan
            map={map}
            label={task ? `Hotellkart med veien for ${task.request}` : "Hotellkart med veien roboten gikk i natt"}
            statuses={statuses}
            route={taskMoves.map((m) => [m.from, m.to])}
            start={task ? (task.path[0] ?? null) : null}
            trace={task ? [] : trace}
            selected={task?.room ? new Set([task.room]) : undefined}
            drawToken={drawToken}
            legend={
              <li className="flex items-center gap-2">
                <span aria-hidden="true" className="h-1 w-6 rounded-full bg-accent" />
                {task ? "Veien for oppgaven" : "Veien i natt"}
              </li>
            }
          />
        </Card>
      </div>

      <div className="grid gap-4 lg:gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] xl:items-start">
        <Card className="p-4 sm:p-5">
          <h2 className="text-xl font-semibold tracking-tight">Hvor metrene gikk</h2>
          <table className="mt-3 w-full text-left text-sm">
            <caption className="sr-only">Meter, oppgaver og heisturer per type oppgave</caption>
            <thead className="text-muted">
              <tr className="border-b border-line">
                <th scope="col" className="py-2 pr-3 font-medium">Type</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">Antall</th>
                <th scope="col" className="w-2/5 py-2 pr-3 font-medium">Meter</th>
                <th scope="col" className="hidden py-2 text-right font-medium sm:table-cell">Heisturer</th>
              </tr>
            </thead>
            <tbody>
              {kinds.map((k) => (
                <tr key={k.kind} className="border-b border-line last:border-b-0">
                  <th scope="row" className="py-2 pr-3 text-base font-semibold">
                    {k.label}
                    <span className="block text-sm font-normal text-muted sm:hidden">{rides(k.rides)}</span>
                  </th>
                  <td className="py-2 pr-3 text-right font-mono tabular-nums">{k.tasks}</td>
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      <span className="h-2 min-w-0 flex-1 rounded-sm bg-sunken">
                        <span className="block h-full rounded-sm bg-line-strong" style={{ width: `${(k.metres / maxKind) * 100}%` }} />
                      </span>
                      <span className="w-14 shrink-0 text-right font-mono whitespace-nowrap tabular-nums">{nb.format(k.metres)}</span>
                    </div>
                  </td>
                  <td className="hidden py-2 text-right font-mono tabular-nums sm:table-cell">{k.rides}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-semibold tracking-tight">Oppgavene i natt</h2>
            {task && (
              <Button variant="ghost" className="text-sm" onClick={() => pick(null, true)}>
                Vis hele natten
              </Button>
            )}
          </div>
          <ol aria-label="Oppgavene i natt" className="mt-2 max-h-[30rem] overflow-y-auto">
            {night.tasks.map((t) => {
              const on = t.request === picked;
              return (
                <li key={t.request} className="border-b border-line last:border-b-0">
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => pick(on ? null : t.request, true)}
                    className={cx(
                      "grid min-h-12 w-full grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 rounded-md px-2 py-2 text-left",
                      "sm:flex",
                      "transition-colors duration-150 ease-standard",
                      on ? "bg-accent-soft" : "hover:bg-sunken",
                    )}
                  >
                    <span className="shrink-0 font-mono text-sm tabular-nums sm:w-14">{t.request}</span>
                    <span className="min-w-0 flex-1 text-base">
                      {taskKindLabel(t.kind)}
                      {t.room && <span className="text-muted"> · {placeLabel(t.room)}</span>}
                    </span>
                    <span className="col-start-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-sm whitespace-nowrap text-muted">
                        <span className="font-mono text-text tabular-nums">{nb.format(t.metres)} m</span>
                        {t.rides > 0 && ` · ${rides(t.rides)}`}
                      </span>
                      <Badge tone={OUTCOME[t.outcome].tone}>{OUTCOME[t.outcome].label}</Badge>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </Card>
      </div>
    </div>
  );
}
