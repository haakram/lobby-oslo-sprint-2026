import { createLocalStore } from "@/features/modules/localStore";
import { osloToday } from "@/features/reception/dates";
import { keepRecentDays } from "@/features/staffinput/retention";
import type { Signoff } from "./select";

const isSignoff = (value: unknown): value is Signoff => {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.name === "string" && entry.name.length > 0 && typeof entry.at === "string";
};

/** A day's log; a day stored before round 7 (one sign-off object) is read as its one line. */
function dayLog(raw: unknown): Signoff[] {
  if (Array.isArray(raw)) return raw.filter(isSignoff);
  return isSignoff(raw) ? [raw] : [];
}

/**
 * *Kvitter mottatt*, per day (YYYY-MM-DD, Oslo): who took the handover and at what time. Append-only
 * (round 7, legal review: a receipt that can be unsigned without a trace is not a record): *Angre
 * kvitteringen* adds a withdrawal line ("Kvittering trukket tilbake … av Siri Haugen"), and a new
 * *Kvitter* adds another line after it. Kept 30 days on this device, pruned on load and on write (the
 * night clerk's RETENTION_DAYS). TODO(phase-3): stored on the server with the user's id, so the night
 * shift sees it was read.
 */
export const SIGNOFFS = createLocalStore<Record<string, Signoff[]>>(
  "lobby:handover-signoff",
  (raw) => keepRecentDays(Object.fromEntries(Object.entries(raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}).map(([day, log]) => [day, dayLog(log)])), osloToday()),
  {},
);

/** The day's sign-off in force: the last line, unless it is a withdrawal. */
export function signoffOf(log: readonly Signoff[] | undefined): Signoff | null {
  const last = log?.at(-1);
  return last && !last.withdrawn ? last : null;
}

/** The last withdrawal, when it is the day's last line: "trukket tilbake … av Siri Haugen". */
export function withdrawalOf(log: readonly Signoff[] | undefined): Signoff | null {
  const last = log?.at(-1);
  return last?.withdrawn ? last : null;
}

/** *Kvitter mottatt* or (`withdrawn`) *Angre kvitteringen*: one more line in the day's log. */
export function sign(day: string, line: Signoff) {
  SIGNOFFS.set((current) => {
    const next = keepRecentDays(current, day);
    next[day] = [...(next[day] ?? []), line];
    return next;
  });
}
