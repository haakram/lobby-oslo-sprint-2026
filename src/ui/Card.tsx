import type { HTMLAttributes } from "react";
import { cx } from "./cx";

/** A raised panel on the current surface. Flat: a border, no shadow. */
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("rounded-lg border border-line bg-surface p-5", className)} {...rest} />;
}
