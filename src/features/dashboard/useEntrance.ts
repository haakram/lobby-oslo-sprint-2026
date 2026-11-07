"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";
import type { RefObject } from "react";

gsap.registerPlugin(useGSAP, CustomEase);

let standard: gsap.EaseFunction | null = null;

/** DESIGN.md's entrance curve, cubic-bezier(0.23, 1, 0.32, 1), as a GSAP ease. */
export function standardEase(): gsap.EaseFunction {
  standard ??= CustomEase.create("lobby-standard", "M0,0 C0.23,1 0.32,1 1,1");
  return standard;
}

/**
 * The overview arrives once the night has loaded: panels marked `data-enter` rise 8 px in 240 ms,
 * 50 ms apart (DESIGN.md "Motion"); room tiles marked `data-tile` fade in over 240 ms in all.
 * Nothing moves under prefers-reduced-motion, and nothing runs again on live updates.
 */
export function useEntrance(scope: RefObject<HTMLElement | null>, ready: boolean) {
  useGSAP(
    () => {
      if (!ready || typeof window.matchMedia !== "function") return;
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const ease = standardEase();
        // Only what is on this screen: a module page has no room tiles, and GSAP warns about a missing target.
        const root = scope.current;
        const panels = root ? Array.from(root.querySelectorAll("[data-enter]")) : [];
        const tiles = root ? Array.from(root.querySelectorAll("[data-tile]")) : [];
        if (panels.length > 0) {
          gsap.from(panels, {
            autoAlpha: 0,
            y: 8,
            duration: 0.24,
            ease,
            stagger: 0.05,
            clearProps: "opacity,visibility,transform",
          });
        }
        if (tiles.length > 0) {
          gsap.from(tiles, {
            autoAlpha: 0,
            duration: 0.2,
            ease,
            delay: 0.12,
            stagger: { amount: 0.24 },
            clearProps: "opacity,visibility",
          });
        }
      });
      return () => mm.revert();
    },
    { scope, dependencies: [ready] },
  );
}
