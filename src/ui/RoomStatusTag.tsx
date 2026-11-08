import { cx } from "./cx";
import { AVVIK, ROOM_STATUS, type RoomStatusKey } from "./roomStatus";

/**
 * A room's state as the key rack draws it (src/ui/roomStatus.ts): the coloured key tag, then the word.
 * One look for the same state on every screen: Rom, Oversikt, the room sheet, Ruter and the 3D panels.
 */
export function RoomStatusTag({ status, className }: { status: RoomStatusKey; className?: string }) {
  const look = ROOM_STATUS[status];
  return (
    <span className={cx("inline-flex items-center gap-1.5 text-sm whitespace-nowrap", look.loud ? "font-semibold" : "font-medium", look.ink, className)}>
      <span aria-hidden="true" className={cx("h-1.5 w-5 shrink-0 rounded-full", look.tag)} />
      {look.word}
    </span>
  );
}

/** The avvik marker beside a state: a 3 px ink edge and the word with its count. Quiet, never red. */
export function AvvikMark({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span className={cx("inline-flex items-center pl-2 text-sm font-semibold whitespace-nowrap", AVVIK.ink, AVVIK.edge, className)}>
      {count} {count === 1 ? "åpent avvik" : "åpne avvik"}
    </span>
  );
}
