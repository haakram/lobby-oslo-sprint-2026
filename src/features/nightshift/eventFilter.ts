import type { ReplayEvent, Task } from "@/features/replay";

/**
 * Which of the robot's events a hotel manager sees (UX audit X4): the ones with a known Norwegian
 * label and a hotel meaning. Everything else (hypotheses, the model's own notes, scans, requeues,
 * unknown kinds) is technical and stays behind "Vis tekniske hendelser" on Natteskift.
 */
export const MANAGER_KINDS: ReadonlySet<string> = new Set([
  "request",
  "task_start",
  "task_done",
  "task_failed",
  "room_status",
  "work_order",
  "person",
  "keycard_withheld",
  "wet_floor",
  "knock",
  "place",
  "pick",
  "say",
  "call_elevator",
  "dock",
  "use",
  "ask",
  "stock_cart",
]);

/** Points are the robot's contest, not the hotel's night: strip "(+46 p)". */
export function managerText(text: string): string {
  return text.replace(/\s*\(\+\d+\s*p\)\s*$/, "").trim();
}

export function forManagers(events: readonly ReplayEvent[], technical: boolean): ReplayEvent[] {
  const kept = technical ? events : events.filter((event) => MANAGER_KINDS.has(event.kind));
  return kept.map((event) => (event.text ? { ...event, text: managerText(event.text) } : event));
}

export type Failure = { task: Task; reason: string | null; clock: string };

/** The failed tasks with the reason the log gave, newest first; the night report leads with them. */
export function failures(tasks: readonly Task[], events: readonly ReplayEvent[], upToEvent: number): Failure[] {
  const seen = events.slice(0, upToEvent);
  return tasks
    .filter((task) => task.outcome === "failed")
    .map((task) => {
      const failed = seen.find((event) => event.kind === "task_failed" && event.request === task.id);
      return { task, reason: task.note ?? (failed ? managerText(failed.text) || null : null), clock: failed?.clock ?? "" };
    })
    .filter((failure) => failure.clock !== "")
    .sort((a, b) => b.task.start - a.task.start);
}
