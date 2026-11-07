import type { Variants } from "motion/react";

/** Seconds, for motion. Mirrors the CSS durations in DESIGN.md. */
export const DURATION = { fast: 0.15, base: 0.2, slow: 0.3 } as const;

/** Decelerate in, never overshoot (no bounce, no springs). */
export const EASE = [0.2, 0, 0, 1] as const;
export const EASE_EXIT = [0.4, 0, 1, 1] as const;

const STILL: Variants = { hidden: {}, visible: {}, exit: {} };

/**
 * Each preset takes the reduced-motion flag (motion's `useReducedMotion()`)
 * and returns variants with the states `hidden`, `visible` and `exit`.
 * Under reduced motion they are no-ops: content appears in place.
 */
export function fadeRise(reduced: boolean | null): Variants {
  if (reduced) return STILL;
  return {
    hidden: { opacity: 0, y: 8 },
    visible: { opacity: 1, y: 0, transition: { duration: DURATION.slow, ease: EASE } },
    exit: { opacity: 0, transition: { duration: DURATION.fast, ease: EASE_EXIT } },
  };
}

export function sheetIn(reduced: boolean | null): Variants {
  if (reduced) return STILL;
  return {
    hidden: { y: "100%" },
    visible: { y: 0, transition: { duration: DURATION.slow, ease: EASE } },
    exit: { y: "100%", transition: { duration: DURATION.base, ease: EASE_EXIT } },
  };
}

/** For an SVG path: the line draws itself. Pass `custom={index}` to stagger stops. */
export function drawLine(reduced: boolean | null): Variants {
  if (reduced) return STILL;
  return {
    hidden: { pathLength: 0 },
    visible: (index: number = 0) => ({
      pathLength: 1,
      transition: { duration: DURATION.slow, ease: EASE, delay: index * DURATION.slow },
    }),
  };
}
