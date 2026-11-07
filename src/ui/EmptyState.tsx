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
    <div className={cx("flex max-w-md flex-col items-start gap-3", className)}>
      {icon && <div className="text-muted">{icon}</div>}
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {body && <p className="text-base text-muted">{body}</p>}
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}
