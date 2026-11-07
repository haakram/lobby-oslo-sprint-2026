import { Skeleton, Stat } from "@/ui";
import { formatNumber } from "./format";
import type { Kpis } from "./selectors";

const LABELS = ["Rom klare", "Åpne arbeidsordre", "Oppgaver fullført", "Oppgaver feilet", "Robotens poeng"] as const;

/** The night's line of figures, read first at 06:00: five numbers along one rule, like the audit. */
export function KpiStrip({ kpis }: { kpis: Kpis | null }) {
  return (
    <section aria-label="Natten i tall" data-enter>
      <div className="grid grid-cols-2 gap-x-6 gap-y-6 border-y border-line py-5 sm:grid-cols-3 lg:grid-cols-5 lg:gap-x-10">
        {kpis ? (
          <>
            <Stat label={LABELS[0]} value={kpis.roomsReady} unit={`av ${kpis.roomsTotal}`} tone="success" />
            <Stat label={LABELS[1]} value={kpis.ordersOpen} tone={kpis.ordersOpen > 0 ? "danger" : "default"} />
            <Stat label={LABELS[2]} value={kpis.tasksDone} />
            <Stat label={LABELS[3]} value={kpis.tasksFailed} />
            <Stat label={LABELS[4]} value={formatNumber(kpis.score)} />
          </>
        ) : (
          LABELS.map((label) => (
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
