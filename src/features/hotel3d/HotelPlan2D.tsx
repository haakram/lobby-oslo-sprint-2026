import { type KeyboardEvent, useMemo } from "react";
import { BASE_HOTEL, floorsOf, type HotelMap, type HotelNode } from "@/features/hotel/mapFromRun";
import { placeName, roomNumber, type Snapshot } from "@/features/replay";
import { cx } from "@/ui";
import { roomWord } from "./held";
import { STATUS_CSS_VAR } from "./tokens";

/**
 * The hotel as a flat plan, one SVG per floor: the same rooms, colours, robot and clicks as the 3D
 * scene. Shown when WebGL is missing (and in tests, where it is the only renderer).
 */

const ROOM = 2.4;
const MARGIN = 3.2;

type FloorPlan = { floor: number; nodes: HotelNode[]; minX: number; minZ: number; width: number; height: number };

function plansOf(map: HotelMap): FloorPlan[] {
  return floorsOf(map).map((floor) => {
    const nodes = Object.values(map.nodes).filter((node) => node.floor === floor);
    const xs = nodes.map((node) => node.x);
    const zs = nodes.map((node) => node.z);
    const minX = Math.min(...xs) - MARGIN;
    const minZ = Math.min(...zs) - MARGIN;
    return {
      floor,
      nodes,
      minX,
      minZ,
      width: Math.max(...xs) + MARGIN - minX,
      height: Math.max(...zs) + MARGIN - minZ,
    };
  });
}

function activate(handler: () => void) {
  return (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handler();
    }
  };
}

export function HotelPlan2D({
  map = BASE_HOTEL,
  snapshot,
  variant = "full",
  className,
  selectedRoom = null,
  onSelectRoom,
  onSelectPlace,
}: {
  /** The night's hotel (`timeline.map`); the seed-1 base when omitted. */
  map?: HotelMap;
  snapshot: Snapshot | null;
  variant?: "panel" | "full";
  className?: string;
  selectedRoom?: string | null;
  onSelectRoom?: (roomId: string | null) => void;
  onSelectPlace?: (nodeId: string) => void;
}) {
  const plans = useMemo(() => plansOf(map), [map]);
  const nodesById = map.nodes;
  const robot = snapshot?.robot ?? null;
  const from = robot ? nodesById[robot.from] : undefined;
  const to = robot ? nodesById[robot.to] : undefined;
  const robotFloor = robot?.floor ?? null;
  const rx = from && to && robot ? from.x + (to.x - from.x) * robot.progress : (to?.x ?? null);
  const rz = from && to && robot ? from.z + (to.z - from.z) * robot.progress : (to?.z ?? null);

  return (
    <figure
      aria-label="Hotellet som plantegning"
      className={cx("grid grid-cols-1 gap-3 bg-bg p-3 sm:grid-cols-3", variant === "panel" && "sm:gap-2", className)}
    >
      {plans.map((plan) => {
        const edges = map.edges.filter((edge) => {
          const a = nodesById[edge.a];
          const b = nodesById[edge.b];
          return a && b && a.floor === plan.floor && b.floor === plan.floor;
        });
        const active = robotFloor === plan.floor;
        return (
          <div key={plan.floor} className={cx("min-w-0 rounded-md border bg-surface p-2", active ? "border-line-strong" : "border-line")}>
            <div className="flex items-baseline justify-between px-1">
              <span className="text-sm font-bold">{plan.floor}. etasje</span>
              {active && robot && <span className="text-xs text-accent-text">Robot</span>}
            </div>
            <svg
              viewBox={`${plan.minX} ${plan.minZ} ${plan.width} ${plan.height}`}
              className="mt-1 h-auto w-full"
              role="group"
              aria-label={`${plan.floor}. etasje`}
            >
              {edges.map((edge) => {
                const a = nodesById[edge.a];
                const b = nodesById[edge.b];
                const door = a.kind === "room" || b.kind === "room";
                return (
                  <line
                    key={`${edge.a}-${edge.b}`}
                    x1={a.x}
                    y1={a.z}
                    x2={b.x}
                    y2={b.z}
                    stroke={door ? "var(--line)" : "var(--line-strong)"}
                    strokeOpacity={door ? 0.8 : 0.5}
                    strokeWidth={door ? 0.4 : 1.4}
                    strokeLinecap="round"
                  />
                );
              })}
              {plan.nodes
                .filter((node) => node.kind !== "corridor" && node.kind !== "room")
                .map((node) => (
                  <g
                    key={node.id}
                    role={onSelectPlace ? "button" : undefined}
                    tabIndex={onSelectPlace ? 0 : undefined}
                    aria-label={onSelectPlace ? placeName(node.id) : undefined}
                    onClick={onSelectPlace ? () => onSelectPlace(node.id) : undefined}
                    onKeyDown={onSelectPlace ? activate(() => onSelectPlace(node.id)) : undefined}
                    className={cx(onSelectPlace && "cursor-pointer")}
                  >
                    <rect
                      x={node.x - 1.4}
                      y={node.z - 1.4}
                      width={2.8}
                      height={2.8}
                      rx={0.3}
                      fill={node.kind === "elevator" || node.kind === "stairwell" ? "var(--line-strong)" : "var(--sunken)"}
                    />
                    <text
                      x={node.x}
                      y={node.z + 2.4}
                      textAnchor="middle"
                      fontSize={1.1}
                      fontWeight={600}
                      fill="var(--muted)"
                      style={{ fontFamily: "var(--font-grotesk), sans-serif" }}
                    >
                      {placeName(node.id)}
                    </text>
                  </g>
                ))}
              {plan.nodes
                .filter((node) => node.kind === "room")
                .map((node) => {
                  const status = snapshot?.rooms[node.id]?.status ?? "ukjent";
                  const highlighted = robot?.attention === node.id;
                  const isSelected = selectedRoom === node.id;
                  const avvik = snapshot?.rooms[node.id]?.avvik ?? false;
                  const name = `Rom ${roomNumber(node.id)}: ${roomWord(snapshot?.rooms[node.id])}${avvik ? ", åpent avvik" : ""}`;
                  return (
                    <g
                      key={node.id}
                      role="button"
                      tabIndex={0}
                      aria-label={name}
                      aria-pressed={isSelected}
                      onClick={() => onSelectRoom?.(isSelected ? null : node.id)}
                      onKeyDown={activate(() => onSelectRoom?.(isSelected ? null : node.id))}
                      className="cursor-pointer"
                    >
                      <title>{name}</title>
                      <rect
                        x={node.x - ROOM / 2}
                        y={node.z - ROOM / 2}
                        width={ROOM}
                        height={ROOM}
                        rx={0.25}
                        fill={STATUS_CSS_VAR[status]}
                        // An open avvik is an ink frame over the room's own colour, never red (DESIGN.md).
                        stroke={isSelected || avvik ? "var(--text)" : highlighted ? "var(--accent)" : "var(--line-strong)"}
                        strokeWidth={isSelected || highlighted ? 0.4 : avvik ? 0.3 : 0.1}
                      />
                      <text
                        x={node.x}
                        y={node.z + 0.4}
                        textAnchor="middle"
                        fontSize={1.05}
                        fontWeight={500}
                        fill={status === "ikke_forstyrr" ? "var(--bg)" : "var(--text)"}
                        style={{ fontFamily: "var(--font-martian), monospace", pointerEvents: "none" }}
                      >
                        {roomNumber(node.id)}
                      </text>
                    </g>
                  );
                })}
              {active && rx !== null && rz !== null && (
                <g pointerEvents="none">
                  <circle cx={rx} cy={rz} r={1.5} fill="var(--accent)" opacity={0.25} />
                  <circle cx={rx} cy={rz} r={0.9} fill="var(--accent)" />
                </g>
              )}
            </svg>
          </div>
        );
      })}
      {robot && (
        <figcaption className="px-1 text-sm text-muted sm:col-span-3">
          Roboten er ved {placeName(robot.node)}
          {robot.task ? ` · ${robot.task.title}` : ""}
        </figcaption>
      )}
    </figure>
  );
}
