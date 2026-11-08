"use client";

import { useMemo } from "react";
import type { Role } from "@/features/auth/roles";
import { useSession } from "@/features/auth/SessionProvider";
import { reviewScore, selectGuestDay } from "@/features/guests/testData";
import { lowStock, STOCK } from "@/features/inventory/testData";
import { outOfOrderRooms, selectMaintenance } from "@/features/maintenance/select";
import { useOsloHour } from "@/features/modules/useNow";
import { selectRequests } from "@/features/requests/select";
import { byRole, onShift, shiftAt } from "@/features/staff/testData";
import type { DashboardData } from "./data";
import { useNight } from "./useNight";
import { useOrderStatuses } from "./useOrderStatuses";
import { useReceptionCalls } from "./useReceptionCalls";

/**
 * The whole hotel for whoever is logged in, shaped once: the night (run log), the requests, work
 * orders, guests, stores and shifts. Oversikt and the bell in the navigation both read it, so the
 * bell never says something the page disagrees with.
 */
export function useHotelData(viewerUrl?: string) {
  const { effectiveRole, user } = useSession();
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
      userName: user?.name ?? null,
      hour,
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
      stock: STOCK,
      lowStock: lowStock(),
      reviews: reviewScore(),
      shift,
      onShift: onShift(shift),
    }),
    [role, user, hour, run.status, night, rooms, robot, requests, maintenance, guests, calls, retryCalls, shift],
  );

  return { data, run, night, robot };
}
