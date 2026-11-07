import { cx } from "./cx";

/** A placeholder block in the shape of the content that is loading. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx("animate-shimmer rounded-md bg-sunken", className)} />;
}
