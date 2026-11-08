"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Which night Overlevering is built from: the robot's run log ("robot", the default) or the sources a
 * hotel without a robot has ("none": the booking system, the door lock and the night clerk). Kept in
 * the address as `?kilde=uten-robot`, so a link or a reload opens the same page; the server and the
 * first paint use the default, the browser's address arrives right after hydration.
 */
export type NightSource = "robot" | "none";

export const SOURCE_PARAM = "kilde";
export const WITHOUT_ROBOT = "uten-robot";

export function sourceFromSearch(search: string): NightSource {
  return new URLSearchParams(search).get(SOURCE_PARAM) === WITHOUT_ROBOT ? "none" : "robot";
}

const listeners = new Set<() => void>();
// When the address can't be changed (a sandboxed frame), the choice still holds for the visit.
let held: NightSource | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("popstate", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("popstate", listener);
  };
}

const snapshot = (): NightSource => held ?? sourceFromSearch(window.location.search);
const serverSnapshot = (): NightSource => "robot";

export function useNightSource(): [NightSource, (next: NightSource) => void] {
  const source = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const choose = useCallback((next: NightSource) => {
    try {
      const url = new URL(window.location.href);
      if (next === "none") url.searchParams.set(SOURCE_PARAM, WITHOUT_ROBOT);
      else url.searchParams.delete(SOURCE_PARAM);
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
      held = null;
    } catch {
      held = next;
    }
    for (const listener of listeners) listener();
  }, []);
  return [source, choose];
}
