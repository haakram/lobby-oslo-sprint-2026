import Link from "next/link";
import { canAccess } from "@/features/auth/roles";
import { buttonClasses, RegenIcon, Skeleton } from "@/ui";
import type { DashboardData } from "./data";
import { greeting, nightSummary, nightTotals, nightVerdict } from "./highlights";
import { cleaningHref } from "./selectors";

/**
 * The top of Oversikt (team lead 2026-11-08: good news first): a greeting honest about the time of
 * day, one sentence on how the night went and what the day starts with, and the screen's one primary
 * action, the cleaning route, as a normal action rather than an alarm. What needs a person is in
 * the bell, not here.
 */
export function Greeting({ data }: { data: DashboardData }) {
  const totals = nightTotals(data);
  const verdict = nightVerdict(data, totals);
  const summary = nightSummary(data, totals);
  const rooms = canAccess(data.role, "/rom") ? data.rooms : null;
  const dirty = rooms?.filter((room) => room.status === "ma_vaskes") ?? [];
  const unchecked = rooms?.filter((room) => room.status === "ukjent") ?? [];

  return (
    <section aria-labelledby="greeting-heading" data-enter className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
      <div className="min-w-0">
        <h1 id="greeting-heading" className="text-2xl font-bold tracking-[-0.02em] sm:text-3xl sm:tracking-[-0.03em]">
          {greeting(data.hour, data.userName)}
        </h1>
        {data.loading ? (
          <Skeleton className="mt-3 h-6 w-full max-w-md" />
        ) : (
          <p className="mt-2 max-w-[64ch] text-base text-muted sm:text-lg">
            <span className={verdict.good ? "font-semibold text-success" : "font-semibold text-text"}>
              {verdict.good && <RegenIcon name="circle-check" size={20} strokeWidth={2} className="mr-1.5 inline-block align-[-0.2em]" />}
              {verdict.text}
            </span>
            {summary && ` ${summary}`}
          </p>
        )}
      </div>
      {dirty.length > 0 ? (
        <Link href={cleaningHref(dirty.map((room) => room.id))} className={buttonClasses("primary")}>
          Lag renholdsrute
        </Link>
      ) : unchecked.length > 0 ? (
        <Link href={cleaningHref(unchecked.map((room) => room.id))} className={buttonClasses("secondary")}>
          Lag sjekkrunde for {unchecked.length} rom
        </Link>
      ) : null}
    </section>
  );
}
