import { clockToSim } from "@/features/replay/timeline";
import { classify, declinedReason, factsFromLines } from "./outcomes";
import type { RunLine } from "./runlog";

/**
 * The robot's refusals held to the same standard as its "done" (review round 3, items B2 and C2): a
 * refusal counts as approved only when the referee (the Wybe Night Shift simulator's server) raised
 * the score after the robot's `report … declined`, exactly as a "done" counts only when the server
 * credited it. On the demo night (seed 16) seven of the eight refusals were credited (+5 each) and
 * one, R-036 ("no new wet patch on floor 3"), was not: the score stayed at 1,120.
 *
 * Owner B's request list imports this selector; owner C's judgement card shows its split. Keep the
 * names stable: `declineSplit`, `declineSplitText`, `DeclineCheck`, `DeclineSplit`.
 *
 * How a refusal is judged: the last score seen before the report line (a `state` line or a call's
 * `result.score`) against the first score seen after it. Higher: "credited". Same or lower:
 * "not_credited". No score after it yet (a live shift, or `until` cut it off): "pending".
 * Which requests are refusals comes from `classify` in outcomes.ts, so the total is the same
 * "declined" count every other screen shows.
 */

export type DeclineKind = "noOrder" | "alreadyDone" | "nothingNew" | "doNotDisturb" | "other";

export type DeclineCheck = {
  request: string;
  /** What the referee made of the refusal. */
  judged: "credited" | "not_credited" | "pending";
  /** Score after minus score before; null while pending or when the log has no report line for it. */
  points: number | null;
  kind: DeclineKind;
  /** The room the refusal is about, when the agent's note names one ("… from 138 on record"). */
  room: string | null;
  /** Why, in Norwegian (declinedReason). */
  reason: string;
  /** The agent's own words (English). */
  note: string | null;
  /** The clock of the report, "04:20:21"; null when the log has no report line. */
  clock: string | null;
};

export type DeclineSplit = {
  total: number;
  credited: number;
  notCredited: number;
  pending: number;
  /** In the order the robot reported them. */
  checks: DeclineCheck[];
  byRequest: Map<string, DeclineCheck>;
};

/** Which kind of refusal a note describes (the agent's own English words). */
export function declineKind(note: string | null): DeclineKind {
  const text = note ?? "";
  if (/no .*order .*on record|nothing was ordered/i.test(text)) return "noOrder";
  if (/already delivered|nothing more to bring|^duplicate of\b/i.test(text)) return "alreadyDone";
  if (/no new wet patch|nothing (?:new|moved)|already (?:signed|has a sign)/i.test(text)) return "nothingNew";
  if (/do not disturb|did not disturb|did not knock/i.test(text)) return "doNotDisturb";
  return "other";
}

const ROOM = /\b(?:from|for|on room-|room-)\s?(\d{3})\b/i;

function scoreOf(line: RunLine): number | null {
  if (line.type === "state") return line.score;
  if (line.type === "call" && line.result && typeof line.result === "object" && !Array.isArray(line.result)) {
    const score = (line.result as Record<string, unknown>).score;
    if (typeof score === "number") return score;
  }
  return null;
}

/** The lines up to sim second `until` (seconds since 22:00): stops at the first clock past it. */
export function linesUntil(lines: readonly RunLine[], until?: number): readonly RunLine[] {
  if (until === undefined) return lines;
  const index = lines.findIndex((line) => (line.type === "call" || line.type === "state") && !!line.clock && clockToSim(line.clock) > until);
  return index < 0 ? lines : lines.slice(0, index);
}

type Report = { index: number; clock: string | null };

/** Every refusal in `lines` (up to `until`), with the referee's verdict on it. */
export function declineSplit(lines: readonly RunLine[], until?: number): DeclineSplit {
  const seen = linesUntil(lines, until);
  const { facts, over } = factsFromLines(seen);

  // The last report line per request ("report" calls carry the request id in their args).
  const reports = new Map<string, Report>();
  seen.forEach((line, index) => {
    if (line.type !== "call" || line.cmd !== "report" || !line.ok) return;
    const args = line.args && typeof line.args === "object" ? (line.args as Record<string, unknown>) : {};
    if (typeof args.request === "string") reports.set(args.request, { index, clock: line.clock ?? null });
  });

  const checks: DeclineCheck[] = [];
  for (const entry of facts.values()) {
    const outcome = classify(entry, over);
    if (outcome.verdict !== "declined") continue;
    const report = reports.get(entry.request);
    let judged: DeclineCheck["judged"] = "pending";
    let points: number | null = null;
    if (report) {
      let before: number | null = null;
      for (let i = report.index - 1; i >= 0 && before === null; i -= 1) before = scoreOf(seen[i]);
      let after: number | null = null;
      for (let i = report.index + 1; i < seen.length && after === null; i += 1) after = scoreOf(seen[i]);
      if (before !== null && after !== null) {
        points = after - before;
        judged = points > 0 ? "credited" : "not_credited";
      }
    }
    checks.push({
      request: entry.request,
      judged,
      points,
      kind: declineKind(entry.note),
      room: entry.note ? (ROOM.exec(entry.note)?.[1] ?? null) : null,
      reason: outcome.reason ?? declinedReason(entry.note),
      note: entry.note,
      clock: report?.clock ?? null,
    });
  }
  checks.sort((a, b) => (reports.get(a.request)?.index ?? Infinity) - (reports.get(b.request)?.index ?? Infinity));

  const count = (judged: DeclineCheck["judged"]) => checks.filter((check) => check.judged === judged).length;
  return {
    total: checks.length,
    credited: count("credited"),
    notCredited: count("not_credited"),
    pending: count("pending"),
    checks,
    byRequest: new Map(checks.map((check) => [check.request, check])),
  };
}

/**
 * "7 falske klager avvist (godkjent av dommeren) · 1 ikke godkjent". "Falske klager" only when every
 * credited refusal is a claim about an order or a delivery; otherwise "meldinger avvist".
 */
export function declineSplitText(split: DeclineSplit): string {
  if (split.total === 0) return "Ingen meldinger avvist.";
  const credited = split.checks.filter((check) => check.judged === "credited");
  const claims = credited.every((check) => check.kind === "noOrder" || check.kind === "alreadyDone");
  const noun = claims ? (split.credited === 1 ? "falsk klage" : "falske klager") : split.credited === 1 ? "melding" : "meldinger";
  const parts: string[] = [];
  if (split.credited > 0) parts.push(`${split.credited} ${noun} avvist (godkjent av dommeren)`);
  if (split.notCredited > 0) parts.push(split.credited > 0 ? `${split.notCredited} ikke godkjent` : `${split.notCredited} avvist, ikke godkjent av dommeren`);
  if (split.pending > 0) parts.push(`${split.pending} venter på dommeren`);
  return parts.join(" · ");
}

const PLAIN_KIND: Record<DeclineKind, (n: number) => string> = {
  noOrder: (n) => `${n} ${n === 1 ? "melding" : "meldinger"} uten bestilling`,
  alreadyDone: (n) => `${n} alt levert`,
  nothingNew: (n) => `${n} uten nytt søl`,
  doNotDisturb: (n) => `${n} med Ikke forstyrr`,
  other: (n) => `${n} ${n === 1 ? "annen" : "andre"}`,
};

/**
 * The split in a manager's words, no referee and no hackathon wording (round 4, design review): "6 meldinger
 * uten bestilling og 1 alt levert · 1 ikke godkjent". The credited refusals by kind, then the ones not
 * credited, then the ones still waiting. The referee behind "godkjent" is named in the card's "Slik vet vi det".
 */
export function declineSplitPlain(split: DeclineSplit): string {
  if (split.total === 0) return "Ingen meldinger avvist.";
  const order: DeclineKind[] = ["noOrder", "alreadyDone", "nothingNew", "doNotDisturb", "other"];
  const credited = split.checks.filter((check) => check.judged === "credited");
  const kinds = order
    .map((kind) => [kind, credited.filter((check) => check.kind === kind).length] as const)
    .filter(([, n]) => n > 0)
    .map(([kind, n]) => PLAIN_KIND[kind](n));
  const parts: string[] = [];
  if (kinds.length > 0) parts.push(kinds.length > 1 ? `${kinds.slice(0, -1).join(", ")} og ${kinds.at(-1)}` : kinds[0]);
  if (split.notCredited > 0) parts.push(`${split.notCredited} ikke godkjent`);
  if (split.pending > 0) parts.push(`${split.pending} venter på svar`);
  return parts.join(" · ");
}
