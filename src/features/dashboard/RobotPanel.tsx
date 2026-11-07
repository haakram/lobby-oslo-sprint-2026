import Link from "next/link";
import { Hotel3D } from "@/features/hotel3d/Hotel3D";
import type { HotelReplay } from "@/features/replay";
import { RegenIcon } from "@/ui";
import { placeLabel } from "./labels";
import type { RobotView } from "./selectors";

/**
 * The hotel in the robot's panel: B1's 3D hotel (`Hotel3D`, a 2D plan without WebGL) at the
 * same moment as the rest of the desk. A tap on a room opens the same room sheet as the rack; the
 * way into the full 3D-kart sits under it.
 */
export function RobotPanel({
  robot,
  replay,
  selectedRoom,
  onSelectRoom,
}: {
  robot: RobotView;
  replay: HotelReplay;
  selectedRoom: string | null;
  onSelectRoom: (room: string | null) => void;
}) {
  const floor = robot.floor ?? 1;

  return (
    <figure data-surface="dark" className="overflow-hidden rounded-md bg-bg">
      <Hotel3D replay={replay} variant="panel" className="rounded-none! border-0!" selectedRoom={selectedRoom} onSelectRoom={onSelectRoom} />
      <figcaption className="flex items-center justify-between gap-3 pl-3">
        <span className="min-w-0 truncate text-sm">
          <span className="font-semibold">{floor}. etasje</span>
          <span className="text-muted"> · {robot.location ? placeLabel(robot.location) : "posisjon ukjent"}</span>
        </span>
        <Link
          href="/hotell"
          className="flex min-h-11 shrink-0 items-center gap-1.5 px-3 text-sm font-semibold text-accent-text hover:underline focus-visible:outline-offset-[-4px]"
        >
          <RegenIcon name="cube" size={18} />
          Åpne 3D-kart
        </Link>
      </figcaption>
    </figure>
  );
}
