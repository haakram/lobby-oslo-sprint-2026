"use client";

import { useCallback, useSyncExternalStore } from "react";
import { z } from "zod";
import { ROOM_TYPE_IDS } from "./hotel";
import { MESSAGE_TOPICS, type ReceptionRecord } from "./records";

export const RECORDS_STORAGE = "resepsjon-records-v1";

/** Enough for a night's calls; the oldest drop off first. */
export const MAX_STORED_RECORDS = 50;

// What a stored record must look like before it is rendered; anything else is dropped. Only the fields
// the card shows as text are checked; others (a newer record's extra fields) are kept as they are.
const Booking = z.looseObject({
  kind: z.literal("booking"),
  id: z.string().min(1),
  createdAt: z.string(),
  name: z.string(),
  phone: z.string(),
  arrival: z.string(),
  departure: z.string(),
  guests: z.number(),
  room: z.enum(ROOM_TYPE_IDS),
  note: z.string(),
  directTotal: z.number(),
  // Bookings stored before Maria could confirm them are requests waiting for staff.
  confirmed: z.boolean().default(false),
});
const Message = z.looseObject({
  kind: z.literal("message"),
  id: z.string().min(1),
  createdAt: z.string(),
  name: z.string(),
  phone: z.string(),
  topic: z.enum(MESSAGE_TOPICS),
  message: z.string(),
  urgent: z.boolean(),
});
const StoredRecord = z.discriminatedUnion("kind", [Booking, Message]);

const EMPTY: ReceptionRecord[] = [];

/** Reads the stored records; anything blocked, broken or unknown counts as none. */
function readRecords(): ReceptionRecord[] {
  try {
    const raw = localStorage.getItem(RECORDS_STORAGE);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return EMPTY;
    return parsed.flatMap((item) => {
      const result = StoredRecord.safeParse(item);
      return result.success ? [result.data as ReceptionRecord] : [];
    });
  } catch {
    return EMPTY;
  }
}

// One copy per page, shared by every component that reads it; dropped when the last one unmounts,
// so the next mount reads the browser's copy again.
let cache: ReceptionRecord[] | null = null;
const listeners = new Set<() => void>();

function snapshot(): ReceptionRecord[] {
  if (cache === null) cache = readRecords();
  return cache;
}

function serverSnapshot(): ReceptionRecord[] {
  return EMPTY;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) cache = null;
  };
}

function save(next: ReceptionRecord[]): void {
  cache = next;
  try {
    localStorage.setItem(RECORDS_STORAGE, JSON.stringify(next));
  } catch {
    // Private mode or a full disk: the records still hold for this visit.
  }
  for (const listener of listeners) listener();
}

/**
 * What the AI receptionist took down, newest first, kept in this browser across reloads and calls, so
 * a booking or a callback waits until staff settle it, as the screen promises.
 * TODO(phase-3): a shared store, so every desk sees the same records.
 */
export function useStoredRecords() {
  // The server renders none; the browser's copy arrives right after hydration.
  const records = useSyncExternalStore(subscribe, snapshot, serverSnapshot);

  const add = useCallback((record: ReceptionRecord) => {
    const current = snapshot();
    save([record, ...current.filter((item) => item.id !== record.id)].slice(0, MAX_STORED_RECORDS));
  }, []);

  return { records, add };
}
