"use client";

import { useMemo } from "react";
import type { RunLine } from "@/features/nightshift/runlog";
import { BASE_HOTEL, type HotelMap, hotelForRun } from "./mapFromRun";

/**
 * The hotel map for the night in `lines` (the dashboard's `useNightLog().lines`, Ruter's log, or the
 * replay's lines). Without lines it is the seed-1 base. Rebuilt only when the lines array changes.
 */
export function useHotelMap(lines: readonly RunLine[] | null | undefined): HotelMap {
  return useMemo(() => (lines && lines.length ? hotelForRun(lines) : BASE_HOTEL), [lines]);
}
