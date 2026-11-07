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
 * The 3D hotel: an explorable map of every floor with the robot's night played on it. Orbit, pan
 * and zoom with mouse, touch or keys; one floor, all floors or spread apart; click a room (the page
 * gets `onSelectRoom`) or a place (the camera flies there); follow the robot or roam. Styled only
 * through the design tokens. Without WebGL it shows the same state as a 2D plan.
 */

export type FloorMode = "auto" | "all" | "exploded" | number;
export type Hotel3DVariant = "panel" | "full";

export type Hotel3DProps = {
  replay: HotelReplay;
  variant?: Hotel3DVariant;
  className?: string;
  /** The highlighted room, when the page owns the selection. Omit to let the map keep it. */
  selectedRoom?: string | null;
  /** A room was clicked or tapped (null: the floor between rooms). */
  onSelectRoom?: (roomId: string | null) => void;
  /** A place (lift, kitchen, dock …) was clicked; the camera has flown there. */
  onSelectPlace?: (nodeId: string) => void;
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

export function Hotel3D({ replay, variant = "full", className, selectedRoom, onSelectRoom, onSelectPlace }: Hotel3DProps) {
  const reduced = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const webgl = useSyncExternalStore(noSubscribe, hasWebGL, serverWebGL);
  const [scene, setScene] = useState<HotelScene | null>(null);
  const [floorMode, setFloorMode] = useState<FloorMode>("auto");
  const [follow, setFollow] = useState(true);
  const [ownSelection, setOwnSelection] = useState<string | null>(null);
  const compact = variant === "panel";
  const snapshot = replay.snapshot;
  const selected = selectedRoom !== undefined ? selectedRoom : ownSelection;

  // Callbacks reach the scene through refs, so the scene is built once and never goes stale.
  const callbacks = useRef({ onSelectRoom, onSelectPlace });
  useEffect(() => {
    callbacks.current = { onSelectRoom, onSelectPlace };
  }, [onSelectRoom, onSelectPlace]);

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
        onSelectRoom: (roomId) => {
          setOwnSelection(roomId);
          callbacks.current.onSelectRoom?.(roomId);
        },
        onSelectPlace: (nodeId) => callbacks.current.onSelectPlace?.(nodeId),
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

  useEffect(() => {
    scene?.setSelectedRoom(selected ?? null);
  }, [scene, selected]);

  const robotFloor = snapshot?.robot.floor ?? null;
  const focusFloor = floorMode === "auto" ? robotFloor : typeof floorMode === "number" ? floorMode : null;
  useEffect(() => {
    scene?.setFocusFloor(focusFloor);
  }, [scene, focusFloor]);

  useEffect(() => {
    scene?.setExploded(floorMode === "exploded");
  }, [scene, floorMode]);

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

  const selectRoom = (roomId: string | null) => {
    setOwnSelection(roomId);
    onSelectRoom?.(roomId);
  };

  const robot = snapshot?.robot ?? null;
  const height = compact ? "h-[clamp(300px,52vw,460px)]" : "h-[clamp(400px,60vh,760px)]";
  const modes: Array<{ mode: FloorMode; text: string; name: string }> = [
    { mode: "auto", text: "Følg", name: "Robotens etasje" },
    ...HOTEL_FLOORS.map((floor) => ({ mode: floor as FloorMode, text: String(floor), name: `${floor}. etasje` })),
    { mode: "all", text: "Alle", name: "Alle etasjer" },
    { mode: "exploded", text: "Spredt", name: "Etasjene spredt" },
  ];

  return (
    <div
      ref={rootRef}
      data-surface="dark"
      className={cx("relative overflow-hidden rounded-lg border border-line bg-bg text-text", webgl !== false && height, className)}
    >
      {webgl === false ? (
        <HotelPlan2D
          snapshot={snapshot}
          variant={variant}
          selectedRoom={selected ?? null}
          onSelectRoom={selectRoom}
          onSelectPlace={onSelectPlace}
        />
      ) : (
        <>
          <div ref={hostRef} className="absolute inset-0" />
          <div ref={labelsRef} className="h3d-labels" data-compact={compact || undefined} aria-hidden="true" />
          {(!scene || replay.status === "loading") && (
            <div className="absolute inset-0 flex items-end p-4" aria-busy="true" aria-label="Laster hotellet">
              <Skeleton className="h-6 w-40" />
            </div>
          )}
        </>
      )}

      {/* HUD: the floors, the robot, the legend. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3 sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div
            role="group"
            aria-label="Etasje"
            className="pointer-events-auto inline-flex flex-wrap gap-0.5 rounded-md border border-line bg-surface/90 p-0.5 backdrop-blur-sm"
          >
            {modes.map(({ mode, text, name }) => {
              const active = floorMode === mode;
              return (
                <button
                  key={String(mode)}
                  type="button"
                  aria-pressed={active}
                  aria-label={name}
                  title={name}
                  onClick={() => setFloorMode(mode)}
                  className={cx(
                    "min-h-9 min-w-9 rounded-sm px-2 text-sm font-semibold transition-colors duration-150 ease-standard pointer-coarse:min-h-11 sm:px-2.5",
                    active ? "bg-sunken text-text" : "text-muted hover:text-text",
                  )}
                >
                  {text}
                </button>
              );
            })}
          </div>
          {webgl && (
            <button
              type="button"
              aria-pressed={follow}
              onClick={() => {
                if (follow) {
                  setFollow(false);
                } else {
                  setFollow(true);
                  scene?.focusRobot();
                }
              }}
              className={cx(
                "pointer-events-auto inline-flex min-h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-semibold backdrop-blur-sm transition-colors duration-150 ease-standard pointer-coarse:min-h-11",
                follow ? "border-accent bg-accent text-on-accent" : "border-line bg-surface/90 text-text hover:bg-sunken",
              )}
            >
              <RegenIcon name="target" className="size-4" />
              {follow ? "Følger robot" : "Følg robot"}
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="flex flex-col gap-1">
            <StatusLegend className="max-sm:hidden" />
            {webgl && !compact && (
              <p className="text-xs text-muted max-sm:hidden">Dra for å snu · rull for å zoome · piltaster flytter · klikk et rom</p>
            )}
          </div>
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
