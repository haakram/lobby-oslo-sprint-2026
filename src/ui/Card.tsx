import type { HTMLAttributes } from "react";
import { cx } from "./cx";

/** A plane on the current surface: tone, not a border, sets it apart (DESIGN.md "Finish"). */
export function Card({
  tone = "surface",
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { tone?: "surface" | "sunken" }) {
  return <div className={cx("rounded-md p-5", tone === "sunken" ? "bg-sunken" : "bg-surface", className)} {...rest} />;
}
