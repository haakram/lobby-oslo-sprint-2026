"use client";

import { useSyncExternalStore } from "react";

/**
 * A small JSON value kept in this browser (localStorage), shared by every component that reads it on
 * the page and safe to render on the server (the server sees `empty`, the browser's copy arrives right
 * after hydration). Blocked or broken storage reads as `empty`; a write that fails still holds for the
 * visit. TODO(phase-3): a shared backend, so every desk sees the same marks.
 */
export type LocalStore<T> = {
  use: () => T;
  read: () => T;
  set: (next: T | ((current: T) => T)) => void;
};

export function createLocalStore<T>(key: string, parse: (raw: unknown) => T, empty: T): LocalStore<T> {
  let cache: T | null = null;
  const listeners = new Set<() => void>();

  const load = (): T => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? parse(JSON.parse(raw)) : empty;
    } catch {
      return empty;
    }
  };
  const read = (): T => {
    if (cache === null) cache = load();
    return cache;
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      // The next mount reads the browser's copy again (another tab may have written it).
      if (listeners.size === 0) cache = null;
    };
  };
  const set = (next: T | ((current: T) => T)) => {
    const value = typeof next === "function" ? (next as (current: T) => T)(read()) : next;
    cache = listeners.size > 0 ? value : null;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Private mode or a full disk: the value still holds while the page is open.
      cache = value;
    }
    for (const listener of listeners) listener();
  };
  const serverSnapshot = () => empty;
  const use = () => useSyncExternalStore(subscribe, read, serverSnapshot);

  return { use, read, set };
}

/** A record of string keys to values, keeping only the entries `keep` accepts. */
export function recordOf<V>(raw: unknown, keep: (value: unknown) => value is V): Record<string, V> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw as Record<string, unknown>).filter((entry): entry is [string, V] => keep(entry[1])));
}
