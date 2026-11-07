import type { ReactNode } from "react";
import { cx } from "./cx";
import { AlertIcon } from "./icons";

/** Something failed: say what happened and what to do next, then offer that action. */
export function ErrorState({
  title,
  body,
  action,
  className,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cx("flex max-w-md flex-col items-start gap-3 border-l-4 border-danger py-1 pl-4", className)}
    >
      <AlertIcon className="text-danger" />
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="text-base text-muted">{body}</p>
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}
