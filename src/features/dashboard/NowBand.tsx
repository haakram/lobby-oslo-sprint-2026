import Link from "next/link";
import { buttonClasses, cx, RegenIcon, Skeleton } from "@/ui";
import type { NowItem } from "./now";

/**
 * The action band under the top bar (UX audit, Oversikt 3): what needs a person now across every
 * module, each line with its one action. The screen's primary action lives here, above the fold.
 */
export function NowBand({ items, loading, className }: { items: NowItem[]; loading: boolean; className?: string }) {
  return (
    <section aria-labelledby="now-heading" data-enter className={className}>
      <h1 id="now-heading" className="text-2xl font-bold tracking-[-0.02em]">
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
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
              <RegenIcon
                name={item.icon}
                size={20}
                className={cx("shrink-0", item.tone === "warning" && "text-warning", item.tone === "danger" && "text-danger", item.tone === "muted" && "text-muted")}
              />
              <span className={cx("min-w-0 flex-1 text-base", item.tone === "muted" ? "text-muted" : "font-semibold")}>{item.text}</span>
              {item.action && (
                <Link href={item.action.href} className={buttonClasses(item.action.primary ? "primary" : "secondary", item.action.primary ? "md" : "sm")}>
                  {item.action.label}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
