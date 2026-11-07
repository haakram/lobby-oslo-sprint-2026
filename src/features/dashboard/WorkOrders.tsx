import { useState } from "react";
import { Badge, type BadgeTone, Button, Card, EmptyState, Skeleton } from "@/ui";
import { hhmm } from "./format";
import { humanizeText, orderTypeLabel, placeLabel } from "./labels";
import type { OrderStatus, OrderView } from "./selectors";

const SHOWN = 6;

const STATUS: Record<OrderStatus, { word: string; tone: BadgeTone }> = {
  ny: { word: "Ny", tone: "danger" },
  tildelt: { word: "Tildelt", tone: "warning" },
  lost: { word: "Løst", tone: "success" },
};

/** Arbeidsordre: the faults the robot found or handled overnight, newest first, one action each. */
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
  const shown = orders ? (all ? orders : orders.slice(0, SHOWN)) : [];

  return (
    <section aria-labelledby="orders-heading" data-enter className={className}>
      <Card className="sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="orders-heading" className="text-lg font-semibold tracking-[-0.01em]">
            Arbeidsordre
          </h2>
          {orders && orders.length > 0 && (
            <p className="text-sm text-muted">
              <span className="font-semibold tabular-nums">{open}</span> åpne av{" "}
              <span className="font-semibold tabular-nums">{orders.length}</span>
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
          <EmptyState
            className="mt-4"
            title="Ingen arbeidsordre i natt"
            body="Roboten fant ingen feil på rom eller i korridorene."
          />
        ) : (
          <>
            <ol className="mt-2">
              {shown.map((order) => (
                <OrderRow
                  key={order.id}
                  order={order}
                  status={statuses[order.id] ?? "ny"}
                  onAdvance={onAdvance}
                  onUndo={onUndo}
                />
              ))}
            </ol>
            {orders.length > SHOWN && (
              <Button variant="ghost" className="mt-2 -ml-4" onClick={() => setAll((value) => !value)} aria-expanded={all}>
                {all ? "Vis færre" : `Vis alle ${orders.length}`}
              </Button>
            )}
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
    <li className="flex flex-col gap-3 border-t border-line py-4 first:border-t-0 sm:flex-row sm:items-center sm:gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Badge>{orderTypeLabel(order.type)}</Badge>
          <span className="text-base font-semibold">{where}</span>
          <span className="text-sm whitespace-nowrap text-muted tabular-nums">{hhmm(order.at)}</span>
        </div>
        <p className="text-base">{humanizeText(order.text)}</p>
        {order.robot && order.request && (
          <p className="text-sm text-muted">
            Robotens oppgave {order.request}: {order.robot === "done" ? "fullført" : order.robot === "failed" ? "feilet" : "pågår"}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3 sm:w-52 sm:justify-end">
        <span aria-live="polite">
          <Badge tone={look.tone}>{look.word}</Badge>
        </span>
        {/* TODO(phase-3): no backend yet; Tildelt and Løst live in this browser tab only. */}
        {status === "lost" ? (
          <Button variant="ghost" onClick={() => onUndo(order.id)} aria-label={`Angre løst: ${where}`}>
            Angre
          </Button>
        ) : (
          <Button
            variant="secondary"
            onClick={() => onAdvance(order.id)}
            aria-label={`${action}: ${orderTypeLabel(order.type)}, ${where}`}
          >
            {action}
          </Button>
        )}
      </div>
    </li>
  );
}
