"use client";

import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "@/features/auth";
import { formatKroner, nightLabel } from "@/features/dashboard/format";
import { declineShort, robotShort } from "@/features/dashboard/highlights";
import { DOOR_LOCK_IS_TEST_DATA, doorLockLines, doorLockSignals } from "@/features/doorlock/feed";
import { type DeclineSplit, declineSplit } from "@/features/nightshift/declines";
import { useNight } from "@/features/dashboard/useNight";
import { useOrderStatuses } from "@/features/dashboard/useOrderStatuses";
import { FigureRow, ModulePage, PanelHead } from "@/features/modules/ModulePage";
import { RobotJudgementCard } from "@/features/nightshift/RobotJudgementCard";
import { SourceSwitch } from "@/features/nightsource/SourceSwitch";
import { SourceNote } from "@/features/modules/SourceNote";
import { osloToday } from "@/features/reception/dates";
import type { DemoCall } from "@/features/reception/demoCalls";
import { formatClock } from "@/features/reception/format";
import { CLERK_SAMPLE_IS_ON } from "@/features/staffinput/entries";
import { readStaffLog, staffRooms } from "@/features/staffinput/read";
import { hoursEarlier, moneyMethod, releasedLine, tonightLine, unbilledMethod } from "@/features/rooms/money";
import { PMS_IS_TEST_DATA, TEST_BOOKING_WORD } from "@/features/rooms/pms";
import type { Contradiction, RoomCheckMark } from "@/features/rooms/reconcile";
import { SellSteps } from "@/features/rooms/SellSteps";
import { HOTEL_NAME } from "@/ui/AppNav";
import { APP_NAME, TAGLINE } from "@/ui/brand";
import { actionStamp, relativeTime, stampNow, useNowMs } from "@/ui/stamp";
import { Badge, Button, Card, cx, EmptyState, ErrorState, Figure as Digits, Monogram, RegenIcon, Skeleton, Stat } from "@/ui";
import { type RobotLook, type RoomSources, roomSources, type SourceChip } from "./evidence";
import { contradictionPoints, type Figures, type Highlight, itemAnchor, nightSourceLine, notifyTarget, type OpenItem, openCount, safetyCount, untoldCount } from "./select";
import { sign, SIGNOFFS } from "./signoff";
import { SAFETY_TOLD, type Told, tell } from "./told";
import { useHandover } from "./useHandover";

const BY: Record<Highlight["by"], { word: string; tone: "accent" | "neutral" }> = {
  robot: { word: "Roboten", tone: "accent" },
  ai: { word: "AI-resepsjonisten", tone: "neutral" },
  staff: { word: "Personalet", tone: "neutral" },
};

/**
 * Overlevering 06:00: the night on one page for the morning manager, read in the order she works
 * (round 3, product and design review: act → evidence → sign). Four decision figures (the room the
 * room check held back, the money, the safety items, the robot's night); *Åpent nå* in the wide column,
 * safety first, then the room check's catch and sale; what happened, folded, beside it; the robot's
 * judgement card; *Kvitter mottatt* last. The proof (the referee, the simulator) sits behind *Slik vet vi
 * det*. Prints as one A4 leave-behind with a Fettero masthead.
 *
 * Round 4 (product and design review): each top figure jumps to its row; the money step is the page's one
 * orange action (and *Kvitter mottatt* takes the orange once no room waits for it); the other links are
 * quiet ink; the test-data chips are one quiet demo band under the header.
 */
export function HandoverScreen({ viewerUrl, demo, today: day }: { viewerUrl?: string; demo?: readonly DemoCall[]; today?: string }) {
  const today = day ?? osloToday();
  const { resolved, statusOf } = useOrderStatuses();
  const nightState = useNight(viewerUrl, resolved);
  // The page and the bell read one composition (useHandover): the same Åpent nå, the same safety saker.
  const { run, night, lines, staff, reconciliation, marks, source, setSource, noRobot, withoutRobot, handover } = useHandover({ nightState, statusOf, today, demo });
  const { user } = useSession();
  const signoff = SIGNOFFS.use()[today] ?? null;
  const now = useNowMs();
  const ready = run.status === "ready";
  const declines = useMemo(() => (lines ? declineSplit(lines) : null), [lines]);
  // The sources a room row draws as chips: the door lock's one signal, the night clerk's look (and the robot's, on its night).
  const doorSignals = useMemo(() => doorLockSignals(doorLockLines()), []);
  const clerkRooms = useMemo(() => staffRooms(readStaffLog(staff)), [staff]);
  const told = SAFETY_TOLD.use()[today];
  const [wholeNight, setWholeNight] = useState(false);
  const shownCheck = noRobot ? (withoutRobot?.reconciliation ?? null) : reconciliation;
  const sourcesOf = useCallback(
    (room: string): RoomSources | null => {
      const sale = noRobot ? null : reconciliation?.sellable.find((row) => row.room === room);
      const guest = noRobot ? null : reconciliation?.guestFound.find((row) => row.room === room);
      const robot: RobotLook | null = sale ? { kind: "empty", row: sale } : guest ? { kind: "guest", row: guest } : null;
      return roomSources({ door: doorSignals.get(room), staff: clerkRooms.get(room), robot });
    },
    [noRobot, reconciliation, doorSignals, clerkRooms],
  );
  const isTold = useCallback((id: string) => Boolean(told?.[id]), [told]);
  const untold = handover ? untoldCount(handover.open, isTold) : 0;
  const onTell = useCallback(
    (id: string, to: string | null) => tell(today, id, to ? { to, by: user?.name ?? null, stamp: stampNow() } : null),
    [today, user],
  );

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
            untold,
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
  const signedWhen = signoff ? relativeTime(signoff.stamp, now) : null;
  const timeline = handover?.timeline ?? [];
  const open = handover?.open ?? [];
  // Each top figure jumps to its row (round 4, product and design review): the presenter taps, never hunts for a scroll.
  const anchors = {
    held: open.find((item) => item.caught)?.id,
    unbilled: open.find((item) => item.kroner)?.id,
    money: open.find((item) => item.sell)?.id,
    safety: open.find((item) => item.safety)?.id,
  };
  // One orange action at a time: the money step while a room waits for it, then the signature.
  const sellWaiting = (figures?.money.toSell.length ?? 0) > 0;
  // One count for the safety figure, Åpent nå and the receipt (round 6, design review: 4 vs 10 vs 9 needed explaining).
  const straks = safetyCount(open);
  const total = openCount(open);
  const testData = PMS_IS_TEST_DATA || DOOR_LOCK_IS_TEST_DATA || CLERK_SAMPLE_IS_ON;

  return (
    <ModulePage
      module="overlevering"
      ready={handover !== null}
      className="print:gap-3 print:p-0"
      lede="Det som trenger deg først, så bevisene, og kvitteringen til slutt."
      meta={signoff ? <Badge tone="success">Kvittert{signedWhen ? ` ${signedWhen}` : ""}</Badge> : <Badge tone="neutral">Ikke kvittert ennå</Badge>}
      actions={
        <Button variant="secondary" className="print:hidden max-sm:hidden" onClick={() => window.print()} disabled={!handover}>
          <RegenIcon name="printer" size={20} />
          Skriv ut
        </Button>
      }
    >
      {/* The printed page is the leave-behind a hotel keeps (round 3, design review): a Fettero masthead on top. */}
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
          {label ?? <Skeleton className="inline-block h-4 w-48 align-middle" />} · 22:00 til 06:00 · Vakt: {noRobot ? "" : "roboten og "}
          {handover?.note.author ?? "nattevakten"}
        </div>
        {/* Which night the page is built from: owner B's switch, Med robot by default. */}
        <SourceSwitch value={source} onChange={setSource} sources={withoutRobot?.sources ?? null} className="mt-1 mb-1 print:hidden" />
        {/* No green summary line (round 6, design review): it repeated the four figures below it. */}
      </div>

      {/* The test data said once, quietly, for the whole page (round 4, design review), and where it is kept: the lists carry no source notes of their own. */}
      {ready && run.lines.length > 0 && !noRobot && (
        <p data-demo-band className="-mt-2 flex items-start gap-2 rounded-md bg-sunken px-3 py-2 text-sm text-muted lg:-mt-4 print:mt-0 print:bg-transparent print:p-0 print:text-xs">
          <RegenIcon name="info-circle" size={18} className="mt-0.5 shrink-0 print:hidden" />
          <span>
            Demo: {nightSourceLine(run.lines)}.{PMS_IS_TEST_DATA ? ` Bookinger og dørlås er testdata, merket «${TEST_BOOKING_WORD}».` : ""}{" "}
            <span className="print:hidden">Det du gjør her, lagres på denne enheten.</span>
          </span>
        </p>
      )}

      {/* On paper the figures' rule sits tighter, so the page fits one sheet. */}
      <div className="contents print:block print:[&>section>div]:py-2">
      <FigureRow label="Natten i tall">
        {figures && figures.money.caught.length > 0 && <HeldFigure figures={figures} contradicted={shownCheck?.contradicted ?? []} to={anchors.held} />}
        <MoneyFigure figures={figures} to={anchors.unbilled} sale={anchors.money} />
        <Figure
          label="Sikkerhet, straks"
          value={figures ? straks : undefined}
          unit={figures ? (straks === 1 ? "sak" : "saker") : undefined}
          detail={figures ? safetyDetail(noRobot ? (withoutRobot?.safety.detail ?? null) : wetAndPeople(open), straks, untold) : undefined}
          to={anchors.safety ? itemAnchor(anchors.safety) : undefined}
        />
        {noRobot ? (
          // No robot tonight: what the night clerk logged stands where the robot's figure was.
          <Figure
            label="Fra nattevakten"
            value={withoutRobot?.sources.staffEntries}
            unit={withoutRobot ? (withoutRobot.sources.staffEntries === 1 ? "registrering" : "registreringer") : undefined}
            detail={withoutRobot?.sources.clerk ? `Ført av ${withoutRobot.sources.clerk}` : undefined}
          />
        ) : (
          <Figure
            label="Robotens oppdrag"
            value={figures?.robot.done}
            unit={figures ? `av ${figures.robot.total}` : undefined}
            tone="success"
            detail={figures ? robotShort(figures.robot) : undefined}
            more={figures ? <Disclosure summary="Slik vet vi det">{robotProof(figures, declines)}</Disclosure> : undefined}
            to={ready && run.lines.length > 0 ? "vurderinger-overlevering" : undefined}
          />
        )}
      </FigureRow>
      </div>

      {/* Wide desk (xl): the work and the night side by side, then the evidence, then the signature. A laptop at
          125 % (lg): the work, the evidence, then the night shift's note beside the signature, so the page ends
          on the sign button. Phone: one column in reading order. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] xl:gap-8 print:grid-cols-2 print:gap-x-6 print:gap-y-2">
        {/* The work: in the wide column (round 3: the eye reads it first), safety first. */}
        <section aria-labelledby="open-heading" data-enter className="lg:col-span-2 xl:col-span-1 xl:col-start-1 xl:row-start-1 print:col-span-2">
          <Card className="sm:p-6 print:border-0 print:p-0">
            <PanelHead id="open-heading" title="Åpent nå" count={handover ? total : undefined} note={handover && straks > 0 ? `${straks} straks · ${total - straks} med frist i dag` : "Hver sak har en eier og en frist."} />
            {!handover ? (
              <Rows rows={3} />
            ) : handover.open.length === 0 ? (
              <p className="mt-3 flex items-start gap-2 text-base">
                <RegenIcon name="circle-check" size={20} className="mt-0.5 shrink-0 text-success" />
                Ingenting er åpent. Natten er ryddet opp.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-line">
                {open.map((item) => (
                  <OpenRow key={item.id} item={item} marks={marks} today={today} sourcesOf={sourcesOf} told={told?.[item.id]} onTell={onTell} now={now} />
                ))}
              </ul>
            )}
            {/* Without a robot the band is not shown: the switch's line names the sources, this says where it is kept. */}
            {noRobot && <SourceNote className="mt-3 print:hidden" sources={["local"]} />}
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
          </Card>
        </section>

        {/* The evidence: the robot's judgement calls (owner C's card, the whole night). On paper, one line instead. */}
        {ready && run.lines.length > 0 && !noRobot && (
          <div data-enter className="lg:col-span-2 lg:row-start-2 print:hidden [&>*]:scroll-mt-24">
            <RobotJudgementCard lines={run.lines} id="vurderinger-overlevering" compact />
          </div>
        )}
        {/* Without a robot its section collapses to one line (round 4, product review): what only a robot sees is not here. */}
        {noRobot && (
          <p className="flex items-start gap-2 text-sm text-muted lg:col-span-2 lg:row-start-2 print:hidden">
            <RegenIcon name="info-circle" size={18} className="mt-0.5 shrink-0" />
            Ingen robot i natt: det bare en robot ser på runden sin, står ikke her. Resten kommer fra bookingsystemet, dørlåsen og nattevakten.
          </p>
        )}

        {/* The signature, last: after the work and the evidence (round 3: never sign above what you are asked to read). */}
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
                        {signoff.untold ? `, ${untoldWords(signoff.untold)} ikke varslet` : ""}
                      </span>
                    </p>
                    <p className="text-sm text-muted print:hidden">
                      {label ? `${label} er overlevert` : "Natten er overlevert"}
                      {signoff.open !== undefined ? `, med ${signoff.open} ${signoff.open === 1 ? "åpen sak" : "åpne saker"}` : ""}
                      {signoff.untold ? `, ${untoldWords(signoff.untold)} ikke varslet` : ""}. Kvitteringen er lagret på denne enheten.
                    </p>
                  </>
                ) : (
                  <>
                    {/* A warning, never a block (round 6, product review): the receipt says what was not done. */}
                    {untold > 0 && (
                      <p className="flex items-start gap-1.5 text-sm font-semibold print:hidden">
                        <RegenIcon name="bell" size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
                        {untold === 1 ? "1 sikkerhetssak er ikke varslet til noen." : `${untold} sikkerhetssaker er ikke varslet til noen.`} Du kan kvittere likevel.
                      </p>
                    )}
                    {/* TODO(phase-3): the sign-off goes to the server with the user's id, so the night shift sees it was read. */}
                    <p className="text-xs text-muted print:hidden">Du kvitterer som {user?.name ?? "morgenvakten"}, på denne enheten.</p>
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

      {/* No contact address exists yet, so none is printed (no e-mail, no invented domain). A real night names guests; test data names nobody real, so nothing to shred. */}
      <footer className="hidden border-t border-line pt-2 text-xs text-muted print:block">
        {APP_NAME} · {TAGLINE} · Team Fettero, Oslo Sprint 2026
        {" · "}
        {testData ? "Testdata: ingen ekte gjester." : "Inneholder personopplysninger. Makuleres etter vakten."}
      </footer>
    </ModulePage>
  );
}

/** Behind *Slik vet vi det*: who confirmed every "done", the refusals, the night staff's and the AI's share. */
function robotProof({ robot, staffDone, calls }: Figures, declines: DeclineSplit | null): string {
  const refused = declineShort(declines, robot.declined);
  return [
    `Hver «ferdig» er bekreftet av simulatoren (Wybe Night Shift): ${robot.done} av ${robot.reported}.`,
    refused ? `Avvist etter sjekk: ${refused}.` : null,
    robot.cancelled > 0 ? `${robot.cancelled} avlyst av nattlederen.` : null,
    staffDone > 0 ? `Nattevakten fullførte ${staffDone} ${staffDone === 1 ? "forespørsel" : "forespørsler"} selv.` : null,
    `AI-resepsjonisten tok ${calls} ${calls === 1 ? "samtale" : "samtaler"}.`,
    "I et ekte hotell finnes ingen dommer: der bekrefter gjesten, resepsjonen eller dørlåsloggen.",
  ]
    .filter(Boolean)
    .join(" ");
}

/** "4 våte gulv · 1 ukjent person": what the robot night's safety rows hold, read from the rows themselves. */
function wetAndPeople(open: readonly OpenItem[]): string | null {
  const safety = open.filter((item) => item.safety);
  const wet = safety.filter((item) => item.id === "wet-floors" || item.id.startsWith("wet-")).reduce((sum, item) => sum + (item.count ?? 1), 0);
  const stranger = safety.some((item) => item.id === "stranger") ? 1 : 0;
  const other = safety.length - safety.filter((item) => item.id.startsWith("wet-") || item.id === "stranger").length;
  const parts = [wet > 0 ? `${wet} ${wet === 1 ? "vått gulv" : "våte gulv"}` : null, stranger ? "1 ukjent person" : null, other > 0 ? `${other} fra nattevakten` : null].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** The safety figure's line: what it counts, then who still has to be told ("4 ikke varslet"), live with the *Varsle* taps. */
function safetyDetail(what: string | null, count: number, untold: number): string {
  if (count === 0) return "Ingenting som kan skade en gjest";
  const told = untold > 0 ? `${untold} ikke varslet` : null;
  return [what, told].filter(Boolean).join(" · ");
}

/** "1 sikkerhetssak" · "4 sikkerhetssaker". */
function untoldWords(count: number): string {
  return count === 1 ? "1 sikkerhetssak" : `${count} sikkerhetssaker`;
}

function Disclosure({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="text-xs text-muted print:hidden">
      {/* Quiet ink, not orange: orange on this page is the one thing to do (round 4, design review). */}
      <summary className="inline-flex min-h-11 cursor-pointer items-center gap-1 font-semibold text-text underline decoration-line-strong underline-offset-4 hover:decoration-text pointer-fine:min-h-8">
        {summary}
      </summary>
      <p className="max-w-[44ch] pb-1">{children}</p>
    </details>
  );
}

/**
 * A top figure that jumps to its row (round 4, product and design review): the figure and its label are one
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

type RowProps = {
  item: OpenItem;
  marks: Readonly<Record<string, RoomCheckMark>>;
  today: string;
  sourcesOf: (room: string) => RoomSources | null;
  told: Told | undefined;
  onTell: (id: string, to: string | null) => void;
  now: number;
};

function OpenRow({ item, marks, today, sourcesOf, told, onTell, now }: RowProps) {
  const evidence = item.evidenceRoom ? sourcesOf(item.evidenceRoom) : null;
  return (
    // On paper the owner and the deadline sit beside the text, so the list fits one sheet. A top figure's
    // link lands here: the row is marked while it is the target (a sunken plane that bleeds past the text).
    <li
      id={itemAnchor(item.id)}
      className="flex scroll-mt-24 flex-col gap-1.5 rounded-sm py-2.5 transition-colors duration-300 ease-standard target:bg-sunken target:shadow-[-12px_0_0_0_var(--color-sunken),12px_0_0_0_var(--color-sunken)] print:grid print:break-inside-avoid print:grid-cols-[minmax(0,1fr)_15rem] print:gap-x-4 print:py-1"
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        {/* The text claims 16rem before the badge sits beside it: on a phone the badge wraps under the text instead of squeezing it into a narrow column (209's row at 390 px). */}
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
          <p className="min-w-0 grow basis-64 text-base print:text-sm">
            {item.safety && <RegenIcon name="alert-triangle" size={18} className="mr-1.5 inline-block align-[-0.2em]" />}
            {item.lead ?? item.text}
          </p>
          {/* Safety is the most urgent thing on the page: the bell's red, never quieter than "Gjest venter" (round 3, design review). */}
          {item.safety ? (
            <Badge tone="danger">Sikkerhet</Badge>
          ) : item.urgent ? (
            <Badge tone="warning">Gjest venter</Badge>
          ) : item.caught ? (
            // Neutral ink with the shield: the room is not fine, it is held (round 5, design review).
            <Badge>
              <RegenIcon name="shield-check" size={14} className="mr-1 inline-block align-[-0.15em]" />
              Holdt tilbake
            </Badge>
          ) : null}
        </div>
        {item.points && <Points points={item.points} />}
        {item.lines && item.lines.length > 0 && (
          <ul className="flex flex-col gap-1 border-l-2 border-line pl-3 text-sm print:gap-0 print:text-xs">
            {item.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
        {evidence && <Sources sources={evidence} />}
        {/* Who was told, as a control (round 6, product review: "varsle nå" was text). */}
        {item.safety && <NotifyRow item={item} told={told} onTell={onTell} now={now} />}
        {item.sell && (
          <div className="flex flex-col gap-3 print:gap-1">
            {item.sell.map((room) => {
              const sources = sourcesOf(room);
              return (
                <div key={room} className="flex flex-col gap-2">
                  {item.sell && item.sell.length > 1 && <span className="self-start rounded-sm bg-sunken px-2 py-1 font-mono text-sm font-medium tabular-nums">{room.replace(/^room-/, "")}</span>}
                  {sources && <Sources sources={sources} />}
                  <SellSteps room={room} mark={marks[room]} today={today} primary className="min-w-0 print:hidden" />
                </div>
              );
            })}
          </div>
        )}
      </div>
      {/* On paper the owner and the deadline in small type, so each sits on one line beside its row and the page fits one sheet. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm print:items-start print:text-xs">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 print:gap-x-1 print:gap-y-0">
          <Monogram name={item.who ?? item.owner} size={24} className="print:hidden" />
          {/* A role the hotel has, and who is on in it (round 4, design review: not one name for everything). */}
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
          // Quiet ink with an arrow: orange on this page is the one thing to do (round 4, design review).
          <Link href={item.href} className="group flex min-h-11 items-center gap-1 font-semibold text-text hover:underline pointer-fine:min-h-8 print:hidden">
            {item.linkLabel}
            <RegenIcon name="arrow-right" size={16} strokeWidth={2} className="text-muted transition-transform duration-[120ms] ease-standard group-hover:translate-x-0.5 group-hover:text-text motion-reduce:transition-none" />
          </Link>
        )}
      </div>
    </li>
  );
}

/**
 * The robot's own contradiction drawn as two points (round 6, design review: show it, don't write it):
 * "● 01:29 bagasje inn", then "● 03:47 meldt tomt", the second dot amber (it is why a person must look).
 * At least 16 px in ink. Stacked in a figure's narrow column, in a row on a list row.
 */
function Points({ points, stacked = false }: { points: readonly { at: string; label: string }[]; stacked?: boolean }) {
  return (
    <ol
      aria-label="Fra robotens egen logg"
      className={cx(
        "relative flex text-base text-text",
        stacked ? "flex-col gap-2 before:absolute before:top-3 before:bottom-3 before:left-[4.5px] before:w-px before:bg-line-strong" : "flex-wrap items-center gap-x-2 gap-y-1",
      )}
    >
      {points.map((point, index) => (
        <li key={`${point.at}-${point.label}`} className="relative flex items-center gap-2">
          {!stacked && index > 0 && <span aria-hidden className="mr-0.5 h-px w-6 bg-line-strong" />}
          <span aria-hidden className={cx("size-2.5 shrink-0 rounded-full", index === points.length - 1 ? "bg-warning" : "bg-text")} />
          <span className="font-mono font-medium tabular-nums">{point.at}</span>
          <span>{point.label}</span>
        </li>
      ))}
    </ol>
  );
}

const SOURCE_ICON: Record<SourceChip["source"], "lock" | "user" | "agent"> = { door_lock: "lock", staff: "user", robot: "agent" };

/**
 * What a room row rests on, as chips (round 6, design review): one per source, the robot's in night
 * steel, then the verdict with a check when two sources agree and one is from outside the robot.
 */
function Sources({ sources }: { sources: RoomSources }) {
  const confirmed = sources.verdict === "confirmed";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <ul aria-label="Kilder" className="flex flex-wrap gap-1.5">
        {/* The robot's chip in night steel on screen; on paper every chip is ink on white (a dark fill does not print). */}
        {sources.chips.map((chip) => (
          <li
            key={chip.source}
            data-surface={chip.source === "robot" ? "dark" : undefined}
            className={cx("inline-flex items-center gap-1.5 rounded-sm border border-line bg-sunken px-2 py-1 text-sm text-text", chip.source === "robot" ? "print:hidden" : "print:bg-transparent print:text-xs")}
          >
            <RegenIcon name={SOURCE_ICON[chip.source]} size={14} strokeWidth={2} className="shrink-0 text-muted print:hidden" />
            <span className="font-semibold">{chip.label}</span>
            <span className="text-muted">· {chip.detail}</span>
          </li>
        ))}
        {sources.chips
          .filter((chip) => chip.source === "robot")
          .map((chip) => (
            <li key={`${chip.source}-print`} className="hidden items-center gap-1.5 rounded-sm border border-line px-2 py-1 text-xs print:inline-flex">
              <span className="font-semibold">{chip.label}</span>
              <span className="text-muted">· {chip.detail}</span>
            </li>
          ))}
      </ul>
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold print:text-xs">
        <RegenIcon name={confirmed ? "circle-check" : "info-circle"} size={16} strokeWidth={2} className={cx("shrink-0", confirmed ? "text-success" : "text-muted")} />
        {sources.word}
      </span>
    </div>
  );
}

/**
 * *Varsle Trond Eikeland* / *Varsle resepsjonen* on a safety row: records who was told, by whom and
 * when, on this device (handover/told.ts), with *Angre*. TODO(phase-3): the message goes out from here.
 */
function NotifyRow({ item, told, onTell, now }: { item: OpenItem; told: Told | undefined; onTell: (id: string, to: string | null) => void; now: number }) {
  const to = notifyTarget(item);
  const box = useRef<HTMLDivElement>(null);
  // The state a tap asked for: focus moves only once the row shows it (a render can come in between).
  const moved = useRef<"told" | "untold" | null>(null);
  const shown = told ? "told" : "untold";
  // The control swaps for its result and back: keep the keyboard on this row.
  useEffect(() => {
    if (moved.current !== shown) return;
    moved.current = null;
    box.current?.querySelector<HTMLElement>("button")?.focus();
  }, [shown]);
  const act = (next: string | null) => {
    moved.current = next ? "told" : "untold";
    onTell(item.id, next);
  };
  if (told) {
    return (
      <div ref={box} aria-live="polite" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <RegenIcon name="bell" size={16} strokeWidth={2} className="shrink-0 text-success" />
        <span>
          <span className="font-semibold">Varslet {told.to}</span>
          <span className="text-muted"> · {actionStamp(told.by, told.stamp, now)} · registrert her, ingen SMS ennå</span>
        </span>
        <Button variant="ghost" size="sm" className="print:hidden" onClick={() => act(null)} aria-label={`Angre: varslet ${told.to}`}>
          Angre
        </Button>
      </div>
    );
  }
  return (
    <div ref={box} aria-live="polite" className="flex flex-wrap items-center gap-x-3 gap-y-1 print:hidden">
      <Button variant="secondary" size="sm" onClick={() => act(to)}>
        <RegenIcon name="bell" size={18} />
        Varsle {to}
      </Button>
    </div>
  );
}

/** The catch leads: the room the room check held back, as the robot's own contradiction drawn on two points (no booking needed). */
function HeldFigure({ figures, contradicted, to }: { figures: Figures; contradicted: readonly Contradiction[]; to: string | undefined }) {
  const caught = figures.money.caught;
  const own = contradicted[0];
  const held = figures.money.held;
  const rooms = caught.map((room) => room.replace(/^room-/, ""));
  const doubled = held.some((row) => row.arrival);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <FigureLink to={to ? itemAnchor(to) : null}>
        {/* The room, not a count (round 6, design review): "209" is the demo's first word. */}
        <Stat size="lg" label="Holdt tilbake fra salg" value={rooms.length <= 2 ? rooms.join(" · ") : rooms.length} unit={rooms.length > 2 ? "rom" : undefined} />
      </FigureLink>
      {own ? <Points points={contradictionPoints(own)} stacked /> : <p className="text-sm">{`Rom ${rooms.join(", ")}${doubled ? ": bagasje levert etter romsjekken" : ": i bruk etter romsjekken"}`}</p>}
    </div>
  );
}

/**
 * The money (round 6, product review): the certain cost leads, a room in use with no booking (a night
 * nobody bills, a room the booking system may sell again), with its own link; the room found free is
 * said as time, "funnet ledig 5 timer tidligere", with a link to its two steps. The kroner for a free
 * room are real only if tonight sells out, so they stay behind *Slik regner vi*.
 */
function MoneyFigure({ figures, to, sale }: { figures: Figures | undefined; to: string | undefined; sale: string | undefined }) {
  if (!figures) {
    return (
      <div className="flex flex-col gap-1">
        <Skeleton className="h-10 w-28" />
        <span className="text-sm text-muted">Penger</span>
      </div>
    );
  }
  const { money, tonight, unbilled } = figures;
  const toSell = money.toSell.length;
  const released = money.released.length;
  const hours = hoursEarlier();
  const saleRooms = (toSell > 0 ? money.toSell : money.released).map((row) => row.room.replace(/^room-/, ""));
  const saleLine = toSell > 0 ? `Rom ${saleRooms.join(", ")}: funnet ledig ${hours} ${hours === 1 ? "time" : "timer"} tidligere` : `Rom ${saleRooms.join(", ")}: sendt til resepsjonen · venter på PMS-en`;
  if (unbilled.rooms.length === 0) return <SaleFigure figures={figures} to={sale} />;
  const rooms = unbilled.rooms.map((room) => room.replace(/^room-/, ""));
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <FigureLink to={to ? itemAnchor(to) : null}>
        <Stat
          size="lg"
          label={`Rom ${rooms.join(", ")} i bruk uten booking`}
          value={
            <>
              <span className="mr-1.5 font-sans text-base font-medium text-muted">ca.</span>
              <Digits value={formatKroner(unbilled.value)} />
            </>
          }
          unit="kr"
        />
      </FigureLink>
      <p className="text-xs text-muted">En natt ingen fakturerer · kan selges igjen i dag</p>
      {(toSell > 0 || released > 0) && (
        <a
          href={sale ? `#${itemAnchor(sale)}` : undefined}
          aria-live="polite"
          className="group -mx-1.5 flex min-h-11 items-center gap-1 rounded-md px-1.5 text-sm font-medium text-text transition-colors duration-[120ms] ease-standard hover:bg-sunken pointer-fine:min-h-8"
        >
          {saleLine}
          <RegenIcon name="arrow-down" size={14} strokeWidth={2} className="shrink-0 text-muted group-hover:text-text print:hidden" />
        </a>
      )}
      <Disclosure summary="Slik regner vi">{[unbilledMethod(unbilled.rooms.length, money.adr), toSell > 0 || released > 0 ? moneyMethod(money, tonight) : null].filter(Boolean).join(" ")}</Disclosure>
    </div>
  );
}

/** A night with no room in use without a booking: the room found free leads, its kroner real only if tonight sells out. */
function SaleFigure({ figures, to }: { figures: Figures; to: string | undefined }) {
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
