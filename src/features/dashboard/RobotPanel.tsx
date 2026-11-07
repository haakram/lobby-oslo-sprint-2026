import Link from "next/link";
import { RegenIcon } from "@/ui";
import { FloorIndicator } from "./FloorIndicator";
import { placeLabel } from "./labels";
import type { RobotView, RoomView } from "./selectors";

/**
 * The bounded panel where the 3D hotel goes. Until B1's `Hotel3D` lands on this branch it shows the
 * 2D floor indicator; swapping is one line, marked below. Dark like the 3D scene, fixed aspect, so
 * the swap does not move anything around it.
 */
export function RobotPanel({ robot, rooms }: { robot: RobotView; rooms: readonly RoomView[] }) {
  const floor = robot.floor ?? 1;
  // Swap point: replace this line with `<Hotel3D variant="panel" />` once src/features/hotel3d exists.
  const view = <FloorIndicator floor={floor} location={robot.location} rooms={rooms} />;

  return (
    <figure data-surface="dark" className="overflow-hidden rounded-md border border-line bg-bg">
      <div className="aspect-[16/10] w-full p-3">{view}</div>
      <figcaption className="flex items-center justify-between gap-3 border-t border-line pl-3">
        <span className="min-w-0 truncate text-sm">
          <span className="font-semibold">{floor}. etasje</span>
          <span className="text-muted"> · {robot.location ? placeLabel(robot.location) : "posisjon ukjent"}</span>
        </span>
        <Link
          href="/hotell"
          className="flex min-h-12 shrink-0 items-center gap-1.5 px-3 text-sm font-semibold text-accent-text hover:underline focus-visible:outline-offset-[-4px]"
        >
          <RegenIcon name="cube" size={18} />
          Åpne 3D
        </Link>
      </figcaption>
    </figure>
  );
}
