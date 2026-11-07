import { Card, cx, Skeleton } from "@/ui";
import { STATUS_LOOK, STATUS_ORDER } from "./labels";
import { countRooms, FLOORS, HOTEL_ROOMS, type RoomView } from "./selectors";

/** Top floor first, like the key rack behind the desk. */
const FLOORS_DOWN = [...FLOORS].reverse();

/**
 * Romstatus, the key rack: every room a pigeonhole on its floor, the floor number big in the
 * margin like a lift indicator. The status word is always written; the coloured tag only repeats
 * it. An open work order adds the red "Avvik" mark.
 */
export function RoomBoard({
  rooms,
  onOpen,
  className,
}: {
  rooms: RoomView[] | null;
  onOpen: (room: string) => void;
  className?: string;
}) {
  const counts = rooms ? countRooms(rooms) : null;

  return (
    <section aria-labelledby="rooms-heading" data-enter className={className}>
      <Card className="sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2 id="rooms-heading" className="text-lg font-semibold tracking-[-0.01em]">
            Romstatus
          </h2>
          <p className="text-sm text-muted">Slik roboten sist så rommene. Trykk på et rom for natten.</p>
        </div>

        <ul aria-label="Rom per status" className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
          {STATUS_ORDER.map((status) => {
            const look = STATUS_LOOK[status];
            return (
              <li key={status} className="flex items-center gap-2 text-sm">
                <span aria-hidden="true" className={cx("h-1.5 w-5 rounded-full", look.tag)} />
                <span className="text-muted">{look.word}</span>
                {counts ? <span className="font-semibold tabular-nums">{counts[status]}</span> : <Skeleton className="h-4 w-4" />}
              </li>
            );
          })}
          <li className="flex items-center gap-2 text-sm">
            <span aria-hidden="true" className="size-2 rounded-full bg-danger" />
            <span className="text-muted">Avvik</span>
            {counts ? <span className="font-semibold tabular-nums">{counts.avvik}</span> : <Skeleton className="h-4 w-4" />}
          </li>
        </ul>

        <div className="mt-6 flex flex-col divide-y divide-line">
          {FLOORS_DOWN.map((floor) => {
            const onFloor = rooms
              ? rooms.filter((room) => room.floor === floor)
              : HOTEL_ROOMS.filter((room) => room.floor === floor);
            return (
              <section
                key={floor}
                aria-labelledby={`floor-${floor}`}
                className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[4rem_minmax(0,1fr)]"
              >
                <h3 id={`floor-${floor}`} className="flex flex-col pt-1 leading-none">
                  <span className="font-display text-2xl font-medium tabular-nums">{floor}</span>
                  <span className="mt-1 text-xs text-muted">etasje</span>
                </h3>
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(68px,1fr))] gap-1.5">
                  {onFloor.map((room) => (
                    <li key={room.id}>
                      {rooms ? <RoomTile room={room as RoomView} onOpen={onOpen} /> : <Skeleton className="h-[72px] w-full rounded-sm" />}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </Card>
    </section>
  );
}

function RoomTile({ room, onOpen }: { room: RoomView; onOpen: (room: string) => void }) {
  const look = STATUS_LOOK[room.status];
  const avvik = room.openOrders > 0;
  const label = `Rom ${room.number}: ${look.word}${avvik ? `, ${room.openOrders} åpne avvik` : ""}`;

  return (
    <button
      type="button"
      data-tile
      onClick={() => onOpen(room.id)}
      aria-label={label}
      aria-haspopup="dialog"
      className="group block h-full w-full rounded-sm text-left transition-transform duration-[120ms] ease-standard active:scale-[0.97]"
    >
      <span
        className={cx(
          "flex h-full min-h-[72px] flex-col justify-between rounded-sm p-2",
          "transition-[filter] duration-[120ms] ease-standard group-hover:brightness-110",
          look.tile,
        )}
      >
        <span className="flex items-center justify-between gap-1">
          <span aria-hidden="true" className={cx("h-1.5 w-5 rounded-full", look.tag)} />
          {avvik && <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-danger" />}
        </span>
        <span>
          <span className="block font-display text-[22px] leading-none font-semibold tabular-nums">{room.number}</span>
          <span className={cx("mt-1 block truncate text-xs leading-4 font-medium", avvik ? "text-danger" : look.word_class)}>
            {avvik ? "Avvik" : look.word}
          </span>
        </span>
      </span>
    </button>
  );
}
