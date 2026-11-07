"use client";

import { useSyncExternalStore } from "react";
import { osloHour } from "@/features/staff/testData";

const MINUTE = 60_000;

function subscribe(onChange: () => void) {
  const timer = setInterval(onChange, MINUTE);
  return () => clearInterval(timer);
}

/** The Oslo hour now; on the server (and before hydration) the day shift's first hour, so markup matches. */
export function useOsloHour(): number {
  return useSyncExternalStore(subscribe, () => osloHour(), () => 7);
}
