"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { nextOrderStatus, type OrderStatus } from "./selectors";

const STATUS_KEY = "lobby:work-orders";

export type Statuses = Readonly<Record<string, OrderStatus>>;

function readStatuses(): Record<string, OrderStatus> {
  try {
    const raw = typeof window === "undefined" ? null : localStorage.getItem(STATUS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter((entry): entry is [string, OrderStatus] => entry[1] === "tildelt" || entry[1] === "lost"),
    );
  } catch {
    return {};
  }
}

/**
 * Ny → Tildelt → Løst for work orders and requests, shared by Oversikt, Vedlikehold and Forespørsler.
 * TODO(phase-3): no backend yet; the statuses live in this browser (localStorage).
 */
export function useOrderStatuses() {
  const [statuses, setStatuses] = useState<Record<string, OrderStatus>>(readStatuses);
  useEffect(() => {
    try {
      localStorage.setItem(STATUS_KEY, JSON.stringify(statuses));
    } catch {
      // Storage blocked: the statuses still hold for this tab.
    }
  }, [statuses]);

  const resolved = useMemo(
    () => new Set(Object.entries(statuses).flatMap(([id, status]) => (status === "lost" ? [id] : []))),
    [statuses],
  );
  const advance = useCallback((id: string) => setStatuses((current) => ({ ...current, [id]: nextOrderStatus(current[id] ?? "ny") })), []);
  const undo = useCallback((id: string) => setStatuses((current) => ({ ...current, [id]: "tildelt" })), []);
  const statusOf = useCallback((id: string): OrderStatus => statuses[id] ?? "ny", [statuses]);

  return { statuses: statuses as Statuses, resolved, advance, undo, statusOf };
}
