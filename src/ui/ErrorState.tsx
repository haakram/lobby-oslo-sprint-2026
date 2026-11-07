import type { ReactNode } from "react";
import { cx } from "./cx";
import { RegenIcon } from "./icons/RegenIcon";

/** Something failed: say what happened and what to do next, then offer that action. */
export function ErrorState({
  title,
  body,
  action,
  as: Heading = "h2",
  className,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  /** `h3` inside a panel that has its own h2, so two headings of one rank don't stack. */
  as?: "h2" | "h3";
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cx("flex max-w-md flex-col items-start gap-2 border-l-2 border-danger py-1 pl-4", className)}
    >
      <RegenIcon name="alert-triangle" className="mb-1 text-danger" />
      <Heading className={Heading === "h3" ? "text-base font-semibold" : "text-lg font-semibold tracking-[-0.01em]"}>{title}</Heading>
      <p className="text-base text-muted">{body}</p>
      {action && <div className="pt-3">{action}</div>}
    </div>
  );
}
