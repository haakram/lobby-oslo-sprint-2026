"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { useSession } from "@/features/auth";
import { formatKroner, nightLabel } from "@/features/dashboard/format";
import { useNight } from "@/features/dashboard/useNight";
import { useOrderStatuses } from "@/features/dashboard/useOrderStatuses";
import { FigureRow, ModulePage, PanelHead } from "@/features/modules/ModulePage";
import { SourceNote } from "@/features/modules/SourceNote";
import { osloToday } from "@/features/reception/dates";
import { type DemoCall, demoCalls } from "@/features/reception/demoCalls";
import { formatClock } from "@/features/reception/format";
import { useStoredRecords } from "@/features/reception/useStoredRecords";
import { PHONE_ASSIGNMENTS, phoneTasks } from "@/features/requests/phoneTasks";
import { selectRequests } from "@/features/requests/select";
import { pmsLastNight, revenueLastNight } from "@/features/rooms/pms";
import { reconcileRooms, robotRoomChecks, ROOM_CHECK_MARKS } from "@/features/rooms/reconcile";
import { Badge, Button, Card, cx, EmptyState, ErrorState, Monogram, RegenIcon, Skeleton, Stat } from "@/ui";
import { composeHandover, type Highlight, type OpenItem } from "./select";
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
  const { run, night, rooms } = useNight(viewerUrl, resolved);
  const { user } = useSession();
  const { records } = useStoredRecords();
  const seeded = useMemo(() => demo ?? demoCalls(today), [demo, today]);
  const phone = useMemo(() => phoneTasks(records, seeded), [records, seeded]);
  const assignments = PHONE_ASSIGNMENTS.use();
  const marks = ROOM_CHECK_MARKS.use()[today];
  const signoff = SIGNOFFS.use()[today] ?? null;
  const ready = run.status === "ready";

  const handover = useMemo(() => {
    if (!night || !rooms || !ready) return null;
    const pms = pmsLastNight(today);
    const reconciliation = reconcileRooms(robotRoomChecks(run.lines), pms);
    const requests = selectRequests({ night, calls: null, statusOf, phone, assignments });
    return composeHandover({ night, rooms, reconciliation, marks: marks ?? {}, requests, phone, revenue: revenueLastNight(rooms.length, pms) });
  }, [night, rooms, ready, run.lines, statusOf, phone, assignments, marks, today]);

  const signButton = useRef<HTMLDivElement>(null);
  const refocus = useRef(false);
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    signButton.current?.querySelector("button")?.focus();
  }, [signoff]);
  const setSigned = (value: boolean) => {
    refocus.current = true;
    sign(today, value ? { name: user?.name ?? "Morgenvakten", at: formatClock(new Date().toISOString()) } : null);
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

  return (
    <ModulePage
      module="overlevering"
      ready={handover !== null}
      lede="Natten oppsummert for morgenvakten: det som gikk bra, det som er åpent, og kvitteringen."
      meta={signoff ? <Badge tone="success">Kvittert {signoff.at}</Badge> : <Badge tone="neutral">Ikke kvittert ennå</Badge>}
      actions={
        <Button variant="secondary" className="print:hidden" onClick={() => window.print()} disabled={!handover}>
          <RegenIcon name="printer" size={20} />
          Skriv ut
        </Button>
      }
    >
      <div className="-mt-2 text-sm text-muted lg:-mt-4">
        {label ?? <Skeleton className="inline-block h-4 w-48 align-middle" />} · 22:00 til 06:00 · Vakt: roboten og {handover?.note.author ?? "nattevakten"}
      </div>

      <FigureRow label="Natten i tall">
        <Figure
          label="Klare til salg"
          value={figures?.roomsReady}
          unit={figures ? `av ${figures.roomsTotal}` : undefined}
          tone="success"
          detail={figures && figures.sellable > 0 ? `${figures.sellable} rom kan selges i dag · ca. ${formatKroner(figures.sellableValue)} kr (systemet trodde de var opptatt)` : undefined}
        />
        <Figure
          label="Robotens oppdrag"
          value={figures?.robot.done}
          unit={figures ? `av ${figures.robot.total}` : undefined}
          tone="success"
          detail={figures ? robotLine(figures) : undefined}
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
            <PanelHead id="open-heading" title="Åpent nå" count={handover?.open.length} note="Hver sak har en eier og en frist." />
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
                  <OpenRow key={item.id} item={item} />
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

        <section aria-labelledby="sign-heading" data-enter className="lg:col-start-2 lg:row-start-2">
          <Card className={cx("sm:p-6", signoff && "border-success")}>
            <PanelHead id="sign-heading" title="Kvitter mottatt" />
            <div ref={signButton} aria-live="polite" className="mt-3 flex flex-col gap-3">
              {signoff ? (
                <>
                  <p className="flex items-start gap-2 text-lg font-semibold tracking-[-0.01em]">
                    <RegenIcon name="circle-check" size={22} className="mt-0.5 shrink-0 text-success" />
                    <span>
                      Signert av {signoff.name} <span className="font-mono tabular-nums">{signoff.at}</span>
                    </span>
                  </p>
                  <p className="text-sm text-muted">{label ? `${label} er overlevert.` : "Natten er overlevert."} Nattevakten ser at den er lest.</p>
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
                  <p className="text-xs text-muted">Du kvitterer som {user?.name ?? "morgenvakten"}, med klokkeslett.</p>
                </>
              )}
            </div>
            <SourceNote className="mt-3" sources="local" />
          </Card>
        </section>
      </div>
    </ModulePage>
  );
}

/** "Godkjent av Wybe-serveren: 73 av 73 · 8 avvist uten bestilling · nattevakten 3 · AI tok 2 samtaler". */
function robotLine({ robot, staffDone, calls }: { robot: { done: number; reported: number; declined: number; cancelled: number }; staffDone: number; calls: number }): string {
  return [
    `Godkjent av Wybe-serveren: ${robot.done} av ${robot.reported}`,
    robot.declined > 0 ? `${robot.declined} avvist uten bestilling` : null,
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

function OpenRow({ item }: { item: OpenItem }) {
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 flex-1 text-base">{item.text}</p>
        {item.urgent && <Badge tone="warning">Gjest venter</Badge>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
        <span className="flex min-w-0 items-center gap-2">
          <Monogram name={item.owner.replace(/^Renhold: /, "")} size={24} />
          <span className="min-w-0">{item.owner}</span>
          <span className="text-muted">·</span>
          <span className="whitespace-nowrap text-muted">
            innen <span className="font-mono tabular-nums text-text">{item.due}</span>
          </span>
        </span>
        <Link href={item.href} className="flex min-h-11 items-center font-semibold text-accent-text hover:underline print:hidden">
          {item.linkLabel}
        </Link>
      </div>
    </li>
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
