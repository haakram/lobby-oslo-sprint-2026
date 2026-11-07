import type { RoomStatus } from "./labels";
import { placeLabel } from "./labels";
import { HOTEL_EDGES, HOTEL_NODES, type RoomView } from "./selectors";

const ROOM_FILL: Record<RoomStatus, string> = {
  klar: "fill-success stroke-success",
  ma_vaskes: "fill-accent stroke-accent",
  opptatt: "fill-line-strong stroke-line-strong",
  ikke_forstyrr: "fill-warning stroke-warning",
  ukjent: "fill-none stroke-line-strong [stroke-dasharray:0.5_0.5]",
};

const PAD = 3;
const ROOM = 2.4;

/**
 * The 2D stand-in for the 3D hotel: the robot's floor from the real map (hotel_seed1.json), rooms
 * in their status colour, the robot as the one orange dot. Same coordinates the agent routes on.
 */
export function FloorIndicator({
  floor,
  location,
  rooms,
}: {
  floor: number;
  location: string | null;
  rooms: readonly RoomView[];
}) {
  const nodes = Object.entries(HOTEL_NODES).filter(([, node]) => node.floor === floor);
  if (nodes.length === 0) return null;
  const xs = nodes.map(([, node]) => node.x);
  const zs = nodes.map(([, node]) => node.z);
  const minX = Math.min(...xs) - PAD;
  const minZ = Math.min(...zs) - PAD;
  const width = Math.max(...xs) - minX + PAD;
  const height = Math.max(...zs) - minZ + PAD;
  const onFloor = new Set(nodes.map(([id]) => id));
  const status = new Map(rooms.map((room) => [room.id, room.status]));
  const robot = location && onFloor.has(location) ? HOTEL_NODES[location] : null;

  return (
    <svg
      viewBox={`${minX} ${minZ} ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`Kart over ${floor}. etasje${robot ? `. Roboten er ved ${placeLabel(location)}.` : "."}`}
      className="h-full w-full"
    >
      {HOTEL_EDGES.filter((edge) => onFloor.has(edge.a) && onFloor.has(edge.b)).map((edge) => {
        const a = HOTEL_NODES[edge.a];
        const b = HOTEL_NODES[edge.b];
        return (
          <line
            key={`${edge.a}-${edge.b}`}
            x1={a.x}
            y1={a.z}
            x2={b.x}
            y2={b.z}
            className="stroke-line"
            strokeWidth={0.5}
            strokeLinecap="round"
          />
        );
      })}
      {nodes.map(([id, node]) =>
        node.kind === "room" ? (
          <rect
            key={id}
            x={node.x - ROOM / 2}
            y={node.z - ROOM / 2}
            width={ROOM}
            height={ROOM}
            rx={0.4}
            strokeWidth={0.25}
            className={ROOM_FILL[status.get(id) ?? "ukjent"]}
          />
        ) : (
          <circle key={id} cx={node.x} cy={node.z} r={0.55} className="fill-muted" />
        ),
      )}
      {robot && (
        <g>
          <circle cx={robot.x} cy={robot.z} r={2.2} className="fill-accent opacity-25" />
          <circle cx={robot.x} cy={robot.z} r={1.1} className="fill-accent stroke-bg" strokeWidth={0.35} />
        </g>
      )}
    </svg>
  );
}
