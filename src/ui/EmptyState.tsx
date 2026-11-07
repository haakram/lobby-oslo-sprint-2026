import type { ReactNode } from "react";
import { cx } from "./cx";

/** Nothing here yet: say what goes here and offer the action that fills it. */
export function EmptyState({
  title,
  body,
  icon,
  action,
  as: Heading = "h2",
  className,
}: {
  title: string;
  body?: string;
  icon?: ReactNode;
  action?: ReactNode;
  /** `h3` inside a panel that has its own h2, so two headings of one rank don't stack. */
  as?: "h2" | "h3";
  className?: string;
}) {
  return (
    <div className={cx("flex max-w-md flex-col items-start gap-2", className)}>
      {icon && <div className="mb-1 text-muted">{icon}</div>}
      <Heading className={Heading === "h3" ? "text-base font-semibold" : "text-lg font-semibold tracking-[-0.01em]"}>{title}</Heading>
      {body && <p className="text-base text-muted">{body}</p>}
      {action && <div className="pt-3">{action}</div>}
    </div>
  );
}
