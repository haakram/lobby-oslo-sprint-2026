import { placeLabel } from "@/features/dashboard/labels";
import type { RunLine } from "@/features/nightshift/runlog";
import type { HazardKind, StaffRoomStatus } from "./entries";

/**
 * Reads the night clerk's lines back (entries.ts writes them): what she logged, in order, with the
 * corrections applied. Lines from other producers are ignored. Pure.
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
  | (Base & { kind: "hazard"; hazard: HazardKind; place: string; note: string | null })
  | (Base & { kind: "note"; text: string });

const STATUSES = new Set<string>(["klar", "opptatt", "ma_vaskes"]);

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
      if (place && hazard) entries.push({ ...base, kind: "hazard", hazard, place, note: str(data.note) });
    } else if (line.kind === "note") {
      const text = str(data.text);
      if (text) entries.push({ ...base, kind: "note", text });
    }
  }
  return entries.map((entry) => (retracted.has(entry.id) ? { ...entry, retracted: true } : entry));
}

export type StaffRoom = Extract<StaffEntry, { kind: "room" }>;
export type StaffHazard = Extract<StaffEntry, { kind: "hazard" }>;
export type StaffNote = Extract<StaffEntry, { kind: "note" }>;

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

/** "Rom 213: tomt og ryddig" · "Vått gulv i lobbyen: Ved inngangen, etter regnet." · the note itself. */
export function entryText(entry: StaffEntry): string {
  if (entry.kind === "room") return `Rom ${entry.room.replace(/^room-/, "")}: ${STATUS_WORD[entry.status]}`;
  if (entry.kind === "note") return entry.text;
  return `${HAZARD_WORD[entry.hazard]} ${placePhrase(entry.place)}${entry.note ? `: ${entry.note}` : ""}`;
}

/** The status word on its own ("tomt og ryddig"), for the room's line on Overlevering. */
export function statusWord(status: StaffRoomStatus): string {
  return STATUS_WORD[status];
}
