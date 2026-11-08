"use client";

import { useMemo } from "react";
import type { RoomView } from "@/features/dashboard/selectors";
import { doorLockLines } from "@/features/doorlock/feed";
import type { PhoneTask } from "@/features/requests/phoneTasks";
import type { RequestView } from "@/features/requests/select";
import { pmsLastNight } from "@/features/rooms/pms";
import { ROOM_CHECK_MARKS, type RoomCheckMark } from "@/features/rooms/reconcile";
import { useStaffLines } from "@/features/staffinput/useStaffLines";
import { composeWithoutRobot, type WithoutRobot } from "./compose";

const NO_MARKS: Readonly<Record<string, RoomCheckMark>> = {};

/**
 * Overlevering without a robot for the handover day `today`: the night clerk's lines on this device (and
 * the sample night), the door lock's feed, the booking system and today's room marks (the same marks as
 * the robot night, so a room released in one view is released in the other). Null until the rooms and
 * the requests are in.
 */
export function useWithoutRobot({
  today,
  rooms,
  requests,
  phone,
  canOpen,
}: {
  today: string;
  rooms: readonly RoomView[] | null;
  requests: readonly RequestView[] | null;
  phone: readonly PhoneTask[];
  canOpen?: (route: string) => boolean;
}): WithoutRobot | null {
  const staff = useStaffLines(today);
  const doorLock = useMemo(() => doorLockLines(), []);
  const marks = ROOM_CHECK_MARKS.use()[today] ?? NO_MARKS;
  const pms = useMemo(() => pmsLastNight(today), [today]);
  return useMemo(
    () => (rooms && requests ? composeWithoutRobot({ staff, doorLock, rooms, marks, requests, phone, today, pms, canOpen }) : null),
    [staff, doorLock, rooms, marks, requests, phone, today, pms, canOpen],
  );
}
