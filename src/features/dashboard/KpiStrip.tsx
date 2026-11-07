import { waiting } from "@/features/requests/select";
import { Skeleton, Stat } from "@/ui";
import type { DashboardData } from "./now";

/** Below this share of rooms ready at handover, the figure is a warning. */
const READY_WARNING = 0.25;
const ROOMS_IN_HOTEL = 36;

/**
 * The hotel's line of figures, read first: eight numbers along one rule, each toned by whether it is
 * good or bad (UX audit, Oversikt 5). Occupancy, arrivals and departures are test data until the
 * PMS is connected; rooms, work orders and requests come from the night.
 */
export function KpiStrip({ data }: { data: DashboardData }) {
  const rooms = data.rooms;
  const total = rooms?.length ?? ROOMS_IN_HOTEL;
  const ready = rooms?.filter((room) => room.status === "klar").length;
  const dirty = rooms?.filter((room) => room.status === "ma_vaskes").length;
  const open = data.maintenance.filter((order) => order.status !== "lost");
  const high = open.filter((order) => order.priority === "hoy").length;
  const waits = waiting(data.requests).length;

  return (
    <section aria-label="Hotellet i tall" data-enter>
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 border-y border-line py-5 sm:grid-cols-4 lg:gap-x-8 xl:grid-cols-8">
        <Stat label="Belegg i natt" value={data.guests.roomsTonight} unit={`av ${total}`} />
        <Stat label="Ankomster i dag" value={data.guests.arrivals.length} />
        <Stat label="Avreiser i dag" value={data.guests.departures.length} />
        <Figure label="Klare til salg" value={ready} unit={rooms ? `av ${total}` : undefined} tone={ready !== undefined && ready / Math.max(1, total) < READY_WARNING ? "warning" : "success"} />
        <Figure label="Må vaskes" value={dirty} tone={dirty ? "warning" : "default"} />
        <Stat label="Åpne arbeidsordre" value={open.length} unit={high > 0 ? `${high} høy` : undefined} tone={high > 0 ? "danger" : "default"} />
        <Stat label="Forespørsler venter" value={waits} tone={waits > 0 ? "warning" : "default"} />
        <Stat label="På vakt nå" value={data.onShift.length} />
      </div>
    </section>
  );
}

function Figure({ label, value, unit, tone }: { label: string; value: number | undefined; unit?: string; tone?: "default" | "success" | "warning" | "danger" }) {
  return value === undefined ? (
    <div className="flex flex-col gap-1">
      <Skeleton className="h-8 w-16" />
      <span className="text-sm text-muted">{label}</span>
    </div>
  ) : (
    <Stat label={label} value={value} unit={unit} tone={tone} />
  );
}
