import { hhmm } from "@/features/dashboard/format";
import type { DoorSignal } from "@/features/doorlock/feed";
import { type EvidenceSignal, type EvidenceVerdict, evidenceVerdict } from "@/features/nightshift/conduct";
import type { GuestFound, Sellable } from "@/features/rooms/reconcile";
import type { StaffRoom } from "@/features/staffinput/read";

/**
 * What a room row rests on, drawn as source chips instead of written as prose (round 6, design review:
 * "[Dørlåsen] [Nattevakt] → Bekreftet av to kilder" is the product's promise as a mark). One chip per
 * source that said something about the room tonight: the door lock's one signal (never who, never when a
 * guest came in), the night clerk's look, and on a robot night the robot's own. The verdict is the
 * evidence rule every screen uses (nightshift/conduct.ts `evidenceVerdict`): bekreftet needs two signals,
 * at least one from outside the robot. Pure.
 */

export type SourceChip = {
  source: "door_lock" | "staff" | "robot";
  /** "Dørlåsen" · "Nattevakt" · "Roboten". */
  label: string;
  /** "ingen kort siden kl. 18" · "tomt 04:24" · "gjest svarte 23:12". */
  detail: string;
};

export type RoomSources = {
  chips: SourceChip[];
  verdict: EvidenceVerdict;
  /** "Bekreftet av to kilder" · "Robotens egen observasjon" · "Én kilde: sjekk rommet". */
  word: string;
};

const COUNT = ["null", "én", "to", "tre", "fire"];

const at = (clock: string | null) => (clock ? ` ${hhmm(clock)}` : "");

function doorChip(signal: DoorSignal): SourceChip {
  // A card in the slot is a yes with no clock (the feed carries none); no card says the window it covers.
  const detail = signal.signal === "card_in" ? "kort i rommet" : signal.since ? `ingen kort siden ${hhmm(signal.since)}` : "ingen kort siden kl. 18";
  return { source: "door_lock", label: "Dørlåsen", detail };
}

const STAFF_SAW: Record<StaffRoom["status"], string> = { klar: "tomt", opptatt: "ikke tomt", ma_vaskes: "trenger vask" };

/** Her look; a sample-night entry says so on the chip (round 7, data review: two of "tre kilder" were team-written). */
function staffChip(entry: StaffRoom): SourceChip {
  return { source: "staff", label: "Nattevakt", detail: `${STAFF_SAW[entry.status]}${at(entry.at)}${entry.sample ? " · eksempel" : ""}` };
}

/** The robot's own look: empty and tidy (a room to sell), or a guest found (a knock answered, a do-not-disturb sign). */
export type RobotLook = { kind: "empty"; row: Sellable } | { kind: "guest"; row: GuestFound };

function robotChip(look: RobotLook): SourceChip {
  if (look.kind === "empty") return { source: "robot", label: "Roboten", detail: `tomt${at(look.row.at)}` };
  const what = look.row.source === "door_sign" ? "ikke forstyrr-skilt" : "gjest svarte";
  return { source: "robot", label: "Roboten", detail: `${what}${at(look.row.at)}` };
}

const SIGNAL: Record<SourceChip["source"], EvidenceSignal> = {
  door_lock: { signal: "door_lock", origin: "building" },
  staff: { signal: "staff_check", origin: "staff" },
  robot: { signal: "room_check", origin: "robot" },
};

/** The room's chips and verdict, or null when no source said anything about it. Order: the building, the person, the robot. */
export function roomSources({ door, staff, robot }: { door?: DoorSignal | null; staff?: StaffRoom | null; robot?: RobotLook | null }): RoomSources | null {
  const chips = [door ? doorChip(door) : null, staff ? staffChip(staff) : null, robot ? robotChip(robot) : null].filter((chip): chip is SourceChip => chip !== null);
  if (chips.length === 0) return null;
  const { verdict } = evidenceVerdict(chips.map((chip) => SIGNAL[chip.source]));
  const word =
    verdict === "confirmed"
      ? `Bekreftet av ${COUNT[chips.length] ?? chips.length} kilder`
      : verdict === "robot_only"
        ? "Robotens egen observasjon"
        : "Én kilde: sjekk rommet";
  return { chips, verdict, word };
}
