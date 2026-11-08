"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useSession } from "@/features/auth/SessionProvider";
import { useHotelData } from "@/features/dashboard/useHotelData";
import { moduleById } from "@/features/modules/registry";
import { Badge, Button, buttonClasses, cx, EmptyState, RegenIcon, Sheet, Skeleton } from "@/ui";
import { type Alert, MAX_ALERTS, selectAlerts } from "./alerts";
import { isNew, useSeen } from "./useSeen";

/** "Varsler, 3 nye": the bell's name says the count, the badge only shows it. */
export function bellLabel(fresh: number, loading: boolean): string {
  if (loading) return "Varsler, henter";
  if (fresh === 0) return "Varsler, ingen nye";
  return `Varsler, ${fresh} ${fresh === 1 ? "ny" : "nye"}`;
}

const noop = () => () => {};

/**
 * The bell in the navigation, on every page and for every role: what needs a person, from every
 * module the role may open. Reads the same hotel as Oversikt (useHotelData).
 */
export function NotificationBell({ viewerUrl }: { viewerUrl?: string }) {
  const { user } = useSession();
  const { data } = useHotelData(viewerUrl);
  const alerts = useMemo(() => selectAlerts(data), [data]);
  return <NotificationBellView alerts={alerts} loading={data.loading} nightFailed={data.nightStatus === "error"} user={user?.u ?? null} />;
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
}: {
  alerts: readonly Alert[];
  loading: boolean;
  nightFailed?: boolean;
  user: string | null;
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
  const waiting = loading && alerts.length === 0;

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
    mark(fresh);
    setSaid(fresh.length === 1 ? "Varselet er markert som sett." : `Alle ${fresh.length} varsler er markert som sett.`);
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
              <p className="text-sm text-muted">{fresh.length > 0 ? `${fresh.length} ${fresh.length === 1 ? "ny" : "nye"}, trenger en person` : "Alt her er sett."}</p>
              {fresh.length > 0 && (
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
        aria-label={bellLabel(fresh.length, waiting)}
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
          fresh.length > 0 && "text-text",
        )}
      >
        <RegenIcon name="bell" size={22} />
        {fresh.length > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-1 right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-text px-1 font-mono text-xs leading-none font-medium text-bg tabular-nums animate-fade"
          >
            {fresh.length}
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
