import { Card, Skeleton, Stat } from "@/ui";
import { formatNumber } from "./format";
import type { Kpis } from "./selectors";

const LABELS = ["Rom klare", "Åpne arbeidsordre", "Oppgaver fullført", "Oppgaver feilet", "Robotens poeng"] as const;

/** The numbers a manager reads first at 06:00. */
export function KpiStrip({ kpis }: { kpis: Kpis | null }) {
  return (
    <section aria-label="Natten i tall" data-enter>
      <Card className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
        {kpis ? (
          <>
            <Stat label={LABELS[0]} value={kpis.roomsReady} unit={`av ${kpis.roomsTotal}`} tone="success" />
            <Stat label={LABELS[1]} value={kpis.ordersOpen} />
            <Stat label={LABELS[2]} value={kpis.tasksDone} />
            <Stat label={LABELS[3]} value={kpis.tasksFailed} />
            <Stat label={LABELS[4]} value={formatNumber(kpis.score)} />
          </>
        ) : (
          LABELS.map((label) => (
            <div key={label} className="flex flex-col gap-1">
              <span className="text-sm text-muted">{label}</span>
              <Skeleton className="h-7 w-20" />
            </div>
          ))
        )}
      </Card>
    </section>
  );
}
