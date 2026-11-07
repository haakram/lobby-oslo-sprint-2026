import type { ReactNode } from "react";
import { cx } from "./cx";

/** A measured value (metres, seconds, score) with its label. Numbers are set in mono. */
export function Stat({
  label,
  value,
  unit,
  tone = "default",
  className,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  tone?: "default" | "accent" | "success";
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col gap-1", className)}>
      <span className="text-sm text-muted">{label}</span>
      <span
        className={cx(
          "font-mono text-xl font-medium tabular-nums",
          tone === "accent" && "text-accent-text",
          tone === "success" && "text-success",
        )}
      >
        {value}
        {unit && <span className="ml-1 text-sm text-muted">{unit}</span>}
      </span>
    </div>
  );
}
