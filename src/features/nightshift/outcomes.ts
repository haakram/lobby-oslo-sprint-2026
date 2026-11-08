import { itemLabel, placeLabel } from "@/features/dashboard/labels";
import type { Timeline } from "@/features/replay/timeline";
import type { RunLine } from "./runlog";

/**
 * How each of the robot's requests really ended, read from the run log (docs/ARCHITECTURE.md § 4.3),
 * and the night's totals from that one reading. Every screen that counts the robot's work (Oversikt,
 * Forespørsler, Natteskift, Overlevering, the bell) counts it here, so one night has one set of
 * numbers (jury round 2, item A1).
 *
 * The verdicts, in a hotel's words:
 * - **done**: reported done and the Wybe server credited it ("Noted. Thanks.").
 * - **unverified**: reported done, but the server did not credit it (`report_unverified`). Not done:
 *   a person checks it.
 * - **declined**: the robot checked and refused on good grounds (a follow-up with no order on record,
 *   a pillow already delivered). Not a failure, nothing for a person to take over.
 * - **cancelled**: the night manager called it off ("Skip R-065, 108 checked out."). Not a failure.
 * - **failed**: the robot could not do it (out of stock, not found, delivered but not confirmed).
 * - **open**: the shift ended before it was done. **running**: still going in a live shift.
 */

export type Verdict = "done" | "unverified" | "declined" | "cancelled" | "failed" | "open" | "running";

export type Outcome = {
  request: string;
  verdict: Verdict;
  /** Why, in Norwegian, for the screen; null for a plain done. */
  reason: string | null;
  /** The log's own words, as the agent wrote them (often English): for the technical view. */
  note: string | null;
};

/** What one request's lines said, whichever reader collected them (the raw lines or the replay). */
export type RequestFacts = {
  request: string;
  started: boolean;
  /** The task's last word: task_done, task_failed, or none yet. */
  ended: "done" | "failed" | null;
  /** task_failed's `status` ("failed", "declined"), when the log carries one. */
  status: string | null;
  note: string | null;
  /** A `report_unverified` for this request: the server did not credit the "done". */
  unverified: boolean;
  /** The night manager's words when the request was called off. */
  skipped: string | null;
};

/**
 * Notes of a refusal on good grounds: the order was never placed, the thing is already there, the
 * guest hung a Do-Not-Disturb sign, or it was the same request twice.
 */
const DECLINED_NOTE = /\bon record\b|nothing was ordered|already delivered|nothing more to bring|^no new\b|do not disturb|did not disturb|did not knock|^duplicate of\b/i;
/** The manager's instruction to drop a request (the old agent leaves it in the inbox). */
const SKIP = /^\s*Skip (R-\d+)\b/;
/** What the replay writes on a task the shift ended on (src/features/replay/timeline.ts). */
const SHIFT_ENDED = "Skiftet tok slutt";

function capitalise(text: string): string {
  return text.charAt(0).toLocaleUpperCase("nb-NO") + text.slice(1);
}

/** "phone-charger" → "mobillader", "wallet-3" → "lommebok". */
function item(raw: string): string {
  return itemLabel(raw.trim());
}

const ENGLISH = /\b(?:the|is|was|not|found|after|from|order|placed|but|score|delivered|stock|nobody)\b/i;

/** The robot's reason for a failure, in a hotel's words. Anything that says "score" never reaches the screen. */
export function failedReason(note: string | null): string {
  if (!note) return "Roboten fikk det ikke til.";
  let match = /^([\w-]+) out of stock/i.exec(note);
  if (match) return `Tomt for ${item(match[1])} på lageret.`;
  match = /^([\w-]+) not found after (\d+) scans?/i.exec(note);
  if (match) return `Fant ikke ${item(match[1])} etter ${match[2]} søk.`;
  match = /placed ([\w-]+?)(?: x\d+)? in room-(\d+) but the score did not rise/i.exec(note);
  if (match) return `${capitalise(item(match[1]))} levert til rom ${match[2]}, men ikke bekreftet. Sjekk at det kom til riktig gjest.`;
  match = /placed an? ([\w-]+) at ([\w-]+).*but the score did not rise/i.exec(note);
  if (match) return `${capitalise(item(match[1]))} satt ut ved ${placeLabel(match[2]).toLowerCase()}, men ikke bekreftet. Sjekk stedet.`;
  match = /could not pick ([\w-]+)/i.exec(note);
  if (match) return `Fant ikke ${item(match[1])} der det skulle være.`;
  if (note === SHIFT_ENDED) return "Skiftet tok slutt før roboten var ferdig.";
  return ENGLISH.test(note) ? "Roboten fikk det ikke til." : note;
}

/** Why the robot refused, in a hotel's words. */
export function declinedReason(note: string | null): string {
  if (!note) return "Roboten sjekket og fant ingenting å gjøre.";
  let match = /no (?:order for )?([\w-]+?)(?: order)? from (\d+) on record/i.exec(note);
  if (match) return `Roboten sjekket: ingen bestilling av ${item(match[1])} fra rom ${match[2]}.`;
  match = /the ([\w-]+) for (\d+) was already delivered under (R-\d+)/i.exec(note);
  if (match) return `${capitalise(item(match[1]))} til rom ${match[2]} var allerede levert (${match[3]}).`;
  if (/^no new wet patch/i.test(note)) return "Roboten fant ikke noe nytt søl.";
  match = /do not disturb sign on room-(\d+)/i.exec(note);
  if (match) return `Ikke forstyrr-skilt på rom ${match[1]}: roboten forstyrret ikke.`;
  match = /^duplicate of (R-\d+)/i.exec(note);
  if (match) return `Samme forespørsel som ${match[1]}.`;
  return "Roboten sjekket og fant ingenting å gjøre.";
}

/** The manager's skip, in a hotel's words: "Skip R-065, 108 checked out." → who checked out. */
export function cancelledReason(text: string | null): string {
  const room = text ? /(\d{3}) checked out/i.exec(text) : null;
  return room ? `Avlyst av nattsjefen: gjesten i rom ${room[1]} har sjekket ut.` : "Avlyst av nattsjefen.";
}

/** One request's verdict. `over`: the night has ended, so what never finished is "open", not "running". */
export function classify(facts: RequestFacts, over: boolean): Outcome {
  const base = { request: facts.request, note: facts.note };
  if (facts.ended === "done") {
    return facts.unverified
      ? { ...base, verdict: "unverified", reason: "Meldt ferdig, men Wybe-serveren godkjente det ikke. Sjekk med gjesten." }
      : { ...base, verdict: "done", reason: null };
  }
  if (facts.skipped !== null) return { ...base, verdict: "cancelled", reason: cancelledReason(facts.skipped) };
  if (facts.ended === "failed") {
    const declined = facts.status === "declined" || (facts.note !== null && DECLINED_NOTE.test(facts.note));
    return declined ? { ...base, verdict: "declined", reason: declinedReason(facts.note) } : { ...base, verdict: "failed", reason: failedReason(facts.note) };
  }
  if (over) return { ...base, verdict: "open", reason: facts.started ? "Skiftet tok slutt før roboten var ferdig." : "Roboten rakk det ikke før skiftet tok slutt." };
  return { ...base, verdict: "running", reason: null };
}

export type Tally = {
  /** Every request the robot was given tonight. */
  received: number;
  done: number;
  unverified: number;
  declined: number;
  cancelled: number;
  failed: number;
  open: number;
  running: number;
  /** "Ferdig" reported to the server: the credited ones and the ones it did not credit. */
  reported: number;
  /** The robot's tasks: every request but the ones called off or rightly refused. Read "done av total". */
  total: number;
  /** What the robot hands to a person: failed, not credited, or not reached. */
  handedBack: number;
};

export function tally(outcomes: Iterable<Outcome>): Tally {
  const count: Record<Verdict, number> = { done: 0, unverified: 0, declined: 0, cancelled: 0, failed: 0, open: 0, running: 0 };
  let received = 0;
  for (const outcome of outcomes) {
    received += 1;
    count[outcome.verdict] += 1;
  }
  return {
    received,
    ...count,
    reported: count.done + count.unverified,
    total: received - count.declined - count.cancelled,
    handedBack: count.failed + count.unverified + count.open,
  };
}

function facts(map: Map<string, RequestFacts>, request: string): RequestFacts {
  let entry = map.get(request);
  if (!entry) {
    entry = { request, started: false, ended: null, status: null, note: null, unverified: false, skipped: null };
    map.set(request, entry);
  }
  return entry;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/** The facts per request from the raw run log, in the order the requests came in. */
export function factsFromLines(lines: readonly RunLine[]): { facts: Map<string, RequestFacts>; over: boolean } {
  const map = new Map<string, RequestFacts>();
  let over = false;
  for (const line of lines) {
    if (line.type === "end") over = true;
    if (line.type === "call" && line.cmd === "inbox" && line.result && typeof line.result === "object") {
      const messages = (line.result as { messages?: unknown }).messages;
      for (const message of Array.isArray(messages) ? messages : []) {
        const body = text((message as Record<string, unknown>)?.text);
        const from = text((message as Record<string, unknown>)?.from) ?? "";
        const skip = body ? SKIP.exec(body) : null;
        if (skip && /manager/i.test(from)) facts(map, skip[1]).skipped = body;
      }
    }
    if (line.type !== "decision") continue;
    const data = line.data ?? {};
    const request = text(data.request);
    if (!request) continue;
    switch (line.kind) {
      case "request":
        facts(map, request);
        break;
      case "task_start":
        facts(map, request).started = true;
        break;
      case "task_done": {
        const entry = facts(map, request);
        entry.ended = "done";
        entry.note = text(data.note);
        break;
      }
      case "task_failed": {
        const entry = facts(map, request);
        entry.ended = "failed";
        entry.status = text(data.status);
        entry.note = text(data.note);
        break;
      }
      case "report_unverified":
        facts(map, request).unverified = true;
        break;
      case "request_skipped":
        facts(map, request).skipped = text(data.text) ?? "Skip";
        break;
    }
  }
  return { facts: map, over };
}

export type NightOutcomes = { outcomes: Map<string, Outcome>; tally: Tally; over: boolean };

/** The whole night (or the night so far, in a live shift) from the raw run log. */
export function nightOutcomes(lines: readonly RunLine[]): NightOutcomes {
  const { facts: all, over } = factsFromLines(lines);
  const outcomes = new Map([...all.values()].map((entry) => [entry.request, classify(entry, over)]));
  return { outcomes, tally: tally(outcomes.values()), over };
}

/**
 * The same verdicts from the replay's timeline at sim time `t` (Natteskift scrubs through the night).
 * The timeline keeps every decision as an event, so `report_unverified` and `request_skipped` are
 * there; a task's failure status is not, so a refusal is told by its note (the agent's own words).
 */
export function outcomesAt(timeline: Timeline, upToEvent: number, t: number): NightOutcomes {
  const map = new Map<string, RequestFacts>();
  const events = timeline.events.slice(0, upToEvent);
  for (const event of events) {
    if (!event.request) continue;
    if (event.kind === "request") facts(map, event.request);
    if (event.kind === "report_unverified") facts(map, event.request).unverified = true;
    if (event.kind === "request_skipped") facts(map, event.request).skipped = event.text || "Skip";
  }
  for (const task of timeline.tasks) {
    if (task.start > t) continue;
    const entry = facts(map, task.id);
    entry.started = true;
    if (task.end === null || task.end > t) continue;
    if (task.outcome === "done") {
      entry.ended = "done";
      entry.note = task.note;
    } else if (task.outcome === "failed" && task.note !== SHIFT_ENDED) {
      entry.ended = "failed";
      entry.note = task.note;
    }
  }
  const over = !timeline.live && t >= timeline.duration;
  const outcomes = new Map([...map.values()].map((entry) => [entry.request, classify(entry, over)]));
  return { outcomes, tally: tally(outcomes.values()), over };
}

/** Verdicts that need a person, and the ones that were right not to do, for a split "Feilet" list. */
export const HANDED_BACK: ReadonlySet<Verdict> = new Set(["failed", "unverified", "open"]);
export const RIGHTLY_NOT_DONE: ReadonlySet<Verdict> = new Set(["declined", "cancelled"]);

/** "Fant ikke 2 · Tomt på lager 1": the handed-back requests grouped by kind of reason. */
export function reasonGroups(outcomes: Iterable<Outcome>): { label: string; count: number }[] {
  const groups = new Map<string, number>();
  for (const outcome of outcomes) {
    const label = groupLabel(outcome);
    if (label) groups.set(label, (groups.get(label) ?? 0) + 1);
  }
  return [...groups.entries()].map(([label, count]) => ({ label, count }));
}

function groupLabel(outcome: Outcome): string | null {
  switch (outcome.verdict) {
    case "declined":
      if (outcome.reason?.startsWith("Ikke forstyrr")) return "Respekterte Ikke forstyrr";
      if (outcome.reason?.startsWith("Samme forespørsel")) return "Dobbel forespørsel";
      return "Avvist (ingen bestilling)";
    case "cancelled":
      return "Avlyst av nattsjefen";
    case "unverified":
      return "Ikke godkjent av serveren";
    case "open":
      return "Ikke rukket før 06:00";
    case "failed":
      if (outcome.reason?.startsWith("Tomt for")) return "Tomt på lager";
      if (outcome.reason?.startsWith("Fant ikke")) return "Ikke funnet";
      if (outcome.reason?.includes("ikke bekreftet")) return "Levert, ikke bekreftet";
      return "Kunne ikke";
    default:
      return null;
  }
}

export type OutcomeRow = {
  request: string;
  /** The robot's task for it; null for a request it never started. */
  task: Timeline["tasks"][number] | null;
  /** The guest's words (English, from the server). */
  text: string;
  /** Sim seconds: when the task started, or when the request came in. */
  t: number;
  verdict: Verdict;
  reason: string | null;
};

/** The rows of Natteskift's split list for some verdicts, newest first, each with what the guest asked. */
export function outcomeRows(timeline: Timeline, upToEvent: number, outcomes: NightOutcomes["outcomes"], verdicts: ReadonlySet<Verdict>): OutcomeRow[] {
  const asked = new Map<string, { text: string; t: number }>();
  for (const event of timeline.events.slice(0, upToEvent)) {
    if (event.kind === "request" && event.request && !asked.has(event.request)) asked.set(event.request, { text: event.text, t: event.t });
  }
  const tasks = new Map(timeline.tasks.map((task) => [task.id, task]));
  return [...outcomes.values()]
    .filter((outcome) => verdicts.has(outcome.verdict))
    .map((outcome) => {
      const task = tasks.get(outcome.request) ?? null;
      const request = asked.get(outcome.request);
      return {
        request: outcome.request,
        task,
        // The replay may already quote the guest's words («…»); the row quotes them once.
        text: (task?.text || request?.text || "").replace(/^«(.*)»$/s, "$1"),
        t: task?.start ?? request?.t ?? 0,
        verdict: outcome.verdict,
        reason: outcome.reason,
      };
    })
    .sort((a, b) => b.t - a.t);
}
