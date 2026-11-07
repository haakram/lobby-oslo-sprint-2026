"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { useReducedMotion } from "motion/react";
import { useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Badge, cx, RegenIcon } from "@/ui";
import { floorsOf, placeLabel, roomNumber, type HotelGraph } from "./hotelMap";
import { ROOM_STATUS } from "@/ui/roomStatus";
import { STATUS_LABEL, type RoomReport, type RoomStatus } from "./nightRooms";
import { floorGeometry, labelPoint, pathData, percentOf, runPoints, TILE, type Frame, type Point } from "./planGeometry";

gsap.registerPlugin(useGSAP);

// DESIGN.md: entrances ease cubic-bezier(0.2, 0, 0, 1); one route segment takes at most 300 ms.
const EASE = "lobby-standard";
let easeReady = false;
function ensureEase() {
  if (easeReady) return;
  gsap.registerPlugin(CustomEase);
  CustomEase.create(EASE, "0.2,0,0,1");
  easeReady = true;
}
const SEGMENT_S = 0.3;
const MIN_SEGMENT_S = 0.12;
const WHOLE_DRAW_S = 2.4;
const PIN_S = 0.15;

/** Below this the floor scrolls sideways inside its panel instead of shrinking the room tiles. */
const MIN_PX_PER_M = 12;
const CONNECTOR = 2;

// The one status language every screen shares (src/ui/roomStatus.ts).
export const STATUS_TONE: Record<RoomStatus, string> = {
  klar: ROOM_STATUS.klar.fill,
  opptatt: ROOM_STATUS.opptatt.fill,
  ma_vaskes: ROOM_STATUS.ma_vaskes.fill,
  ikke_forstyrr: ROOM_STATUS.ikke_forstyrr.fill,
};

export type PlanPin = { node: string; label: string; /** The route step that ends here; no step = shown at once. */ step?: number };
export type PlanTrace = { from: string; to: string; count: number };

type Props = {
  map: HotelGraph;
  /** Accessible name of the whole plan. */
  label: string;
  statuses: ReadonlyMap<string, RoomReport>;
  /** The route, one node path per step (a leg between stops, or a task). Drawn in order. */
  route: string[][];
  pins?: PlanPin[];
  start?: string | null;
  /** Edges the robot walked, with how often: drawn faint, thicker where it walked more. */
  trace?: PlanTrace[];
  selected?: ReadonlySet<string>;
  /** When given, guest rooms are buttons that add or remove themselves. */
  onToggleRoom?: (room: string) => void;
  /** Bump to draw the route stop by stop; 0 shows it at once. */
  drawToken: number;
  legend?: ReactNode;
  /** Actions under the plan, beside the legend. */
  footer?: ReactNode;
};

type Run = { floor: number; nodes: string[] };

function runsOf(map: HotelGraph, path: string[]): Run[] {
  const runs: Run[] = [];
  for (const id of path) {
    const floor = map.nodes[id]?.floor;
    if (floor === undefined) continue;
    const last = runs.at(-1);
    if (last && last.floor === floor) last.nodes.push(id);
    else runs.push({ floor, nodes: [id] });
  }
  return runs;
}

const box = (centre: Point, size: number, f: Frame): CSSProperties => ({
  left: `${((centre.x - size / 2 - f.minX) / f.width) * 100}%`,
  top: `${((centre.z - size / 2 - f.minZ) / f.height) * 100}%`,
  width: `${(size / f.width) * 100}%`,
  height: `${(size / f.height) * 100}%`,
});

/** A label anchored at `p`, shifted inwards near the edges so it never spills off the plan. */
function anchored(p: Point, f: Frame): CSSProperties {
  const { left, top } = percentOf(p, f);
  const shift = left < 16 ? "0%" : left > 84 ? "-100%" : "-50%";
  return { left: `${left}%`, top: `${top}%`, transform: `translate(${shift}, -50%)` };
}

/** Hubs whose name goes right of the dot, clear of a neighbour's centred name. */
const HUB_LABEL_RIGHT = new Set(["lobby"]);

function rightOf(p: Point, f: Frame): CSSProperties {
  const { left, top } = percentOf(p, f);
  return { left: `${left}%`, top: `${top}%`, transform: "translate(0, -50%)" };
}

function joinFloors(floors: number[]): string {
  const names = floors.map((f) => `${f}.`);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} og ${names.at(-1)} etasje` : `${names[0]} etasje`;
}

export function HotelPlan({
  map,
  label,
  statuses,
  route,
  pins = [],
  start = null,
  trace = [],
  selected,
  onToggleRoom,
  drawToken,
  legend,
  footer,
}: Props) {
  const reduced = useReducedMotion();
  const baseId = useId();
  const root = useRef<HTMLDivElement>(null);
  const floors = useMemo(() => floorsOf(map), [map]);
  const [shown, setShown] = useState(floors[0]);

  const steps = useMemo(() => route.map((path) => runsOf(map, path)), [map, route]);
  const maxTrace = Math.max(1, ...trace.map((t) => t.count));

  useGSAP(
    () => {
      if (reduced || drawToken === 0 || steps.length === 0) return;
      ensureEase();
      const tl = gsap.timeline({ defaults: { ease: EASE } });
      const perStep = Math.min(SEGMENT_S, Math.max(MIN_SEGMENT_S, WHOLE_DRAW_S / steps.length));
      steps.forEach((runs, step) => {
        runs.forEach((_, sub) => {
          const lines = root.current?.querySelectorAll(`[data-step="${step}"][data-sub="${sub}"]`);
          if (lines?.length) tl.fromTo(lines, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: perStep / runs.length });
        });
        const landed = root.current?.querySelectorAll(`[data-pin-step="${step}"]`);
        if (landed?.length) tl.fromTo(landed, { autoAlpha: 0, scale: 0.9 }, { autoAlpha: 1, scale: 1, duration: PIN_S }, "<");
      });
    },
    { scope: root, dependencies: [drawToken], revertOnUpdate: true },
  );

  const widths = floors.map((f) => floorGeometry(map, f).frame.width);
  const rest = widths.slice(1);
  const layout = {
    "--cols-all": widths.map((w) => `minmax(0, ${w}fr)`).join(" "),
    "--cols-rest": rest.map((w) => `minmax(0, ${w}fr)`).join(" "),
    "--first-w": `calc((100% - ${Math.max(0, rest.length - 1)}rem) * ${widths[0]} / ${rest.reduce((a, b) => a + b, 0) || 1})`,
  } as CSSProperties;

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = floors[(floors.indexOf(shown) + step + floors.length) % floors.length];
    setShown(next);
    document.getElementById(`${baseId}-tab-${next}`)?.focus();
  }

  const stopsOn = (floor: number) => pins.filter((p) => map.nodes[p.node]?.floor === floor).length;

  return (
    <div ref={root} role="group" aria-label={label} className="flex flex-col gap-4">
      <div role="tablist" aria-label="Etasjer" className="grid grid-cols-(--floor-tabs) gap-1 rounded-md bg-sunken p-1 md:hidden" style={{ "--floor-tabs": `repeat(${floors.length}, minmax(0, 1fr))` } as CSSProperties}>
        {floors.map((f) => {
          const active = f === shown;
          return (
            <button
              key={f}
              id={`${baseId}-tab-${f}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`${baseId}-floor-${f}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setShown(f)}
              onKeyDown={onTabKey}
              className={cx(
                "inline-flex min-h-12 items-center justify-center gap-2 rounded-md border px-2 text-base font-semibold",
                "transition-colors duration-150 ease-standard",
                active ? "border-line bg-surface text-text" : "border-transparent text-muted hover:text-text",
              )}
            >
              {f}. etg.
              {stopsOn(f) > 0 && (
                <Badge tone={active ? "accent" : "neutral"}>
                  <span className="font-mono tabular-nums">{stopsOn(f)}</span>
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      <div style={layout} className="md:grid md:grid-cols-(--cols-rest) md:gap-4 min-[87.5rem]:grid-cols-(--cols-all)">
        {floors.map((floor, index) => {
          const { frame, corridors, doors } = floorGeometry(map, floor);
          const here = Object.entries(map.nodes).filter(([, n]) => n.floor === floor);
          const hops = new Map<string, Set<number>>();
          steps.forEach((runs) =>
            runs.forEach((run, i) => {
              const touch = (other: Run | undefined, node: string) => {
                if (!other || run.floor !== floor) return;
                const kind = map.nodes[node]?.kind === "stairwell" ? "Trapp" : "Heis";
                hops.set(kind, (hops.get(kind) ?? new Set()).add(other.floor));
              };
              touch(runs[i + 1], run.nodes.at(-1)!);
              touch(runs[i - 1], run.nodes[0]);
            }),
          );
          const usedConnectors = new Set(steps.flatMap((runs) => runs.flatMap((r) => r.nodes)));
          const traceHere = trace.filter((t) => map.nodes[t.from]?.floor === floor && map.nodes[t.to]?.floor === floor);
          const count = stopsOn(floor);
          return (
            <section
              key={floor}
              id={`${baseId}-floor-${floor}`}
              aria-label={`${floor}. etasje`}
              className={cx(
                "min-w-0",
                floor !== shown && "hidden md:block",
                index === 0 && "md:col-span-full md:w-(--first-w) min-[87.5rem]:col-span-1 min-[87.5rem]:w-auto",
              )}
            >
              <header className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="text-base font-semibold">{floor}. etasje</h3>
                {count > 0 && (
                  <span className="text-sm text-muted">
                    <span className="font-mono tabular-nums">{count}</span> stopp
                  </span>
                )}
                {[...hops].map(([kind, others]) => (
                  <span key={kind} className="text-sm text-accent-text">
                    {kind} til {joinFloors([...others].sort((a, b) => a - b))}
                  </span>
                ))}
              </header>
              <div className="overflow-x-auto rounded-md">
                <div
                  className="relative w-full"
                  style={{ aspectRatio: `${frame.width} / ${frame.height}`, minWidth: `${Math.round(frame.width * MIN_PX_PER_M)}px` }}
                >
                  <svg viewBox={`0 0 ${frame.width} ${frame.height}`} className="absolute inset-0 size-full" aria-hidden="true">
                    <rect x="0.1" y="0.1" width={frame.width - 0.2} height={frame.height - 0.2} rx="0.8" className="fill-sunken stroke-line" strokeWidth="0.15" />
                    <g strokeLinecap="round" strokeLinejoin="round" fill="none">
                      {corridors.map(([a, b], i) => (
                        <path key={`c-out-${i}`} d={pathData([a, b], frame)} className="stroke-line" strokeWidth="2.5" />
                      ))}
                      {[...doors].map(([id, door]) => (
                        <path key={`d-out-${id}`} d={pathData([door, map.nodes[id]], frame)} className="stroke-line" strokeWidth="1.1" />
                      ))}
                      {corridors.map(([a, b], i) => (
                        <path key={`c-in-${i}`} d={pathData([a, b], frame)} className="stroke-surface" strokeWidth="2.1" />
                      ))}
                      {[...doors].map(([id, door]) => (
                        <path key={`d-in-${id}`} d={pathData([door, map.nodes[id]], frame)} className="stroke-surface" strokeWidth="0.75" />
                      ))}
                    </g>
                    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
                      {traceHere.map((t) => {
                        const share = t.count / maxTrace;
                        return (
                          <path
                            key={`t-${t.from}-${t.to}`}
                            d={pathData(runPoints(map, [t.from, t.to]), frame)}
                            className="stroke-accent"
                            strokeWidth={0.25 + 0.6 * share}
                            strokeOpacity={0.25 + 0.6 * share}
                          />
                        );
                      })}
                      {steps.flatMap((runs, step) =>
                        runs.map((run, sub) => {
                          if (run.floor !== floor || run.nodes.length < 2) return null;
                          const d = pathData(runPoints(map, run.nodes), frame);
                          const common = { d, pathLength: 1, strokeDasharray: "1 1", "data-step": step, "data-sub": sub };
                          return (
                            <g key={`r-${step}-${sub}`}>
                              <path {...common} className="stroke-surface" strokeWidth="1.05" />
                              <path {...common} className="stroke-accent" strokeWidth="0.55" />
                            </g>
                          );
                        }),
                      )}
                    </g>
                  </svg>

                  {here.map(([id, n]) => {
                    const centre = { x: n.x, z: n.z };
                    if (n.kind === "room") {
                      const report = statuses.get(id);
                      const on = selected?.has(id) ?? false;
                      const name = `Rom ${roomNumber(id)}${report ? `, ${STATUS_LABEL[report.status].toLowerCase()}` : ""}`;
                      const tile = cx(
                        "absolute flex items-center justify-center overflow-hidden rounded-sm font-mono text-xs tabular-nums",
                        "transition-colors duration-150 ease-standard",
                        on ? "border-2 border-accent bg-accent-soft text-text" : "border border-line-strong bg-surface text-text",
                      );
                      const inner = (
                        <>
                          {roomNumber(id)}
                          {report && (
                            <span aria-hidden="true" className={cx("absolute inset-x-1 bottom-0.5 h-[3px] rounded-full", STATUS_TONE[report.status])} />
                          )}
                        </>
                      );
                      return onToggleRoom ? (
                        <button
                          key={id}
                          type="button"
                          aria-pressed={on}
                          aria-label={name}
                          title={name}
                          onClick={() => onToggleRoom(id)}
                          className={cx(tile, !on && "hover:bg-sunken", "cursor-pointer")}
                          style={box(centre, TILE, frame)}
                        >
                          {inner}
                        </button>
                      ) : (
                        <div key={id} title={name} className={tile} style={box(centre, TILE, frame)}>
                          {inner}
                        </div>
                      );
                    }
                    if (n.kind === "service") {
                      const out = labelPoint(centre, doors.get(id) ?? centre);
                      return (
                        <div key={id} aria-hidden="true">
                          <span className="absolute rounded-sm border border-line bg-surface" style={box(centre, TILE, frame)} />
                          <span className="absolute text-xs font-medium whitespace-nowrap text-muted" style={anchored(out, frame)}>
                            {placeLabel(id)}
                          </span>
                        </div>
                      );
                    }
                    if (n.kind === "elevator" || n.kind === "stairwell") {
                      const used = usedConnectors.has(id);
                      return (
                        <span
                          key={id}
                          title={placeLabel(id)}
                          className={cx(
                            "absolute flex items-center justify-center rounded-sm border bg-surface text-text",
                            used ? "border-2 border-accent" : "border-line-strong",
                          )}
                          style={box(centre, CONNECTOR, frame)}
                        >
                          <RegenIcon name={n.kind === "elevator" ? "chevrons-up-down" : "stairs"} size={16} />
                        </span>
                      );
                    }
                    if (n.kind === "hub") {
                      return (
                        <div key={id} aria-hidden="true">
                          <span className="absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-line-strong" style={{ left: `${percentOf(centre, frame).left}%`, top: `${percentOf(centre, frame).top}%` }} />
                          <span
                            className="absolute rounded-sm bg-sunken px-1 text-xs whitespace-nowrap text-muted"
                            style={HUB_LABEL_RIGHT.has(id) ? rightOf({ x: n.x + 0.5, z: n.z + 1.3 }, frame) : anchored({ x: n.x, z: n.z + 1.3 }, frame)}
                          >
                            {placeLabel(id)}
                          </span>
                        </div>
                      );
                    }
                    return null;
                  })}

                  {start && map.nodes[start]?.floor === floor && (
                    <span
                      className="pointer-events-none absolute rounded-sm bg-text px-2 py-0.5 text-xs font-semibold text-surface"
                      style={anchored(map.nodes[start], frame)}
                    >
                      Start
                    </span>
                  )}

                  {pins
                    .filter((p) => map.nodes[p.node]?.floor === floor)
                    .map((p) => {
                      const n = map.nodes[p.node];
                      const corner = percentOf({ x: n.x + TILE / 2, z: n.z - TILE / 2 }, frame);
                      return (
                        <span
                          key={`pin-${p.node}-${p.label}`}
                          aria-hidden="true"
                          data-pin-step={p.step}
                          className="pointer-events-none absolute flex h-5 min-w-5 -translate-x-2/5 -translate-y-3/5 items-center justify-center rounded-full border-2 border-surface bg-accent px-1 font-mono text-xs font-medium text-on-accent tabular-nums"
                          style={{ left: `${corner.left}%`, top: `${corner.top}%` }}
                        >
                          {p.label}
                        </span>
                      );
                    })}
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <ul aria-label="Tegnforklaring" className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
          {legend}
          {(Object.keys(STATUS_TONE) as RoomStatus[]).map((s) => (
            <li key={s} className="flex items-center gap-2">
              <span aria-hidden="true" className={cx("h-[3px] w-5 rounded-full", STATUS_TONE[s])} />
              {STATUS_LABEL[s]}
            </li>
          ))}
          <li className="flex items-center gap-2">
            <RegenIcon name="chevrons-up-down" size={18} className="text-text" />
            Heis
          </li>
          <li className="flex items-center gap-2">
            <RegenIcon name="stairs" size={18} className="text-text" />
            Trapp
          </li>
        </ul>
        {footer}
      </div>
    </div>
  );
}
