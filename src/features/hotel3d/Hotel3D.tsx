"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { HOTEL_FLOORS, type HotelReplay, placeName, ROOM_STATUS_LABEL, type RoomStatus } from "@/features/replay";
import { cx, RegenIcon, Skeleton } from "@/ui";
import { HotelPlan2D } from "./HotelPlan2D";
import type { HotelScene } from "./scene";
import { readTokens, STATUS_CSS_VAR } from "./tokens";
import "./hotel3d.css";

/**
 * The 3D hotel. Takes the replay from `useHotelReplay` and draws it: floors, rooms in their status
 * colour, the robot walking its real path at the replay's pace. `variant="panel"` is the smaller
 * embed for dashboards; `"full"` is the hero on /hotell. Without WebGL it shows the same state as
 * a 2D plan.
 */

export type FloorMode = "auto" | "all" | number;
export type Hotel3DVariant = "panel" | "full";

export type Hotel3DProps = {
  replay: HotelReplay;
  variant?: Hotel3DVariant;
  className?: string;
};

const LEGEND: RoomStatus[] = ["klar", "ma_vaskes", "opptatt", "ikke_forstyrr", "avvik", "ukjent"];

/** The room colours with their words. Inside the 3D view from 640 px; under it on phones. */
export function StatusLegend({ className }: { className?: string }) {
  return (
    <ul aria-label="Romstatus" className={cx("flex flex-wrap gap-x-3 gap-y-1", className)}>
      {LEGEND.map((status) => (
        <li key={status} className="flex items-center gap-1.5 text-xs font-medium text-muted">
          <span aria-hidden="true" className="inline-block size-2.5 rounded-[2px] border border-line-strong" style={{ background: STATUS_CSS_VAR[status] }} />
          {ROOM_STATUS_LABEL[status]}
        </li>
      ))}
    </ul>
  );
}

let webglSupport: boolean | null = null;

/** Detected once per page; the server answers null so the first paint matches on both sides. */
function hasWebGL(): boolean {
  if (webglSupport !== null) return webglSupport;
  if (typeof WebGL2RenderingContext === "undefined" && typeof WebGLRenderingContext === "undefined") {
    webglSupport = false;
  } else {
    try {
      const canvas = document.createElement("canvas");
      webglSupport = !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
    } catch {
      webglSupport = false;
    }
  }
  return webglSupport;
}

const noSubscribe = () => () => {};
const serverWebGL = () => null;

export function Hotel3D({ replay, variant = "full", className }: Hotel3DProps) {
  const reduced = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const webgl = useSyncExternalStore(noSubscribe, hasWebGL, serverWebGL);
  const [scene, setScene] = useState<HotelScene | null>(null);
  const [floorMode, setFloorMode] = useState<FloorMode>("auto");
  const [follow, setFollow] = useState(true);
  const compact = variant === "panel";
  const snapshot = replay.snapshot;

  // Mount the scene once WebGL is confirmed; the three.js code only loads then.
  useEffect(() => {
    if (!webgl || !hostRef.current || !labelsRef.current || !rootRef.current) return;
    let cancelled = false;
    let instance: HotelScene | null = null;
    const host = hostRef.current;
    const labels = labelsRef.current;
    const tokens = readTokens(rootRef.current);
    import("./scene").then(({ HotelScene: Scene }) => {
      if (cancelled) return;
      instance = new Scene(host, labels, {
        tokens,
        reducedMotion: !!reduced,
        compact,
        onUserOrbit: () => setFollow(false),
      });
      setScene(instance);
    });
    return () => {
      cancelled = true;
      instance?.dispose();
      setScene(null);
    };
  }, [webgl, reduced, compact]);

  useEffect(() => {
    scene?.setTimeline(replay.timeline);
  }, [scene, replay.timeline]);

  useEffect(() => {
    scene?.setClock(replay.now);
  }, [scene, replay.now]);

  useEffect(() => {
    scene?.setSnapshot(snapshot);
  }, [scene, snapshot]);

  const robotFloor = snapshot?.robot.floor ?? null;
  const focusFloor = floorMode === "auto" ? robotFloor : floorMode === "all" ? null : floorMode;
  useEffect(() => {
    scene?.setFocusFloor(focusFloor);
  }, [scene, focusFloor]);

  useEffect(() => {
    scene?.setFollow(follow);
  }, [scene, follow]);

  // Render only while on screen and the tab is visible.
  useEffect(() => {
    if (!scene || !rootRef.current) return;
    let onScreen = true;
    const update = () => scene.setActive(onScreen && document.visibilityState !== "hidden");
    const observer = new IntersectionObserver((entries) => {
      onScreen = entries.some((entry) => entry.isIntersecting);
      update();
    });
    observer.observe(rootRef.current);
    document.addEventListener("visibilitychange", update);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, [scene]);

  const robot = snapshot?.robot ?? null;
  const height = compact ? "h-[clamp(300px,52vw,460px)]" : "h-[clamp(400px,60vh,760px)]";

  return (
    <div
      ref={rootRef}
      data-surface="dark"
      className={cx("relative overflow-hidden rounded-lg border border-line bg-bg text-text", webgl !== false && height, className)}
    >
      {webgl === false ? (
        <HotelPlan2D snapshot={snapshot} variant={variant} />
      ) : (
        <>
          <div ref={hostRef} className="absolute inset-0" aria-hidden="true" />
          <div ref={labelsRef} className="h3d-labels" data-compact={compact || undefined} aria-hidden="true" />
          {(!scene || replay.status === "loading") && (
            <div className="absolute inset-0 flex items-end p-4" aria-busy="true" aria-label="Laster hotellet">
              <Skeleton className="h-6 w-40" />
            </div>
          )}
        </>
      )}

      {/* HUD: the floor, the robot, the legend. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3 sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div
            role="group"
            aria-label="Etasje"
            className="pointer-events-auto inline-flex gap-0.5 rounded-md border border-line bg-surface/90 p-0.5 backdrop-blur-sm"
          >
            {(["auto", ...HOTEL_FLOORS, "all"] as FloorMode[]).map((mode) => {
              const active = floorMode === mode;
              const text = mode === "auto" ? "Følg" : mode === "all" ? "Alle" : String(mode);
              const name = mode === "auto" ? "Robotens etasje" : mode === "all" ? "Alle etasjer" : `${mode}. etasje`;
              return (
                <button
                  key={String(mode)}
                  type="button"
                  aria-pressed={active}
                  aria-label={name}
                  title={name}
                  onClick={() => setFloorMode(mode)}
                  className={cx(
                    "min-h-9 min-w-9 rounded-sm px-2.5 text-sm font-semibold transition-colors duration-150 ease-standard pointer-coarse:min-h-11",
                    active ? "bg-sunken text-text" : "text-muted hover:text-text",
                  )}
                >
                  {text}
                </button>
              );
            })}
          </div>
          {webgl && (
            <div className="pointer-events-auto inline-flex gap-1">
              <button
                type="button"
                aria-pressed={follow}
                onClick={() => {
                  setFollow(true);
                  scene?.focusRobot();
                }}
                className={cx(
                  "inline-flex min-h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-semibold backdrop-blur-sm transition-colors duration-150 ease-standard pointer-coarse:min-h-11",
                  follow ? "border-accent bg-accent text-on-accent" : "border-line bg-surface/90 text-text hover:bg-sunken",
                )}
              >
                <RegenIcon name="target" className="size-4" />
                Følg robot
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-end justify-between gap-2">
          <StatusLegend className="max-sm:hidden" />
          {robot && (
            <p className="rounded-md bg-surface/90 px-2.5 py-1.5 text-xs text-muted backdrop-blur-sm">
              <span className="text-text">{placeName(robot.node)}</span> · {robot.floor}. etasje
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
