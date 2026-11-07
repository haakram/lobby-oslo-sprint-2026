"use client";

import Link from "next/link";
import { type ReactNode, useState } from "react";
import { useSession } from "@/features/auth/SessionProvider";
import { ModulePage } from "@/features/modules/ModulePage";
import type { ModuleId } from "@/features/modules/registry";
import { SourceNote } from "@/features/modules/SourceNote";
import { Badge, Button, buttonClasses, cx, EmptyState, ErrorState, RegenIcon, Sheet, Skeleton } from "@/ui";
import { APARTMENTS, clock } from "./demoData";
import { type BellItem, useHost } from "./HostProvider";

const LONG_DATE = new Intl.DateTimeFormat("nb-NO", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/** "Søndag 8. november" for a YYYY-MM-DD. */
export function longDate(date: string): string {
  const text = LONG_DATE.format(new Date(`${date}T12:00:00Z`));
  return text.charAt(0).toLocaleUpperCase("nb-NO") + text.slice(1);
}

/**
 * The frame of every host screen: a dark bar with who this is, the clock and the bell, then the
 * module frame (title, one line, actions, panels). The panels show only when the day is in; before
 * that the screen's own skeleton, and the empty and error states in its place.
 */
export function HostPage({
  module,
  lede,
  actions,
  figureLabels,
  children,
}: {
  module: ModuleId;
  lede?: string;
  actions?: ReactNode;
  /** The labels of the screen's figures, kept under the skeleton while the day loads. */
  figureLabels: string[];
  children: ReactNode;
}) {
  const host = useHost();
  return (
    <>
      <HostTopBar />
      <ModulePage module={module} lede={lede} actions={host.kind === "ready" ? actions : undefined} ready={host.kind !== "loading"}>
        {host.kind === "loading" && <HostSkeleton labels={figureLabels} />}
        {host.kind === "empty" && (
          // TODO(phase-3): "Koble til Airbnb" goes here once the channel integration exists.
          <EmptyState
            icon={<RegenIcon name="home" size={28} />}
            title="Ingen boliger ennå"
            body="Når Airbnb-kontoen din er koblet til, henter Lobby boligene, bookingene og meldingene dine hit av seg selv."
          />
        )}
        {host.kind === "error" && (
          <ErrorState
            title="Fikk ikke hentet boligene"
            body="Sjekk nettet og prøv igjen. Bookingene og meldingene dine er trygge hos Airbnb i mellomtiden."
            action={
              <Button variant="secondary" onClick={host.retry}>
                Prøv igjen
              </Button>
            }
          />
        )}
        {host.kind === "ready" && (
          <>
            {children}
            <SourceNote sources="test" />
          </>
        )}
      </ModulePage>
    </>
  );
}

/** The dark bar on top of every host screen: the host, the clock, and the bell. */
export function HostTopBar() {
  const { user } = useSession();
  const host = useHost();
  const ready = host.kind === "ready" ? host : null;
  return (
    <header data-surface="dark" className="border-b border-line bg-bg text-text">
      <div className="mx-auto flex min-h-16 w-full max-w-[1600px] items-center justify-between gap-x-6 px-4 py-2 sm:px-6 lg:px-10">
        <div className="flex min-w-0 flex-col sm:flex-row sm:items-baseline sm:gap-x-3">
          <span className="truncate text-base font-semibold">{user?.name ?? "Mine boliger"}</span>
          <span className="truncate text-sm text-muted">{APARTMENTS.length} boliger i Oslo</span>
        </div>
        <div className="flex shrink-0 items-center gap-3 sm:gap-5">
          {ready ? (
            <>
              <span className="hidden text-sm text-muted md:inline">{longDate(ready.day.today)}</span>
              <span className="font-mono text-xl leading-none font-medium whitespace-nowrap tabular-nums">
                <span className="sr-only">Klokka er </span>
                {clock(ready.day.minute)}
              </span>
            </>
          ) : (
            host.kind === "loading" && <Skeleton className="h-7 w-16" />
          )}
          <Bell />
        </div>
      </div>
    </header>
  );
}

const TONE_WORD: Record<BellItem["tone"], string | null> = { danger: "Haster", warning: "Lav beholdning", neutral: null };

/**
 * The few things that need the host, behind a bell instead of a wall of warnings. Amber and red live
 * only in here, on the items that really need action; the button itself stays calm.
 */
export function Bell() {
  const host = useHost();
  const [open, setOpen] = useState(false);
  const items = host.kind === "ready" ? host.bell : [];
  const waiting = items.filter((item) => !item.done);
  const urgent = waiting.some((item) => item.tone === "danger");
  const label = waiting.length === 0 ? "Varsler: ingenting trenger deg" : `Varsler: ${waiting.length} ting trenger deg`;

  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={host.kind !== "ready"}
        onClick={() => setOpen(true)}
        className={cx(
          "relative inline-flex min-h-11 items-center gap-2 rounded-md border border-line-strong px-3 text-sm font-semibold",
          "transition-colors duration-[120ms] ease-standard hover:bg-sunken active:scale-[0.97] disabled:opacity-50",
        )}
      >
        <RegenIcon name="bell" size={20} />
        <span className="hidden sm:inline">Varsler</span>
        {waiting.length > 0 && (
          <span
            aria-hidden="true"
            className={cx(
              "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 font-mono text-xs font-medium tabular-nums",
              urgent ? "bg-danger-soft text-danger" : "bg-text text-bg",
            )}
          >
            {waiting.length}
          </span>
        )}
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Varsler" surface="light">
        <p className="text-base text-muted">
          {waiting.length === 0
            ? "Alt er i orden. Lobby sier fra her når noe trenger deg."
            : `${waiting.length} ting trenger deg. Resten har Lobby ordnet.`}
        </p>
        <ul className="mt-3 divide-y divide-line">
          {[...waiting, ...items.filter((item) => item.done)].map((item) => (
            <BellRow key={item.id} item={item} onLeave={() => setOpen(false)} />
          ))}
        </ul>
      </Sheet>
    </>
  );
}

function BellRow({ item, onLeave }: { item: BellItem; onLeave: () => void }) {
  if (item.done) {
    return (
      <li className="flex items-start gap-3 py-3">
        <RegenIcon name="circle-check" size={20} className="mt-0.5 shrink-0 text-success" />
        <div className="min-w-0">
          <p className="font-semibold">{item.title}</p>
          <p role="status" className="text-sm text-success">
            {item.doneText}
          </p>
        </div>
      </li>
    );
  }
  const word = TONE_WORD[item.tone];
  return (
    <li className="py-3">
      <div
        className={cx(
          "flex flex-col gap-2",
          item.tone === "danger" && "border-l-2 border-danger pl-3",
          item.tone === "warning" && "border-l-2 border-warning pl-3",
        )}
      >
      <div className="flex flex-wrap items-center gap-2">
        {word && <Badge tone={item.tone === "danger" ? "danger" : "warning"}>{word}</Badge>}
        <p className="font-semibold">{item.title}</p>
      </div>
      <p className="text-sm text-muted">{item.body}</p>
      {(item.action || item.link) && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {item.action && (
            <Button variant="secondary" size="sm" onClick={item.action.run}>
              {item.action.label}
            </Button>
          )}
          {item.link && (
            <Link href={item.link.href} onClick={onLeave} className={buttonClasses("ghost", "sm")}>
              {item.link.label}
            </Link>
          )}
        </div>
      )}
      </div>
    </li>
  );
}

/** Figures along one rule; the host's overview has six, the other screens four. */
export function HostFigures({ label, children, six = false }: { label: string; children: ReactNode; six?: boolean }) {
  return (
    <section aria-label={label} data-enter>
      <div className={cx("grid grid-cols-2 gap-x-6 gap-y-5 border-y border-line py-5 lg:gap-x-10", six ? "sm:grid-cols-3 xl:grid-cols-6" : "sm:grid-cols-4")}>{children}</div>
    </section>
  );
}

function HostSkeleton({ labels }: { labels: string[] }) {
  return (
    <div aria-busy="true" className="flex flex-col gap-6 lg:gap-8">
      <p className="sr-only">Henter boligene …</p>
      <HostFigures label="Laster tallene" six={labels.length > 4}>
        {labels.map((label) => (
          <div key={label} className="flex flex-col gap-1">
            <Skeleton className="h-8 w-20" />
            <span className="text-sm text-muted">{label}</span>
          </div>
        ))}
      </HostFigures>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:gap-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-36 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-lg" />
      </div>
    </div>
  );
}
