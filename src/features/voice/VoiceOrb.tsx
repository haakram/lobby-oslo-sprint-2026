"use client";

import { motion, useAnimationFrame, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { cx, MicIcon } from "@/ui";
import type { VoicePhase } from "./useFetteroVoice";

// How much of each new reading the orb takes per frame: smooth, but still on the beat of speech.
const SMOOTHING = 0.22;

const CORE: Record<VoicePhase, string> = {
  idle: "bg-sunken border-line-strong text-muted",
  connecting: "bg-sunken border-accent text-accent-text",
  listening: "bg-surface border-accent text-accent-text",
  speaking: "bg-accent border-accent text-on-accent",
};

/**
 * The voice orb. While Fettero listens it moves with the worker's voice, while it speaks with its
 * own; it never moves on its own. Under reduced motion it holds still and only its colour changes.
 */
export function VoiceOrb({
  phase,
  getInputVolume,
  getOutputVolume,
}: {
  phase: VoicePhase;
  getInputVolume: () => number;
  getOutputVolume: () => number;
}) {
  const reduced = useReducedMotion();
  const level = useMotionValue(0);

  useAnimationFrame(() => {
    let target = 0;
    if (!reduced) {
      if (phase === "listening") target = getInputVolume();
      else if (phase === "speaking") target = getOutputVolume();
    }
    const clamped = Math.min(1, Math.max(0, Number.isFinite(target) ? target : 0));
    const current = level.get();
    const next = current + (clamped - current) * SMOOTHING;
    if (Math.abs(next - current) > 0.0005) level.set(next);
  });

  const coreScale = useTransform(level, [0, 1], [1, 1.12]);
  const innerScale = useTransform(level, [0, 1], [1, 1.32]);
  const outerScale = useTransform(level, [0, 1], [1, 1.6]);
  const outerOpacity = useTransform(level, [0, 0.05, 1], [0, 0.55, 0.9]);
  const active = phase === "listening" || phase === "speaking";

  return (
    <div aria-hidden="true" className="relative grid size-48 place-items-center sm:size-60">
      <motion.div
        className="absolute inset-[18%] rounded-full bg-accent-soft"
        style={{ scale: outerScale, opacity: outerOpacity }}
      />
      <motion.div
        className={cx(
          "absolute inset-[14%] rounded-full bg-accent-soft transition-opacity duration-300 ease-standard",
          active ? "opacity-100" : "opacity-0",
        )}
        style={{ scale: innerScale }}
      />
      <motion.div
        className={cx(
          "relative grid size-[62%] place-items-center rounded-full border-2",
          "transition-[background-color,border-color,color] duration-300 ease-standard",
          CORE[phase],
        )}
        style={{ scale: coreScale }}
      >
        <MicIcon className="size-12 sm:size-14" strokeWidth={1.5} />
      </motion.div>
    </div>
  );
}
