"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { canAccess, useSession } from "@/features/auth";
import { formatKroner, nightLabel } from "@/features/dashboard/format";
import { declineShort, nightFacts, robotShort } from "@/features/dashboard/highlights";
import { doneBasis, selfContradictions } from "@/features/nightshift/conduct";
import { type DeclineSplit, declineSplit } from "@/features/nightshift/declines";
import { useNight } from "@/features/dashboard/useNight";
import { useOrderStatuses } from "@/features/dashboard/useOrderStatuses";
import { FigureRow, ModulePage, PanelHead } from "@/features/modules/ModulePage";
import { RobotJudgementCard } from "@/features/nightshift/RobotJudgementCard";
import { SourceNote } from "@/features/modules/SourceNote";
import { osloToday } from "@/features/reception/dates";
import { type DemoCall, demoCalls } from "@/features/reception/demoCalls";
import { formatClock } from "@/features/reception/format";
import { useStoredRecords } from "@/features/reception/useStoredRecords";
import { PHONE_ASSIGNMENTS, phoneTasks } from "@/features/requests/phoneTasks";
import { hotelRoomsOf, selectRequests } from "@/features/requests/select";
import { hoursEarlier, moneyMethod, releasedLine, tonightLine } from "@/features/rooms/money";
import { PILOT_EVIDENCE, PMS_IS_TEST_DATA, TEST_BOOKING_LABEL, TEST_BOOKING_WORD } from "@/features/rooms/pms";
import type { Contradiction, RoomCheckMark } from "@/features/rooms/reconcile";
import { SellSteps } from "@/features/rooms/SellSteps";
import { useRoomCheck } from "@/features/rooms/useRoomCheck";
import { HOTEL_NAME } from "@/ui/AppNav";
import { APP_NAME, TAGLINE } from "@/ui/brand";
import { actionStamp, relativeTime, stampNow, useNowMs } from "@/ui/stamp";
import { Badge, Button, Card, cx, EmptyState, ErrorState, Figure as Digits, Monogram, RegenIcon, Skeleton, Stat } from "@/ui";
import { robotAtHandover } from "./robotState";
import { nightSafety } from "./safety";
import { composeHandover, type Figures, type Highlight, itemAnchor, nightSourceLine, type OpenItem, openCount } from "./select";
import { sign, SIGNOFFS } from "./signoff";

const BY: Record<Highlight["by"], { word: string; tone: "accent" | "neutral" }> = {
  robot: { word: "Roboten", tone: "accent" },
  ai: { word: "AI-resepsjonisten", tone: "neutral" },
  staff: { word: "Personalet", tone: "neutral" },
};

/**
 * Overlevering 06:00: the night on one page for the morning manager, read in the order she works
 * (jury round 3, the product juror/the creative juror/the design juror: act → evidence → sign). Four decision figures (the room the
 * room check held back, the money, the safety items, the robot's night); *Åpent nå* in the wide column,
 * safety first, then the room check's catch and sale; what happened, folded, beside it; the robot's
 * judgement card; *Kvitter mottatt* last. The proof (the referee, the simulator) sits behind *Slik vet vi
 * det*. Prints as one A4 leave-behind with a Fettero masthead.
 *
 * Round 4 (the product juror, the design juror, the creative juror): each top figure jumps to its row; the money step is the page's one
 * orange action (and *Kvitter mottatt* takes the orange once no room waits for it); the other links are
 * quiet ink; the test-data chips are one quiet demo band under the header.
 */
export function HandoverScreen({ viewerUrl, demo, today: day }: { viewerUrl?: string; demo?: readonly DemoCall[]; today?: string }) {
  const today = day ?? osloToday();
  const { resolved, statusOf } = useOrderStatuses();
  const { run, night, rooms, map } = useNight(viewerUrl, resolved);
  // Tonight's rooms: a call naming a room the hotel doesn't have is "Ukjent rom", never "Gjest venter" here.
  const hotelRooms = useMemo(() => hotelRoomsOf(map, Boolean(night?.ended)), [map, night]);
  const { user, effectiveRole } = useSession();
  const { records } = useStoredRecords();
  const seeded = useMemo(() => demo ?? demoCalls(today), [demo, today]);
  const phone = useMemo(() => phoneTasks(records, seeded), [records, seeded]);
  const assignments = PHONE_ASSIGNMENTS.use();
  const signoff = SIGNOFFS.use()[today] ?? null;
  const now = useNowMs();
  const ready = run.status === "ready";
  const lines = ready ? run.lines : null;
  // The same room check, marks and money as Rom and Oversikt: a release here moves them too.
  const { reconciliation, marks, revenue, pms } = useRoomCheck(lines, rooms, today);
  const safety = useMemo(() => (lines ? nightSafety(lines) : null), [lines]);
  const robotState = useMemo(() => (lines ? robotAtHandover(lines) : null), [lines]);
  const declines = useMemo(() => (lines ? declineSplit(lines) : null), [lines]);
  // What each "done" rested on, the same reading as Oversikt's line (owner C): one number per fact.
  const basis = useMemo(() => (lines ? doneBasis(lines) : null), [lines]);
  const contradictions = useMemo(() => (lines ? selfContradictions(lines) : null), [lines]);
  const [wholeNight, setWholeNight] = useState(false);

  const handover = useMemo(() => {
    if (!night || !rooms || !reconciliation || !safety) return null;
    const requests = selectRequests({
      night,
      calls: null,
      statusOf,
      phone,
      assignments,
      hotelRooms,
    });
    return composeHandover({
      night,
      rooms,
      reconciliation,
      marks,
      requests,
      phone,
      revenue,
      today,
      pms,
      safety,
      robot: robotState,
      resolved: (id) => statusOf(id) === "lost",
      canOpen: (route) => effectiveRole === null || canAccess(effectiveRole, route),
    });
  }, [night, rooms, reconciliation, safety, robotState, statusOf, phone, assignments, hotelRooms, marks, revenue, today, pms, effectiveRole]);

  const signButton = useRef<HTMLDivElement>(null);
  const refocus = useRef(false);
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    signButton.current?.querySelector("button")?.focus();
  }, [signoff]);
  const setSigned = (value: boolean) => {
    refocus.current = true;
    sign(
      today,
      value
        ? {
            name: user?.name ?? "Morgenvakten",
            at: formatClock(new Date().toISOString()),
            stamp: stampNow(),
            open: handover ? openCount(handover.open) : undefined,
          }
        : null,
    );
  };

  if (run.status === "error" || run.status === "empty") {
    return (
      <ModulePage module="overlevering">
        <Card className="sm:p-6">
          {run.status === "error" ? (
            <ErrorState
              title="Fikk ikke lastet natten"
              body="Overleveringen bygges fra robotens natt. Sjekk nettet og prøv igjen."
              action={
                <Button variant="secondary" onClick={run.retry}>
                  Prøv igjen
                </Button>
              }
            />
          ) : (
            <EmptyState title="Ingen natt å overlevere ennå" body="Når nattevakten og roboten har jobbet, står natten oppsummert her til kl. 06:00." />
          )}
        </Card>
      </ModulePage>
    );
  }

  const label = night ? nightLabel(night.startedAt) : null;
  const figures = handover?.figures;
  const facts = figures
    ? nightFacts({
        confirmed: figures.robot.done,
        wetFloors: figures.safety.wetFloors,
        stranger: figures.safety.stranger,
        basis: basis ?? undefined,
        contradictions: contradictions ?? undefined,
      })
    : null;
  const signedWhen = signoff ? relativeTime(signoff.stamp, now) : null;
  const timeline = handover?.timeline ?? [];
  const open = handover?.open ?? [];
  // Each top figure jumps to its row (jury round 4, the product juror/the design juror): the presenter taps, never hunts for a scroll.
  const anchors = {
    held: open.find((item) => item.caught)?.id,
    money: open.find((item) => item.sell)?.id,
    safety: open.find((item) => item.safety)?.id,
  };
  // One orange action at a time: the money step while a room waits for it, then the signature.
  const sellWaiting = (figures?.money.toSell.length ?? 0) > 0;
  const bookingRows = open.some((item) => item.booking);

  return (
    <ModulePage
      module="overlevering"
      ready={handover !== null}
      className="print:gap-3 print:p-0"
      lede="Det som trenger deg først, så bevisene fra natten, og kvitteringen til slutt."
      meta={signoff ? <Badge tone="success">Kvittert{signedWhen ? ` ${signedWhen}` : ""}</Badge> : <Badge tone="neutral">Ikke kvittert ennå</Badge>}
      actions={
        <Button variant="secondary" className="print:hidden max-sm:hidden" onClick={() => window.print()} disabled={!handover}>
          <RegenIcon name="printer" size={20} />
          Skriv ut
        </Button>
      }
    >
      {/* The printed page is the leave-behind a hotel keeps (jury round 3, the creative juror): a Fettero masthead on top. */}
      <header data-print-masthead className="hidden border-b border-line pb-2 print:order-first print:flex print:items-baseline print:justify-between print:gap-4">
        <p className="flex shrink-0 items-baseline gap-3">
          <span className="text-xl font-bold tracking-[-0.02em]">{APP_NAME}</span>
          <span className="text-sm whitespace-nowrap">{TAGLINE}</span>
        </p>
        <p className="text-xs text-muted">
          {HOTEL_NAME} · Overlevering 06:00{label ? ` · ${label}` : ""}
        </p>
      </header>

      <div className="-mt-2 flex flex-col gap-1 lg:-mt-4 print:mt-0">
        {/* A div, not a p: the label's skeleton is a div while the night loads. */}
        <div className="text-sm text-muted print:hidden">
          {label ?? <Skeleton className="inline-block h-4 w-48 align-middle" />} · 22:00 til 06:00 · Vakt: roboten og {handover?.note.author ?? "nattevakten"}
        </div>
        {/* The night in one factual line: green only for what is done, the rest says plainly what needs a person. */}
        {facts && (
          <p className="text-base sm:text-lg print:hidden">
            <span className="font-semibold text-success">
              <RegenIcon name="circle-check" size={20} strokeWidth={2} className="mr-1.5 inline-block align-[-0.2em]" />
              {facts.done}
            </span>
            {facts.basis && <span className="text-muted"> ({facts.basis})</span>}
            {facts.attention && <span className="font-semibold"> · {facts.attention}</span>}
          </p>
        )}
      </div>

      {/* The test data said once, quietly, for the whole page (jury round 4, the creative juror): never a mono chip on the money row. */}
      {ready && run.lines.length > 0 && (
        <p data-demo-band className="-mt-2 flex items-start gap-2 rounded-md bg-sunken px-3 py-2 text-sm text-muted lg:-mt-4 print:mt-0 print:bg-transparent print:p-0 print:text-xs">
          <RegenIcon name="info-circle" size={18} className="mt-0.5 shrink-0 print:hidden" />
          <span>
            Demo: {nightSourceLine(run.lines)}.
            {PMS_IS_TEST_DATA && bookingRows ? ` ${TEST_BOOKING_LABEL}, merket «${TEST_BOOKING_WORD}».` : ""} {PILOT_EVIDENCE}
          </span>
        </p>
      )}

      {/* On paper the figures' rule sits tighter, so the page fits one sheet. */}
      <div className="contents print:block print:[&>section>div]:py-2">
      <FigureRow label="Natten i tall">
        {figures && figures.money.caught.length > 0 && <HeldFigure figures={figures} contradicted={reconciliation?.contradicted ?? []} to={anchors.held} />}
        <MoneyFigure figures={figures} to={anchors.money} />
        <Figure
          label="Sikkerhet, straks"
          value={figures ? figures.safety.wetFloors + (figures.safety.stranger ? 1 : 0) : undefined}
          unit={figures ? (figures.safety.wetFloors + (figures.safety.stranger ? 1 : 0) === 1 ? "sak" : "saker") : undefined}
          detail={figures ? safetyDetail(figures.safety) : undefined}
          to={anchors.safety ? itemAnchor(anchors.safety) : undefined}
        />
        <Figure
          label="Robotens oppdrag"
          value={figures?.robot.done}
          unit={figures ? `av ${figures.robot.total}` : undefined}
          tone="success"
          detail={figures ? robotShort(figures.robot) : undefined}
          more={figures ? <Disclosure summary="Slik vet vi det">{robotProof(figures, declines)}</Disclosure> : undefined}
          to={ready && run.lines.length > 0 ? "vurderinger-overlevering" : undefined}
        />
      </FigureRow>
      </div>

      {/* Wide desk (xl): the work and the night side by side, then the evidence, then the signature. A laptop at
          125 % (lg): the work, the evidence, then the night shift's note beside the signature, so the page ends
          on the sign button. Phone: one column in reading order. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] xl:gap-8 print:grid-cols-2 print:gap-x-6 print:gap-y-2">
        {/* The work: in the wide column (jury round 3: the eye reads it first), safety first. */}
        <section aria-labelledby="open-heading" data-enter className="lg:col-span-2 xl:col-span-1 xl:col-start-1 xl:row-start-1 print:col-span-2">
          <Card className="sm:p-6 print:border-0 print:p-0">
            <PanelHead id="open-heading" title="Åpent nå" count={handover ? openCount(handover.open) : undefined} note="Hver sak har en eier og en frist. Sikkerhet først." />
            {!handover ? (
              <Rows rows={3} />
            ) : handover.open.length === 0 ? (
              <p className="mt-3 flex items-start gap-2 text-base">
                <RegenIcon name="circle-check" size={20} className="mt-0.5 shrink-0 text-success" />
                Ingenting er åpent. Natten er ryddet opp.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-line">
                {handover.open.map((item) => (
                  <OpenRow key={item.id} item={item} marks={marks} today={today} figures={handover.figures} />
                ))}
              </ul>
            )}

            <SourceNote className="mt-3 print:hidden" sources={["run-log", "test", "local"]} />
          </Card>
        </section>

        {/* What happened, beside the work on a wide desk; folded under the night shift's own note on a narrower one. */}
        <section aria-labelledby="night-heading" data-enter className="lg:col-start-1 lg:row-start-3 xl:col-start-2 xl:row-start-1 print:col-start-1 print:row-span-2 print:row-start-2 print:[&_#night-heading]:hidden">
          <Card className="sm:p-6 print:border-0 print:p-0">
            <PanelHead
              id="night-heading"
              title="Dette skjedde i natt"
              action={
                handover && timeline.length > 0 ? (
                  <Button variant="ghost" size="sm" className="-mr-3 xl:hidden print:hidden" aria-expanded={wholeNight} aria-controls="natten-linjer" onClick={() => setWholeNight((open) => !open)}>
                    {wholeNight ? "Vis færre" : `Vis hele natten (${timeline.length})`}
                  </Button>
                ) : undefined
              }
            />
            {handover && (
              <figure className="mt-3 rounded-md bg-sunken p-4 print:p-2">
                <figcaption className="flex items-center gap-2 text-sm font-semibold">
                  <Monogram name={handover.note.author} size={24} />
                  {handover.note.author} <span className="font-normal text-muted">· {handover.note.role}</span>
                </figcaption>
                <blockquote className="mt-2 text-sm print:text-xs">{handover.note.text}</blockquote>
              </figure>
            )}
            {!handover ? (
              <Rows rows={3} />
            ) : (
              <ol id="natten-linjer" className={cx("mt-3 flex-col print:hidden", wholeNight ? "flex" : "hidden xl:flex")}>
                {timeline.map((line, index) => (
                  <li key={`${line.at}-${index}`} className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-3 border-t border-line py-2.5 first:border-t-0">
                    <span className="pt-0.5 font-mono text-xs whitespace-nowrap tabular-nums text-muted">{line.at}</span>
                    <div className="flex min-w-0 flex-col items-start gap-1">
                      <Badge tone={BY[line.by].tone}>{BY[line.by].word}</Badge>
                      <p className="text-sm">{line.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            <SourceNote className="mt-3 print:hidden" sources={["run-log", "reception", "test"]} />
          </Card>
        </section>

        {/* The evidence: the robot's judgement calls (owner C's card, the whole night). On paper, one line instead. */}
        {ready && run.lines.length > 0 && (
          <div data-enter className="lg:col-span-2 lg:row-start-2 print:hidden [&>*]:scroll-mt-24">
            <RobotJudgementCard lines={run.lines} id="vurderinger-overlevering" compact />
          </div>
        )}

        {/* The signature, last: after the work and the evidence (jury round 3: never sign above what you are asked to read). */}
        <section aria-labelledby="sign-heading" data-enter className="lg:col-start-2 lg:row-start-3 xl:col-span-2 xl:col-start-1 print:col-start-2 print:row-start-3">
          <Card className={cx("sm:p-6 print:border-0 print:p-0", signoff && "border-success")}>
            <div
              ref={signButton}
              aria-live="polite"
              className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6 lg:flex-col lg:items-stretch xl:flex-row xl:items-center print:flex-row"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <h2 id="sign-heading" className="text-lg font-semibold tracking-[-0.01em] print:text-base">
                  Kvitter mottatt
                </h2>
                {signoff ? (
                  <>
                    <p className="flex items-start gap-2 text-lg font-semibold tracking-[-0.01em] print:text-base">
                      <RegenIcon name="circle-check" size={22} className="mt-0.5 shrink-0 text-success" />
                      <span className="print:hidden">Kvittert av {actionStamp(signoff.name, signoff.stamp, now)}</span>
                      <span className="hidden print:inline">
                        Kvittert av {signoff.name} kl. {signoff.at}
                        {signoff.open !== undefined ? `, ${signoff.open} ${signoff.open === 1 ? "åpen sak" : "åpne saker"}` : ""}
                      </span>
                    </p>
                    <p className="text-sm text-muted print:hidden">
                      {label ? `${label} er overlevert` : "Natten er overlevert"}
                      {signoff.open !== undefined ? `, med ${signoff.open} ${signoff.open === 1 ? "åpen sak" : "åpne saker"}` : ""}. Kvitteringen er lagret på denne enheten.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-base text-muted print:hidden">Les gjennom det som er åpent og robotens vurderinger, og kvitter når du har tatt over vakten.</p>
                    {/* TODO(phase-3): the sign-off goes to the server with the user's id, so the night shift sees it was read. */}
                    <p className="text-xs text-muted print:hidden">Du kvitterer som {user?.name ?? "morgenvakten"}. Kvitteringen lagres på denne enheten.</p>
                    <p className="hidden text-sm print:block">Mottatt av: ______________________ kl. ________</p>
                  </>
                )}
              </div>
              {signoff ? (
                <Button variant="ghost" size="sm" className="self-start sm:self-center lg:self-start xl:self-center print:hidden" onClick={() => setSigned(false)}>
                  Angre kvitteringen
                </Button>
              ) : (
                <Button
                  size="lg"
                  variant={sellWaiting ? "secondary" : "primary"}
                  className="w-full shrink-0 sm:w-auto lg:self-start xl:self-auto print:hidden"
                  onClick={() => setSigned(true)}
                  disabled={!handover}
                >
                  Kvitter mottatt
                </Button>
              )}
            </div>
          </Card>
        </section>
      </div>

      {/* No contact address exists yet, so none is printed (no e-mail, no invented domain). The page names guests. */}
      <footer className="hidden border-t border-line pt-2 text-xs text-muted print:block">
        {APP_NAME} · {TAGLINE} · Team Fettero, Oslo Sprint 2026
        {" · "}Inneholder personopplysninger. Makuleres etter vakten.
      </footer>
    </ModulePage>
  );
}

/** Behind *Slik vet vi det*: who confirmed every "done", the refusals, the night staff's and the AI's share. */
function robotProof({ robot, staffDone, calls }: Figures, declines: DeclineSplit | null): string {
  const refused = declineShort(declines, robot.declined);
  return [
    `Hver «ferdig» er godkjent av dommeren i Wybe Night Shift-simulatoren: ${robot.done} av ${robot.reported}.`,
    refused ? `Avvist etter sjekk: ${refused}.` : null,
    robot.cancelled > 0 ? `${robot.cancelled} avlyst av nattlederen.` : null,
    staffDone > 0 ? `Nattevakten fullførte ${staffDone} ${staffDone === 1 ? "forespørsel" : "forespørsler"} selv.` : null,
    `AI-resepsjonisten tok ${calls} ${calls === 1 ? "samtale" : "samtaler"}.`,
    "I et hotell finnes ingen dommer: der bekrefter dørlåsloggen og robotens foto.",
  ]
    .filter(Boolean)
    .join(" ");
}

/** "3 våte gulv · 1 ukjent person": what the safety figure counts. */
function safetyDetail({ wetFloors, stranger }: { wetFloors: number; stranger: boolean }): string {
  const parts = [wetFloors > 0 ? `${wetFloors} ${wetFloors === 1 ? "vått gulv" : "våte gulv"}` : null, stranger ? "1 ukjent person" : null].filter(Boolean);
  return parts.length > 0 ? `${parts.join(" · ")}, hver med eier` : "Ingenting som kan skade en gjest";
}

function Disclosure({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="text-xs text-muted print:hidden">
      {/* Quiet ink, not orange: orange on this page is the one thing to do (jury round 4, the design juror). */}
      <summary className="inline-flex min-h-11 cursor-pointer items-center gap-1 font-semibold text-text underline decoration-line-strong underline-offset-4 hover:decoration-text pointer-fine:min-h-8">
        {summary}
      </summary>
      <p className="max-w-[44ch] pb-1">{children}</p>
    </details>
  );
}

/**
 * A top figure that jumps to its row (jury round 4, the product juror/the design juror): the figure and its label are one
 * link with a down arrow, its row is marked while it is the page's target. A disclosure stays outside the
 * link (no control inside a control).
 */
function FigureLink({ to, children }: { to: string | null | undefined; children: ReactNode }) {
  if (!to) return <>{children}</>;
  return (
    <a
      href={`#${to}`}
      className="group relative -mx-1.5 -my-1 flex min-w-0 flex-col rounded-md px-1.5 py-1 pr-7 transition-colors duration-[120ms] ease-standard hover:bg-sunken print:pr-1.5"
    >
      {children}
      <RegenIcon name="arrow-down" size={16} strokeWidth={2} className="absolute top-2 right-1.5 text-muted group-hover:text-text print:hidden" />
      <span className="sr-only">, gå til saken</span>
    </a>
  );
}

function Figure({ label, value, unit, tone, detail, more, to }: { label: string; value: ReactNode | undefined; unit?: string; tone?: "success"; detail?: string; more?: ReactNode; to?: string | null }) {
  if (value === undefined) {
    return (
      <div className="flex flex-col gap-1">
        <Skeleton className="h-8 w-20" />
        <span className="text-sm text-muted">{label}</span>
      </div>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <FigureLink to={to}>
        <Stat label={label} value={value} unit={unit} tone={tone} />
      </FigureLink>
      {detail && <p className="text-xs text-muted">{detail}</p>}
      {more}
    </div>
  );
}

function OpenRow({ item, marks, today, figures }: { item: OpenItem; marks: Readonly<Record<string, RoomCheckMark>>; today: string; figures: Figures }) {
  const value = item.sell ? (item.pending ? figures.money.releasedValue : figures.money.toSellValue) : 0;
  return (
    // On paper the owner and the deadline sit beside the text, so the list fits one sheet. A top figure's
    // link lands here: the row is marked while it is the target (a sunken plane that bleeds past the text).
    <li
      id={itemAnchor(item.id)}
      className="flex scroll-mt-24 flex-col gap-1.5 rounded-sm py-2.5 transition-colors duration-300 ease-standard target:bg-sunken target:shadow-[-12px_0_0_0_var(--color-sunken),12px_0_0_0_var(--color-sunken)] print:grid print:break-inside-avoid print:grid-cols-[minmax(0,1fr)_11rem] print:gap-x-4 print:py-1"
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        {/* The text claims 16rem before the badge sits beside it: on a phone the badge wraps under the text instead of squeezing it into a narrow column (209's row at 390 px). */}
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
          <p className="min-w-0 grow basis-64 text-base print:text-sm">
            {item.safety && <RegenIcon name="alert-triangle" size={18} className="mr-1.5 inline-block align-[-0.2em]" />}
            {item.text}
          </p>
          {/* Safety is the most urgent thing on the page: the bell's red, never quieter than "Gjest venter" (jury round 3, the design juror). */}
          {item.safety ? (
            <Badge tone="danger">Sikkerhet</Badge>
          ) : item.urgent ? (
            <Badge tone="warning">Gjest venter</Badge>
          ) : item.caught ? (
            <Badge tone="success">
              <RegenIcon name="shield-check" size={14} className="mr-1 inline-block align-[-0.15em]" />
              Fettero holdt rommet tilbake
            </Badge>
          ) : item.pending ? (
            // Pending, never "Gjort i dag": the booking system has not said the room is free (jury round 4, the product juror).
            <Badge>Venter på PMS-en</Badge>
          ) : null}
        </div>
        {item.lines && (
          <ul className="flex flex-col gap-1 border-l-2 border-line pl-3 text-sm print:gap-0 print:text-xs">
            {item.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
        {/* Who was told in the night: a known hazard is acted on at once (jury round 4, the law juror). */}
        {item.escalation && (
          <p className="flex items-start gap-1.5 text-sm font-semibold">
            <RegenIcon name="bell" size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
            {item.escalation}
          </p>
        )}
        {/* The figure that changed, where the presenter is (jury round 4, the creative juror): the kroner on the row once it is sent. */}
        {item.sell && item.pending && value > 0 && (
          <p aria-live="polite" className="flex flex-wrap items-baseline gap-x-2 print:hidden">
            <span className="font-mono text-xl font-medium tabular-nums">
              <span className="mr-1.5 font-sans text-sm font-medium text-muted">ca.</span>
              <Digits value={formatKroner(value)} />
              <span className="ml-1 font-sans text-sm font-medium text-muted">kr</span>
            </span>
            <span className="text-sm text-muted">sendt til resepsjonen · venter på PMS-en</span>
          </p>
        )}
        {item.sell && (
          <div className="flex flex-col gap-2 print:hidden">
            {item.sell.map((room) => (
              <div key={room} className="flex flex-wrap items-start gap-x-3 gap-y-1">
                {item.sell && item.sell.length > 1 && <span className="mt-2 rounded-sm bg-sunken px-2 py-1 font-mono text-sm font-medium tabular-nums">{room.replace(/^room-/, "")}</span>}
                <SellSteps room={room} mark={marks[room]} today={today} primary className="min-w-0 flex-1" />
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm print:items-start">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 print:gap-x-1 print:gap-y-0">
          <Monogram name={item.who ?? item.owner} size={24} className="print:hidden" />
          {/* A role the hotel has, and who is on in it (jury round 4, the design juror: not one name for everything). */}
          <span className="min-w-0">
            <span className="font-medium">{item.owner}</span>
            {item.who && <span className="text-muted"> · {item.who}</span>}
          </span>
          <span className="text-muted">·</span>
          {item.due === "straks" ? (
            <span className="font-semibold whitespace-nowrap">straks</span>
          ) : (
            <span className="whitespace-nowrap text-muted">
              {item.dueWord ?? "innen"} <span className="font-mono tabular-nums text-text">{item.due}</span>
            </span>
          )}
          {/* The bookings are test data: one small word on the row, the band at the top says it once. */}
          {item.booking && PMS_IS_TEST_DATA && <span className="text-xs text-muted">· {TEST_BOOKING_WORD}</span>}
        </span>
        {item.href && (
          // Quiet ink with an arrow: orange on this page is the one thing to do (jury round 4, the design juror).
          <Link href={item.href} className="group flex min-h-11 items-center gap-1 font-semibold text-text hover:underline pointer-fine:min-h-8 print:hidden">
            {item.linkLabel}
            <RegenIcon name="arrow-right" size={16} strokeWidth={2} className="text-muted transition-transform duration-[120ms] ease-standard group-hover:translate-x-0.5 group-hover:text-text motion-reduce:transition-none" />
          </Link>
        )}
      </div>
    </li>
  );
}

/** "Rom 209: meldt tomt kl. 03:47, men roboten satte inn bagasje kl. 01:29." (the robot's own contradiction, jury round 4, the Wybe engineer). */
function contradictionShort(row: Contradiction): string {
  return `Rom ${row.room.replace(/^room-/, "")}: meldt tomt kl. ${row.checkedAt?.slice(0, 5) ?? "--:--"}, men roboten satte inn ${row.arrival ? "bagasje" : "noe"} kl. ${row.placedAt?.slice(0, 5) ?? "--:--"}`;
}

/** The catch leads: the room the room check held back, said as the robot's own contradiction when it is one (no booking needed). */
function HeldFigure({ figures, contradicted, to }: { figures: Figures; contradicted: readonly Contradiction[]; to: string | undefined }) {
  const caught = figures.money.caught;
  const own = contradicted[0];
  const held = figures.money.held;
  const rooms = caught.map((room) => room.replace(/^room-/, ""));
  const doubled = held.some((row) => row.arrival);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <FigureLink to={to ? itemAnchor(to) : null}>
        <Stat size="lg" label="Holdt tilbake fra salg" value={caught.length} unit="rom" />
      </FigureLink>
      <p className="text-xs text-muted">{own ? contradictionShort(own) : `Rom ${rooms.join(", ")}${doubled ? ": bagasje for en annen ankomst" : ": i bruk etter romsjekken"}`}</p>
    </div>
  );
}

/**
 * The money (jury round 4, the founder juror/the product juror): what the room check buys is time, "funnet ledig 5 timer
 * tidligere", and the kroner are real only if tonight sells out, so tonight's bookings stand beside them.
 * Sent to reception it reads pending, never sold.
 */
function MoneyFigure({ figures, to }: { figures: Figures | undefined; to: string | undefined }) {
  if (!figures) {
    return (
      <div className="flex flex-col gap-1">
        <Skeleton className="h-10 w-28" />
        <span className="text-sm text-muted">Kan selges etter bekreftelse</span>
      </div>
    );
  }
  const { money, tonight } = figures;
  const toSell = money.toSell.length;
  const released = money.released.length;
  if (toSell === 0 && released === 0) {
    return <Figure label="Klare til salg" value={figures.roomsReady} unit={`av ${figures.roomsTotal}`} tone={figures.roomsReady ? "success" : undefined} />;
  }
  const value = toSell > 0 ? money.toSellValue : money.releasedValue;
  const rooms = (toSell > 0 ? money.toSell : money.released).map((row) => row.room.replace(/^room-/, ""));
  const hours = hoursEarlier();
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <FigureLink to={to ? itemAnchor(to) : null}>
        <Stat
          size="lg"
          label={toSell > 0 ? `Funnet ledig ${hours} ${hours === 1 ? "time" : "timer"} tidligere` : "Sendt til resepsjonen"}
          value={
            <>
              <span className="mr-1.5 font-sans text-base font-medium text-muted">ca.</span>
              <Digits value={formatKroner(value)} />
            </>
          }
          unit="kr"
        />
      </FigureLink>
      <p aria-live="polite" className="text-xs text-muted">
        {toSell > 0 ? `Rom ${rooms.join(", ")} · hvis natten blir utsolgt · ${tonightLine(tonight.booked, tonight.rooms)}` : `Rom ${rooms.join(", ")} · venter på PMS-en`}
      </p>
      {/* Mixed: some sent, some still to confirm; the running count step 2 moves (the pilot's number). */}
      {toSell > 0 && released > 0 && <p className="text-xs text-muted">{releasedLine(money)}</p>}
      <Disclosure summary="Slik regner vi">{moneyMethod(money, tonight)}</Disclosure>
    </div>
  );
}

function Rows({ rows }: { rows: number }) {
  return (
    <div role="status" aria-busy="true" className="mt-4 flex flex-col gap-4">
      <span className="sr-only">Henter natten</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      ))}
    </div>
  );
}
