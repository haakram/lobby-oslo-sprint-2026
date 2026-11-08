"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { humanizeText, orderTypeLabel, placeLabel } from "@/features/dashboard/labels";
import type { OrderStatus } from "@/features/dashboard/selectors";
import { useNight } from "@/features/dashboard/useNight";
import { useOrderStatuses } from "@/features/dashboard/useOrderStatuses";
import { FigureRow, ModulePage, PanelHead } from "@/features/modules/ModulePage";
import { SourceNote } from "@/features/modules/SourceNote";
import { focusAction, UndoStatus } from "@/features/requests/UndoStatus";
import { byRole } from "@/features/staff/testData";
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton, Stat } from "@/ui";
import { countMaintenance, PRIORITY, selectMaintenance, splitNote, type WorkOrderView } from "./select";

/** What the last action did, so the status line can say it and *Angre* can put it back exactly. */
type Last = { key: number; id: string; message: string; where: string; previous: OrderStatus | undefined; moved: boolean };

/**
 * Vedlikehold: every work order, the robot's overnight findings and the ones staff reported, by
 * priority. Tildel hands it to the technician on shift; Marker løst closes it.
 */
export function MaintenanceScreen({ viewerUrl }: { viewerUrl?: string }) {
  const { statuses, statusOf, advance, undo, restore } = useOrderStatuses();
  const { run, orders } = useNight(viewerUrl);
  const technician = byRole("Vedlikehold").find((member) => member.shift === "dag") ?? null;
  const all = useMemo(() => selectMaintenance({ orders, statusOf, assignee: technician?.name ?? null }), [orders, statusOf, technician]);
  const counts = countMaintenance(all);
  const open = all.filter((order) => order.status !== "lost");
  const resolved = all.filter((order) => order.status === "lost");
  const [showResolved, setShowResolved] = useState(false);
  const [last, setLast] = useState<Last | null>(null);
  const seq = useRef(0);
  const lists = useRef<HTMLDivElement>(null);
  const refocus = useRef<string | null>(null);
  const loading = run.status === "loading";
  // The robot's orders are in every figure: until the night is in, the figures wait too.
  const figure = (value: number) => (loading ? <Skeleton className="inline-block h-7 w-10 align-middle" /> : value);

  // After Angre the order is back where it was: its action gets the focus again.
  useEffect(() => {
    if (!refocus.current) return;
    focusAction(lists.current, refocus.current);
    refocus.current = null;
  });

  const remember = (order: WorkOrderView, message: string, moved: boolean) => {
    seq.current += 1;
    setLast({ key: seq.current, id: order.id, message, where: whereOf(order), previous: statuses[order.id] as OrderStatus | undefined, moved });
  };
  const onAdvance = (order: WorkOrderView) => {
    const where = whereOf(order);
    const who = technician?.name.split(" ")[0];
    // Tildel keeps the row in place (its button stays focused); Marker løst moves it to the closed list.
    if (order.status === "ny") remember(order, `${where} er tildelt${who ? ` ${who}` : ""}.`, false);
    else remember(order, `${where} er markert løst og ligger under Løst.`, true);
    advance(order.id, order.status);
  };
  const onReopen = (order: WorkOrderView) => {
    remember(order, `${whereOf(order)} er åpen igjen.`, true);
    undo(order.id);
  };
  const undoLast = () => {
    if (!last) return;
    restore(last.id, last.previous);
    refocus.current = last.id;
    setLast(null);
  };

  return (
    <ModulePage module="vedlikehold" ready={!loading} lede="Robotens funn fra natten og feilene personalet har meldt, etter prioritet.">
      <FigureRow label="Arbeidsordrene i tall">
        <Stat label="Åpne" value={figure(counts.open)} />
        <Stat label="Høy prioritet" value={figure(counts.high)} tone={!loading && counts.high > 0 ? "danger" : "default"} />
        <Stat label="Tildelt" value={figure(counts.assigned)} unit={technician ? `hos ${technician.name.split(" ")[0]}` : undefined} />
        <Stat label="Rom ute av drift" value={counts.outOfOrder} tone={counts.outOfOrder > 0 ? "danger" : "default"} />
      </FigureRow>

      {run.status === "error" && (
        <ErrorState
          title="Fikk ikke lastet natten"
          body="Robotens arbeidsordre vises ikke før natteloggen svarer. Det personalet har meldt, står under."
          action={
            <Button variant="secondary" onClick={run.retry}>
              Prøv igjen
            </Button>
          }
        />
      )}

      <div ref={lists} className="flex flex-col gap-6 lg:gap-8">
        <section aria-labelledby="open-heading" data-enter>
          <Card className="sm:p-6">
            <PanelHead id="open-heading" title="Åpne arbeidsordre" count={open.length} note="Høy først. Tildel gir saken til vedlikehold på vakt." />
            {last && <UndoStatus key={last.key} className="mt-3" message={last.message} onUndo={undoLast} undoLabel={`Angre: ${last.where}`} takeFocus={last.moved} />}
            {open.length === 0 ? (
              loading ? (
                <LoadingRows rows={3} />
              ) : (
                <EmptyState className="mt-4" title="Ingen åpne arbeidsordre" body="Roboten fant ingen feil i natt, og ingen har meldt noe." />
              )
            ) : (
              <>
                <ol className="mt-2 divide-y divide-line">
                  {open.map((order) => (
                    <Row key={order.id} order={order} onAdvance={onAdvance} onReopen={onReopen} />
                  ))}
                </ol>
                {loading && <LoadingRows rows={1} />}
              </>
            )}
            <SourceNote className="mt-4" sources={run.status === "ready" ? ["run-log", "test", "local"] : ["test", "local"]} />
          </Card>
        </section>

        {resolved.length > 0 && (
          <section aria-labelledby="resolved-heading" data-enter>
            <Card className="sm:p-6">
              <PanelHead
                id="resolved-heading"
                title="Løst"
                count={resolved.length}
                action={
                  <Button variant="ghost" size="sm" onClick={() => setShowResolved((value) => !value)} aria-expanded={showResolved}>
                    {showResolved ? "Skjul" : "Vis"}
                  </Button>
                }
              />
              {showResolved && (
                <ol className="mt-2 divide-y divide-line">
                  {resolved.map((order) => (
                    <Row key={order.id} order={order} onAdvance={onAdvance} onReopen={onReopen} />
                  ))}
                </ol>
              )}
            </Card>
          </section>
        )}
      </div>
    </ModulePage>
  );
}

function whereOf(order: WorkOrderView): string {
  return order.room ? placeLabel(order.room) : placeLabel(order.place);
}

/** Orders still on their way, under the ones already here, in the shape of a row. */
function LoadingRows({ rows }: { rows: number }) {
  return (
    <div role="status" aria-busy="true" className="mt-4 flex flex-col gap-4">
      <span className="sr-only">Henter robotens natt</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ))}
    </div>
  );
}

function Row({ order, onAdvance, onReopen }: { order: WorkOrderView; onAdvance: (order: WorkOrderView) => void; onReopen: (order: WorkOrderView) => void }) {
  const priority = PRIORITY[order.priority];
  const where = whereOf(order);
  const done = order.status === "lost";
  // The robot writes its finding in Norwegian and quotes what it saw, sometimes in English.
  const { lead, quote } = order.origin === "robot" ? splitNote(order.text) : { lead: order.text, quote: null };
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {!done && <Badge tone={priority.tone}>{priority.word}</Badge>}
          <span className="font-semibold">{where}</span>
          <span className="text-sm text-muted">{orderTypeLabel(order.type)}</span>
          {order.outOfOrder && !done && <Badge tone="danger">Rom stengt</Badge>}
        </div>
        <p className="text-base">
          {humanizeText(lead)}
          {quote && (
            <>
              {": "}
              <q lang="en" className="text-muted">
                {quote}
              </q>
            </>
          )}
        </p>
        <p className="text-sm text-muted">
          Meldt {order.at ?? "–"} av {order.reportedBy}
          {order.assignee ? ` · hos ${order.assignee}` : order.status === "ny" ? " · ingen har tatt den" : ""}
        </p>
        {order.robot === "failed" && <p className="text-sm font-semibold text-danger">Robotens oppgave feilet, gjesten venter</p>}
      </div>
      <div className="flex shrink-0 items-center gap-3 sm:w-52 sm:justify-end">
        {order.status === "tildelt" && <Badge tone="warning">Tildelt</Badge>}
        {done ? (
          <>
            <Badge tone="success">Løst</Badge>
            <Button variant="ghost" size="sm" data-action-for={order.id} onClick={() => onReopen(order)} aria-label={`Angre løst: ${where}`}>
              Angre
            </Button>
          </>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            data-action-for={order.id}
            onClick={() => onAdvance(order)}
            aria-label={`${order.status === "ny" ? "Tildel" : "Marker løst"}: ${orderTypeLabel(order.type)}, ${where}`}
          >
            {order.status === "ny" ? "Tildel" : "Marker løst"}
          </Button>
        )}
      </div>
    </li>
  );
}
