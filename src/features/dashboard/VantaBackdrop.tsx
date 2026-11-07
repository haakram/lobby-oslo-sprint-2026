"use client";

import { useEffect, useRef } from "react";

type VantaEffect = { destroy: () => void };

// Night-steel fog: the dark surface tokens (DESIGN.md), so the band never gets brighter than --line.
const FOG = {
  baseColor: 0x121c24,
  lowlightColor: 0x1a2630,
  midtoneColor: 0x22313d,
  highlightColor: 0x2e3e4a,
  blurFactor: 0.7,
  speed: 0.5,
  zoom: 0.7,
};

/**
 * The ambient backdrop behind the overview header only (DESIGN.md "Ambient background"). Vanta
 * needs three r134, shipped as `three-vanta`. Off under reduced motion, torn down while the tab is
 * hidden, and silent when WebGL is missing (the band's solid colour stays).
 */
export function VantaBackdrop() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el || typeof window.matchMedia !== "function") return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let effect: VantaEffect | null = null;
    let starting = false;
    let disposed = false;

    async function start() {
      if (effect || starting || disposed || document.hidden || reduced.matches) return;
      starting = true;
      try {
        const [{ default: fog }, THREE] = await Promise.all([
          import("vanta/dist/vanta.fog.min"),
          import("three-vanta"),
        ]);
        if (disposed || document.hidden || reduced.matches || !el) return;
        effect = fog({ el, THREE, mouseControls: false, touchControls: false, gyroControls: false, ...FOG });
      } catch {
        effect = null;
      } finally {
        starting = false;
      }
    }

    function stop() {
      effect?.destroy();
      effect = null;
    }

    const onVisibility = () => (document.hidden ? stop() : void start());
    const onMotion = () => (reduced.matches ? stop() : void start());
    document.addEventListener("visibilitychange", onVisibility);
    reduced.addEventListener("change", onMotion);
    void start();

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      reduced.removeEventListener("change", onMotion);
      stop();
    };
  }, []);

  return <div ref={host} aria-hidden="true" className="pointer-events-none absolute inset-0" />;
}
