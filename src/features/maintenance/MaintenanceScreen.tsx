"use client";

import { useMemo, useState } from "react";
import { humanizeText, orderTypeLabel, placeLabel } from "@/features/dashboard/labels";
import { useNight } from "@/features/dashboard/useNight";
import { useOrderStatuses } from "@/features/dashboard/useOrderStatuses";
import { FigureRow, ModulePage, PanelHead } from "@/features/modules/ModulePage";
import { SourceNote } from "@/features/modules/SourceNote";
import { byRole } from "@/features/staff/testData";
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton, Stat } from "@/ui";
import { countMaintenance, PRIORITY, selectMaintenance, type WorkOrderView } from "./select";

/**
 * Vedlikehold: every work order, the robot's overnight findings and the ones staff reported, by
 * priority. Tildel hands it to the technician on shift; Marker løst closes it.
 */
export function MaintenanceScreen({ viewerUrl }: { viewerUrl?: string }) {
  const { statusOf, advance, undo } = useOrderStatuses();
  const { run, orders } = useNight(viewerUrl);
  const technician = byRole("Vedlikehold").find((member) => member.shift === "dag") ?? null;
  const all = useMemo(() => selectMaintenance({ orders, statusOf, assignee: technician?.name ?? null }), [orders, statusOf, technician]);
  const counts = countMaintenance(all);
  const open = all.filter((order) => order.status !== "lost");
  const resolved = all.filter((order) => order.status === "lost");
  const [showResolved, setShowResolved] = useState(false);
  const loading = run.status === "loading";

  return (
    <ModulePage module="vedlikehold" ready={!loading} lede="Robotens funn fra natten og feilene personalet har meldt, etter prioritet.">
      <FigureRow label="Arbeidsordrene i tall">
        <Stat label="Åpne" value={counts.open} />
        <Stat label="Høy prioritet" value={counts.high} tone={counts.high > 0 ? "danger" : "default"} />
        <Stat label="Tildelt" value={counts.assigned} unit={technician ? `hos ${technician.name.split(" ")[0]}` : undefined} />
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

      <section aria-labelledby="open-heading" data-enter>
        <Card className="sm:p-6">
          <PanelHead id="open-heading" title="Åpne arbeidsordre" count={open.length} note="Høy først. Tildel gir saken til vedlikehold på vakt." />
          {loading && open.length === 0 ? (
            <div className="mt-4 flex flex-col gap-4" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex flex-col gap-2">
                  <Skeleton className="h-5 w-1/3" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              ))}
            </div>
          ) : open.length === 0 ? (
            <EmptyState className="mt-4" title="Ingen åpne arbeidsordre" body="Roboten fant ingen feil i natt, og ingen har meldt noe." />
          ) : (
            <ol className="mt-2 divide-y divide-line">
              {open.map((order) => (
                <Row key={order.id} order={order} onAdvance={advance} onUndo={undo} />
              ))}
            </ol>
          )}
          <SourceNote className="mt-4" sources={["run-log", "test", "local"]} />
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
                  <Row key={order.id} order={order} onAdvance={advance} onUndo={undo} />
                ))}
              </ol>
            )}
          </Card>
        </section>
      )}
    </ModulePage>
  );
}

function Row({ order, onAdvance, onUndo }: { order: WorkOrderView; onAdvance: (id: string) => void; onUndo: (id: string) => void }) {
  const priority = PRIORITY[order.priority];
  const where = order.room ? placeLabel(order.room) : placeLabel(order.place);
  const done = order.status === "lost";
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {!done && <Badge tone={priority.tone}>{priority.word}</Badge>}
          <span className="font-semibold">{where}</span>
          <span className="text-sm text-muted">{orderTypeLabel(order.type)}</span>
          {order.outOfOrder && !done && <Badge tone="danger">Rom stengt</Badge>}
        </div>
        <p className="text-base">{humanizeText(order.text)}</p>
        <p className="text-sm text-muted">
          Meldt {order.at ?? "–"} av {order.reportedBy}
          {order.assignee ? ` · hos ${order.assignee}` : order.status === "ny" ? " · ingen har tatt den" : ""}
        </p>
        {order.robot === "failed" && <p className="text-sm font-semibold text-danger">Robotens oppgave feilet, gjesten venter</p>}
      </div>
      <div className="flex shrink-0 items-center gap-3 sm:w-52 sm:justify-end">
        {order.status === "tildelt" && (
          <span aria-live="polite">
            <Badge tone="warning">Tildelt</Badge>
          </span>
        )}
        {done ? (
          <>
            <Badge tone="success">Løst</Badge>
            <Button variant="ghost" size="sm" onClick={() => onUndo(order.id)} aria-label={`Angre løst: ${where}`}>
              Angre
            </Button>
          </>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => onAdvance(order.id)} aria-label={`${order.status === "ny" ? "Tildel" : "Marker løst"}: ${orderTypeLabel(order.type)}, ${where}`}>
            {order.status === "ny" ? "Tildel" : "Marker løst"}
          </Button>
        )}
      </div>
    </li>
  );
}
