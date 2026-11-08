"use client";

import Link from "next/link";
import { PanelHead } from "@/features/modules/ModulePage";
import { Badge, type BadgeTone, Card, cx, RegenIcon, type RegenName, Stat } from "@/ui";
import {
  agoClock,
  APARTMENTS,
  type ApartmentNow,
  type ApartmentStatus,
  decimal,
  type DayTurnover,
  type HandlerKind,
  type HostDay,
  kr,
  LANG_NAME,
  percent,
  STATUS_WORD,
  type StepState,
} from "./demoData";
import { HostFigures, HostPage, longDate } from "./HostPage";
import { type HostReady, useHost } from "./HostProvider";

export const OVERVIEW_FIGURES = ["Bookinger i november", "Belegg i november", "Inntekt hittil i november", "Snittvurdering", "Timer spart", "Oppgaver gjort for deg"];

const STATUS_TONE: Record<ApartmentStatus, BadgeTone> = { klar: "success", "ny-gjest": "success", "gjest-inne": "neutral", rengjores: "neutral" };

export const HANDLER: Record<HandlerKind, { icon: RegenName; word: string; className: string }> = {
  renholder: { icon: "user", word: "Renholder", className: "text-muted" },
  // The robot keeps its orange, as everywhere in Fettero.
  robot: { icon: "agent", word: "Robot", className: "text-accent-text" },
  automatikk: { icon: "zap", word: "Automatisk", className: "text-muted" },
};

const STEP: Record<StepState, { word: string; icon: RegenName; className: string }> = {
  done: { word: "Fullført", icon: "circle-check", className: "text-success" },
  active: { word: "Pågår", icon: "clock", className: "text-text" },
  planned: { word: "Planlagt", icon: "circle-frame", className: "text-line-strong" },
};

/** One line under the title: the date and whether today is in hand. */
function summary(day: HostDay): string {
  const date = longDate(day.today);
  if (day.problems.length > 0) return `${date}. ${day.problems.length === 1 ? "Én bolig" : `${day.problems.length} boliger`} trenger deg før innsjekk.`;
  const steps = day.turnovers.flatMap((turnover) => turnover.steps);
  if (steps.length === 0) return `${date}. Ingen bytter i dag, alle gjester er på plass.`;
  if (steps.every((step) => step.state === "done")) return `${date}. Alle dagens bytter er ferdige.`;
  return `${date}. ${day.turnovers.length} bytter i dag, og alt er i rute.`;
}

/**
 * Mine boliger, the host's start page: the month's good numbers, each apartment's status now, today's
 * turnovers step by step with who handles each step, the newest guest messages and what the automation
 * has done. What needs the host is in the bell, not here.
 */
export function HostOverview() {
  const host = useHost();
  return (
    <HostPage module="vert" lede={host.kind === "ready" ? summary(host.day) : undefined} figureLabels={OVERVIEW_FIGURES}>
      {host.kind === "ready" && <Overview host={host} />}
    </HostPage>
  );
}

function Overview({ host }: { host: HostReady }) {
  const { day } = host;
  const { month } = day;
  const quiet = APARTMENTS.filter((apartment) => !day.turnovers.some((turnover) => turnover.apartment.id === apartment.id));
  return (
    <>
      <HostFigures label="Måneden i tall" six>
        <Stat label={`Bookinger i ${month.month}`} value={month.bookings} />
        <Stat label={`Belegg i ${month.month}`} value={percent(month.occupancy)} tone="success" />
        <Stat label={`Inntekt hittil i ${month.month}`} value={kr(month.earned)} unit="kr" />
        <Stat label="Snittvurdering" value={decimal(month.rating)} unit="av 5" tone="success" />
        <Stat label="Timer spart" value={month.hoursSaved} unit="t" tone="success" />
        <Stat label="Oppgaver gjort for deg" value={month.tasksDone} tone="success" />
      </HostFigures>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:items-start lg:gap-8">
        <div className="flex min-w-0 flex-col gap-6 lg:gap-8">
          <section aria-labelledby="boliger-heading" data-enter className="flex flex-col gap-3">
            <PanelHead id="boliger-heading" title="Boligene nå" count={day.apartments.length} />
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {day.apartments.map((entry) => (
                <ApartmentTile key={entry.apartment.id} entry={entry} />
              ))}
            </ul>
          </section>

          <section aria-labelledby="bytter-heading" data-enter>
            <Card className="sm:p-6">
              <PanelHead id="bytter-heading" title="Dagens bytter" note="Utsjekk, rengjøring og innsjekk, og hvem som tar hvert steg." />
              {day.turnovers.length === 0 ? (
                <p className="mt-3 text-base text-muted">Ingen bytter i dag. Alle gjestene blir der de er.</p>
              ) : (
                <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">
                  {day.turnovers.map((turnover) => (
                    <TurnoverSteps key={turnover.apartment.id} turnover={turnover} />
                  ))}
                </div>
              )}
              {quiet.length > 0 && day.turnovers.length > 0 && (
                <p className="mt-5 border-t border-line pt-3 text-sm text-muted">
                  {quiet.map((apartment) => apartment.name).join(" og ")} har ingen bytter i dag.
                </p>
              )}
            </Card>
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-6 lg:gap-8">
          <MessagesPeek host={host} />
          <AutomationLog day={day} />
        </div>
      </div>
    </>
  );
}

function ApartmentTile({ entry }: { entry: ApartmentNow }) {
  return (
    <li data-tile>
      <Card className="flex h-full flex-col gap-3 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold">{entry.apartment.name}</h3>
            <p className="text-sm text-muted">
              <span className="whitespace-nowrap">{entry.apartment.area}</span> · <span className="whitespace-nowrap">{entry.apartment.layout}</span>
            </p>
          </div>
          <Badge tone={STATUS_TONE[entry.status]}>{STATUS_WORD[entry.status]}</Badge>
        </div>
        <p className="text-sm">{entry.line}</p>
        {entry.guards.length > 0 && (
          <ul aria-label="Klart til innsjekk" className="mt-auto flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3">
            {entry.guards.map((guard) => (
              <li key={guard.id} className={cx("inline-flex items-center gap-1.5 text-sm", !guard.ok ? "font-semibold text-danger" : guard.pending ? "text-muted" : "text-success")}>
                <RegenIcon name={!guard.ok ? "alert-triangle" : guard.pending ? "clock" : "circle-check"} size={16} />
                {guard.word}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </li>
  );
}

function TurnoverSteps({ turnover }: { turnover: DayTurnover }) {
  const done = turnover.steps.filter((step) => step.state === "done").length;
  const headingId = `bytte-${turnover.apartment.id}`;
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 id={headingId} className="font-semibold">
          {turnover.apartment.name}
        </h3>
        <span className="text-sm text-muted tabular-nums">
          {done} av {turnover.steps.length} ferdig
        </span>
      </div>
      <ol aria-labelledby={headingId} className="mt-3">
        {turnover.steps.map((step, index) => {
          const look = STEP[step.state];
          const handler = HANDLER[step.handler.kind];
          const last = index === turnover.steps.length - 1;
          return (
            <li key={step.id} className="grid grid-cols-[44px_20px_minmax(0,1fr)] gap-x-3">
              <span className="pt-px font-mono text-xs leading-5 whitespace-nowrap text-muted tabular-nums">{step.at}</span>
              <span className="flex flex-col items-center">
                <RegenIcon name={look.icon} size={20} className={cx("shrink-0", look.className)} />
                {!last && <span aria-hidden="true" className={cx("mt-1 w-px flex-1", step.state === "done" ? "bg-success" : "bg-line")} />}
              </span>
              <div className={cx("min-w-0", !last && "pb-4")}>
                <p className="flex flex-wrap items-baseline gap-x-2 leading-5">
                  <span className="font-semibold">{step.title}</span>
                  <span className={cx("text-xs", step.state === "done" ? "text-success" : step.state === "active" ? "font-semibold" : "text-muted")}>{look.word}</span>
                </p>
                <p className="mt-0.5 text-sm text-muted">{step.text[step.state]}</p>
                <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted">
                  <RegenIcon name={handler.icon} size={14} className={handler.className} />
                  <span>
                    {handler.word} · {step.handler.name}
                  </span>
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function MessagesPeek({ host }: { host: HostReady }) {
  const { day } = host;
  const threads = [...day.threads].sort((a, b) => a.minutesAgo - b.minutesAgo).slice(0, 3);
  const auto = day.threads.filter((thread) => thread.reply.kind === "auto").length;
  return (
    <section aria-labelledby="meldinger-heading" data-enter>
      <Card className="sm:p-6">
        <PanelHead
          id="meldinger-heading"
          title="Gjestemeldinger"
          action={
            <Link href="/vert/meldinger" className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-text hover:underline">
              Åpne
            </Link>
          }
        />
        <p className="text-sm text-muted">
          {auto} av {day.threads.length} svart automatisk siste døgn.
        </p>
        <ul className="mt-2 divide-y divide-line">
          {threads.map((thread) => {
            const apartment = APARTMENTS.find((entry) => entry.id === thread.apartment)!;
            const answered = thread.reply.kind === "auto" || host.lateCheckout !== null;
            return (
              <li key={thread.id} className="flex flex-col gap-1 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate font-semibold">
                    {thread.guest}
                    <span className="font-normal text-muted"> · {apartment.area}</span>
                  </span>
                  <span className="text-sm whitespace-nowrap text-muted tabular-nums">{agoClock(thread.minutesAgo, day.minute)}</span>
                </div>
                <p className="line-clamp-2 text-sm">{thread.text}</p>
                <div className="flex flex-wrap items-center gap-2">
                  {thread.reply.kind === "auto" ? <Badge tone="success">Svart automatisk</Badge> : answered ? <Badge tone="success">Besvart</Badge> : <Badge>Venter på deg</Badge>}
                  {thread.lang !== "nb" && <span className="text-xs text-muted">Oversatt fra {LANG_NAME[thread.lang]}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}

const LOG_SHOWN = 6;

function AutomationLog({ day }: { day: HostDay }) {
  const shown = day.log.slice(0, LOG_SHOWN);
  return (
    <section aria-labelledby="ordnet-heading" data-enter>
      <Card className="sm:p-6">
        <PanelHead id="ordnet-heading" title="Ordnet for deg" count={day.log.length} note="Siste døgn" />
        {shown.length === 0 ? (
          <p className="mt-3 text-base text-muted">Ingenting å gjøre ennå i dag. Fettero fører det opp her når det skjer.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {shown.map((entry) => {
              const handler = HANDLER[entry.kind];
              const area = entry.apartment ? APARTMENTS.find((apartment) => apartment.id === entry.apartment)?.area : null;
              return (
                <li key={entry.id} className="grid grid-cols-[20px_minmax(0,1fr)_auto] items-start gap-x-3 py-2.5 text-sm">
                  <RegenIcon name={handler.icon} size={16} className={cx("mt-0.5", handler.className)} />
                  <span className="min-w-0">
                    {entry.text}
                    {area && <span className="text-muted"> · {area}</span>}
                  </span>
                  <span className="whitespace-nowrap text-muted tabular-nums">{agoClock(entry.minutesAgo, day.minute)}</span>
                </li>
              );
            })}
          </ul>
        )}
        {day.log.length > LOG_SHOWN && <p className="mt-2 text-sm text-muted">og {day.log.length - LOG_SHOWN} til</p>}
      </Card>
    </section>
  );
}
