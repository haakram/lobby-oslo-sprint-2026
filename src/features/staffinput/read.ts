import { placeLabel } from "@/features/dashboard/labels";
import type { RunLine } from "@/features/nightshift/runlog";
import type { HazardKind, StaffRoomStatus } from "./entries";

/**
 * Reads the night clerk's lines back (entries.ts writes them): what she logged, in order, with the
 * corrections applied (a retracted line no longer counts; a sign put out later marks its wet floor
 * signed). Lines from other producers are ignored. Pure.
 */

type Base = {
  id: string;
  by: string;
  /** Oslo clock, HH:MM:SS. */
  at: string | null;
  /** ISO, for "nå" / "for 3 min siden" (sample lines have none). */
  stamp: string | null;
  /** Part of the sample night (test data). */
  sample: boolean;
  /** Taken back with Angre (the line stays in the log). */
  retracted: boolean;
};

export type StaffEntry =
  | (Base & { kind: "room"; room: string; status: StaffRoomStatus })
  | (Base & {
      kind: "hazard";
      hazard: HazardKind;
      place: string;
      note: string | null;
      /** HH:MM:SS: wet since (the report's clock when the line has none). Null for a door or a person. */
      since: string | null;
      /** A wet floor: is a sign out (her answer, or a sign put out later). Null for a door or a person. */
      signed: boolean | null;
      /** HH:MM:SS when the sign went out, or null. */
      signedAt: string | null;
    })
  | (Base & {
      kind: "sign";
      /** The wet floor's line id. */
      target: string;
      /** Where that wet floor is (null when its line is not in the log). */
      place: string | null;
    })
  | (Base & {
      kind: "ack";
      /** The robot hazard's key (robotHazards.ts `robotHazardKey`). */
      target: string;
      hazard: "wet" | "person";
      place: string | null;
      /** The robot's clock for the hazard, HH:MM:SS. */
      robotAt: string | null;
    })
  | (Base & { kind: "note"; text: string });

const STATUSES = new Set<string>(["klar", "opptatt", "ma_vaskes"]);

/** The night clerk's hours (21:00–06:59): a clock outside them was typed by day (on a demo) and is said without a clock. */
export function inNightHours(clock: string | null | undefined): clock is string {
  if (!clock || !/^\d{2}:\d{2}/.test(clock)) return false;
  const hour = Number(clock.slice(0, 2));
  return hour >= 21 || hour < 7;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Every entry the clerk made, oldest first; `retracted` marks the ones taken back. */
export function readStaffLog(lines: readonly RunLine[]): StaffEntry[] {
  const entries: StaffEntry[] = [];
  const retracted = new Set<string>();
  for (const line of lines) {
    if (line.type !== "decision") continue;
    const data = line.data ?? {};
    if (data.source !== "staff") continue;
    const id = str(data.id);
    if (!id) continue;
    const base: Base = { id, by: str(data.by) ?? "Nattevakten", at: str(data.at), stamp: str(data.stamp), sample: data.sample === true, retracted: false };
    if (line.kind === "retracted") {
      const target = str(data.target);
      if (target) retracted.add(target);
    } else if (line.kind === "room_status") {
      const room = str(data.room);
      const status = str(data.status);
      if (room && status && STATUSES.has(status)) entries.push({ ...base, kind: "room", room, status: status as StaffRoomStatus });
    } else if (line.kind === "hazard" || line.kind === "security_event") {
      const place = str(data.place);
      const hazard: HazardKind | null =
        line.kind === "hazard" ? (data.hazard === "wet" ? "wet" : null) : data.event === "door_open" ? "door" : data.event === "unknown_person" ? "person" : null;
      if (place && hazard) {
        const wet = hazard === "wet";
        const signed = wet ? data.signed === true : null;
        entries.push({
          ...base,
          kind: "hazard",
          hazard,
          place,
          note: str(data.note),
          since: wet ? (str(data.since) ?? base.at) : null,
          signed,
          signedAt: signed ? (str(data.signedAt) ?? base.at) : null,
        });
      }
    } else if (line.kind === "sign_placed") {
      const target = str(data.target);
      if (target) entries.push({ ...base, kind: "sign", target, place: null });
    } else if (line.kind === "acknowledged") {
      const target = str(data.target);
      const hazard = data.hazard === "wet" || data.hazard === "person" ? data.hazard : null;
      if (target && hazard) entries.push({ ...base, kind: "ack", target, hazard, place: str(data.place), robotAt: str(data.robotAt) });
    } else if (line.kind === "note") {
      const text = str(data.text);
      if (text) entries.push({ ...base, kind: "note", text });
    }
  }
  const marked = entries.map((entry) => (retracted.has(entry.id) ? { ...entry, retracted: true } : entry));
  // A sign put out later (and not taken back) marks its wet floor signed, at the sign's clock.
  const signs = new Map<string, Base>();
  for (const entry of marked) if (entry.kind === "sign" && !entry.retracted && !signs.has(entry.target)) signs.set(entry.target, entry);
  const places = new Map<string, string>();
  for (const entry of marked) if (entry.kind === "hazard") places.set(entry.id, entry.place);
  return marked.map((entry) => {
    if (entry.kind === "sign") return { ...entry, place: places.get(entry.target) ?? null };
    if (entry.kind !== "hazard" || entry.signed !== false) return entry;
    const sign = signs.get(entry.id);
    return sign ? { ...entry, signed: true, signedAt: sign.at } : entry;
  });
}

export type StaffRoom = Extract<StaffEntry, { kind: "room" }>;
export type StaffHazard = Extract<StaffEntry, { kind: "hazard" }>;
export type StaffNote = Extract<StaffEntry, { kind: "note" }>;
export type StaffSign = Extract<StaffEntry, { kind: "sign" }>;
export type StaffAck = Extract<StaffEntry, { kind: "ack" }>;

const active = (entries: readonly StaffEntry[]) => entries.filter((entry) => !entry.retracted);

/** The clerk's last word on each room she logged (corrections applied). */
export function staffRooms(entries: readonly StaffEntry[]): Map<string, StaffRoom> {
  const rooms = new Map<string, StaffRoom>();
  for (const entry of active(entries)) if (entry.kind === "room") rooms.set(entry.room, entry);
  return rooms;
}

export function staffHazards(entries: readonly StaffEntry[]): StaffHazard[] {
  return active(entries).filter((entry): entry is StaffHazard => entry.kind === "hazard");
}

export function staffNotes(entries: readonly StaffEntry[]): StaffNote[] {
  return active(entries).filter((entry): entry is StaffNote => entry.kind === "note");
}

/** The robot hazards she acknowledged, by the hazard's key: the first acknowledgement in force for each. */
export function staffAcks(entries: readonly StaffEntry[]): Map<string, StaffAck> {
  const acks = new Map<string, StaffAck>();
  for (const entry of active(entries)) if (entry.kind === "ack" && !acks.has(entry.target)) acks.set(entry.target, entry);
  return acks;
}

const hm = (clock: string) => clock.slice(0, 5);

/**
 * A wet floor's sign in the handover's words: "skilt satt ut 02:16" · "uten skilt siden 02:15" ("skilt
 * satt ut" / "uten skilt" when the clock was typed by day). Null for a door or a person.
 */
export function signPhrase(hazard: StaffHazard): string | null {
  if (hazard.hazard !== "wet") return null;
  if (hazard.signed) return inNightHours(hazard.signedAt) ? `skilt satt ut ${hm(hazard.signedAt)}` : "skilt satt ut";
  return inNightHours(hazard.since) ? `uten skilt siden ${hm(hazard.since)}` : "uten skilt";
}

const STATUS_WORD: Record<StaffRoomStatus, string> = { klar: "tomt og ryddig", opptatt: "ikke tomt", ma_vaskes: "trenger vask" };
const HAZARD_WORD: Record<HazardKind, string> = { wet: "Vått gulv", door: "Dør", person: "Person" };

const DEFINITE: Record<string, string> = { lobby: "lobbyen", "front-desk": "resepsjonen", "lobby-bar": "lobbybaren", "staff-room": "personalrommet", storage: "lageret", laundry: "vaskeriet", "kitchen-pass": "kjøkkenluka" };

/** "i korridor 2B" · "i lobbyen" · "ved heisen, 1. etasje" · "på rom 213": a place inside a sentence. */
export function placePhrase(place: string): string {
  if (DEFINITE[place]) return `i ${DEFINITE[place]}`;
  const floorPlace = /^(elevator|stairwell)-(\d)$/.exec(place);
  if (floorPlace) return floorPlace[1] === "elevator" ? `ved heisen, ${floorPlace[2]}. etasje` : `i trappen, ${floorPlace[2]}. etasje`;
  const label = placeLabel(place);
  const lower = label.charAt(0).toLowerCase() + label.slice(1);
  return place.startsWith("room-") ? `på ${lower}` : `i ${lower}`;
}

const ROBOT_HAZARD_WORD: Record<StaffAck["hazard"], string> = { wet: "vått gulv", person: "en person ved dørene" };

/**
 * "Rom 213: tomt og ryddig" · "Vått gulv i lobbyen: Ved inngangen, etter regnet." · "Skilt satt ut i
 * lobbyen" · "Kvitterte robotens melding: vått gulv i korridor 2B" · the note itself.
 */
export function entryText(entry: StaffEntry): string {
  if (entry.kind === "room") return `Rom ${entry.room.replace(/^room-/, "")}: ${STATUS_WORD[entry.status]}`;
  if (entry.kind === "note") return entry.text;
  if (entry.kind === "sign") return entry.place ? `Skilt satt ut ${placePhrase(entry.place)}` : "Skilt satt ut";
  if (entry.kind === "ack") return `Kvitterte robotens melding: ${ROBOT_HAZARD_WORD[entry.hazard]}${entry.place ? ` ${placePhrase(entry.place)}` : ""}`;
  return `${HAZARD_WORD[entry.hazard]} ${placePhrase(entry.place)}${entry.note ? `: ${entry.note}` : ""}`;
}

/** The status word on its own ("tomt og ryddig"), for the room's line on Overlevering. */
export function statusWord(status: StaffRoomStatus): string {
  return STATUS_WORD[status];
}
