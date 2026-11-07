import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * A figure with its label: the value large in Martian Mono (tabular), the unit small in the text
 * face beside it, the label under it. The tone says whether the figure is good or bad.
 */
export function Stat({
  label,
  value,
  unit,
  tone = "default",
  size = "md",
  className,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  tone?: "default" | "accent" | "success" | "warning" | "danger";
  size?: "md" | "lg";
  className?: string;
}) {
  return (
    <div className={cx("flex min-w-0 flex-col gap-1", className)}>
      <span
        className={cx(
          "font-mono font-medium tabular-nums",
          size === "lg" ? "text-2xl" : "text-xl",
          tone === "accent" && "text-accent-text",
          tone === "success" && "text-success",
          tone === "warning" && "text-warning",
          tone === "danger" && "text-danger",
        )}
      >
        <span className="whitespace-nowrap">{value}</span>
        {unit && <span className="ml-1.5 font-sans text-sm font-medium text-muted">{unit}</span>}
      </span>
      <span className="text-sm text-muted">{label}</span>
    </div>
  );
}
