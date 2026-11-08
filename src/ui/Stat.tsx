import type { ReactNode } from "react";
import { cx } from "./cx";
import { Figure } from "./Figure";
import { RegenIcon } from "./icons/RegenIcon";

/** A bad figure says so by shape and in words, not only in colour (WCAG 1.4.1). */
const ALERT = {
  warning: { icon: "alert-triangle", word: "Obs: " },
  danger: { icon: "circle-alert", word: "Kritisk: " },
} as const;

/**
 * A figure with its label: the value large in Martian Mono (tabular), the unit small in the text
 * face beside it, the label under it. A plain value goes through `Figure`, so its decimal comma and
 * thousands space don't take a full monospace cell ("4,7", not "4 , 7"). The tone says whether the figure is good or bad; a warning or
 * danger figure also gets an icon and a hidden word, so the judgement doesn't hang on colour.
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
  const alert = tone === "warning" || tone === "danger" ? ALERT[tone] : null;
  return (
    <div className={cx("flex min-w-0 flex-col gap-1", className)}>
      {/* Read first ("Kritisk: 28 … Åpne arbeidsordre"); kept out of the value so the value stays the figure. */}
      {alert && <span className="sr-only">{alert.word}</span>}
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
        {alert && <RegenIcon name={alert.icon} size={size === "lg" ? 20 : 16} strokeWidth={2} className="mr-1.5 inline-block align-[-0.1em]" />}
        <span className="whitespace-nowrap">{typeof value === "string" || typeof value === "number" ? <Figure value={value} /> : value}</span>
        {unit && <span className="ml-1.5 font-sans text-sm font-medium text-muted">{unit}</span>}
      </span>
      <span className="text-sm text-muted">{label}</span>
    </div>
  );
}
