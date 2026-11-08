"use client";

import { useSyncExternalStore } from "react";

/**
 * Who did something, and how long ago: "Siri Haugen · nå", "Siri Haugen · for 3 min siden". The one
 * stamp every action on a 06:00 screen carries (a room released, *Ta saken*, *Gi det likevel*,
 * *Kvitter mottatt*). Never a wall-clock time: on stage at 14:15 a "14:15" beside a 06:00 handover
 * contradicts the story, while "nå" is true at any hour (jury round 3, the product juror). Store the moment as
 * ISO (`stampNow()`), render it with `actionStamp(who, at, now)` and `useNowMs()` so it ages.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** The moment of an action, to keep with it (ISO, UTC). */
export function stampNow(): string {
  return new Date().toISOString();
}

/**
 * "nå" under a minute (and for a moment a little ahead of `now`), "for 3 min siden", "for 1 time
 * siden", "for 5 timer siden", "i går", "for 3 dager siden". Null when `at` is not an ISO time (an old
 * stamp kept as "06:04"): the caller shows the name alone rather than a clock.
 */
export function relativeTime(at: string | null | undefined, now: number): string | null {
  if (!at || !/^\d{4}-\d{2}-\d{2}T/.test(at)) return null;
  const then = Date.parse(at);
  if (Number.isNaN(then)) return null;
  const ago = now - then;
  if (ago < MINUTE) return "nå";
  if (ago < HOUR) return `for ${Math.floor(ago / MINUTE)} min siden`;
  if (ago < DAY) {
    const hours = Math.floor(ago / HOUR);
    return `for ${hours} ${hours === 1 ? "time" : "timer"} siden`;
  }
  if (ago < 2 * DAY) return "i går";
  return `for ${Math.floor(ago / DAY)} dager siden`;
}

/** "Siri Haugen · nå"; the name alone when the time is unknown; "Personalet" when nobody is logged in. */
export function actionStamp(who: string | null | undefined, at: string | null | undefined, now: number): string {
  const name = who?.trim() || "Personalet";
  const when = relativeTime(at, now);
  return when ? `${name} · ${when}` : name;
}

// One shared ticking clock for every stamp on the page, so "nå" turns into "for 1 min siden" by itself.
const TICK = 30_000;
let current = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void) {
  if (listeners.size === 0) {
    current = Date.now();
    timer = setInterval(() => {
      current = Date.now();
      for (const notify of listeners) notify();
    }, TICK);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function snapshot(): number {
  if (current === 0) current = Date.now();
  return current;
}

/** Now (epoch ms), refreshed every 30 s; 0 on the server, where no stamp is rendered (they live in this browser). */
export function useNowMs(): number {
  return useSyncExternalStore(subscribe, snapshot, () => 0);
}
