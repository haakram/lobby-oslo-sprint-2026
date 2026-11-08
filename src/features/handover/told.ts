import { createLocalStore, recordOf } from "@/features/modules/localStore";
import { osloToday } from "@/features/reception/dates";
import { keepRecentDays } from "@/features/staffinput/retention";

/**
 * *Varsle …* on a safety row (round 6, product and design review: "varsle nå" was text, not a control):
 * who was told, by whom, and when, per handover day (YYYY-MM-DD) and row. Kept on this device like the
 * sign-off, for the night staff's retention (30 days, staffinput/retention.ts). TODO(phase-3): the
 * message goes out (SMS or the hotel's own channel) and the record goes to the server; today the button
 * records that the morning told the person, it sends nothing.
 */
export type Told = {
  /** "Trond Eikeland" · "resepsjonen". */
  to: string;
  /** Who tapped it. */
  by: string | null;
  /** ISO time (src/ui/stamp.ts). */
  stamp: string;
};

const isTold = (value: unknown): value is Told => {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.to === "string" && entry.to.length > 0 && typeof entry.stamp === "string";
};

export const SAFETY_TOLD = createLocalStore<Record<string, Record<string, Told>>>(
  "lobby:handover-varslet",
  (raw) =>
    keepRecentDays(
      Object.fromEntries(Object.entries(recordOf(raw, (day): day is Record<string, unknown> => Boolean(day) && typeof day === "object" && !Array.isArray(day))).map(([day, rows]) => [day, recordOf(rows, isTold)])),
      osloToday(),
    ),
  {},
);

export function tell(day: string, id: string, told: Told | null) {
  SAFETY_TOLD.set((current) => {
    const rows = { ...(current[day] ?? {}) };
    if (told) rows[id] = told;
    else delete rows[id];
    return { ...keepRecentDays(current, day), [day]: rows };
  });
}
