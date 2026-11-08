"use client";

import { motion, useReducedMotion } from "motion/react";
import { useId, useMemo, useState, type CSSProperties, type KeyboardEvent, type SVGProps } from "react";
import { Badge, cx, drawLine } from "@/ui";
import { floorRuns } from "./tour";
import type { RouteMatrix, RouteNode, TourLeg } from "./types";

const PAD = 5; // metres of floor around the outermost nodes
const CONNECTOR: Record<string, string> = { elevator: "Heis", stairwell: "Trapp" };

function LiftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>
      <rect x="4" y="3" width="16" height="18" rx="1.5" />
      <path d="m9 9 3-3 3 3M9 15l3 3 3-3" />
    </svg>
  );
}

function StairsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>
      <path d="M3 20h5v-5h5v-5h5V5h3" />
    </svg>
  );
}

const ConnectorIcon = ({ kind, className }: { kind: string; className?: string }) =>
  kind === "elevator" ? <LiftIcon className={className} /> : <StairsIcon className={className} />;

type Frame = { minX: number; minZ: number; width: number; height: number };

function frameOf(nodes: RouteNode[]): Frame {
  const xs = nodes.map((n) => n.x);
  const zs = nodes.map((n) => n.z);
  const minX = Math.min(...xs) - PAD;
  const minZ = Math.min(...zs) - PAD;
  return { minX, minZ, width: Math.max(...xs) + PAD - minX, height: Math.max(...zs) + PAD - minZ };
}

/** Corridor-style line: along x, then along z, through every node of the run. */
function elbowPath(points: RouteNode[], f: Frame): string {
  const p = (n: RouteNode) => [n.x - f.minX, n.z - f.minZ] as const;
  const [x0, z0] = p(points[0]);
  let d = `M${x0} ${z0}`;
  for (let i = 1; i < points.length; i++) {
    const [px, pz] = p(points[i - 1]);
    const [x, z] = p(points[i]);
    if (x !== px && z !== pz) d += ` L${x} ${pz}`;
    d += ` L${x} ${z}`;
  }
  return d;
}

/** Where to put an HTML marker over the drawing, anchored so it never spills off the map. */
function place(n: RouteNode, f: Frame, dz = 0): CSSProperties {
  const left = ((n.x - f.minX) / f.width) * 100;
  const top = ((n.z + dz - f.minZ) / f.height) * 100;
  const shift = left < 20 ? "0%" : left > 80 ? "-100%" : "-50%";
  return { left: `${left}%`, top: `${top}%`, transform: `translate(${shift}, -50%)` };
}

const centre = (n: RouteNode, f: Frame): CSSProperties => ({
  left: `${((n.x - f.minX) / f.width) * 100}%`,
  top: `${((n.z - f.minZ) / f.height) * 100}%`,
  transform: "translate(-50%, -50%)",
});

type Hop = { node: string; other: number; leaves: boolean; arrives: boolean };

/** Lift and stairs crossings on one floor, merged per connector and other floor. */
function hopsOn(m: RouteMatrix, legs: TourLeg[], floor: number): Hop[] {
  const hops = new Map<string, Hop>();
  const mark = (node: string, other: number, dir: "leaves" | "arrives") => {
    const k = `${node}:${other}`;
    const hop = hops.get(k) ?? { node, other, leaves: false, arrives: false };
    hop[dir] = true;
    hops.set(k, hop);
  };
  for (const leg of legs) {
    const runs = floorRuns(m, leg.path);
    runs.slice(1).forEach((run, i) => {
      const prev = runs[i];
      if (prev.floor === floor) mark(prev.nodes.at(-1)!, run.floor, "leaves");
      if (run.floor === floor) mark(run.nodes[0], prev.floor, "arrives");
    });
  }
  return [...hops.values()];
}

function hopText(m: RouteMatrix, hop: Hop): string {
  const name = CONNECTOR[m.nodes[hop.node].kind] ?? "Overgang";
  const way = hop.leaves && hop.arrives ? "til og fra" : hop.leaves ? "til" : "fra";
  return `${name} ${way} ${hop.other}. etasje`;
}

export function FloorMap({ matrix, legs, order }: { matrix: RouteMatrix; legs: TourLeg[]; order: string[] }) {
  const reduced = useReducedMotion();
  const baseId = useId();
  const nodes = matrix.nodes;
  const floors = useMemo(() => [...new Set(Object.values(nodes).map((n) => n.floor))].sort((a, b) => a - b), [nodes]);
  const [floor, setFloor] = useState(nodes[matrix.start].floor);
  const frame = useMemo(() => frameOf(Object.values(nodes)), [nodes]);

  const onFloor = (id: string) => nodes[id].floor === floor;
  const stopsOn = (f: number) => order.filter((id) => nodes[id].floor === f).length;
  const here = Object.entries(nodes).filter(([, n]) => n.floor === floor);
  const hops = hopsOn(matrix, legs, floor);
  // Replays the drawing when the floor or the tour changes.
  const drawKey = `${floor}:${order.join(",")}`;

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = floors[(floors.indexOf(floor) + step + floors.length) % floors.length];
    setFloor(next);
    document.getElementById(`${baseId}-tab-${next}`)?.focus();
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Etasjer" className="flex gap-1 self-start rounded-md bg-sunken p-1">
        {floors.map((f) => {
          const selected = f === floor;
          return (
            <button
              key={f}
              id={`${baseId}-tab-${f}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${baseId}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setFloor(f)}
              onKeyDown={onTabKey}
              className={cx(
                // No wrap at 360 px: "1. etasje" stays on one line (the Holio juror).
                "inline-flex min-h-12 items-center gap-2 rounded-md border px-3 text-base font-semibold whitespace-nowrap sm:px-4",
                "transition-colors duration-[120ms] ease-standard",
                selected ? "border-line bg-surface text-text" : "border-transparent text-muted hover:text-text",
              )}
            >
              {f}. etasje
              <Badge tone={selected && stopsOn(f) > 0 ? "accent" : "neutral"}>
                <span className="font-mono tabular-nums">{stopsOn(f)}</span>&nbsp;stopp
              </Badge>
            </button>
          );
        })}
      </div>

      <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-tab-${floor}`}>
        <div className="relative w-full" style={{ aspectRatio: `${frame.width} / ${frame.height}` }}>
          <svg
            role="img"
            aria-label={`Kart over ${floor}. etasje med ${stopsOn(floor)} stopp på ruten`}
            viewBox={`0 0 ${frame.width} ${frame.height}`}
            className="absolute inset-0 size-full"
          >
            <defs>
              <pattern id={`${baseId}-grid`} width="2" height="2" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="0.09" className="fill-line-strong" opacity="0.5" />
              </pattern>
            </defs>
            <rect x="0.1" y="0.1" width={frame.width - 0.2} height={frame.height - 0.2} rx="0.8" className="fill-sunken stroke-line" strokeWidth="0.2" />
            <rect x="0.1" y="0.1" width={frame.width - 0.2} height={frame.height - 0.2} rx="0.8" fill={`url(#${baseId}-grid)`} />

            {here.map(([id, n]) =>
              n.kind === "shelf" ? (
                <rect key={id} x={n.x - frame.minX - 4} y={n.z - frame.minZ - 3.4} width="8" height="1.8" rx="0.3" className="fill-surface stroke-line-strong" strokeWidth="0.15" />
              ) : n.kind in CONNECTOR || id === matrix.start ? null : (
                <circle key={id} cx={n.x - frame.minX} cy={n.z - frame.minZ} r="0.35" className="fill-line-strong" />
              ),
            )}

            <g key={drawKey} fill="none" strokeLinecap="round" strokeLinejoin="round">
              {legs.flatMap((leg, i) =>
                floorRuns(matrix, leg.path)
                  .filter((run) => run.floor === floor && run.nodes.length > 1)
                  .map((run, r) => {
                    const d = elbowPath(run.nodes.map((id) => nodes[id]), frame);
                    return (
                      <g key={`${i}-${r}`}>
                        <motion.path d={d} className="stroke-surface" strokeWidth="1" variants={drawLine(reduced)} initial="hidden" animate="visible" custom={i} />
                        <motion.path d={d} className="stroke-accent" strokeWidth="0.55" variants={drawLine(reduced)} initial="hidden" animate="visible" custom={i} />
                      </g>
                    );
                  }),
              )}
            </g>
          </svg>

          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            {here
              .filter(([, n]) => n.kind === "shelf" && n.label)
              .map(([id, n]) => (
                <span key={`label-${id}`} className="absolute text-xs font-medium whitespace-nowrap text-muted" style={place(n, frame, -4.4)}>
                  {n.label}
                </span>
              ))}

            {here
              .filter(([, n]) => n.kind in CONNECTOR)
              .map(([id, n]) => (
                <span key={`conn-${id}`} className="absolute flex size-8 items-center justify-center rounded-sm border border-line-strong bg-surface text-text" style={centre(n, frame)}>
                  <ConnectorIcon kind={n.kind} className="size-5" />
                </span>
              ))}

            {hops.map((hop) => (
              <span
                key={`hop-${hop.node}-${hop.other}`}
                className="absolute rounded-sm bg-accent-soft px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-accent-text"
                style={place(nodes[hop.node], frame, 2.6)}
              >
                {hopText(matrix, hop)}
              </span>
            ))}

            {onFloor(matrix.start) && (
              <span className="absolute rounded-sm bg-text px-2 py-1 text-xs font-semibold text-surface" style={centre(nodes[matrix.start], frame)}>
                Start
              </span>
            )}

            {order.map((id, i) =>
              onFloor(id) ? (
                <span key={`${drawKey}-pin-${id}`} className="absolute" style={centre(nodes[id], frame)}>
                  {/* The pin lands as the line reaches it. */}
                  <span
                    className={cx(
                      "flex size-8 items-center justify-center rounded-full border-2 border-surface bg-accent font-mono text-sm font-medium text-on-accent tabular-nums",
                      !reduced && "animate-rise",
                    )}
                    style={reduced ? undefined : { animationDelay: `${(i + 1) * 300 - 100}ms` }}
                  >
                    {i + 1}
                  </span>
                </span>
              ) : null,
            )}
          </div>
        </div>

        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted" aria-label="Tegnforklaring">
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="h-1 w-6 rounded-full bg-accent" />
            Rute
          </li>
          <li className="flex items-center gap-2">
            <LiftIcon className="size-5 text-text" />
            Heis
          </li>
          <li className="flex items-center gap-2">
            <StairsIcon className="size-5 text-text" />
            Trapp
          </li>
        </ul>
      </div>
    </div>
  );
}
