import { Badge, Button } from "@/ui";
import { STATUS_BADGE } from "./CleaningStops";
import { placeLabel } from "./hotelMap";
import { STATUS_LABEL, type RoomReport } from "./nightRooms";

/**
 * Rooms that were picked but that tonight's map doesn't have (the night can be run on another
 * hotel than the map). They are never dropped silently: each gets a row that says to visit it by
 * hand, and a way to take it off the list.
 */
export function OffMapRooms({
  rooms,
  statuses,
  onRemove,
}: {
  rooms: string[];
  statuses: ReadonlyMap<string, RoomReport>;
  onRemove: (room: string) => void;
}) {
  return (
    <section
      aria-label="Rom som ikke er med i ruten"
      className="rounded-lg border border-l-4 border-line border-l-warning bg-surface p-4 sm:p-5"
    >
      <h2 className="text-base font-semibold">
        {rooms.length === 1 ? "1 rom er ikke med i ruten" : `${rooms.length} rom er ikke med i ruten`}
      </h2>
      <ul className="mt-1">
        {rooms.map((room) => {
          const report = statuses.get(room);
          return (
            <li key={room} className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-b-0">
              <p className="min-w-0 text-base">
                {report && (
                  <Badge tone={STATUS_BADGE[report.status]} className="mr-2 align-middle">
                    {STATUS_LABEL[report.status]}
                  </Badge>
                )}
                <span className="text-warning">{placeLabel(room)} finnes ikke på kartet for i natt — besøk det manuelt</span>
              </p>
              <Button
                variant="ghost"
                className="shrink-0 px-3 text-sm"
                aria-label={`Fjern ${placeLabel(room).toLowerCase()}`}
                onClick={() => onRemove(room)}
              >
                Fjern
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
