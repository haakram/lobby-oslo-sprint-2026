import type { ReactElement } from "react";
import { canAccess } from "@/features/auth/roles";
import { waiting } from "@/features/requests/select";
import { cx, Skeleton, Stat } from "@/ui";
import type { DashboardData } from "./now";

/** Below this share of rooms ready at handover, the figure is a warning. */
const READY_WARNING = 0.25;
const ROOMS_IN_HOTEL = 36;

/** One rule however many figures the role sees (Tailwind needs the class names written out). */
const WIDE_COLUMNS: Record<number, string> = {
  2: "xl:grid-cols-2",
  3: "xl:grid-cols-3",
  4: "xl:grid-cols-4",
  5: "xl:grid-cols-5",
  6: "xl:grid-cols-6",
  7: "xl:grid-cols-7",
  8: "xl:grid-cols-8",
};

/**
 * The hotel's line of figures, read first: up to eight numbers along one rule, each toned by whether
 * it is good or bad (UX audit, Oversikt 5). A role sees only the figures of modules it may open, so
 * nobody gets an alarm they can't act on. Occupancy, arrivals and departures are test data until the
 * PMS is connected; rooms, work orders and requests come from the night.
 */
export function KpiStrip({ data }: { data: DashboardData }) {
  const may = (route: string) => canAccess(data.role, route);
  const rooms = data.rooms;
  const total = rooms?.length ?? ROOMS_IN_HOTEL;
  const ready = rooms?.filter((room) => room.status === "klar").length;
  const dirty = rooms?.filter((room) => room.status === "ma_vaskes").length;
  const open = data.maintenance.filter((order) => order.status !== "lost");
  const high = open.filter((order) => order.priority === "hoy").length;
  const waits = waiting(data.requests).length;
  // The robot's work orders and requests come with the night: no count until it is in.
  const loading = data.loading;

  const gjester = may("/gjester");
  const figures = [
    gjester && <Stat key="belegg" label="Belegg i natt" value={data.guests.roomsTonight} unit={`av ${total}`} />,
    gjester && <Stat key="ankomster" label="Ankomster i dag" value={data.guests.arrivals.length} />,
    gjester && <Stat key="avreiser" label="Avreiser i dag" value={data.guests.departures.length} />,
    <Figure
      key="klare"
      label="Klare til salg"
      value={ready}
      loading={loading}
      unit={rooms ? `av ${total}` : undefined}
      tone={ready !== undefined && ready / Math.max(1, total) < READY_WARNING ? "warning" : "success"}
    />,
    <Figure key="vaskes" label="Må vaskes" value={dirty} loading={loading} tone={dirty ? "warning" : "default"} />,
    may("/vedlikehold") && (
      <Figure
        key="arbeidsordre"
        label="Åpne arbeidsordre"
        value={loading ? undefined : open.length}
        loading={loading}
        unit={high > 0 ? `${high} høy` : undefined}
        tone={high > 0 ? "danger" : "default"}
      />
    ),
    may("/foresporsler") && <Figure key="venter" label="Forespørsler venter" value={loading ? undefined : waits} loading={loading} tone={waits > 0 ? "warning" : "default"} />,
    may("/ansatte") && <Stat key="vakt" label="På vakt nå" value={data.onShift.length} />,
  ].filter((figure): figure is ReactElement => Boolean(figure));

  return (
    <section aria-label="Hotellet i tall" data-enter>
      <div className={cx("grid grid-cols-2 gap-x-6 gap-y-5 border-y border-line py-5 sm:grid-cols-4 lg:gap-x-8", WIDE_COLUMNS[figures.length])}>
        {figures}
      </div>
    </section>
  );
}

/** A figure that comes from the night: a skeleton while it loads, a dash when the night isn't there. */
function Figure({
  label,
  value,
  unit,
  tone,
  loading,
}: {
  label: string;
  value: number | undefined;
  unit?: string;
  tone?: "default" | "success" | "warning" | "danger";
  loading: boolean;
}) {
  if (value !== undefined) return <Stat label={label} value={value} unit={unit} tone={tone} />;
  if (!loading) return <Stat label={label} value="–" />;
  return (
    <div className="flex flex-col gap-1">
      <Skeleton className="h-8 w-16" />
      <span className="text-sm text-muted">{label}</span>
    </div>
  );
}
