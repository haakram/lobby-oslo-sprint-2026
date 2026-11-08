import { clockToSim } from "@/features/replay/timeline";
import type { RunLine } from "./runlog";

/**
 * "Robotens vurderinger i natt": the judgement calls in the robot's run log (docs/ARCHITECTURE.md
 * § 4.3), counted for a hotel manager. Pure; a decision line has no clock of its own, so it takes the
 * clock of the last call or state line before it (as `roomStatusAt` does).
 *
 * - Strangers: one `hypothesis` H-bathrobe per refusal (a person asked to be let into a room; the robot
 *   said no, kept its keycard, did not follow), grouped as one incident; `keycard_withheld` is a room
 *   it waited to open because a stranger, or that person, was there. Older logs without the hypothesis fall
 *   back to `person` lines that ask to be let in.
 * - Do Not Disturb: rooms with an `ikke_forstyrr` status, and how many the robot entered after that.
 * - Wet floors: places a `look` saw wet, the signs the robot placed (H-spill), and the wet places
 *   without a sign at the end (a sign moved to a newer spill leaves its old place bare).
 * - Done: `task_done` lines against the server's replies; `report_unverified` is a done the server
 *   did not confirm.
 * - Declined: `task_failed` with status "declined", by reason (no order on record, already delivered,
 *   nothing new to fix).
 */

export type StrangerRefusal = { clock: string; room: string | null };

export type RobotJudgement = {
  /** `keycardWaits`: rooms where it held the keycard back (and waited) while that person was there. */
  /** `reply`: what the robot said to the person, word for word (the first refusal), when the log has it. */
  strangers: { refusals: StrangerRefusal[]; rooms: string[]; keycardWaits: string[]; reply: string | null };
  doNotDisturb: { rooms: string[]; entered: string[] };
  wetFloors: { found: string[]; signed: string[]; unsignedAtEnd: string[] };
  done: { reported: number; confirmed: number };
  declined: { total: number; noOrder: number; alreadyDone: number; nothingNew: number; other: number };
};

const LOCKED_OUT = /locked out of (?:room[- ])?(\d{3})/i;
const LET_IN = /let me in|locked out/i;
const SIGN_PLACED = /placed a wet-floor sign at ([a-z0-9-]+)/i;
const WET = /wet patch on the floor here/i;
const SIGN_HERE = /a sign stands next to it/i;

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function rec(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function declineReason(note: string): keyof Omit<RobotJudgement["declined"], "total"> {
  if (/no .*order .*on record|nothing was ordered/i.test(note)) return "noOrder";
  if (/already delivered|duplicate/i.test(note)) return "alreadyDone";
  if (/no new wet patch|nothing (?:new|moved)|already (?:signed|has a sign)/i.test(note)) return "nothingNew";
  return "other";
}

/** The robot's judgement calls in `lines`, up to sim second `until` (seconds since 22:00) when given. */
export function robotJudgement(lines: readonly RunLine[], until?: number): RobotJudgement {
  const refusals: StrangerRefusal[] = [];
  const pleas: StrangerRefusal[] = [];
  const keycardWaits: string[] = [];
  let lastSay: string | null = null;
  let reply: string | null = null;
  const dnd = new Set<string>();
  const entered = new Set<string>();
  const wet = new Set<string>();
  const placed: string[] = [];
  const signNow = new Map<string, boolean>();
  let reported = 0;
  let unverified = 0;
  const declined = { total: 0, noOrder: 0, alreadyDone: 0, nothingNew: 0, other: 0 };
  let clock = "22:00:00";

  for (const line of lines) {
    if ((line.type === "call" || line.type === "state") && line.clock) {
      if (until !== undefined && clockToSim(line.clock) > until) break;
      clock = line.clock;
    }

    if (line.type === "call" && line.ok) {
      const args = rec(line.args);
      const result = rec(line.result);
      if (line.cmd === "say") lastSay = str(args?.text);
      if (line.cmd === "look" && result) {
        const at = str(result.location);
        const description = str(result.description) ?? "";
        if (at && WET.test(description)) {
          wet.add(at);
          signNow.set(at, SIGN_HERE.test(description));
        }
      }
      // Into a Do-Not-Disturb room after the sign was seen: by keycard, or by walking in.
      const into = line.cmd === "use" && str(args?.item) === "keycard" ? str(args?.on) : line.cmd === "move" ? str(args?.to) : null;
      if (into && dnd.has(into)) entered.add(into);
      continue;
    }

    if (line.type !== "decision") continue;
    const data = line.data ?? {};
    switch (line.kind) {
      case "hypothesis": {
        const id = str(data.id);
        if (id === "H-bathrobe") {
          const text = str(data.text) ?? "";
          refusals.push({ clock, room: LOCKED_OUT.exec(text)?.[1] ?? null });
          if (reply === null && lastSay && /can(?:'|no)t open|front desk/i.test(lastSay)) reply = lastSay;
        }
        if (id === "H-spill") {
          const action = str(data.action) ?? "";
          const at = SIGN_PLACED.exec(action)?.[1];
          if (at) {
            placed.push(at);
            wet.add(at);
            signNow.set(at, true);
          }
          const movedFrom = str(data.moved_from);
          if (at && movedFrom) signNow.set(movedFrom, false);
        }
        break;
      }
      case "person": {
        const text = str(data.text) ?? "";
        if (data.repeat !== true && LET_IN.test(text)) pleas.push({ clock, room: LOCKED_OUT.exec(text)?.[1] ?? null });
        break;
      }
      case "keycard_withheld": {
        // The second line of a wait ("final") is the same wait, still not opened.
        const room = str(data.room);
        if (room && data.final !== true) keycardWaits.push(room);
        break;
      }
      case "room_status": {
        const room = str(data.room);
        if (room && data.status === "ikke_forstyrr") dnd.add(room);
        break;
      }
      case "work_order": {
        // A wet floor the robot raised as a work order (found by a walk over it or an exit warning, no
        // "wet patch" in a look): the bell and Vedlikehold list it until a sign is placed after it.
        const place = str(data.place);
        if (place && data.type === "sol" && !data.request && !/varselskilt/i.test(str(data.text) ?? "")) {
          wet.add(place);
          signNow.set(place, false);
        }
        break;
      }
      case "task_done":
        reported += 1;
        break;
      case "report_unverified":
        unverified += 1;
        break;
      case "task_failed": {
        if (data.status !== "declined") break;
        declined.total += 1;
        declined[declineReason(str(data.note) ?? "")] += 1;
        break;
      }
    }
  }

  const incident = refusals.length > 0 ? refusals : pleas;
  const rooms = [...new Set(incident.map((refusal) => refusal.room).filter((room): room is string => room !== null))];
  const signed = [...new Set(placed)];
  return {
    strangers: { refusals: incident, rooms, keycardWaits, reply },
    doNotDisturb: { rooms: [...dnd].sort(), entered: [...entered].sort() },
    wetFloors: {
      found: [...wet].sort(),
      signed,
      unsignedAtEnd: [...wet].filter((place) => signNow.get(place) !== true).sort(),
    },
    done: { reported, confirmed: Math.max(0, reported - unverified) },
    declined,
  };
}
