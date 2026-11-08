"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { canAccess } from "@/features/auth/roles";
import { useSession } from "@/features/auth/SessionProvider";
import { useHotelData } from "@/features/dashboard/useHotelData";
import { handoverLine, type HandoverSummary } from "@/features/handover/select";
import { openSummary, useHandover } from "@/features/handover/useHandover";
import { moduleById } from "@/features/modules/registry";
import { osloToday } from "@/features/reception/dates";
import { Badge, Button, buttonClasses, cx, EmptyState, RegenIcon, Sheet, Skeleton } from "@/ui";
import { type Alert, MAX_ALERTS, selectAlerts } from "./alerts";
import { isNew, useSeen } from "./useSeen";

/**
 * "Varsler, 3 nye": the bell's name says the count, the badge only shows it. For a role that may open
 * Overlevering the badge is the page's straks (round 7, design review: 10 on the bell, 13 in *Åpent nå*
 * and 5 on the safety figure read as three counts), and the name says the page's line.
 */
export function bellLabel(fresh: number, loading: boolean, handover: HandoverSummary | null = null): string {
  if (loading) return "Varsler, henter";
  if (handover) return `Varsler, ${handoverLine(handover).replace(/^Overlevering 06:00: /, "")}`;
  if (fresh === 0) return "Varsler, ingen nye";
  return `Varsler, ${fresh} ${fresh === 1 ? "ny" : "nye"}`;
}

const noop = () => () => {};

// The one "needs you" line lives with the page that owns the numbers (handover/select.ts).
export { handoverLine, type HandoverSummary };

/**
 * The bell in the navigation, on every page and for every role: what needs a person, from every
 * module the role may open. Reads the same hotel as Oversikt (useHotelData), and the same Overlevering
 * as the page (useHandover): its safety alerts are *Åpent nå*'s straks saker, the night clerk's
 * entries included, and its line says how many saker the page holds.
 */
export function NotificationBell({ viewerUrl }: { viewerUrl?: string }) {
  const { user } = useSession();
  const { data, nightState, statusOf } = useHotelData(viewerUrl);
  const { safety, handover } = useHandover({ nightState, statusOf, today: osloToday() });
  const alerts = useMemo(() => selectAlerts({ ...data, safety: safety ?? data.safety }), [data, safety]);
  const mayOpen = canAccess(data.role, "/overlevering");
  const summary = useMemo(() => (handover && mayOpen ? openSummary(handover.open) : null), [handover, mayOpen]);
  // Until the page's numbers are in, a role that may open it gets no badge (never a count that then changes meaning).
  return (
    <NotificationBellView
      alerts={alerts}
      loading={data.loading}
      nightFailed={data.nightStatus === "error"}
      user={user?.u ?? null}
      handover={summary}
      handoverPending={mayOpen && !summary && data.nightStatus !== "error"}
    />
  );
}

/**
 * The bell and its sheet. The badge counts what is new to this person; the sheet lists it with one
 * action each, *Marker som sett* per alert and *Merk alle som sett*. Seen alerts stay listed under
 * Sett (quiet), so marking one never makes it disappear without a trace. Red and amber live only
 * here, on alerts that are new.
 */
export function NotificationBellView({
  alerts,
  loading,
  nightFailed = false,
  user,
  handover = null,
  handoverPending = false,
}: {
  alerts: readonly Alert[];
  loading: boolean;
  nightFailed?: boolean;
  user: string | null;
  /** Overlevering's *Åpent nå* (useHandover), for a role that may open it; null otherwise. */
  handover?: HandoverSummary | null;
  /** The role may open Overlevering and its numbers are not in yet: no badge until they are. */
  handoverPending?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [said, setSaid] = useState("");
  const { seen, mark } = useSeen(user);
  // The sheet goes to <body>, out of the rail's stacking context; only in the browser.
  const browser = useSyncExternalStore(noop, () => true, () => false);
  const list = useRef<HTMLDivElement>(null);
  const [focusNext, setFocusNext] = useState<string | null>(null);

  const shown = alerts.slice(0, MAX_ALERTS);
  const rest = alerts.slice(MAX_ALERTS);
  const fresh = shown.filter((alert) => isNew(alert, seen));
  const old = shown.filter((alert) => !isNew(alert, seen));
  // The badge counts every new alert, also the ones named in "og N til" (review round 1: it said 5 with 6 in the sheet).
  const freshAll = alerts.filter((alert) => isNew(alert, seen));
  const freshCount = freshAll.length;
  const waiting = loading && alerts.length === 0;
  // One count (round 7): the badge is Overlevering's straks when the role may open it, else what is new here.
  const badge = handover ? handover.straks : handoverPending ? 0 : freshCount;

  // After Marker som sett the button is gone: put the focus on the next new alert, or on the one
  // just marked (now under Sett), never on <body>.
  useEffect(() => {
    if (!focusNext || !list.current) return;
    const row = list.current.querySelector<HTMLElement>(`[data-alert="${focusNext}"]`);
    (row?.querySelector<HTMLElement>("[data-mark]") ?? row?.querySelector<HTMLElement>("a"))?.focus();
    setFocusNext(null);
  }, [focusNext, seen]);

  function markOne(alert: Alert) {
    const index = fresh.findIndex((entry) => entry.id === alert.id);
    const next = fresh[index + 1] ?? fresh[index - 1] ?? alert;
    mark([alert]);
    setSaid(`${alert.title}: markert som sett.`);
    setFocusNext(next.id);
  }

  function markAll() {
    mark(freshAll);
    setSaid(freshAll.length === 1 ? "Varselet er markert som sett." : `Alle ${freshAll.length} varsler er markert som sett.`);
    if (fresh[0]) setFocusNext(fresh[0].id);
  }

  function take(alert: Alert) {
    // Taking the action is seeing it.
    mark([alert]);
    setOpen(false);
  }

  const sheet = (
    <Sheet open={open} onClose={() => setOpen(false)} title="Varsler" surface="light">
      <div ref={list}>
        <p role="status" className="sr-only">
          {said}
        </p>
        {/* The page's two numbers, from the same composition: the bell's Haster safety rows are its straks. */}
        {handover && handover.total > 0 && !waiting && (
          <p className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line pb-2 text-sm">
            <span>{handoverLine(handover)}</span>
            <Link href="/overlevering" onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center font-semibold text-accent-text hover:underline">
              Åpne Overlevering
            </Link>
          </p>
        )}
        {waiting ? (
          <div className="flex flex-col gap-4 py-2" aria-busy="true">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <span className="sr-only">Henter varslene</span>
          </div>
        ) : alerts.length === 0 ? (
          <EmptyState
            as="h3"
            className="py-4"
            icon={<RegenIcon name="circle-check" size={28} className="text-success" />}
            title="Ingenting trenger deg nå"
            body="Roboten og personalet har resten. Kommer det noe som trenger en person, står det her."
          />
        ) : (
          <>
            <div className="flex min-h-10 flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <p className="text-sm text-muted">{freshCount > 0 ? `${freshCount} ${freshCount === 1 ? "ny" : "nye"}, trenger en person` : "Alt her er sett."}</p>
              {freshCount > 0 && (
                <Button variant="ghost" size="sm" onClick={markAll}>
                  Merk alle som sett
                </Button>
              )}
            </div>
            {fresh.length > 0 && (
              <ul aria-label="Nye varsler" className="divide-y divide-line">
                {fresh.map((alert) => (
                  <AlertRow key={alert.id} alert={alert} fresh onTake={() => take(alert)} onSeen={() => markOne(alert)} />
                ))}
              </ul>
            )}
            {old.length > 0 && (
              <section aria-labelledby="seen-heading" className={cx(fresh.length > 0 && "mt-4 border-t border-line pt-3")}>
                <h3 id="seen-heading" className="text-sm font-medium text-muted">
                  Sett
                </h3>
                <ul className="divide-y divide-line">
                  {old.map((alert) => (
                    <AlertRow key={alert.id} alert={alert} fresh={false} onTake={() => take(alert)} />
                  ))}
                </ul>
              </section>
            )}
            {rest.length > 0 && (
              <p className="mt-3 flex flex-wrap items-center gap-x-3 border-t border-line pt-3 text-sm">
                <span className="text-muted">og {rest.length} til:</span>
                {rest.map((alert) => (
                  <Link
                    key={alert.id}
                    href={moduleById(alert.module).route}
                    onClick={() => take(alert)}
                    className="inline-flex min-h-11 items-center font-semibold text-accent-text hover:underline"
                  >
                    {alert.title}
                  </Link>
                ))}
              </p>
            )}
            {loading && (
              // The night is still coming in: the robot's alerts may land here.
              <div className="pt-3">
                <Skeleton className="h-6 w-2/3" />
                <span className="sr-only">Henter natten</span>
              </div>
            )}
          </>
        )}
        {nightFailed && <p className="mt-4 text-sm text-muted">Natten er ikke lastet, så robotens varsler mangler her. Prøv igjen fra Oversikt.</p>}
      </div>
    </Sheet>
  );

  return (
    <>
      <button
        type="button"
        aria-label={bellLabel(freshCount, waiting, handover)}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setSaid("");
          setOpen(true);
        }}
        className={cx(
          "relative flex size-11 shrink-0 items-center justify-center rounded-md text-muted",
          "transition-[background-color,color,transform] duration-[120ms] ease-standard hover:bg-sunken hover:text-text active:scale-[0.97]",
          "focus-visible:outline-offset-[-2px]",
          badge > 0 && "text-text",
        )}
      >
        <RegenIcon name="bell" size={22} />
        {badge > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-1 right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-text px-1 font-mono text-xs leading-none font-medium text-bg tabular-nums animate-fade"
          >
            {badge}
          </span>
        )}
      </button>
      {browser && createPortal(sheet, document.body)}
    </>
  );
}

function AlertRow({ alert, fresh, onTake, onSeen }: { alert: Alert; fresh: boolean; onTake: () => void; onSeen?: () => void }) {
  const urgent = alert.priority === "hoy";
  return (
    <li data-alert={alert.id} className="flex gap-3 py-4">
      <RegenIcon
        name={urgent ? "circle-alert" : alert.icon}
        size={20}
        strokeWidth={urgent ? 2 : undefined}
        className={cx("mt-0.5 shrink-0", !fresh ? "text-muted" : urgent ? "text-danger" : "text-warning")}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className={cx("text-base", fresh ? "font-semibold" : "text-muted")}>{alert.title}</p>
          {urgent && <Badge tone={fresh ? "danger" : "neutral"}>Haster</Badge>}
        </div>
        {alert.detail && <p className="text-sm text-muted">{alert.detail}</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          <Link href={alert.action.href} onClick={onTake} className={buttonClasses("secondary", "sm")}>
            {alert.action.label}
          </Link>
          {onSeen && (
            <Button variant="ghost" size="sm" data-mark onClick={onSeen} aria-label={`Marker som sett: ${alert.title}`}>
              Marker som sett
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}
