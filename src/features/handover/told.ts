import { createLocalStore, recordOf } from "@/features/modules/localStore";
import { osloToday } from "@/features/reception/dates";
import { keepRecentDays } from "@/features/staffinput/retention";

/**
 * *Varsle …* on a safety row (round 6, product and design review: "varsle nå" was text, not a control):
 * who was told, by whom, and when, per handover day (YYYY-MM-DD). Round 7: kept per **hazard**, not per
 * row (`wet:lobby`, `person:doors`: OpenItem.hazards), so a *Varsle* under *Med robot* reads as told
 * under *Uten robot* too, where the same floor is its own row; and **append-only**, as the night clerk's
 * log is: *Angre* adds a correction line, it never deletes the record. Kept on this device for the night
 * staff's retention (30 days, staffinput/retention.ts). TODO(phase-3): the message goes out (SMS or the
 * hotel's own channel) and the record goes to the server; today the button records that the morning
 * told the person, it sends nothing.
 */
export type Told = {
  /** "Trond Eikeland" · "resepsjonen". */
  to: string;
  /** Who tapped it. */
  by: string | null;
  /** ISO time (src/ui/stamp.ts). */
  stamp: string;
};

/** One line in the day's log: a *Varsle* for a hazard, or (`undo`) the correction *Angre* appends. */
export type ToldEntry = Told & { hazard: string; undo?: boolean };

/** A hazard's state: told (the last line is a Varsle), or taken back (the last line is a correction, with the Varsle it took back). */
export type ToldState = { told: Told | null; undone: { told: Told; by: string | null; stamp: string } | null };

const isTold = (value: unknown): value is Told => {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.to === "string" && entry.to.length > 0 && typeof entry.stamp === "string";
};

const isEntry = (value: unknown): value is ToldEntry => isTold(value) && typeof (value as Record<string, unknown>).hazard === "string";

/** A day's log; a day stored before round 7 (a record per row id) is read as one line per row, in stamp order. */
function dayLog(raw: unknown): ToldEntry[] {
  if (Array.isArray(raw)) return raw.filter(isEntry);
  if (!raw || typeof raw !== "object") return [];
  return Object.entries(recordOf(raw, isTold))
    .map(([hazard, told]) => ({ ...told, hazard }))
    .sort((a, b) => a.stamp.localeCompare(b.stamp));
}

export const SAFETY_TOLD = createLocalStore<Record<string, ToldEntry[]>>(
  "lobby:handover-varslet",
  (raw) => keepRecentDays(Object.fromEntries(Object.entries(raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}).map(([day, log]) => [day, dayLog(log)])), osloToday()),
  {},
);

/** Each hazard's state from the day's log: the last line decides. */
export function toldStates(log: readonly ToldEntry[] | undefined): Map<string, ToldState> {
  const states = new Map<string, ToldState>();
  for (const entry of log ?? []) {
    const { hazard, undo, ...told } = entry;
    const before = states.get(hazard)?.told ?? null;
    if (undo) states.set(hazard, { told: null, undone: before ? { told: before, by: told.by, stamp: told.stamp } : null });
    else states.set(hazard, { told, undone: null });
  }
  return states;
}

/** *Varsle*: one line per hazard the row covers. */
export function tell(day: string, hazards: readonly string[], told: Told) {
  append(day, hazards.map((hazard) => ({ ...told, hazard })));
}

/** *Angre*: a correction line per hazard, naming who took it back and when; the Varsle stays in the log. */
export function untell(day: string, hazards: readonly string[], by: string | null, stamp: string) {
  SAFETY_TOLD.set((current) => {
    const states = toldStates(current[day]);
    const lines = hazards.flatMap((hazard) => {
      const told = states.get(hazard)?.told;
      return told ? [{ ...told, hazard, by, stamp, undo: true as const }] : [];
    });
    return { ...keepRecentDays(current, day), [day]: [...(current[day] ?? []), ...lines] };
  });
}

function append(day: string, lines: readonly ToldEntry[]) {
  SAFETY_TOLD.set((current) => ({ ...keepRecentDays(current, day), [day]: [...(current[day] ?? []), ...lines] }));
}
