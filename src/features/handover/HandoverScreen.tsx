"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { canAccess, useSession } from "@/features/auth";
import { formatKroner, nightLabel } from "@/features/dashboard/format";
import { declineShort, nightFacts } from "@/features/dashboard/highlights";
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
import { moneyMethod, releasedLine } from "@/features/rooms/money";
import type { RoomCheckMark } from "@/features/rooms/reconcile";
import { SellSteps } from "@/features/rooms/SellSteps";
import { useRoomCheck } from "@/features/rooms/useRoomCheck";
import { APP_NAME, TAGLINE } from "@/ui/brand";
import { actionStamp, relativeTime, stampNow, useNowMs } from "@/ui/stamp";
import { Badge, Button, Card, cx, EmptyState, ErrorState, Figure as Digits, Monogram, RegenIcon, Skeleton, Stat } from "@/ui";
import { nightSafety } from "./safety";
import { composeHandover, type Figures, type Highlight, type OpenItem, openCount } from "./select";
import { sign, SIGNOFFS } from "./signoff";

const BY: Record<Highlight["by"], { word: string; tone: "accent" | "neutral" }> = {
  robot: { word: "Roboten", tone: "accent" },
  ai: { word: "AI-resepsjonisten", tone: "neutral" },
  staff: { word: "Personalet", tone: "neutral" },
};

/**
 * Overlevering 06:00: the night on one page for the morning manager. The good news in four figures,
 * the few things still open (each with someone who has it and a time), what happened, the night
 * shift's note, and *Kvitter mottatt*, which stamps who took over and when. Prints on one sheet.
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
  const declines = useMemo(() => (lines ? declineSplit(lines) : null), [lines]);

  const handover = useMemo(() => {
    if (!night || !rooms || !reconciliation || !safety) return null;
    const requests = selectRequests({ night, calls: null, statusOf, phone, assignments, hotelRooms });
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
      resolved: (id) => statusOf(id) === "lost",
      canOpen: (route) => effectiveRole === null || canAccess(effectiveRole, route),
    });
  }, [night, rooms, reconciliation, safety, statusOf, phone, assignments, hotelRooms, marks, revenue, today, pms, effectiveRole]);

  const signButton = useRef<HTMLDivElement>(null);
  const refocus = useRef(false);
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    signButton.current?.querySelector("button")?.focus();
  }, [signoff]);
  const setSigned = (value: boolean) => {
    refocus.current = true;
    sign(today, value ? { name: user?.name ?? "Morgenvakten", at: formatClock(new Date().toISOString()), stamp: stampNow(), open: handover ? openCount(handover.open) : undefined } : null);
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
  const issues = figures ? figures.guestIssues.noise + figures.guestIssues.lost + figures.guestIssues.spill : undefined;
  const facts = figures ? nightFacts({ confirmed: figures.robot.done, wetFloors: figures.safety.wetFloors, stranger: figures.safety.stranger }) : null;
  const signedWhen = signoff ? relativeTime(signoff.stamp, now) : null;

  return (
    <ModulePage
      module="overlevering"
      ready={handover !== null}
      lede="Natten oppsummert for morgenvakten: det som gikk bra, det som er åpent, og kvitteringen."
      meta={signoff ? <Badge tone="success">Kvittert{signedWhen ? ` ${signedWhen}` : ""}</Badge> : <Badge tone="neutral">Ikke kvittert ennå</Badge>}
      actions={
        <Button variant="secondary" className="print:hidden max-sm:hidden" onClick={() => window.print()} disabled={!handover}>
          <RegenIcon name="printer" size={20} />
          Skriv ut
        </Button>
      }
    >
      <div className="-mt-2 flex flex-col gap-1 lg:-mt-4">
        {/* A div, not a p: the label's skeleton is a div while the night loads. */}
        <div className="text-sm text-muted">
          {label ?? <Skeleton className="inline-block h-4 w-48 align-middle" />} · 22:00 til 06:00 · Vakt: roboten og {handover?.note.author ?? "nattevakten"}
        </div>
        {/* The night in one factual line: green only for what is done, the rest says plainly what needs a person. */}
        {facts && (
          <p className="text-base sm:text-lg">
            <span className="font-semibold text-success">
              <RegenIcon name="circle-check" size={20} strokeWidth={2} className="mr-1.5 inline-block align-[-0.2em]" />
              {facts.done}
            </span>
            {facts.attention && <span className="font-semibold"> · {facts.attention}</span>}
          </p>
        )}
      </div>

      <FigureRow label="Natten i tall">
        <MoneyFigure figures={figures} />
        <Figure
          label="Robotens oppdrag"
          value={figures?.robot.done}
          unit={figures ? `av ${figures.robot.total}` : undefined}
          tone="success"
          detail={figures ? robotLine(figures, declines) : undefined}
        />
        <Figure
          label="Gjestesaker løst"
          value={issues}
          tone="success"
          detail={figures ? issuesDetail(figures.guestIssues) : undefined}
        />
        <Figure
          label="Losjiinntekt i natt"
          value={figures ? formatKroner(figures.revenue.revenue) : undefined}
          unit="kr"
          detail={figures ? `Snittpris ${formatKroner(figures.revenue.adr)} kr · ${figures.revenue.roomsSold} av ${figures.roomsTotal} rom solgt` : undefined}
        />
      </FigureRow>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,480px)] lg:items-start lg:gap-8">
        {/* Phone order: what is open, then the night, then the sign-off; on a desk the night takes the left. */}
        <section aria-labelledby="open-heading" data-enter className="lg:col-start-2 lg:row-start-1">
          <Card className="sm:p-6">
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
                  <OpenRow key={item.id} item={item} marks={marks} today={today} />
                ))}
              </ul>
            )}
            <SourceNote className="mt-3" sources={["run-log", "test", "local"]} />
          </Card>
        </section>

        <section aria-labelledby="night-heading" data-enter className="lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <Card className="sm:p-6">
            <PanelHead id="night-heading" title="Dette skjedde i natt" />
            {!handover ? (
              <Rows rows={5} />
            ) : (
              <ol className="mt-3 flex flex-col">
                {handover.timeline.map((line, index) => (
                  <li key={`${line.at}-${index}`} className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-4 border-t border-line py-3 first:border-t-0 sm:grid-cols-[4rem_minmax(0,1fr)]">
                    <span className="pt-0.5 font-mono text-sm whitespace-nowrap tabular-nums text-muted">{line.at}</span>
                    <div className="flex min-w-0 flex-col items-start gap-1">
                      <Badge tone={BY[line.by].tone}>{BY[line.by].word}</Badge>
                      <p className="text-base">{line.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {handover && (
              <figure className="mt-4 rounded-md bg-sunken p-4">
                <figcaption className="flex items-center gap-2 text-sm font-semibold">
                  <Monogram name={handover.note.author} size={24} />
                  {handover.note.author} <span className="font-normal text-muted">· {handover.note.role}</span>
                </figcaption>
                <blockquote className="mt-2 text-base">{handover.note.text}</blockquote>
              </figure>
            )}
            <SourceNote className="mt-3" sources={["run-log", "reception", "test"]} />
          </Card>
        </section>

        {/* The robot's judgement calls (owner C's card, the whole night): the stranger it refused, every "done" confirmed. */}
        {ready && run.lines.length > 0 && (
          <div data-enter className="lg:col-span-2 lg:row-start-3">
            <RobotJudgementCard lines={run.lines} id="vurderinger-overlevering" />
          </div>
        )}

        <section aria-labelledby="sign-heading" data-enter className="lg:col-start-2 lg:row-start-2">
          <Card className={cx("sm:p-6", signoff && "border-success")}>
            <PanelHead id="sign-heading" title="Kvitter mottatt" />
            <div ref={signButton} aria-live="polite" className="mt-3 flex flex-col gap-3">
              {signoff ? (
                <>
                  <p className="flex items-start gap-2 text-lg font-semibold tracking-[-0.01em]">
                    <RegenIcon name="circle-check" size={22} className="mt-0.5 shrink-0 text-success" />
                    <span>Kvittert av {actionStamp(signoff.name, signoff.stamp, now)}</span>
                  </p>
                  <p className="text-sm text-muted">
                    {label ? `${label} er overlevert` : "Natten er overlevert"}
                    {signoff.open !== undefined ? `, med ${signoff.open} ${signoff.open === 1 ? "åpen sak" : "åpne saker"}` : ""}. Kvitteringen er lagret på denne enheten.
                  </p>
                  <Button variant="ghost" size="sm" className="self-start print:hidden" onClick={() => setSigned(false)}>
                    Angre kvitteringen
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-base text-muted">Les gjennom det som er åpent, og kvitter når du har tatt over vakten.</p>
                  <Button size="lg" className="w-full sm:w-auto sm:self-start print:hidden" onClick={() => setSigned(true)} disabled={!handover}>
                    Kvitter mottatt
                  </Button>
                  {/* TODO(phase-3): the sign-off goes to the server with the user's id, so the night shift sees it was read. */}
                  <p className="text-xs text-muted">Du kvitterer som {user?.name ?? "morgenvakten"}. Kvitteringen lagres på denne enheten.</p>
                </>
              )}
            </div>
          </Card>
        </section>
      </div>

      {/* The printed page is the leave-behind a hotel keeps (jury round 2, the marketing juror): the name, the line and who made it.
          No contact address exists yet, so none is printed (no e-mail, no invented domain). */}
      <footer className="hidden border-t border-line pt-3 text-xs text-muted print:block">
        {APP_NAME} · {TAGLINE} · Team Fettero, Oslo Sprint 2026
      </footer>
    </ModulePage>
  );
}

/** "Godkjent av dommeren (Wybe Night Shift-simulatoren): 73 av 73 · 7 falske klager avvist · 1 ikke godkjent · nattevakten 3 · AI tok 2 samtaler". */
function robotLine(
  { robot, staffDone, calls }: { robot: { done: number; reported: number; declined: number; cancelled: number }; staffDone: number; calls: number },
  declines: DeclineSplit | null,
): string {
  return [
    `Godkjent av dommeren (Wybe Night Shift-simulatoren): ${robot.done} av ${robot.reported}`,
    declineShort(declines, robot.declined),
    robot.cancelled > 0 ? `${robot.cancelled} avlyst` : null,
    staffDone > 0 ? `nattevakten ${staffDone}` : null,
    `AI tok ${calls} ${calls === 1 ? "samtale" : "samtaler"}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function issuesDetail({ noise, lost, spill }: { noise: number; lost: number; spill: number }): string {
  return [
    noise ? `${noise} ${noise === 1 ? "støyklage" : "støyklager"}` : null,
    lost ? `${lost} ${lost === 1 ? "gjenglemt ting" : "gjenglemte ting"} funnet` : null,
    spill ? `${spill} søl sikret` : null,
  ]
    .filter(Boolean)
    .join(", ") || "Ingen gjestesaker i natt";
}

function Figure({ label, value, unit, tone, detail }: { label: string; value: ReactNode | undefined; unit?: string; tone?: "success"; detail?: string }) {
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
      <Stat label={label} value={value} unit={unit} tone={tone} />
      {detail && <p className="text-xs text-muted">{detail}</p>}
    </div>
  );
}

function OpenRow({ item, marks, today }: { item: OpenItem; marks: Readonly<Record<string, RoomCheckMark>>; today: string }) {
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <p className={cx("min-w-0 flex-1 text-base", item.done && "text-muted")}>
          {item.safety && <RegenIcon name="alert-triangle" size={18} className="mr-1.5 inline-block align-[-0.2em]" />}
          {item.text}
        </p>
        {item.safety ? <Badge>Sikkerhet</Badge> : item.urgent ? <Badge tone="warning">Gjest venter</Badge> : item.done ? <Badge tone="success">Gjort i dag</Badge> : null}
      </div>
      {item.sell && (
        <div className="flex flex-col gap-2 print:hidden">
          {item.sell.map((room) => (
            <div key={room} className="flex flex-wrap items-start gap-x-3 gap-y-1">
              {item.sell && item.sell.length > 1 && <span className="mt-2 rounded-sm bg-sunken px-2 py-1 font-mono text-sm font-medium tabular-nums">{room.replace(/^room-/, "")}</span>}
              <SellSteps room={room} mark={marks[room]} today={today} className="min-w-0 flex-1" />
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
        <span className="flex min-w-0 items-center gap-2">
          {/* A role ("Vaktmester / renhold") gets its initials, not "V/". */}
          <Monogram name={item.owner.replace(/^[^:]+: /, "").replace(/\s*\/\s*/g, " ")} size={24} />
          <span className="min-w-0">{item.owner}</span>
          <span className="text-muted">·</span>
          <span className="whitespace-nowrap text-muted">
            innen <span className="font-mono tabular-nums text-text">{item.due}</span>
          </span>
        </span>
        {item.href && (
          <Link href={item.href} className="flex min-h-11 items-center font-semibold text-accent-text hover:underline print:hidden">
            {item.linkLabel}
          </Link>
        )}
      </div>
    </li>
  );
}

/** The first figure is the money (jury round 2, the founder juror/the creative juror): what the room check can sell, held back, released today. */
function MoneyFigure({ figures }: { figures: Figures | undefined }) {
  if (!figures) {
    return (
      <div className="flex flex-col gap-1">
        <Skeleton className="h-10 w-28" />
        <span className="text-sm text-muted">Kan selges etter bekreftelse</span>
      </div>
    );
  }
  const { money } = figures;
  const toSell = money.toSell.length;
  const released = money.released.length;
  if (toSell === 0 && released === 0 && money.held.length === 0) {
    return <Figure label="Klare til salg" value={figures.roomsReady} unit={`av ${figures.roomsTotal}`} tone={figures.roomsReady ? "success" : undefined} />;
  }
  const value = toSell > 0 ? money.toSellValue : money.releasedValue;
  const rooms = (toSell > 0 ? money.toSell : money.released).map((row) => row.room.replace(/^room-/, ""));
  const held = money.held.map((row) => row.room.replace(/^room-/, ""));
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Stat
        size="lg"
        label={toSell > 0 ? "Kan selges etter bekreftelse" : released > 0 ? "Frigitt for salg i dag" : "Rom å selge i dag"}
        value={
          toSell > 0 || released > 0 ? (
            <>
              <span className="mr-1.5 font-sans text-base font-medium text-muted">ca.</span>
              <Digits value={formatKroner(value)} />
            </>
          ) : (
            0
          )
        }
        unit={toSell > 0 || released > 0 ? "kr" : undefined}
        tone={toSell === 0 && released > 0 ? "success" : undefined}
      />
      <p aria-live="polite" className="text-xs text-muted">
        {[rooms.length > 0 ? `Rom ${rooms.join(", ")}` : null, held.length > 0 ? `${held.length} holdt tilbake (rom ${held.join(", ")})` : null].filter(Boolean).join(" · ")}
      </p>
      <p className="text-xs text-muted">{releasedLine(money)}</p>
      <details className="text-xs text-muted print:hidden">
        <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-accent-text hover:underline pointer-fine:min-h-8">Slik regner vi</summary>
        <p className="max-w-[40ch] pb-1">{moneyMethod(money)}</p>
      </details>
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
