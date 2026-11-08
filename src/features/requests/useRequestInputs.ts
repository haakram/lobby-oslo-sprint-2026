"use client";

import { useMemo } from "react";
import type { CallSummary } from "@/features/dashboard/useReceptionCalls";
import { type DemoCall, demoCalls } from "@/features/reception/demoCalls";
import { useStoredRecords } from "@/features/reception/useStoredRecords";
import { ROOM_CHECK_MARKS } from "@/features/rooms/reconcile";
import { PHONE_ASSIGNMENTS, phoneTasks } from "./phoneTasks";
import { fromRoomCheck } from "./select";

/**
 * What selectRequests needs besides the night and the calls: the phone tasks the AI receptionist took
 * down (this browser's records and last night's seeded calls, TODO(phase-3)), who took each one, and
 * the tasks made on Rom. Forespørsler and Oversikt (its widget, the bell) both read it, so the page
 * and its widget count the same requests (jury round 2, item A1).
 */
export function useRequestInputs({ today, demo, calls }: { today: string; demo?: readonly DemoCall[]; calls: readonly CallSummary[] | null }) {
  const { records } = useStoredRecords();
  const seeded = useMemo(() => demo ?? demoCalls(today), [demo, today]);
  const phone = useMemo(() => phoneTasks(records, seeded, calls ?? []), [records, seeded, calls]);
  const assignments = PHONE_ASSIGNMENTS.use();
  const roomChecks = ROOM_CHECK_MARKS.use()[today];
  const extra = useMemo(
    () => Object.entries(roomChecks ?? {}).flatMap(([room, mark]) => (mark.action === "task" ? [fromRoomCheck(today, room, mark)] : [])),
    [roomChecks, today],
  );
  return { phone, assignments, extra };
}
