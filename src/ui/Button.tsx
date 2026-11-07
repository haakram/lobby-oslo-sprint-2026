import type { ButtonHTMLAttributes } from "react";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "md" | "lg";

const VARIANT: Record<ButtonVariant, string> = {
  // The one main action on a screen: safety orange, ink text.
  primary: "bg-accent text-on-accent hover:brightness-105 active:brightness-95",
  secondary: "bg-surface text-text border border-line-strong hover:bg-sunken",
  ghost: "text-text hover:bg-sunken",
};

const SIZE: Record<ButtonSize, string> = {
  md: "min-h-12 px-4 text-base",
  lg: "min-h-14 px-6 text-lg",
};

/** Classes for anything that should look like a button, e.g. a next/link. */
export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md"): string {
  return cx(
    "relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-md font-semibold",
    "transition-[background-color,filter,opacity] duration-150 ease-standard",
    "disabled:cursor-not-allowed disabled:opacity-60",
    VARIANT[variant],
    SIZE[size],
  );
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Disables the button and shows a running bar along its bottom edge. */
  loading?: boolean;
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  type = "button",
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(buttonClasses(variant, size), className)}
      {...rest}
    >
      {children}
      {loading && (
        <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden">
          <span className="block h-full w-2/5 animate-progress bg-current opacity-70 motion-reduce:w-full motion-reduce:animate-none motion-reduce:opacity-40" />
        </span>
      )}
    </button>
  );
}
