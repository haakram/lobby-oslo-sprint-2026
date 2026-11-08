import { createLocalStore, recordOf } from "@/features/modules/localStore";
import type { Signoff } from "./select";

const isSignoff = (value: unknown): value is Signoff => {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.name === "string" && entry.name.length > 0 && typeof entry.at === "string";
};

/**
 * *Kvitter mottatt*, per day (YYYY-MM-DD, Oslo): who took the handover and at what time.
 * TODO(phase-3): stored on the server with the user's id, so the night shift sees it was read.
 */
export const SIGNOFFS = createLocalStore<Record<string, Signoff>>("lobby:handover-signoff", (raw) => recordOf(raw, isSignoff), {});

export function sign(day: string, signoff: Signoff | null) {
  SIGNOFFS.set((current) => {
    const next = { ...current };
    if (signoff) next[day] = signoff;
    else delete next[day];
    return next;
  });
}
