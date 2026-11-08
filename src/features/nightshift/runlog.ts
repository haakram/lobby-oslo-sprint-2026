import { z } from "zod";

/**
 * Run log v1, read-only (docs/ARCHITECTURE.md § 4.3). Track A's agent writes one JSON object per
 * line, "v": 1 on every line. Lines we can't read are skipped and counted; unknown types are ignored.
 */

/** A Wybe shift id. Anything else never reaches a URL. */
export const SHIFT_ID = /^w2-[0-9a-f]{8,64}$/;

const base = { v: z.literal(1), t: z.number().optional() };
const clock = z.string().nullable().optional();

export const startLine = z.object({
  ...base,
  type: z.literal("start"),
  shift: z.string().regex(SHIFT_ID),
  mode: z.string(),
  seed: z.number().int().nullable().optional(),
  /** Who wrote the log: absent for the Night Shift agent, "open-rmf" for that adapter (docs/runlog.schema.json). */
  source: z.string().optional(),
  /** Newer agents: the flags in force at the start; `score_blind: true` means the agent never read the score. */
  flags: z.record(z.string(), z.unknown()).optional(),
});

export const callLine = z.object({
  ...base,
  type: z.literal("call"),
  cmd: z.string(),
  args: z.unknown().optional(),
  ok: z.boolean(),
  clock,
  result: z.unknown().optional(),
  events: z.array(z.unknown()).optional(),
  latency_ms: z.number().optional(),
  status: z.number().optional(),
});

export const decisionLine = z.object({
  ...base,
  type: z.literal("decision"),
  kind: z.string(),
  data: z.record(z.string(), z.unknown()).optional(),
});

export const stateLine = z.object({
  ...base,
  type: z.literal("state"),
  clock,
  location: z.string().nullable().optional(),
  score: z.number(),
  battery: z.number().optional(),
  hands: z.array(z.unknown()).optional(),
  cart: z.array(z.unknown()).nullable().optional(),
});

export const endLine = z.object({
  ...base,
  type: z.literal("end"),
  score: z.number(),
  requests_served: z.number().optional(),
  reason: z.string().optional(),
});

export const runLine = z.discriminatedUnion("type", [startLine, callLine, decisionLine, stateLine, endLine]);
export type RunLine = z.infer<typeof runLine>;

const KNOWN_TYPES = new Set(["start", "call", "decision", "state", "end"]);

/** A well-formed v1 line of a type this app doesn't know yet: ignored, not counted as skipped. */
const unknownV1Type = z.object({
  v: z.literal(1),
  type: z.string().refine((type) => !KNOWN_TYPES.has(type)),
});

/** Parses lines the viewer server already decoded (`/api/run/<shift>`). */
export function parseRunValues(values: readonly unknown[]): { lines: RunLine[]; skipped: number } {
  const lines: RunLine[] = [];
  let skipped = 0;
  for (const value of values) {
    const parsed = runLine.safeParse(value);
    if (parsed.success) lines.push(parsed.data);
    else if (!unknownV1Type.safeParse(value).success) skipped += 1;
  }
  return { lines, skipped };
}

/** Parses a whole `.jsonl` file. Blank lines are not lines. */
export function parseRunLog(text: string): { lines: RunLine[]; skipped: number } {
  const values: unknown[] = [];
  let unreadable = 0;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    try {
      values.push(JSON.parse(raw));
    } catch {
      unreadable += 1;
    }
  }
  const parsed = parseRunValues(values);
  return { lines: parsed.lines, skipped: parsed.skipped + unreadable };
}

export type Decision = { id: number; kind: string; text: string };

export type RunSummary = {
  shift: string | null;
  mode: string | null;
  seed: number | null;
  score: number;
  clock: string | null;
  location: string | null;
  tasksDone: number;
  tasksFailed: number;
  live: boolean;
  /** Newest first, at most 20. */
  decisions: Decision[];
};

const MAX_DECISIONS = 20;
const DETAIL_KEYS = ["text", "note", "reason", "summary"] as const;

/** "R-003 · Do Not Disturb on room-208." from whatever the decision's data holds. */
function describe(data: Record<string, unknown> | undefined): string {
  if (!data) return "";
  const request = typeof data.request === "string" ? data.request : null;
  const detail = DETAIL_KEYS.map((key) => data[key]).find((value): value is string => typeof value === "string");
  return [request, detail].filter(Boolean).join(" · ");
}

export function summarise(lines: readonly RunLine[]): RunSummary {
  const summary: RunSummary = {
    shift: null,
    mode: null,
    seed: null,
    score: 0,
    clock: null,
    location: null,
    tasksDone: 0,
    tasksFailed: 0,
    live: true,
    decisions: [],
  };
  const decisions: Decision[] = [];

  lines.forEach((line, id) => {
    switch (line.type) {
      case "start":
        summary.shift = line.shift;
        summary.mode = line.mode;
        summary.seed = line.seed ?? null;
        break;
      case "call":
        if (line.clock) summary.clock = line.clock;
        break;
      case "state":
        if (line.clock) summary.clock = line.clock;
        if (line.location) summary.location = line.location;
        if (summary.live) summary.score = line.score;
        break;
      case "decision":
        if (line.kind === "task_done") summary.tasksDone += 1;
        if (line.kind === "task_failed") summary.tasksFailed += 1;
        decisions.push({ id, kind: line.kind, text: describe(line.data) });
        break;
      case "end":
        summary.score = line.score;
        summary.live = false;
        break;
    }
  });

  summary.decisions = decisions.slice(-MAX_DECISIONS).reverse();
  return summary;
}

const REPLAY_SPEED = 10;
const MAX_GAP_MS = 1000;
const FALLBACK_GAP_MS = 100;

/** How long to wait before showing `next` in a replay: the recorded gap at 10x, capped. */
export function replayDelayMs(prev: { t?: number }, next: { t?: number }): number {
  if (prev.t === undefined || next.t === undefined || next.t < prev.t) return FALLBACK_GAP_MS;
  return Math.min(MAX_GAP_MS, Math.round(((next.t - prev.t) * 1000) / REPLAY_SPEED));
}
