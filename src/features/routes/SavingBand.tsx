import { Card, Stat } from "@/ui";
import type { CleaningPlan } from "./cleaningPlan";

const metres = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 });

/**
 * What the best round saves, in metres only (data review, round 3): against the same rooms in
 * room-number order, the baseline the optimiser plays by too (any order, no time windows), and,
 * shown beside it, against the order the rooms were given in. Time never leads: it would pick
 * whichever figure is larger.
 */
export function cleaningSavings(plan: CleaningPlan) {
  const rides = Math.max(0, plan.givenRides - plan.elevatorRides);
  // With one or two rooms every order is the same round: nothing to compare.
  const comparable = plan.tour.order.length > 2;
  const lead: "numbers" | "none" = comparable && plan.savedOnNumbers.metres > 0 ? "numbers" : "none";
  return { lead, comparable, rides, onNumbers: plan.savedOnNumbers, onGiven: plan.saved };
}

/** "26 m kortere (9 %)" or "like kort". */
function saving({ metres: m, percent }: { metres: number; percent: number }) {
  return m > 0 ? (
    <>
      <span className="font-mono text-success tabular-nums">{metres.format(m)}</span> m kortere ({percent} %)
    </>
  ) : (
    "like kort"
  );
}

/**
 * The headline: metres saved against room-number order, or the round itself when that order is as
 * short; then both baselines on their own line, named, with the lift rides, and (`givenNote`) what
 * the round ignores about the given order.
 */
export function SavingBand({
  plan,
  given = "Mot rekkefølgen rommene ble valgt i",
  givenNote,
}: {
  plan: CleaningPlan;
  given?: string;
  /** One line under the comparison: a constraint the given order has and the best round does not. */
  givenNote?: string;
}) {
  const minutes = Math.max(1, Math.round(plan.tour.seconds / 60));
  const win = cleaningSavings(plan);
  const fig = (value: string | number, unit: string) => (
    <span className="whitespace-nowrap text-success">
      <span className="font-mono font-medium tabular-nums">{value}</span> {unit}
    </span>
  );
  return (
    <section aria-label="Rutetall">
      <Card className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4 p-4 sm:p-5">
        <div className="min-w-0">
          {win.lead === "numbers" ? (
            <>
              <p className="text-2xl font-bold tracking-[-0.03em] sm:text-3xl">
                {fig(metres.format(win.onNumbers.metres), "m")} spart · {fig(win.onNumbers.percent, "%")} kortere
              </p>
              <p className="mt-1 text-base">enn de samme rommene i romnummer-rekkefølge</p>
            </>
          ) : (
            // Room-number order is as short (or one or two rooms): the round itself is the headline.
            <p className="text-2xl font-bold tracking-[-0.03em] sm:text-3xl">
              <span className="whitespace-nowrap">
                <span className="font-mono font-medium tabular-nums">{metres.format(Math.round(plan.tour.metres))}</span> m
              </span>{" "}
              ·{" "}
              <span className="whitespace-nowrap">
                ca. <span className="font-mono font-medium tabular-nums">{minutes}</span> min
              </span>{" "}
              for {plan.tour.order.length} rom
            </p>
          )}
          {win.comparable ? (
            <>
              {/* One row per baseline; on a tablet and up the names line up in one column. */}
              <dl aria-label="Sammenlignet med" className="mt-3 grid max-w-[80ch] grid-cols-1 gap-y-1 text-sm text-muted sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-3">
                <div className="contents">
                  <dt>Mot romnummer-rekkefølge:</dt>
                  <dd className="text-text">
                    <span className="font-mono tabular-nums">{metres.format(Math.round(plan.numberMetres))}</span> m, beste rute er {saving(win.onNumbers)}
                  </dd>
                </div>
                <div className="contents">
                  <dt className="max-sm:mt-1">{given}:</dt>
                  <dd className="text-text">
                    <span className="font-mono tabular-nums">{metres.format(Math.round(plan.givenMetres))}</span> m, beste rute er {saving(win.onGiven)}
                    {win.rides > 0 && (
                      <>
                        {" "}
                        og har <span className="font-mono tabular-nums">{win.rides}</span> {win.rides === 1 ? "heistur" : "heisturer"} færre
                      </>
                    )}
                  </dd>
                </div>
              </dl>
              {givenNote && <p className="mt-1 max-w-[80ch] text-sm text-muted">{givenNote}</p>}
            </>
          ) : (
            <p className="mt-2 max-w-[60ch] text-sm text-muted">Korteste runde på tvers av etasjene.</p>
          )}
        </div>
        {/* With the round as the headline, metres, minutes and rooms are already said: only the lift rides are new. */}
        <div className="grid w-full grid-cols-2 gap-4 border-t border-line pt-4 sm:grid-cols-4 lg:w-auto lg:gap-x-6 lg:border-t-0 lg:pt-0">
          {win.lead !== "none" && (
            <>
              <Stat label="Beste rute" value={metres.format(Math.round(plan.tour.metres))} unit="m" />
              <Stat label="Gangtid, ca." value={minutes} unit="min" />
            </>
          )}
          <Stat label="Heisturer" value={plan.elevatorRides} />
          {win.lead !== "none" && <Stat label="Rom" value={plan.tour.order.length} />}
        </div>
      </Card>
    </section>
  );
}
