import {
  HOTEL_EDGES,
  HOTEL_FLOORS,
  HOTEL_NODES,
  type HotelNode,
  placeName,
  ROOM_STATUS_LABEL,
  roomNumber,
  type Snapshot,
} from "@/features/replay";
import { cx } from "@/ui";
import { STATUS_CSS_VAR } from "./tokens";

/**
 * The hotel as a flat plan, one SVG per floor: the same rooms, colours and robot as the 3D scene.
 * Shown when WebGL is missing (and in tests, where it is the only renderer).
 */

const ROOM = 2.4;
const MARGIN = 3.2;

type FloorPlan = { floor: number; nodes: HotelNode[]; minX: number; minZ: number; width: number; height: number };

const PLANS: FloorPlan[] = HOTEL_FLOORS.map((floor) => {
  const nodes = Object.values(HOTEL_NODES).filter((node) => node.floor === floor);
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

export function HotelPlan2D({
  snapshot,
  variant = "full",
  className,
}: {
  snapshot: Snapshot | null;
  variant?: "panel" | "full";
  className?: string;
}) {
  const robot = snapshot?.robot ?? null;
  const from = robot ? HOTEL_NODES[robot.from] : undefined;
  const to = robot ? HOTEL_NODES[robot.to] : undefined;
  const robotFloor = robot?.floor ?? null;
  const rx = from && to && robot ? from.x + (to.x - from.x) * robot.progress : (to?.x ?? null);
  const rz = from && to && robot ? from.z + (to.z - from.z) * robot.progress : (to?.z ?? null);

  return (
    <figure
      aria-label="Hotellet som plantegning"
      className={cx("grid grid-cols-1 gap-3 bg-bg p-3 sm:grid-cols-3", variant === "panel" && "sm:gap-2", className)}
    >
      {PLANS.map((plan) => {
        const edges = HOTEL_EDGES.filter((edge) => {
          const a = HOTEL_NODES[edge.a];
          const b = HOTEL_NODES[edge.b];
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
              role="img"
              aria-label={`${plan.floor}. etasje`}
            >
              {edges.map((edge) => {
                const a = HOTEL_NODES[edge.a];
                const b = HOTEL_NODES[edge.b];
                const door = a.kind === "room" || b.kind === "room";
                return (
                  <line
                    key={`${edge.a}-${edge.b}`}
                    x1={a.x}
                    y1={a.z}
                    x2={b.x}
                    y2={b.z}
                    stroke={door ? "var(--line)" : "var(--sunken)"}
                    strokeWidth={door ? 0.4 : 1.4}
                    strokeLinecap="round"
                  />
                );
              })}
              {plan.nodes
                .filter((node) => node.kind !== "corridor" && node.kind !== "room")
                .map((node) => (
                  <g key={node.id}>
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
                  return (
                    <g key={node.id}>
                      <title>{`Rom ${roomNumber(node.id)}: ${ROOM_STATUS_LABEL[status]}`}</title>
                      <rect
                        x={node.x - ROOM / 2}
                        y={node.z - ROOM / 2}
                        width={ROOM}
                        height={ROOM}
                        rx={0.25}
                        fill={STATUS_CSS_VAR[status]}
                        stroke={highlighted ? "var(--accent)" : "var(--line)"}
                        strokeWidth={highlighted ? 0.35 : 0.08}
                      />
                      <text
                        x={node.x}
                        y={node.z + 0.4}
                        textAnchor="middle"
                        fontSize={1.05}
                        fontWeight={500}
                        fill={status === "ikke_forstyrr" ? "var(--bg)" : "var(--text)"}
                        style={{ fontFamily: "var(--font-martian), monospace" }}
                      >
                        {roomNumber(node.id)}
                      </text>
                    </g>
                  );
                })}
              {active && rx !== null && rz !== null && (
                <g>
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
