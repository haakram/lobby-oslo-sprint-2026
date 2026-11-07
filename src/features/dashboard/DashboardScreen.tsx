"use client";

import { useMemo, useRef } from "react";
import { canAccess, type Role } from "@/features/auth/roles";
import { useSession } from "@/features/auth/SessionProvider";
import { selectGuestDay } from "@/features/guests/testData";
import { lowStock } from "@/features/inventory/testData";
import { outOfOrderRooms, selectMaintenance } from "@/features/maintenance/select";
import { MODULES } from "@/features/modules/registry";
import { useOsloHour } from "@/features/modules/useNow";
import { selectRequests } from "@/features/requests/select";
import { byRole, onShift, shiftAt } from "@/features/staff/testData";
import { Button, Card, cx, ErrorState } from "@/ui";
import { nightLabel } from "./format";
import { KpiStrip } from "./KpiStrip";
import { type DashboardData, selectNow } from "./now";
import { NowBand } from "./NowBand";
import { TopBar } from "./TopBar";
import { useEntrance } from "./useEntrance";
import { useNight } from "./useNight";
import { useOrderStatuses } from "./useOrderStatuses";
import { useReceptionCalls } from "./useReceptionCalls";
import { WIDE, WIDGETS } from "./widgets";

/**
 * Oversikt: the whole hotel at a glance, for whoever is logged in. The top bar, what needs a person
 * now across every module (with the one primary action), the hotel's figures, then one widget per
 * module the role may open, in registry order. The robot is one widget among them.
 */
export function DashboardScreen({ viewerUrl }: { viewerUrl?: string }) {
  const { effectiveRole } = useSession();
  const role: Role = effectiveRole ?? "admin";
  const { resolved, statusOf } = useOrderStatuses();
  const { run, night, rooms, orders, robot } = useNight(viewerUrl, resolved);
  const { state: calls, retry: retryCalls } = useReceptionCalls();
  const hour = useOsloHour();

  const technician = byRole("Vedlikehold").find((member) => member.shift === "dag") ?? null;
  const maintenance = useMemo(() => selectMaintenance({ orders, statusOf, assignee: technician?.name ?? null }), [orders, statusOf, technician]);
  const requests = useMemo(() => selectRequests({ night, calls: calls.kind === "ready" ? calls.calls : null, statusOf }), [night, calls, statusOf]);
  const guests = useMemo(() => selectGuestDay(), []);
  const shift = shiftAt(hour);

  const data: DashboardData = useMemo(
    () => ({
      role,
      loading: run.status === "loading",
      nightStatus: run.status,
      night,
      rooms,
      robot,
      requests,
      maintenance,
      outOfOrder: outOfOrderRooms(maintenance),
      guests,
      calls,
      retryCalls,
      lowStock: lowStock(),
      shift,
      onShift: onShift(shift),
    }),
    [role, run.status, night, rooms, robot, requests, maintenance, guests, calls, retryCalls, shift],
  );
  const now = useMemo(() => selectNow(data), [data]);
  const widgets = MODULES.filter((module) => module.widget && canAccess(role, module.route));

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
        <NowBand items={now} loading={!ready} />

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
