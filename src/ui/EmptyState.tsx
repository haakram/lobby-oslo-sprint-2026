import type { ReactNode } from "react";
import { cx } from "./cx";

/** Nothing here yet: say what goes here and offer the action that fills it. */
export function EmptyState({
  title,
  body,
  icon,
  action,
  className,
}: {
  title: string;
  body?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex max-w-md flex-col items-start gap-2", className)}>
      {icon && <div className="mb-1 text-muted">{icon}</div>}
      <h2 className="text-lg font-semibold tracking-[-0.01em]">{title}</h2>
      {body && <p className="text-base text-muted">{body}</p>}
      {action && <div className="pt-3">{action}</div>}
    </div>
  );
}
