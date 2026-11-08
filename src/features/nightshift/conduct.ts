import { linesUntil } from "./declines";
import type { RunLine } from "./runlog";

/**
 * What the robot's own run log says about how it worked (jury round 4, owner C): what each "done" rested
 * on, and the honest lines a robot operator checks first. Pure selectors over the log
 * (docs/ARCHITECTURE.md § 4.3); every figure is counted, nothing is typed in for the demo night.
 *
 * Stable names (owner A shows the room flags from `multiArrivalRooms`; the judgement card shows the rest):
 * `doneBasis`, `masterKeyEntries`, `multiArrivalRooms`, `slipCrossings`, `signsMovedOffWet`, and their
 * types. The same "done" rule runs in scripts/ledger.py (`done_after_rise`, `done_own`, …), so the card
 * and docs/runs/ledger.csv agree.
 *
 * Each selector takes `until` (sim seconds since 22:00) as `declineSplit` does: only lines up to that
 * clock count, so Natteskift's card follows the replay. A decision line has no clock of its own; it
 * takes the clock of the last call or state line before it.
 */

export type Tally = { reported: number; confirmed: number };

export type DoneBasis = Tally & {
  /** Reported after the score had already risen during the task: the simulator's referee confirmed it first. */
  afterRise: Tally;
  /** No rise during the task: the robot said "done" from what it saw (room checks, spills, …). */
  own: Tally & { roomChecks: Tally; spills: Tally; other: Tally; confirmedRequests: string[] };
  /** No `task_start` line for the request in the log (very early logs): basis not known. */
  unknown: Tally;
  /**
   * A producer with no referee (docs/runlog.schema.json, e.g. the Open-RMF adapter): a `task_done` with an
   * `evidence` list and no report call, judged by `evidenceVerdict`: confirmed only with two different
   * signals, at least one from outside the robot; `robotOnly` had two or more, all the robot's own
   * ("robotens egen observasjon"). `signals` names the signals behind the confirmed ones.
   */
  evidence: Tally & { robotOnly: number; signals: string[] };
};

export type MasterKeyEntry = { room: string; clock: string | null; knocked: boolean };
export type MasterKeyEntries = { entries: MasterKeyEntry[]; withoutKnock: number };

export type Arrival = { item: string; clock: string | null; request: string | null };
/** A room that received bags for two or more arrivals tonight: more than one booking can hold. */
export type MultiArrivalRoom = { room: string; arrivals: Arrival[] };

/** A slip on a wet floor, and how often the robot crossed that same wet floor afterwards with no sign there. */
export type SlipCrossing = { place: string; clock: string | null; crossingsAfter: number; signedAfter: boolean };

/** A sign the robot picked up and moved; `stillWet` when its last look there before the move saw the patch. */
export type SignMove = { from: string; to: string | null; clock: string | null; request: string | null; stillWet: boolean };

type Rec = Record<string, unknown>;

function rec(value: unknown): Rec | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Rec) : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function scoreOf(line: RunLine): number | null {
  if (line.type === "state") return line.score;
  if (line.type === "call") {
    const score = rec(line.result)?.score;
    if (typeof score === "number") return score;
  }
  return null;
}

const tally = (): Tally => ({ reported: 0, confirmed: 0 });

function add(into: Tally, confirmed: boolean): void {
  into.reported += 1;
  if (confirmed) into.confirmed += 1;
}

/**
 * Where a signal comes from (jury round 5, domain review; owner B's door lock and night clerk use the same rule).
 * Only `robot` is the robot talking about itself; everything else is a signal from outside it.
 * - robot: what the robot's own sensors or actions say (its camera, its compartment, "placed inside", a
 *   knock it heard answered, a sign it put down, a lock opened with its own credential);
 * - building: the door-lock audit trail or the energy slot (one derived signal per room, never who);
 * - guest: the guest confirmed (PIN, app, voice);
 * - staff: a person on the night shift checked it (owner B's night-clerk entries);
 * - pms: the booking system (read-only);
 * - referee: the Wybe simulator's verified reply. It exists only in the simulator, never in a hotel.
 */
export type SignalOrigin = "robot" | "building" | "guest" | "staff" | "pms" | "referee";

/** One evidence entry (docs/runlog.schema.json `evidence`), or a fact from another source (owner B: `source: "staff"`). */
export type EvidenceSignal = { signal: string; origin?: string | null; source?: string | null; detail?: string | null; at?: string | null };

const ORIGINS: ReadonlySet<string> = new Set(["robot", "building", "guest", "staff", "pms", "referee"]);

/** A signal's origin when the producer did not name one: by the signal, else by the line's `source`. */
const SIGNAL_ORIGIN: Readonly<Record<string, SignalOrigin>> = {
  referee: "referee",
  lock: "building",
  door_lock: "building",
  energy_slot: "building",
  guest_ack: "guest",
  staff: "staff",
  staff_check: "staff",
  pms: "pms",
  photo: "robot",
  compartment: "robot",
  sign_placed: "robot",
  door_answered: "robot",
  item_placed: "robot",
  room_check: "robot",
  knock: "robot",
};

/** A lock opened with the robot's own key is the robot's own action in the lock trail, not the building's. */
const ROBOT_CREDENTIAL = /\brobot(?:'s)? (?:credential|key|card)\b/i;

/** Where `entry` comes from: its own `origin` when valid, else read from the signal and its source. Unknown: the robot. */
export function signalOrigin(entry: EvidenceSignal): SignalOrigin {
  if (entry.origin && ORIGINS.has(entry.origin)) return entry.origin as SignalOrigin;
  if ((entry.signal === "lock" || entry.signal === "door_lock") && ROBOT_CREDENTIAL.test(entry.detail ?? "")) return "robot";
  return SIGNAL_ORIGIN[entry.signal] ?? (entry.source ? SIGNAL_ORIGIN[entry.source] : undefined) ?? "robot";
}

/**
 * The evidence rule (jury round 5, domain review; owner B): "bekreftet" needs two different signals, at least
 * one of them from outside the robot (door lock, energy slot, guest, staff, the PMS). Two or more signals
 * that all come from the robot read "robotens egen observasjon", a tier below. Fewer than two read
 * "ikke bekreftet". Signals count once each, by name.
 */
export type EvidenceVerdict = "confirmed" | "robot_only" | "unconfirmed";

export const EVIDENCE_WORDS: Readonly<Record<EvidenceVerdict, string>> = {
  confirmed: "bekreftet",
  robot_only: "robotens egen observasjon",
  unconfirmed: "ikke bekreftet",
};

export function evidenceVerdict(entries: readonly EvidenceSignal[]): { verdict: EvidenceVerdict; signals: string[]; outside: string[] } {
  const signals: string[] = [];
  const outside: string[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry.signal !== "string" || !entry.signal || signals.includes(entry.signal)) continue;
    signals.push(entry.signal);
    if (signalOrigin(entry) !== "robot") outside.push(entry.signal);
  }
  const verdict: EvidenceVerdict = signals.length < 2 ? "unconfirmed" : outside.length > 0 ? "confirmed" : "robot_only";
  return { verdict, signals, outside };
}

/**
 * What each "done" rested on. A `report … done` counts as after the rise when any score the robot saw
 * between the request's last `task_start` and the report was higher than the score before it (the
 * agent's flows read that rise before they report: `_deliver`, `message`); otherwise it is the robot's
 * own judgement, split by the task's kind. Confirmed: the server answered "Noted. Thanks.". A score-blind run
 * (`flags.score_blind` on the start line) counts every "done" as its own judgement.
 */
export function doneBasis(lines: readonly RunLine[], until?: number): DoneBasis {
  const basis: DoneBasis = {
    ...tally(),
    afterRise: tally(),
    own: { ...tally(), roomChecks: tally(), spills: tally(), other: tally(), confirmedRequests: [] },
    unknown: tally(),
    evidence: { ...tally(), robotOnly: 0, signals: [] },
  };
  const open = new Map<string, { kind: string | null; rose: boolean }>();
  const reportedDone = new Set<string>();
  // A score-blind run (the start line's flags) never read the score: every "done" is its own judgement.
  const start = lines.find((line) => line.type === "start");
  const blind = start?.type === "start" && start.flags?.score_blind === true;
  let last: number | null = null;
  for (const line of linesUntil(lines, until)) {
    const score = scoreOf(line);
    if (score !== null) {
      if (last !== null && score > last && !blind) for (const task of open.values()) task.rose = true;
      last = score;
    }
    if (line.type === "decision") {
      const request = str(line.data?.request);
      if (!request) continue;
      if (line.kind === "task_start") open.set(request, { kind: str(line.data?.kind), rose: false });
      const evidence = line.data?.evidence;
      if (line.kind === "task_done" && Array.isArray(evidence) && !reportedDone.has(request)) {
        const judged = evidenceVerdict(evidence.map((entry) => rec(entry)).filter((entry): entry is Rec => entry !== null) as EvidenceSignal[]);
        const confirmed = judged.verdict === "confirmed";
        add(basis, confirmed);
        add(basis.evidence, confirmed);
        if (judged.verdict === "robot_only") basis.evidence.robotOnly += 1;
        if (confirmed) for (const signal of judged.signals) if (!basis.evidence.signals.includes(signal)) basis.evidence.signals.push(signal);
      }
      if (line.kind === "task_done" || line.kind === "task_failed") open.delete(request);
      continue;
    }
    if (line.type !== "call" || line.cmd !== "report" || !line.ok) continue;
    const args = rec(line.args);
    if (args?.outcome !== "done") continue;
    const reply = typeof line.result === "string" ? line.result : JSON.stringify(line.result ?? "");
    const confirmed = reply.toLowerCase().includes("thanks");
    add(basis, confirmed);
    reportedDone.add(str(args.request) ?? "");
    const task = open.get(str(args.request) ?? "");
    if (!task) add(basis.unknown, confirmed);
    else if (task.rose) add(basis.afterRise, confirmed);
    else {
      add(basis.own, confirmed);
      if (confirmed) basis.own.confirmedRequests.push(str(args.request) ?? "");
      add(task.kind === "room_check" ? basis.own.roomChecks : task.kind === "spill" ? basis.own.spills : basis.own.other, confirmed);
    }
  }
  return basis;
}

/**
 * The robot's own-judgement "done" checked against its own log (jury round 5, domain review): of the ones the
 * referee confirmed, how many no `selfContradictions` line disputes. 209 makes the demo night 8 of 9.
 */
export function ownAgainstLog(basis: DoneBasis, contradictions: readonly SelfContradiction[]): { reported: number; holds: number; contradicted: SelfContradiction[] } {
  const contradicted = contradictions.filter((entry) => basis.own.confirmedRequests.includes(entry.request));
  return { reported: basis.own.reported, holds: basis.own.confirmed - contradicted.length, contradicted };
}

/**
 * Every door the robot opened with its keycard (the master key), and whether it knocked on that door
 * first: a knock on the same door since the task started and since the last time it opened that door.
 */
export function masterKeyEntries(lines: readonly RunLine[], until?: number): MasterKeyEntries {
  const entries: MasterKeyEntry[] = [];
  const knocked = new Set<string>();
  for (const line of linesUntil(lines, until)) {
    if (line.type === "decision" && line.kind === "task_start") knocked.clear();
    if (line.type !== "call" || !line.ok) continue;
    const args = rec(line.args);
    if (line.cmd === "knock") {
      const door = str(args?.door);
      if (door) knocked.add(door);
    }
    if (line.cmd === "use" && str(args?.item) === "keycard") {
      const door = str(args?.on);
      if (!door?.startsWith("room-")) continue;
      entries.push({ room: door.slice(5), clock: line.clock ?? null, knocked: knocked.has(door) });
      knocked.delete(door);
    }
  }
  return { entries, withoutKnock: entries.filter((entry) => !entry.knocked).length };
}

const LUGGAGE = /^luggage(?:-|$)/;

/**
 * Rooms the robot put bags into for two or more different arrivals tonight (luggage-212, luggage-212-28,
 * luggage-212-67), in the order of the room's first bag. No booking data needed: the log alone shows a
 * room handed to more guests than it holds.
 */
export function multiArrivalRooms(lines: readonly RunLine[], until?: number): MultiArrivalRoom[] {
  const byRoom = new Map<string, Arrival[]>();
  let task: string | null = null;
  for (const line of linesUntil(lines, until)) {
    if (line.type === "decision" && line.kind === "task_start") task = str(line.data?.request);
    if (line.type !== "call" || line.cmd !== "place" || !line.ok) continue;
    const args = rec(line.args);
    const item = str(args?.item);
    const where = str(args?.where);
    if (!item || !LUGGAGE.test(item) || !where?.startsWith("room-")) continue;
    const room = where.slice(5);
    const arrivals = byRoom.get(room) ?? [];
    if (!arrivals.some((arrival) => arrival.item === item)) arrivals.push({ item, clock: line.clock ?? null, request: task });
    byRoom.set(room, arrivals);
  }
  return [...byRoom].filter(([, arrivals]) => arrivals.length >= 2).map(([room, arrivals]) => ({ room, arrivals }));
}

/**
 * A room check the robot reported "done" as empty while its own log says it had put something inside that
 * room earlier the same night (jury round 5, domain review): at 01:29 it placed luggage-209 inside room-209, at
 * 03:47 it looked in, saw "Nobody is here. The room is tidy." with no bags, and reported the room empty.
 * Two signals from the same robot that disagree: its look (the simulator's text reply, not a camera) against its
 * own task log. scripts/ledger.py runs the same rule over every night (round 6).
 */
export type SelfContradiction = {
  request: string;
  /** "209". */
  room: string;
  /** What the robot put inside the room before the check and its look did not show, with when. */
  placed: { item: string; clock: string | null }[];
  /** When the robot reported the room empty. */
  clock: string | null;
  /** What the robot saw, in its own words ("Nobody is here. The room is tidy."). */
  finding: string | null;
};

const SIGN_ITEM = /wet-floor-sign/;
const EMPTY_FINDING = /nobody is here|\bempty\b|\btidy\b/i;

/** Every own room check that contradicts the robot's own earlier `place` into that room, in report order. */
export function selfContradictions(lines: readonly RunLine[], until?: number): SelfContradiction[] {
  const placed = new Map<string, { item: string; clock: string | null }[]>();
  const tasks = new Map<string, { kind: string | null; room: string | null }>();
  const looks = new Map<string, { objects: string[]; description: string | null }>();
  const found: SelfContradiction[] = [];
  for (const line of linesUntil(lines, until)) {
    if (line.type === "decision" && line.kind === "task_start") {
      const request = str(line.data?.request);
      if (request) tasks.set(request, { kind: str(line.data?.kind), room: str(line.data?.room) });
      continue;
    }
    if (line.type !== "call" || !line.ok) continue;
    const args = rec(line.args);
    if (line.cmd === "place") {
      const item = str(args?.item);
      const where = str(args?.where);
      const reply = typeof line.result === "string" ? line.result : "";
      if (!item || !where?.startsWith("room-") || !/\binside\b/i.test(reply) || SIGN_ITEM.test(item)) continue;
      const items = placed.get(where) ?? [];
      if (!items.some((entry) => entry.item === item)) items.push({ item, clock: line.clock ?? null });
      placed.set(where, items);
      continue;
    }
    if (line.cmd === "look" && !args?.at) {
      const result = rec(line.result);
      const at = str(result?.location);
      if (!at) continue;
      const objects = Array.isArray(result?.objects) ? result.objects.map((object) => (typeof object === "string" ? object : str(rec(object)?.name) ?? "")) : [];
      looks.set(at, { objects, description: str(result?.description) });
      continue;
    }
    if (line.cmd !== "report" || args?.outcome !== "done") continue;
    const request = str(args.request);
    const task = request ? tasks.get(request) : undefined;
    if (!request || task?.kind !== "room_check" || !task.room) continue;
    const items = placed.get(task.room) ?? [];
    if (items.length === 0) continue;
    const look = looks.get(task.room);
    const finding = look?.description ?? str(args.note);
    if (!EMPTY_FINDING.test(finding ?? "")) continue;
    const missing = items.filter((entry) => !(look?.objects ?? []).some((object) => object === entry.item));
    if (missing.length === 0) continue;
    found.push({ request, room: task.room.slice(5), placed: missing, clock: line.clock ?? null, finding });
  }
  return found;
}

const WET_NOTICE = /wet floor/i;
const SLIPPED = /slipped/i;
const WET_LOOK = /wet patch on the floor here/i;

/** The robot's place after each line: a move's `at`, a status's `location`, a state line's `location`. */
function placeAfter(line: RunLine, current: string | null): string | null {
  if (line.type === "state") return line.location ?? current;
  if (line.type !== "call" || !line.ok) return current;
  const result = rec(line.result);
  if (line.cmd === "move") return str(result?.at) ?? current;
  if (line.cmd === "status") return str(result?.location) ?? current;
  return current;
}

/**
 * Each slip on a wet floor (a move the server answered "The robot slipped on a wet floor"), and how many
 * times after it the robot crossed that wet floor again (a move into or out of that place that the
 * server answered with a wet-floor notice) before a sign stood there.
 */
export function slipCrossings(lines: readonly RunLine[], until?: number): SlipCrossing[] {
  const slips: SlipCrossing[] = [];
  let here: string | null = null;
  for (const line of linesUntil(lines, until)) {
    const from = here;
    here = placeAfter(line, here);
    if (line.type !== "call" || !line.ok) continue;
    if (line.cmd === "place" && SIGN_ITEM.test(str(rec(line.args)?.item) ?? "")) {
      for (const slip of slips) if (slip.place === here) slip.signedAfter = true;
      continue;
    }
    if (line.cmd !== "move") continue;
    const notice = str(rec(line.result)?.notice) ?? "";
    if (!WET_NOTICE.test(notice)) continue;
    for (const slip of slips) if (!slip.signedAfter && (slip.place === here || slip.place === from)) slip.crossingsAfter += 1;
    if (SLIPPED.test(notice) && here) slips.push({ place: here, clock: line.clock ?? null, crossingsAfter: 0, signedAfter: false });
  }
  return slips;
}

/**
 * The signs the robot moved (`sign_moved`: picked up where it stood, put down at the next sign it
 * placed), and whether its last look at the old place, before it picked the sign up, still saw the wet
 * patch.
 */
export function signsMovedOffWet(lines: readonly RunLine[], until?: number): SignMove[] {
  const moves: SignMove[] = [];
  const wetAt = new Map<string, boolean>();
  let here: string | null = null;
  let clock: string | null = null;
  let carrying: SignMove | null = null;
  for (const line of linesUntil(lines, until)) {
    here = placeAfter(line, here);
    if ((line.type === "call" || line.type === "state") && line.clock) clock = line.clock;
    if (line.type === "decision" && line.kind === "sign_moved") {
      const from = str(line.data?.place) ?? here;
      if (!from) continue;
      carrying = { from, to: null, clock, request: str(line.data?.request), stillWet: wetAt.get(from) === true };
      moves.push(carrying);
      continue;
    }
    if (line.type !== "call" || !line.ok) continue;
    const result = rec(line.result);
    if (line.cmd === "look" && result && !rec(line.args)?.at) {
      const at = str(result.location);
      if (at) wetAt.set(at, WET_LOOK.test(str(result.description) ?? ""));
    }
    if (line.cmd === "place" && carrying && SIGN_ITEM.test(str(rec(line.args)?.item) ?? "")) {
      carrying.to = here;
      carrying = null;
    }
  }
  return moves;
}

/** Where the robot ended the shift: its place, whether it docked, its battery, and whether it still holds the master keycard. */
export type EndOfShift = { place: string | null; docked: boolean; battery: number | null; keycard: boolean; clock: string | null };

const DOCK_BATTERY = /\bto (\d+(?:\.\d+)?)\s*%/i;

/**
 * The robot at the end of the shift (round 6, the domain review: a robot that ends in a corridor, or holding the
 * master keycard, is what a hotel acts on at 06:00). Read only once the log's `end` line is within `until`; null
 * while the night runs. The keycard counts while it is in the robot's hands or cart on the last state line, or
 * picked up after it and not put down.
 */
export function endOfShift(lines: readonly RunLine[], until?: number): EndOfShift | null {
  const seen = linesUntil(lines, until);
  if (!seen.some((line) => line.type === "end")) return null;
  let place: string | null = null;
  let docked = false;
  let battery: number | null = null;
  let keycard = false;
  let clock: string | null = null;
  for (const line of seen) {
    place = placeAfter(line, place);
    if ((line.type === "call" || line.type === "state") && line.clock) clock = line.clock;
    if (line.type === "state") {
      if (typeof line.battery === "number") battery = line.battery;
      keycard = [...(line.hands ?? []), ...(line.cart ?? [])].some((item) => item === "keycard");
      continue;
    }
    if (line.type !== "call" || !line.ok) continue;
    const item = str(rec(line.args)?.item);
    const result = rec(line.result);
    if (line.cmd === "move") docked = false;
    if (line.cmd === "dock") {
      docked = true;
      const charged = DOCK_BATTERY.exec(str(result?.outcome) ?? "");
      if (charged) battery = Number(charged[1]);
    }
    if (line.cmd === "status" && result) {
      if (typeof result.battery === "number") battery = result.battery;
      if (typeof result.docked === "boolean") docked = result.docked;
    }
    if (item === "keycard" && line.cmd === "pick") keycard = true;
    if (item === "keycard" && (line.cmd === "place" || line.cmd === "drop")) keycard = false;
  }
  return { place, docked, battery, keycard, clock };
}

export type UnfinishedTask = { request: string; status: string; note: string | null; room: string | null };

/**
 * The tasks that did not end "done": failed or cancelled (`task_failed`, any status but declined) and the
 * ones still open when the log ends (a `task_start` with no end line). For producers without the Wybe
 * request flow (the Open-RMF adapter), where these are the handover's open items.
 */
export function unfinishedTasks(lines: readonly RunLine[], until?: number): { ended: UnfinishedTask[]; open: UnfinishedTask[] } {
  const started = new Map<string, string | null>();
  const ended: UnfinishedTask[] = [];
  const closed = new Set<string>();
  for (const line of linesUntil(lines, until)) {
    if (line.type !== "decision") continue;
    const request = str(line.data?.request);
    if (!request) continue;
    if (line.kind === "task_start") started.set(request, str(line.data?.room));
    if (line.kind === "task_done") closed.add(request);
    if (line.kind === "task_failed") {
      closed.add(request);
      const status = str(line.data?.status) ?? "failed";
      if (status !== "declined") ended.push({ request, status, note: str(line.data?.note), room: started.get(request) ?? null });
    }
  }
  const open = [...started].filter(([request]) => !closed.has(request)).map(([request, room]) => ({ request, status: "open", note: null, room }));
  return { ended, open };
}
