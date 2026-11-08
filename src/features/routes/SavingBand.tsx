import { Card, Stat } from "@/ui";
import type { CleaningPlan } from "./cleaningPlan";

const metres = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 });

/** What the best round saves against the given order: metres, and time with the lift waits. */
export function cleaningSavings(plan: CleaningPlan) {
  const seconds = Math.max(0, Math.round(plan.givenSeconds - plan.tour.seconds));
  const timePercent = plan.givenSeconds > 0 ? Math.round((seconds / plan.givenSeconds) * 100) : 0;
  const rides = Math.max(0, plan.givenRides - plan.elevatorRides);
  // A cleaner with a cart pays in lift waits more than in metres: lead with time when it saves more.
  const lead: "time" | "metres" | "none" =
    seconds >= 60 && timePercent > plan.saved.percent ? "time" : plan.saved.metres > 0 ? "metres" : "none";
  return { seconds, minutes: Math.round(seconds / 60), timePercent, rides, lead };
}

/**
 * The headline: what the best round saves against the order the rooms were given in (`given` names
 * that order), in time or metres, whichever is larger; and, so the claim is fair, against the same
 * rooms in room-number order.
 */
export function SavingBand({ plan, given = "Mot rekkefølgen rommene ble valgt i" }: { plan: CleaningPlan; given?: string }) {
  const { saved, savedOnNumbers } = plan;
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
          {win.lead === "time" ? (
            <p className="text-2xl font-bold tracking-[-0.03em] sm:text-3xl">
              ca. {fig(win.minutes, "min")} spart · {fig(win.timePercent, "%")} kortere
            </p>
          ) : win.lead === "metres" ? (
            <p className="text-2xl font-bold tracking-[-0.03em] sm:text-3xl">
              {fig(metres.format(saved.metres), "m")} spart · {fig(saved.percent, "%")} kortere
            </p>
          ) : (
            // Nothing to save against the order given: the round itself is the headline (Holio pain 6).
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
          <p className="mt-2 max-w-[60ch] text-sm text-muted">
            {win.lead === "none" ? (
              "Korteste runde på tvers av etasjene. Rommene sto allerede i beste rekkefølge."
            ) : (
              <>
                {given}:{" "}
                <span className="font-mono whitespace-nowrap text-text tabular-nums">{metres.format(Math.round(plan.givenMetres))} m</span>
                {win.rides > 0 && (
                  <>
                    , <span className="font-mono text-text tabular-nums">{plan.givenRides}</span> heisturer
                  </>
                )}
                .
                {plan.tour.order.length > 2 && (
                  <>
                    {" "}
                    {savedOnNumbers.metres > 0 ? (
                      <>
                        Mot romnummer-rekkefølge:{" "}
                        <span className="font-mono whitespace-nowrap text-text tabular-nums">{metres.format(savedOnNumbers.metres)} m</span> kortere.
                      </>
                    ) : (
                      "I romnummer-rekkefølge er den like kort."
                    )}
                  </>
                )}
              </>
            )}
          </p>
        </div>
        {/* With no saving the headline already says metres, minutes and rooms: only the lift rides are new. */}
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
