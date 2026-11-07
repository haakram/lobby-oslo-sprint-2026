import { useState } from "react";
import { Badge, type BadgeTone, Button, Card, EmptyState, Skeleton } from "@/ui";
import { hhmm } from "./format";
import { humanizeText, orderTypeLabel, placeLabel } from "./labels";
import type { OrderStatus, OrderView } from "./selectors";

const SHOWN = 6;

const STATUS: Record<OrderStatus, { word: string; tone: BadgeTone } | null> = {
  ny: null,
  tildelt: { word: "Tildelt", tone: "warning" },
  lost: { word: "Løst", tone: "success" },
};

type Group = { id: string; title: string; orders: OrderView[] };

/** Urgency first: a guest waiting, then the floor (spill, noise), then the rest (UX audit, Oversikt 6). */
export function groupOrders(orders: readonly OrderView[]): Group[] {
  const guest: OrderView[] = [];
  const floor: OrderView[] = [];
  const rest: OrderView[] = [];
  for (const order of orders) {
    if (order.type === "gjesteklage" || order.robot === "failed") guest.push(order);
    else if (order.type === "sol" || order.type === "stoy") floor.push(order);
    else rest.push(order);
  }
  return [
    { id: "guest", title: "Gjest venter", orders: guest },
    { id: "floor", title: "Søl og støy", orders: floor },
    { id: "rest", title: "Annet", orders: rest },
  ].filter((group) => group.orders.length > 0);
}

/** Arbeidsordre: the faults the robot found or handled overnight, grouped by urgency, one action each. */
export function WorkOrders({
  orders,
  statuses,
  onAdvance,
  onUndo,
  className,
}: {
  orders: OrderView[] | null;
  statuses: Readonly<Record<string, OrderStatus>>;
  onAdvance: (id: string) => void;
  onUndo: (id: string) => void;
  className?: string;
}) {
  const [all, setAll] = useState(false);
  const open = orders?.filter((order) => (statuses[order.id] ?? "ny") !== "lost").length ?? 0;
  const groups = orders ? groupOrders(all ? orders : orders.slice(0, SHOWN)) : [];

  return (
    <section aria-labelledby="orders-heading" data-enter className={className}>
      <Card className="sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="orders-heading" className="scroll-mt-24 text-lg font-semibold tracking-[-0.01em]">
            Arbeidsordre
          </h2>
          {orders && orders.length > 0 && (
            <p className="text-sm text-muted">
              <span className="font-semibold tabular-nums">{open}</span> åpne av <span className="font-semibold tabular-nums">{orders.length}</span>
            </p>
          )}
        </div>

        {!orders ? (
          <div className="mt-4 flex flex-col gap-5" aria-busy="true">
            <span className="sr-only">Henter arbeidsordrene</span>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex flex-col gap-2">
                <Skeleton className="h-5 w-1/3" />
                <Skeleton className="h-4 w-4/5" />
              </div>
            ))}
          </div>
        ) : orders.length === 0 ? (
          <EmptyState className="mt-4" title="Ingen arbeidsordre i natt" body="Roboten fant ingen feil på rom eller i korridorene." />
        ) : (
          <>
            {groups.map((group) => (
              <div key={group.id} className="mt-5 first:mt-3">
                <h3 className="flex items-baseline gap-2 text-sm font-semibold">
                  {group.title}
                  <span className="font-normal text-muted tabular-nums">{group.orders.length}</span>
                </h3>
                <ol className="mt-1 divide-y divide-line">
                  {group.orders.map((order) => (
                    <OrderRow key={order.id} order={order} status={statuses[order.id] ?? "ny"} onAdvance={onAdvance} onUndo={onUndo} />
                  ))}
                </ol>
              </div>
            ))}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              {orders.length > SHOWN ? (
                <Button variant="ghost" size="sm" className="-ml-3" onClick={() => setAll((value) => !value)} aria-expanded={all}>
                  {all ? "Vis færre" : `Vis alle ${orders.length}`}
                </Button>
              ) : (
                <span />
              )}
              {/* TODO(phase-3): no backend yet; Tildelt and Løst are kept in this browser only. */}
              <p className="text-xs text-muted">Tildelt og løst lagres bare i denne nettleseren.</p>
            </div>
          </>
        )}
      </Card>
    </section>
  );
}

function OrderRow({
  order,
  status,
  onAdvance,
  onUndo,
}: {
  order: OrderView;
  status: OrderStatus;
  onAdvance: (id: string) => void;
  onUndo: (id: string) => void;
}) {
  const look = STATUS[status];
  const where = order.room ? placeLabel(order.room) : placeLabel(order.place);
  const action = status === "ny" ? "Tildel" : "Marker løst";

  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-base font-semibold">{where}</span>
          <span className="text-sm text-muted">{orderTypeLabel(order.type)}</span>
          <span className="text-sm whitespace-nowrap text-muted tabular-nums">{hhmm(order.at)}</span>
        </div>
        <p className="text-base">{humanizeText(order.text)}</p>
        {order.robot && order.request && (
          <p className={order.robot === "failed" ? "text-sm font-semibold text-danger" : "text-sm text-muted"}>
            Robotens oppgave {order.robot === "done" ? "ble fullført" : order.robot === "failed" ? "feilet, gjesten venter" : "pågår"}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3 sm:w-52 sm:justify-end">
        {look && (
          <span aria-live="polite">
            <Badge tone={look.tone}>{look.word}</Badge>
          </span>
        )}
        {status === "lost" ? (
          <Button variant="ghost" size="sm" onClick={() => onUndo(order.id)} aria-label={`Angre løst: ${where}`}>
            Angre
          </Button>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => onAdvance(order.id)} aria-label={`${action}: ${orderTypeLabel(order.type)}, ${where}`}>
            {action}
          </Button>
        )}
      </div>
    </li>
  );
}
