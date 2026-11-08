import { cx } from "./cx";

/** The user's picture: a generated monogram, never a photo. The initials come from the name. */
export function Monogram({ name, size = 36, className }: { name: string; size?: number; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("nb-NO") ?? "")
    .join("");
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.44) }}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold leading-none text-accent-text",
        className,
      )}
    >
      {initials}
    </span>
  );
}
