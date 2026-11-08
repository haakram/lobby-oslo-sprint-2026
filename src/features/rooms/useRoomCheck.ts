"use client";

import { useMemo } from "react";
import type { RoomView } from "@/features/dashboard/selectors";
import type { RunLine } from "@/features/nightshift/runlog";
import { osloToday } from "@/features/reception/dates";
import { roomMoney } from "./money";
import { pmsLastNight, revenueLastNight } from "./pms";
import { reconcileNight, ROOM_CHECK_MARKS, type RoomCheckMark } from "./reconcile";

const NO_MARKS: Readonly<Record<string, RoomCheckMark>> = {};

/**
 * The room check as every screen reads it (Oversikt, Rom, Overlevering, the bell): the robot's checks
 * and deliveries against the booking system, today's marks in this browser, and the money. A release
 * on one screen recomputes all of them (the marks are one shared store).
 */
export function useRoomCheck(lines: readonly RunLine[] | null, rooms: readonly RoomView[] | null, today: string = osloToday()) {
  const marks = ROOM_CHECK_MARKS.use()[today] ?? NO_MARKS;
  const pms = useMemo(() => pmsLastNight(today), [today]);
  const revenue = useMemo(() => revenueLastNight(rooms?.length || 36, pms), [rooms?.length, pms]);
  const reconciliation = useMemo(() => (lines ? reconcileNight(lines, pms) : null), [lines, pms]);
  const money = useMemo(() => (reconciliation ? roomMoney({ reconciliation, marks, revenue, rooms, pms }) : null), [reconciliation, marks, revenue, rooms, pms]);
  return { reconciliation, money, marks, revenue, pms };
}
