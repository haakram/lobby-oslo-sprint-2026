import { Card, Stat } from "@/ui";
import type { CleaningPlan } from "./cleaningPlan";

const metres = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 });

/** The headline: what the best round saves against the order the rooms were given in. */
export function SavingBand({ plan }: { plan: CleaningPlan }) {
  const { saved } = plan;
  return (
    <section aria-label="Rutetall">
      <Card className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4 p-4 sm:p-5">
        <div className="min-w-0">
          {saved.metres > 0 ? (
            <p className="text-2xl font-bold tracking-[-0.03em] sm:text-3xl">
              <span className="whitespace-nowrap text-success">
                <span className="font-mono font-medium tabular-nums">{metres.format(saved.metres)}</span> m
              </span>{" "}
              spart ·{" "}
              <span className="whitespace-nowrap text-success">
                <span className="font-mono font-medium tabular-nums">{saved.percent}</span> %
              </span>{" "}
              kortere
            </p>
          ) : (
            <p className="text-xl font-bold tracking-tight">Rommene står allerede i beste rekkefølge</p>
          )}
          <p className="mt-2 text-sm text-muted">
            Mot rekkefølgen rommene ble valgt i:{" "}
            <span className="font-mono whitespace-nowrap text-text tabular-nums">{metres.format(Math.round(plan.givenMetres))} m</span>
          </p>
        </div>
        <div className="grid w-full grid-cols-2 gap-4 border-t border-line pt-4 sm:grid-cols-4 lg:w-auto lg:gap-x-8 lg:border-t-0 lg:pt-0">
          <Stat label="Beste rute" value={metres.format(Math.round(plan.tour.metres))} unit="m" />
          <Stat label="Gangtid, ca." value={Math.max(1, Math.round(plan.tour.seconds / 60))} unit="min" />
          <Stat label="Heisturer" value={plan.elevatorRides} />
          <Stat label="Rom" value={plan.tour.order.length} />
        </div>
      </Card>
    </section>
  );
}
