"use client";

import { useMemo } from "react";
import type { Role } from "@/features/auth/roles";
import { useSession } from "@/features/auth/SessionProvider";
import { reviewScore, selectGuestDay } from "@/features/guests/testData";
import { nightSafety } from "@/features/handover/safety";
import { doneBasis, selfContradictions } from "@/features/nightshift/conduct";
import { declineSplit } from "@/features/nightshift/declines";
import { lowStock, STOCK } from "@/features/inventory/testData";
import { outOfOrderRooms, selectMaintenance } from "@/features/maintenance/select";
import { useOsloHour } from "@/features/modules/useNow";
import { osloToday } from "@/features/reception/dates";
import { hotelRoomsOf, selectRequests } from "@/features/requests/select";
import { useRequestInputs } from "@/features/requests/useRequestInputs";
import { useRoomCheck } from "@/features/rooms/useRoomCheck";
import { byRole, onShift, shiftAt } from "@/features/staff/testData";
import type { DashboardData } from "./data";
import { withClosed, withHeld } from "./selectors";
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
  const { run, night, rooms, orders, robot, map } = useNight(viewerUrl, resolved);
  const { state: calls, retry: retryCalls } = useReceptionCalls();
  const hour = useOsloHour();

  const technician = byRole("Vedlikehold").find((member) => member.shift === "dag") ?? null;
  const maintenance = useMemo(() => selectMaintenance({ orders, statusOf, assignee: technician?.name ?? null }), [orders, statusOf, technician]);
  // The same requests as Forespørsler (its phone tasks and Rom's tasks too), so the widget and the page agree.
  const liveCalls = calls.kind === "ready" ? calls.calls : null;
  const { phone, assignments, extra } = useRequestInputs({ today: osloToday(), calls: liveCalls });
  // Tonight's rooms: a live call naming a room the hotel doesn't have is "Ukjent rom" in the widget and the bell too.
  const hotelRooms = useMemo(() => hotelRoomsOf(map, Boolean(night?.ended)), [map, night]);
  const requests = useMemo(
    () => selectRequests({ night, calls: liveCalls, statusOf, phone, assignments, extra, hotelRooms }),
    [night, liveCalls, statusOf, phone, assignments, extra, hotelRooms],
  );
  const outOfOrder = useMemo(() => outOfOrderRooms(maintenance), [maintenance]);
  // The rack reads the same closed rooms as the bell: a room out of order says so on its tile.
  const rackRooms = useMemo(() => (rooms ? withClosed(rooms, outOfOrder) : null), [rooms, outOfOrder]);
  const guests = useMemo(() => selectGuestDay(), []);
  const lines = run.status === "ready" ? run.lines : null;
  const safety = useMemo(() => (lines ? nightSafety(lines) : null), [lines]);
  const declines = useMemo(() => (lines ? declineSplit(lines) : null), [lines]);
  const basis = useMemo(() => (lines ? doneBasis(lines) : null), [lines]);
  const contradictions = useMemo(() => (lines ? selfContradictions(lines) : null), [lines]);
  // The same room check as Rom and Overlevering: a release on either moves Oversikt's figure and the money line.
  const { money } = useRoomCheck(lines, rackRooms, osloToday());
  // The rack and the money line agree: a room held back is taken, and one still to confirm is not a green Klar.
  const heldRooms = useMemo(
    () =>
      rackRooms && money
        ? withHeld(
            rackRooms,
            money.held.map((row) => row.room),
            money.toSell.map((row) => row.room),
            money.released.map((row) => row.room),
          )
        : rackRooms,
    [rackRooms, money],
  );
  const shift = shiftAt(hour);

  const data: DashboardData = useMemo(
    () => ({
      role,
      userName: user?.name ?? null,
      hour,
      loading: run.status === "loading",
      nightStatus: run.status,
      night,
      rooms: heldRooms,
      safety,
      money,
      declines,
      basis,
      contradictions,
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
    [role, user, hour, run.status, night, heldRooms, safety, money, declines, basis, contradictions, robot, requests, maintenance, outOfOrder, guests, calls, retryCalls, shift],
  );

  return { data, run, night, robot };
}
