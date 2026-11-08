"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { Alert } from "./alerts";

/**
 * Which alerts a person has seen, per user, in this browser: `{ [alert id]: level seen }`.
 * TODO(phase-3): no backend yet; it lives in localStorage. Storage can be blocked (a private window,
 * a strict browser): then it holds for this tab only, and nothing throws.
 */

export const SEEN_PREFIX = "lobby:varsler-sett:";

export type Seen = Readonly<Record<string, number>>;

const listeners = new Set<() => void>();
/** What this tab wrote when storage refused it. Empty while storage works. */
const memory = new Map<string, string>();

function read(key: string): string {
  const own = memory.get(key);
  if (own !== undefined) return own;
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
    memory.delete(key);
  } catch {
    // Storage blocked: `memory` keeps it for this tab.
    memory.set(key, value);
  }
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // Another tab marked something: read storage again, not this tab's copy.
  const onStorage = (event: StorageEvent) => {
    if (event.key?.startsWith(SEEN_PREFIX)) {
      memory.delete(event.key);
      onChange();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function parse(raw: string): Seen {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1])));
  } catch {
    return {};
  }
}

/** New: never seen, or there is more of it now than when it was seen. */
export function isNew(alert: Pick<Alert, "id" | "level">, seen: Seen): boolean {
  const level = seen[alert.id];
  return level === undefined || alert.level > level;
}

/** The seen alerts of `user` (the login name), and a way to mark some as seen. */
export function useSeen(user: string | null) {
  const key = `${SEEN_PREFIX}${user ?? "ukjent"}`;
  // On the server and while hydrating, nothing is seen; the browser's answer follows right after.
  const raw = useSyncExternalStore(subscribe, () => read(key), () => "");
  const seen = useMemo(() => parse(raw), [raw]);
  const mark = useCallback(
    (alerts: readonly Pick<Alert, "id" | "level">[]) => {
      const next: Record<string, number> = { ...parse(read(key)) };
      for (const alert of alerts) next[alert.id] = Math.max(next[alert.id] ?? 0, alert.level);
      write(key, JSON.stringify(next));
    },
    [key],
  );
  return { seen, mark };
}
