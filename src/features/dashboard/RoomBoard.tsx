import { Card, cx, Skeleton } from "@/ui";
import { hhmm } from "./format";
import { STATUS_LOOK, STATUS_ORDER } from "./labels";
import { countRooms, FLOORS, floorsOfRooms, HOTEL_ROOMS, type RoomView } from "./selectors";


/**
 * Romstatus, the key rack: every room a pigeonhole on its floor, the floor number big in the
 * margin like a lift indicator. The status word is always written; the coloured tag only repeats
 * it. An open work order adds the red "Avvik" mark.
 */
/** A check older than this (sim hours) is marked with its time on the tile. */
const STALE_HOURS = 3;

export function RoomBoard({
  rooms,
  clock,
  onOpen,
  className,
}: {
  rooms: RoomView[] | null;
  /** The shift clock ("05:58:07"), to tell a stale check from a fresh one. */
  clock: string | null;
  onOpen: (room: string) => void;
  className?: string;
}) {
  const counts = rooms ? countRooms(rooms) : null;
  // Top floor first, like the key rack behind the desk. Tonight's floors once the night is in.
  const floorsDown = [...(rooms ? floorsOfRooms(rooms) : FLOORS)].reverse();

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
            <span aria-hidden="true" className="size-2 rounded-full bg-text" />
            <span className="text-muted">Avvik</span>
            {counts ? <span className="font-semibold tabular-nums">{counts.avvik}</span> : <Skeleton className="h-4 w-4" />}
          </li>
        </ul>

        <div className="mt-6 flex flex-col divide-y divide-line">
          {floorsDown.map((floor) => {
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
                  <span className="font-mono text-2xl font-medium tabular-nums">{floor}</span>
                  <span className="mt-1 text-xs text-muted">etasje</span>
                </h3>
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-1.5">
                  {onFloor.map((room) => (
                    <li key={room.id}>
                      {rooms ? <RoomTile room={room as RoomView} clock={clock} onOpen={onOpen} /> : <Skeleton className="h-[84px] w-full rounded-sm" />}
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

/** Hours between two shift clocks across midnight ("23:10:00" → "05:58:07" is 6.8). */
function hoursBetween(from: string, to: string): number {
  const [fh, fm] = from.split(":").map(Number);
  const [th, tm] = to.split(":").map(Number);
  const minutes = (th * 60 + tm - (fh * 60 + fm) + 24 * 60) % (24 * 60);
  return minutes / 60;
}

function RoomTile({ room, clock, onOpen }: { room: RoomView; clock: string | null; onOpen: (room: string) => void }) {
  const look = STATUS_LOOK[room.status];
  const avvik = room.openOrders > 0;
  const stale = room.statusAt && clock ? hoursBetween(room.statusAt, clock) >= STALE_HOURS : false;
  // Closed today (out of order): the tile says so, as the bell and "Ute av drift" do.
  const word = room.closed ? "Ute av drift" : room.held ? "Holdt tilbake" : room.toConfirm ? "Bekreft først" : look.word;
  const label = `Rom ${room.number}: ${word}${avvik ? `, ${room.openOrders} åpne avvik` : ""}${stale ? `, sjekket ${hhmm(room.statusAt)}` : ""}`;

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
          "relative flex h-full min-h-[84px] flex-col justify-between rounded-sm p-2",
          "transition-[filter] duration-[120ms] ease-standard group-hover:brightness-110",
          room.closed ? "bg-sunken" : look.tile,
          // An ink mark, not red: what an avvik needs is on Vedlikehold and in the bell.
          avvik && "shadow-[inset_3px_0_0_0_var(--text)]",
        )}
      >
        <span className="flex items-center justify-between gap-1">
          <span aria-hidden="true" className={cx("h-1.5 w-5 rounded-full", room.closed ? "bg-line-strong" : look.tag)} />
          {stale && !avvik && <span className="text-xs leading-4 text-muted tabular-nums">{hhmm(room.statusAt)}</span>}
          {avvik && (
            <span className="text-xs leading-4 font-semibold text-text">
              Avvik{room.openOrders > 1 ? ` ${room.openOrders}` : ""}
            </span>
          )}
        </span>
        <span>
          <span className="block font-mono text-lg leading-none font-medium tabular-nums">{room.number}</span>
          {/* The word is the tile's point: it wraps ("Ikke / sjekket") rather than cut to "Ikke sjek…". */}
          <span className={cx("mt-1 block text-sm leading-5", room.closed ? "font-medium text-muted" : look.loud ? "font-semibold" : "font-medium", !room.closed && look.word_class)}>{word}</span>
        </span>
      </span>
    </button>
  );
}
