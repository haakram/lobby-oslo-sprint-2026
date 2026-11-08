import { type RunLine, runLine } from "./runlog";

/**
 * A second producer for run log v1 (jury round 4, item C6; the Wybe engineer): Open-RMF's task_state and
 * fleet_state messages (rmf_api_msgs) turned into the lines the handover reads (docs/runlog.schema.json),
 * so a robot that is not Wybe's simulator gets the same judgement card. Pure; no network.
 *
 * What maps to what:
 * - each task: a `task_start` decision at `unix_millis_start_time` (request = the booking id; kind = the
 *   RMF category; room from a `room:204` booking label or a `[place:room_204]` phase), then at
 *   `unix_millis_finish_time` a `task_done` (status `completed`) with its `evidence`, or a `task_failed`
 *   (`failed`, `error`, `killed`: failed; `canceled`: skipped, with the cancellation's labels as the note).
 *   A task still `underway`/`queued` at the end has only its start: open at 06:00.
 * - evidence, from the task's phase events (RMF does not standardise these names; this is the mapping):
 *   a door opened (the door adapter, the lock trail) → `lock`; a photo → `photo`; a compartment/drawer
 *   event → `compartment`; a recipient/guest confirmation or PIN → `guest_ack`. Only completed events count.
 * - fleet_state robots: a `state` line per snapshot with the battery (0–1 → per cent); RMF has map
 *   coordinates, not place names, so `location` is null. `score` is 0: there is no referee.
 * Every line goes through the v1 parser, so a line the app could not read is dropped, never shown wrong.
 */

type Rec = Record<string, unknown>;

export type RmfSample = { fleet?: string; fleet_states?: unknown[]; tasks?: unknown[] };

export type EvidenceSignal = "lock" | "photo" | "compartment" | "guest_ack";

const SIGNALS: [RegExp, EvidenceSignal][] = [
  [/\bdoor\b.*\bopened\b|\block\b/i, "lock"],
  [/\bphoto\b|\bcamera\b/i, "photo"],
  [/\bcompartment\b|\bdrawer\b/i, "compartment"],
  [/\brecipient\b|\bguest\b.*\bconfirm|\bpin\b/i, "guest_ack"],
];

const OSLO = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });

function rec(value: unknown): Rec | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Rec) : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** "22:30:00", hotel time in Oslo. */
export function rmfClock(millis: number): string {
  return OSLO.format(new Date(millis));
}

/** A stable hex id for the sample, so it fits the v1 shift pattern (FNV-1a, 32 bits, twice). */
function shiftId(seed: string): string {
  const fnv = (text: string) => {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
  };
  return `w2-${fnv(seed)}${fnv(`${seed}:rmf`)}`;
}

/** "room-204" from a `room:204` label or the first `[place:room_204]` in the phases. */
function roomOf(task: Rec): string | null {
  const labels = (rec(task.booking)?.labels as unknown[] | undefined) ?? [];
  for (const label of labels) {
    const match = /^room:(\d{3})$/.exec(str(label) ?? "");
    if (match) return `room-${match[1]}`;
  }
  for (const phase of Object.values(rec(task.phases) ?? {})) {
    const match = /\[place:room_(\d{3})\]/.exec(str(rec(phase)?.category) ?? "");
    if (match) return `room-${match[1]}`;
  }
  return null;
}

function itemOf(task: Rec): string | null {
  const labels = (rec(task.booking)?.labels as unknown[] | undefined) ?? [];
  for (const label of labels) {
    const match = /^item:(.+)$/.exec(str(label) ?? "");
    if (match) return match[1];
  }
  return null;
}

/** The evidence signals in a task's completed phase events, each once, in the order they happened. */
export function rmfEvidence(task: Rec, at: string): { signal: EvidenceSignal; at: string; detail: string }[] {
  const found: { signal: EvidenceSignal; at: string; detail: string }[] = [];
  for (const phase of Object.values(rec(task.phases) ?? {})) {
    for (const event of Object.values(rec(rec(phase)?.events) ?? {})) {
      const e = rec(event);
      if (!e || str(e.status) !== "completed") continue;
      const name = str(e.name) ?? "";
      const signal = SIGNALS.find(([pattern]) => pattern.test(name))?.[1];
      if (signal && !found.some((entry) => entry.signal === signal)) found.push({ signal, at, detail: name });
    }
  }
  return found;
}

type Timed = { t: number; order: number; line: unknown };

/** The sample as run log v1 lines, in time order. */
export function fromOpenRmf(sample: RmfSample): RunLine[] {
  const timed: Timed[] = [];
  let order = 0;
  const push = (millis: number, line: unknown) => timed.push({ t: millis, order: order++, line });
  const tasks = (sample.tasks ?? []).map(rec).filter((task): task is Rec => task !== null);
  const ids = tasks.map((task) => str(rec(task.booking)?.id) ?? "").join("|");
  const starts = tasks.map((task) => num(task.unix_millis_start_time)).filter((t): t is number => t !== null);
  const first = Math.min(...starts, ...((sample.fleet_states ?? []) as Rec[]).flatMap((state) =>
    Object.values(rec(state?.robots) ?? {}).map((robot) => num(rec(robot)?.unix_millis_time) ?? Infinity),
  ));
  if (!Number.isFinite(first)) return [];

  push(first - 1, { v: 1, type: "start", t: (first - 1) / 1000, shift: shiftId(`${sample.fleet ?? "rmf"}|${ids}`), mode: "sample", source: "open-rmf" });

  for (const state of sample.fleet_states ?? []) {
    for (const robot of Object.values(rec(rec(state)?.robots) ?? {})) {
      const r = rec(robot);
      const millis = num(r?.unix_millis_time);
      if (!r || millis === null) continue;
      const battery = num(r.battery);
      push(millis, { v: 1, type: "state", t: millis / 1000, clock: rmfClock(millis), location: null, score: 0, ...(battery !== null && { battery: Math.round(battery * 1000) / 10 }) });
    }
  }

  let completed = 0;
  for (const task of tasks) {
    const request = str(rec(task.booking)?.id);
    const started = num(task.unix_millis_start_time);
    if (!request || started === null) continue;
    const clock = rmfClock(started);
    push(started, { v: 1, type: "state", t: started / 1000, clock, location: null, score: 0 });
    push(started, { v: 1, type: "decision", kind: "task_start", data: { request, kind: str(task.category) ?? "task", room: roomOf(task), item: itemOf(task) } });
    const finished = num(task.unix_millis_finish_time);
    const status = str(task.status) ?? "";
    if (finished === null) continue;
    const end = rmfClock(finished);
    push(finished, { v: 1, type: "state", t: finished / 1000, clock: end, location: null, score: 0 });
    if (status === "completed") {
      completed += 1;
      const room = roomOf(task);
      push(finished, {
        v: 1,
        type: "decision",
        kind: "task_done",
        data: { request, status: "done", note: `${str(task.category) ?? "task"}${room ? ` ${room}` : ""} completed`, evidence: rmfEvidence(task, end) },
      });
    } else if (["failed", "error", "killed", "canceled"].includes(status)) {
      const labels = ((rec(task.cancellation)?.labels as unknown[] | undefined) ?? []).map(str).filter(Boolean);
      const failure = Object.values(rec(task.phases) ?? {})
        .flatMap((phase) => Object.values(rec(rec(phase)?.events) ?? {}))
        .map(rec)
        .find((event) => event && ["failed", "error"].includes(str(event.status) ?? ""));
      const note = status === "canceled" ? `canceled: ${labels.join(", ") || "by an operator"}` : (str(failure?.name) ?? status);
      push(finished, { v: 1, type: "decision", kind: "task_failed", data: { request, status: status === "canceled" ? "skipped" : "failed", note } });
    }
  }

  timed.sort((a, b) => a.t - b.t || a.order - b.order);
  const last = timed.at(-1)?.t ?? first;
  push(last + 1, { v: 1, type: "end", score: 0, requests_served: completed, reason: "end of the Open-RMF sample" });

  const lines: RunLine[] = [];
  for (const { line } of timed) {
    const parsed = runLine.safeParse(line);
    if (parsed.success) lines.push(parsed.data);
  }
  return lines;
}
