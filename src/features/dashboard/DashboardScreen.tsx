"use client";

import { useRef } from "react";
import { canAccess } from "@/features/auth/roles";
import { MODULES, PILOT_MODULES } from "@/features/modules/registry";
import { Button, Card, cx, ErrorState } from "@/ui";
import { nightLabel } from "./format";
import { Greeting } from "./Greeting";
import { KpiStrip } from "./KpiStrip";
import { TopBar } from "./TopBar";
import { useEntrance } from "./useEntrance";
import { useHotelData } from "./useHotelData";
import { WIDE, WIDGETS } from "./widgets";

/**
 * Oversikt: the whole hotel at a glance, good news first (team lead 2026-11-08). The top bar, a
 * greeting with how the night went and the one primary action, the hotel's figures, then one widget
 * per module the role may open, in registry order. What needs a person is in the bell in the
 * navigation, not on this page.
 */
export function DashboardScreen({ viewerUrl }: { viewerUrl?: string }) {
  const { data, run, night, robot } = useHotelData(viewerUrl);
  // The pilot accounts (admin) see the pilot's widgets only, the same cut as the rail (round 5, the product juror, the creative juror):
  // no Lager, Ansatte, Vedlikehold, Gjester, Resepsjon or 3D widget for a manager whose pilot is four screens.
  const widgets = MODULES.filter((module) => module.widget && canAccess(data.role, module.route) && (data.role !== "admin" || PILOT_MODULES.includes(module.id)));

  const ready = run.status !== "loading";
  const scope = useRef<HTMLDivElement>(null);
  useEntrance(scope, ready);

  return (
    <main className="flex-1">
      <TopBar night={night ? nightLabel(night.startedAt) : null} robot={robot} run={run} loading={run.status === "loading"} />
      {/* The skeletons are silent; this says it in words, and says when the night is in. */}
      <p role="status" className="sr-only">
        {run.status === "loading" ? "Henter natten …" : run.status === "ready" ? "Natten er lastet." : ""}
      </p>

      <div ref={scope} className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-6 sm:px-6 lg:gap-8 lg:px-10 lg:py-8">
        <Greeting data={data} />

        {run.status === "error" && (
          <Card className="sm:p-6">
            <ErrorState
              title="Fikk ikke lastet natten"
              body="Natteloggen svarte ikke, så rom, robot og robotens arbeidsordre vises ikke. Resten av hotellet står under. Sjekk nettet og prøv igjen."
              action={
                <Button variant="secondary" onClick={run.retry}>
                  Prøv igjen
                </Button>
              }
            />
          </Card>
        )}

        <KpiStrip data={data} />

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:gap-8 xl:grid-cols-3">
          {widgets.map((module) => {
            const Widget = WIDGETS[module.id];
            if (!Widget) return null;
            return <Widget key={module.id} data={data} className={cx(WIDE.has(module.id) && "md:col-span-2")} />;
          })}
        </div>
      </div>
    </main>
  );
}
