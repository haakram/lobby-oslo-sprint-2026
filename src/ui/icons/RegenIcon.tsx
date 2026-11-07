import { REGEN, type RegenName } from "./regenPaths";

type Props = {
  name: RegenName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  /** Give a title only when the icon stands alone and carries meaning; otherwise it is decorative. */
  title?: string;
};

// The markup comes from the bundled, static Regen set (regenPaths.ts), never from user or model input.
export function RegenIcon({ name, size = 24, strokeWidth = 1.75, className, title }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      dangerouslySetInnerHTML={{ __html: REGEN[name] }}
    />
  );
}
