import { createLocalStore, recordOf } from "@/features/modules/localStore";

/**
 * Who moved a request along on this screen, and when (ISO): *Ta saken*, *Marker fullført*, *Gi det
 * likevel*, a phone task given to the robot or a person. Shown as "Siri Haugen tok saken · nå" (the
 * shared stamp in src/ui/stamp.ts), never a wall-clock time. TODO(phase-3): a shared backend; today the
 * stamps live in this browser, like the statuses they go with.
 */

export type RequestAct = "took" | "done" | "gave" | "reopened" | "assigned";

export type RequestStamp = { act: RequestAct; who: string; at: string };

const ACTS: ReadonlySet<string> = new Set(["took", "done", "gave", "reopened", "assigned"]);

const isStamp = (value: unknown): value is RequestStamp => {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.act === "string" && ACTS.has(entry.act) && typeof entry.who === "string" && typeof entry.at === "string";
};

export const REQUEST_STAMPS = createLocalStore<Record<string, RequestStamp>>("lobby:request-stamps", (raw) => recordOf(raw, isStamp), {});

/** Keep (or, with null, drop) the stamp of a request. */
export function stampRequest(id: string, stamp: RequestStamp | null) {
  REQUEST_STAMPS.set((current) => {
    const next = { ...current };
    if (stamp) next[id] = stamp;
    else delete next[id];
    return next;
  });
}
