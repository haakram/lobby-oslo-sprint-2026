import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * The top of a screen: its name, one line on what it is, and the screen's
 * actions on the right. `meta` sits next to the title (a badge saying live or recorded).
 */
export function PageHeader({
  title,
  lede,
  meta,
  actions,
  className,
}: {
  title: string;
  lede?: string;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cx("flex flex-wrap items-end justify-between gap-x-10 gap-y-4", className)}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <h1 className="text-2xl font-bold tracking-[-0.02em] sm:text-3xl sm:tracking-[-0.03em]">{title}</h1>
          {meta}
        </div>
        {lede && <p className="mt-2 max-w-[56ch] text-base text-muted">{lede}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
