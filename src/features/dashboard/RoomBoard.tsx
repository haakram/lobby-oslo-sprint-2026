import { Card, cx, Skeleton } from "@/ui";
import { STATUS_LOOK, STATUS_ORDER } from "./labels";
import { countRooms, FLOORS, HOTEL_ROOMS, type RoomView } from "./selectors";

/** Top floor first, like the building seen from the street. */
const FLOORS_DOWN = [...FLOORS].reverse();

/**
 * Romstatus, the hero: every room as a tile on its floor, like the key board behind the desk.
 * The status word is always written; the colour only repeats it. An open work order adds "Avvik".
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
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="rooms-heading" className="text-2xl font-bold tracking-[-0.02em]">
            Romstatus
          </h2>
          <p className="text-sm text-muted">Slik roboten sist så rommene. Trykk på et rom for natten.</p>
        </div>

        <ul aria-label="Rom per status" className="mt-4 flex flex-wrap gap-2">
          {STATUS_ORDER.map((status) => {
            const look = STATUS_LOOK[status];
            return (
              <li key={status} className="flex items-center gap-2 rounded-sm bg-sunken px-2 py-1 text-sm">
                <span aria-hidden="true" data-surface={look.dark ? "dark" : undefined} className={cx("size-3 rounded-[3px] border", look.tile)} />
                <span>{look.word}</span>
                {counts ? (
                  <span className="font-mono font-medium tabular-nums">{counts[status]}</span>
                ) : (
                  <Skeleton className="h-4 w-4" />
                )}
              </li>
            );
          })}
          <li className="flex items-center gap-2 rounded-sm bg-sunken px-2 py-1 text-sm">
            <span aria-hidden="true" className="size-2.5 rounded-full bg-danger" />
            <span>Avvik</span>
            {counts ? (
              <span className="font-mono font-medium tabular-nums">{counts.avvik}</span>
            ) : (
              <Skeleton className="h-4 w-4" />
            )}
          </li>
        </ul>

        <div className="mt-6 flex flex-col gap-5">
          {FLOORS_DOWN.map((floor) => {
            const onFloor = rooms
              ? rooms.filter((room) => room.floor === floor)
              : HOTEL_ROOMS.filter((room) => room.floor === floor);
            return (
              <section key={floor} aria-labelledby={`floor-${floor}`}>
                <h3 id={`floor-${floor}`} className="text-sm font-semibold text-muted">
                  {floor}. etasje
                </h3>
                <ul className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-2">
                  {onFloor.map((room) => (
                    <li key={room.id}>
                      {rooms ? (
                        <RoomTile room={room as RoomView} onOpen={onOpen} />
                      ) : (
                        <Skeleton className="h-[76px] w-full" />
                      )}
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
    // The focus ring sits on the button (light surface); the tile inside may be dark.
    <button
      type="button"
      data-tile
      onClick={() => onOpen(room.id)}
      aria-label={label}
      aria-haspopup="dialog"
      className="group block h-full w-full rounded-md text-left transition-transform duration-150 ease-standard active:scale-[0.97]"
    >
      <span
        data-surface={look.dark ? "dark" : undefined}
        className={cx(
          "flex h-full min-h-[76px] flex-col justify-between gap-1 rounded-md border p-2",
          "transition-[filter] duration-150 ease-standard group-hover:brightness-95",
          look.tile,
        )}
      >
        <span className="flex items-center justify-between gap-1">
          <span className="font-mono text-base font-medium tabular-nums">{room.number}</span>
          {avvik && <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-danger" />}
        </span>
        <span className={cx("text-xs leading-4 font-semibold", look.word_class)}>{look.word}</span>
        {avvik && <span className="text-xs leading-4 font-semibold text-danger">Avvik</span>}
      </span>
    </button>
  );
}
