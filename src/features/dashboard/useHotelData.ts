"use client";

import { useMemo } from "react";
import type { Role } from "@/features/auth/roles";
import { useSession } from "@/features/auth/SessionProvider";
import { reviewScore, selectGuestDay } from "@/features/guests/testData";
import { lowStock, STOCK } from "@/features/inventory/testData";
import { outOfOrderRooms, selectMaintenance } from "@/features/maintenance/select";
import { useOsloHour } from "@/features/modules/useNow";
import { osloToday } from "@/features/reception/dates";
import { selectRequests } from "@/features/requests/select";
import { useRequestInputs } from "@/features/requests/useRequestInputs";
import { byRole, onShift, shiftAt } from "@/features/staff/testData";
import type { DashboardData } from "./data";
import { withClosed } from "./selectors";
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
  // The same requests as Forespørsler (its phone tasks and Rom's tasks too), so the widget and the page agree.
  const liveCalls = calls.kind === "ready" ? calls.calls : null;
  const { phone, assignments, extra } = useRequestInputs({ today: osloToday(), calls: liveCalls });
  const requests = useMemo(
    () => selectRequests({ night, calls: liveCalls, statusOf, phone, assignments, extra }),
    [night, liveCalls, statusOf, phone, assignments, extra],
  );
  const outOfOrder = useMemo(() => outOfOrderRooms(maintenance), [maintenance]);
  // The rack reads the same closed rooms as the bell: a room out of order says so on its tile.
  const rackRooms = useMemo(() => (rooms ? withClosed(rooms, outOfOrder) : null), [rooms, outOfOrder]);
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
      rooms: rackRooms,
      robot,
      requests,
      maintenance,
      outOfOrder,
      guests,
      calls,
      retryCalls,
      stock: STOCK,
      lowStock: lowStock(),
      reviews: reviewScore(),
      shift,
      onShift: onShift(shift),
    }),
    [role, user, hour, run.status, night, rackRooms, robot, requests, maintenance, outOfOrder, guests, calls, retryCalls, shift],
  );

  return { data, run, night, robot };
}
