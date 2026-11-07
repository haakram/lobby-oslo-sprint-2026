"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";
import type { RefObject } from "react";

gsap.registerPlugin(useGSAP, CustomEase);

let standard: gsap.EaseFunction | null = null;

/** DESIGN.md's entrance curve, cubic-bezier(0.2, 0, 0, 1), as a GSAP ease. */
function standardEase(): gsap.EaseFunction {
  standard ??= CustomEase.create("lobby-standard", "M0,0 C0.2,0 0,1 1,1");
  return standard;
}

/**
 * The overview arrives once the night has loaded: panels marked `data-enter` rise 8 px in 300 ms,
 * 60 ms apart (DESIGN.md "Motion"); room tiles marked `data-tile` fade in over 240 ms in all.
 * Nothing moves under prefers-reduced-motion, and nothing runs again on live updates.
 */
export function useEntrance(scope: RefObject<HTMLElement | null>, ready: boolean) {
  useGSAP(
    () => {
      if (!ready || typeof window.matchMedia !== "function") return;
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const ease = standardEase();
        gsap.from("[data-enter]", {
          autoAlpha: 0,
          y: 8,
          duration: 0.3,
          ease,
          stagger: 0.06,
          clearProps: "opacity,visibility,transform",
        });
        gsap.from("[data-tile]", {
          autoAlpha: 0,
          duration: 0.2,
          ease,
          delay: 0.12,
          stagger: { amount: 0.24 },
          clearProps: "opacity,visibility",
        });
      });
      return () => mm.revert();
    },
    { scope, dependencies: [ready] },
  );
}
