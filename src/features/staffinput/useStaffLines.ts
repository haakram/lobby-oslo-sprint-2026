"use client";

import { useEffect, useMemo } from "react";
import type { RunLine } from "@/features/nightshift/runlog";
import { CLERK_SAMPLE, CLERK_SAMPLE_IS_ON, pruneStaffLog, STAFF_LOG, storedStaffLines } from "./entries";

/**
 * The night clerk's run-log lines for one handover day (YYYY-MM-DD): the sample night while it is on,
 * then what was typed on this device, oldest first. Overlevering reads these beside (or instead of) the
 * robot's log; Nattevaktens logg lists them. On load, the days older than RETENTION_DAYS leave this
 * device (retention.ts).
 */
export function useStaffLines(day: string): RunLine[] {
  const log = STAFF_LOG.use();
  useEffect(() => pruneStaffLog(), []);
  return useMemo(() => [...(CLERK_SAMPLE_IS_ON ? CLERK_SAMPLE : []), ...storedStaffLines(log, day)], [log, day]);
}
