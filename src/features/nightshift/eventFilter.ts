import { type ReplayEvent, simToClock, type Task } from "@/features/replay";
import { agentNote } from "@/features/replay/norsk";

/**
 * Which of the robot's events a hotel manager sees (UX audit X4): the ones with a known Norwegian
 * label and a hotel meaning. Everything else (hypotheses, the model's own notes, scans, requeues,
 * unknown kinds) is technical and stays behind "Vis tekniske hendelser" on Natteskift. The one
 * hypothesis a manager must see is the refused stranger (H-bathrobe): the timeline gives it the kind
 * "stranger_refused".
 */
export const MANAGER_KINDS: ReadonlySet<string> = new Set([
  "request",
  "task_start",
  "task_done",
  "task_failed",
  "room_status",
  "work_order",
  "person",
  "stranger_refused",
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

/**
 * The tasks that ended without "done" by `t`, with the reason the log gave, newest first; the night
 * report leads with them. The same rule as the snapshot's `tasksFailed` count, so the list and the
 * figure always agree: a task the shift ended on ("Skiftet tok slutt") has no `task_failed` line but
 * still counts, with its end as the clock.
 */
export function failures(tasks: readonly Task[], events: readonly ReplayEvent[], upToEvent: number, t: number): Failure[] {
  const seen = events.slice(0, upToEvent);
  return tasks
    .filter((task): task is Task & { end: number } => task.end !== null && task.end <= t && task.outcome !== "done")
    .map((task) => {
      const failed = seen.find((event) => event.kind === "task_failed" && event.request === task.id);
      const logged = failed ? managerText(failed.text) || null : null;
      const reason = (task.note ? agentNote(task.note) : null) ?? logged ?? (task.outcome === null ? "Ble ikke fullført." : null);
      return { task, reason, clock: failed?.clock ?? simToClock(task.end) };
    })
    .sort((a, b) => b.task.start - a.task.start);
}
