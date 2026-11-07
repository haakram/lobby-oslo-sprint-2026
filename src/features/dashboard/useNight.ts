"use client";

import { useMemo } from "react";
import { type HotelMap, useHotelMap } from "@/features/hotel";
import { foldNight, type Night, type OrderView, type RobotView, type RoomView, selectRobot, selectRooms, selectWorkOrders } from "./selectors";
import { type DashboardRun, useDashboardRun } from "./useDashboardRun";

export type NightState = {
  run: DashboardRun;
  /** The night folded to its end (the 06:00 handover, or now while a shift is live). Null until loaded. */
  night: Night | null;
  /** Tonight's hotel, built from the run log. */
  map: HotelMap;
  rooms: RoomView[] | null;
  /** Newest first. */
  orders: OrderView[] | null;
  robot: RobotView | null;
};

/**
 * The one night every module reads: rooms, work orders and the robot from the run log, shaped once.
 * `resolved` are the work orders staff have marked Løst (see useOrderStatuses), which clears a
 * room's Avvik mark.
 */
export function useNight(viewerUrl?: string, resolved?: ReadonlySet<string>): NightState {
  const run = useDashboardRun(viewerUrl);
  const ready = run.status === "ready";
  const night = useMemo(() => (ready ? foldNight(run.lines) : null), [ready, run.lines]);
  const map = useHotelMap(ready ? run.lines : null);
  const rooms = useMemo(() => (night ? selectRooms(night, resolved, map) : null), [night, resolved, map]);
  const orders = useMemo(() => (night ? selectWorkOrders(night) : null), [night]);
  const robot = useMemo(() => (night ? selectRobot(night, map) : null), [night, map]);
  return { run, night, map, rooms, orders, robot };
}
