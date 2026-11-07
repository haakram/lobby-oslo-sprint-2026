import Link from "next/link";
import { moduleById } from "@/features/modules/registry";
import { buttonClasses, cx, RegenIcon, Skeleton } from "@/ui";
import type { NowItem, NowTone } from "./now";

/** Rows with their own action; anything after them is named in one "og N til" line, never dropped. */
export const MAX_ROWS = 6;

const ICON_TONE: Record<NowTone, string> = {
  danger: "text-danger",
  warning: "text-warning",
  muted: "text-muted",
};

/**
 * The action band under the top bar (UX audit, Oversikt 3): what needs a person now across every
 * module, each line with its one action. The screen's primary action lives here, above the fold.
 * A danger row says so in its icon (a warning triangle) and in words for a screen reader, not only
 * in red.
 */
export function NowBand({ items, loading, className }: { items: NowItem[]; loading: boolean; className?: string }) {
  const shown = items.slice(0, MAX_ROWS);
  const more = items.slice(MAX_ROWS);
  return (
    <section aria-labelledby="now-heading" data-enter className={className}>
      <h1 id="now-heading" className="text-2xl font-bold tracking-[-0.02em] sm:text-3xl sm:tracking-[-0.03em]">
        Oversikt
      </h1>
      {loading && items.length === 0 ? (
        <div className="mt-3 flex flex-col gap-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-12 w-3/4" />
        </div>
      ) : (
        <ul className="mt-3 flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
          {items.length === 0 && (
            <li className="flex items-center gap-4 px-4 py-3 text-base text-muted sm:px-5">
              <RegenIcon name="check" size={20} className="shrink-0 text-success" />
              Ingenting venter på noen akkurat nå.
            </li>
          )}
          {shown.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
              <RegenIcon name={item.tone === "danger" ? "alert-triangle" : item.icon} size={20} className={cx("shrink-0", ICON_TONE[item.tone])} />
              <span className={cx("min-w-[12rem] flex-1 text-base", item.tone === "muted" ? "text-muted" : "font-semibold")}>
                {item.tone === "danger" && <span className="sr-only">Haster: </span>}
                {item.text}
              </span>
              {item.action && (
                <Link href={item.action.href} className={buttonClasses(item.action.primary ? "primary" : "secondary", item.action.primary ? "md" : "sm")}>
                  {item.action.label}
                </Link>
              )}
            </li>
          ))}
          {more.length > 0 && (
            <li className="flex flex-wrap items-center gap-x-4 px-4 py-1 text-sm sm:px-5">
              <span className="font-semibold text-muted">og {more.length} til:</span>
              {more.map((item) => (
                <Link
                  key={item.id}
                  href={moduleById(item.module).route}
                  className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent-text hover:underline"
                >
                  <RegenIcon name={item.tone === "danger" ? "alert-triangle" : item.icon} size={16} className={cx("shrink-0", ICON_TONE[item.tone])} />
                  {item.tone === "danger" && <span className="sr-only">Haster: </span>}
                  {item.text}
                </Link>
              ))}
            </li>
          )}
          {loading && (
            // The night is still coming in: more rows may land here.
            <li className="px-4 py-3 sm:px-5">
              <Skeleton className="h-6 w-2/3" />
              <span className="sr-only">Henter natten</span>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
