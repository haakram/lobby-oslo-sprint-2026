import type { HTMLAttributes } from "react";
import { cx } from "./cx";

/** A panel on the current surface: a 1 px line, no shadow (DESIGN.md "Spacing and radii"). */
export function Card({
  tone = "surface",
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { tone?: "surface" | "sunken" }) {
  return <div className={cx("rounded-lg border border-line p-5", tone === "sunken" ? "bg-sunken" : "bg-surface", className)} {...rest} />;
}
