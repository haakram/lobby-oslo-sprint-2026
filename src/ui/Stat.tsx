import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * A figure with its label, like a line of the night audit: the value large in the display face,
 * the label under it. Figures are tabular; the unit is small and quiet.
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
    <div className={cx("flex flex-col gap-1", className)}>
      <span
        className={cx(
          "font-display font-medium whitespace-nowrap tabular-nums",
          size === "lg" ? "text-2xl" : "text-xl",
          tone === "accent" && "text-accent-text",
          tone === "success" && "text-success",
          tone === "warning" && "text-warning",
          tone === "danger" && "text-danger",
        )}
      >
        {value}
        {unit && <span className="ml-1.5 font-sans text-sm font-medium text-muted">{unit}</span>}
      </span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
}
