import { Badge, type BadgeTone, Button } from "@/ui";
import { minutesText } from "./cleaningPlan";
import { placeLabel, type HotelGraph } from "./hotelMap";
import { STATUS_LABEL, type RoomReport, type RoomStatus } from "./nightRooms";
import type { TourLeg } from "./types";

// TODO(phase-2): read from src/ui/roomStatus.ts once the design lead lands it (UX audit X2).
export const STATUS_BADGE: Record<RoomStatus, BadgeTone> = {
  klar: "success",
  opptatt: "neutral",
  ma_vaskes: "accent",
  ikke_forstyrr: "warning",
};

function via(map: HotelGraph, leg: TourLeg): string {
  const kinds = new Set(leg.path.map((id) => map.nodes[id]?.kind));
  if (kinds.has("elevator")) return " · heis";
  if (kinds.has("stairwell")) return " · trapp";
  return "";
}

/** The rooms in walking order, each with the distance and time from the stop before. */
export function CleaningStops({
  map,
  start,
  order,
  legs,
  statuses,
  onRemove,
}: {
  map: HotelGraph;
  start: string;
  order: string[];
  legs: TourLeg[];
  statuses: ReadonlyMap<string, RoomReport>;
  onRemove: (room: string) => void;
}) {
  const back = legs.at(-1);
  return (
    <div>
      <ol aria-label="Rekkefølge" className="gap-x-8 sm:columns-2 min-[87.5rem]:columns-3">
        {order.map((id, i) => {
          const leg = legs[i];
          const report = statuses.get(id);
          return (
            <li key={id} className="flex break-inside-avoid items-start gap-3 border-b border-line py-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent font-mono text-sm font-medium text-on-accent tabular-nums">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <h3 className="text-base font-semibold">{placeLabel(id)}</h3>
                  {report && <Badge tone={STATUS_BADGE[report.status]}>{STATUS_LABEL[report.status]}</Badge>}
                </div>
                <p className="text-sm text-muted">
                  {map.nodes[id].floor}. etasje ·{" "}
                  <span className="font-mono whitespace-nowrap tabular-nums">{Math.round(leg.metres)} m</span>
                  {" · "}
                  <span className="whitespace-nowrap">{minutesText(leg.seconds)}</span>
                  {i === 0 ? " fra start" : ""}
                  {via(map, leg)}
                </p>
                {report?.status === "ikke_forstyrr" && (
                  <p className="mt-1 text-sm text-warning">Skilt på døra i natt. Bank på før du går inn.</p>
                )}
              </div>
              <Button
                variant="ghost"
                className="-my-1 shrink-0 px-3 text-sm"
                aria-label={`Fjern ${placeLabel(id).toLowerCase()}`}
                onClick={() => onRemove(id)}
              >
                Fjern
              </Button>
            </li>
          );
        })}
      </ol>
      {back && (
        <p className="mt-3 text-sm text-muted">
          Tilbake til {placeLabel(start).toLowerCase()}:{" "}
          <span className="font-mono whitespace-nowrap text-text tabular-nums">{Math.round(back.metres)} m</span>
          {via(map, back)}
        </p>
      )}
    </div>
  );
}
