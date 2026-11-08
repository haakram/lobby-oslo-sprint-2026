import { addDays } from "@/features/reception/dates";

/**
 * How long what the night staff typed stays on this device (round 6, legal review: retention as code,
 * at the DPA's number, not a promise on paper). One constant: the DPA's Vedlegg II and the line on
 * /natt ("Lagres på denne enheten i 30 dager") read the same number. TODO(phase-3): the server store
 * deletes on the same schedule.
 */
export const RETENTION_DAYS = 30;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A per-day record (YYYY-MM-DD keys) without the days older than `days` before `today`, and without any
 * key that is not a day. A day exactly `days` old is kept. Pure: the store writes the result back.
 */
export function keepRecentDays<V>(record: Readonly<Record<string, V>>, today: string, days: number = RETENTION_DAYS): Record<string, V> {
  const cutoff = addDays(today, -days);
  return Object.fromEntries(Object.entries(record).filter(([day]) => DAY.test(day) && day >= cutoff));
}

/** True when `keepRecentDays` would drop something (so a store writes only when it must). */
export function hasExpiredDays(record: Readonly<Record<string, unknown>>, today: string, days: number = RETENTION_DAYS): boolean {
  return Object.keys(keepRecentDays(record, today, days)).length !== Object.keys(record).length;
}
