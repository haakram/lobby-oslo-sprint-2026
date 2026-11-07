import { Skeleton, Stat } from "@/ui";
import type { Kpis } from "./selectors";

/** Below this share of rooms ready at handover, the figure is a warning. */
const READY_WARNING = 0.25;

/**
 * The night's line of figures, read first at 06:00: four numbers along one rule, each toned by
 * whether it is good or bad (UX audit, Oversikt 5). No score: that is the robot's contest, not the
 * hotel's night.
 */
export function KpiStrip({ kpis }: { kpis: Kpis | null }) {
  const labels = ["Klare til salg", "Må vaskes", "Åpne avvik", "Oppgaver i natt"];
  return (
    <section aria-label="Natten i tall" data-enter>
      <div className="grid grid-cols-2 gap-x-6 gap-y-6 border-y border-line py-5 sm:grid-cols-4 lg:gap-x-10">
        {kpis ? (
          <>
            <Stat
              label={labels[0]}
              value={kpis.roomsReady}
              unit={`av ${kpis.roomsTotal}`}
              tone={kpis.roomsReady / Math.max(1, kpis.roomsTotal) < READY_WARNING ? "warning" : "success"}
            />
            <Stat label={labels[1]} value={kpis.roomsDirty} tone={kpis.roomsDirty > 0 ? "warning" : "default"} />
            <Stat
              label={labels[2]}
              value={kpis.ordersOpen}
              unit={kpis.guestsWaiting > 0 ? `${kpis.guestsWaiting} med gjest` : undefined}
              tone={kpis.ordersOpen > 0 ? "danger" : "default"}
            />
            <Stat
              label={labels[3]}
              value={kpis.tasksDone}
              unit={`fullført · ${kpis.tasksFailed} feilet${kpis.tasksOpen > 0 ? ` · ${kpis.tasksOpen} ikke ferdig` : ""}`}
              tone={kpis.tasksFailed > 0 ? "danger" : "success"}
            />
          </>
        ) : (
          labels.map((label) => (
            <div key={label} className="flex flex-col gap-1">
              <Skeleton className="h-8 w-20" />
              <span className="text-xs text-muted">{label}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
