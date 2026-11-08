import { createLocalStore, recordOf } from "@/features/modules/localStore";
import { type RunLine, parseRunValues } from "@/features/nightshift/runlog";
import { addDays, osloToday } from "@/features/reception/dates";
import { hasExpiredDays, keepRecentDays } from "./retention";

/**
 * The night clerk as a run-log producer (jury round 5, the founder juror/the product juror/the marketing juror: "hotel number one needs no
 * robot", so the night staff's own input must exist). Every tap on Nattevaktens logg becomes the same
 * run-log decision the robot writes (docs/runlog.schema.json), with `source: "staff"` and the clerk's
 * name, so the handover reads a night with no robot exactly as it reads one with:
 *
 * - a room: `room_status` {room, status: klar | opptatt | ma_vaskes, source: "staff", by, at}
 * - a safety item: `hazard` {place, hazard: "wet", since, signed, signedAt} for a wet floor (round 6,
 *   legal review: "Skilt satt ut?" is a required yes or no, so the record shows care when there was
 *   care), `security_event` {place, event: door_open | unknown_person} for a door or a person
 * - a sign put out later on a wet floor she reported without one: `sign_placed` {target}
 * - a robot hazard she saw (round 6, the robot's hazards reach her as they happen): `acknowledged`
 *   {target: robotHazardKey, hazard, place, robotAt}
 * - a note: `note` {text}
 * - a correction: `retracted` {id}: Angre adds a line, it never deletes one, so the log stays a record.
 *
 * Every line carries `id`, `by`, `at` (Oslo clock, HH:MM:SS) and `stamp` (ISO). Stored on this device for
 * the pilot, RETENTION_DAYS (30) per handover day, pruned on load (TODO(phase-3): a server store, so the
 * morning manager's PC sees what the clerk typed on her phone). Pure builders; the store is the shared
 * localStorage helper.
 */

export type StaffRoomStatus = "klar" | "opptatt" | "ma_vaskes";
export type HazardKind = "wet" | "door" | "person";

/** What the clerk taps, in her words; `hint` is the one line under the button. */
export const ROOM_CHOICES: readonly { status: StaffRoomStatus; word: string; hint: string }[] = [
  { status: "klar", word: "Tom og ryddig", hint: "Ingen gjest, ingen bagasje" },
  { status: "opptatt", word: "Ikke tom", hint: "Gjest eller bagasje i rommet" },
  { status: "ma_vaskes", word: "Trenger vask", hint: "Tomt, men ikke klart" },
];

export const HAZARD_CHOICES: readonly { kind: HazardKind; word: string }[] = [
  { kind: "wet", word: "Vått gulv" },
  { kind: "door", word: "Dør" },
  { kind: "person", word: "Person" },
];

/** A note is a few lines for the morning, not a report. */
export const NOTE_MAX = 280;

/** From this hour the clerk's entries belong to the next morning's handover (the night shift starts at 22:00). */
export const NIGHT_ROLLOVER_HOUR = 21;

const OSLO = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });

/** "04:24:10", Oslo time. */
export function osloClock(now: Date): string {
  return OSLO.format(now);
}

/** The handover an entry belongs to (YYYY-MM-DD): today's, or from 21:00 tomorrow's. */
export function handoverDay(now: Date = new Date()): string {
  const today = osloToday(now);
  return Number(osloClock(now).slice(0, 2)) >= NIGHT_ROLLOVER_HOUR ? addDays(today, 1) : today;
}

type Who = { by: string; now: Date; id?: string };

let sequence = 0;
function makeId(now: Date): string {
  sequence = (sequence + 1) % 1000;
  return `s-${now.getTime().toString(36)}-${sequence}`;
}

function line(kind: string, data: Record<string, unknown>, { by, now, id }: Who): RunLine {
  return {
    v: 1,
    t: Math.round(now.getTime() / 1000),
    type: "decision",
    kind,
    data: { id: id ?? makeId(now), ...data, source: "staff", by, at: osloClock(now), stamp: now.toISOString() },
  };
}

export function roomLine(room: string, status: StaffRoomStatus, who: Who): RunLine {
  return line("room_status", { room, status }, who);
}

/**
 * A safety item. A wet floor carries the clerk's answer to "Skilt satt ut?": `signed` true sets
 * `signedAt` to the moment she reported it; false is a wet floor without a sign since then.
 */
export function hazardLine(kind: HazardKind, place: string, note: string, who: Who, signed = false): RunLine {
  const extra = note.trim() ? { note: note.trim() } : {};
  if (kind === "wet") {
    const at = osloClock(who.now);
    return line("hazard", { place, hazard: "wet", since: at, signed, signedAt: signed ? at : null, ...extra }, who);
  }
  return line("security_event", { place, event: kind === "door" ? "door_open" : "unknown_person", room: place.startsWith("room-") ? place : null, ...extra }, who);
}

export function noteLine(text: string, who: Who): RunLine {
  return line("note", { text: text.trim().slice(0, NOTE_MAX) }, who);
}

export function retractLine(target: string, who: Who): RunLine {
  return line("retracted", { target }, who);
}

/** The sign is out now on a wet floor she reported without one (`target`: that hazard line's id). */
export function signPlacedLine(target: string, who: Who): RunLine {
  return line("sign_placed", { target }, who);
}

/** She saw a robot hazard: who and when, under the hazard's key (robotHazards.ts `robotHazardKey`). */
export function acknowledgeLine(hazard: { key: string; hazard: "wet" | "person"; place: string | null; at: string | null }, who: Who): RunLine {
  return line("acknowledged", { target: hazard.key, hazard: hazard.hazard, place: hazard.place, robotAt: hazard.at }, who);
}

/** Lines per handover day (YYYY-MM-DD), oldest first. */
export type StaffLog = Record<string, unknown[]>;

export const STAFF_LOG = createLocalStore<StaffLog>(
  "lobby:nattevakt-logg",
  (raw) => recordOf(raw, (value): value is unknown[] => Array.isArray(value)),
  {},
);

export function appendStaffLine(day: string, entry: RunLine) {
  STAFF_LOG.set((current) => ({ ...keepRecentDays(current, day), [day]: [...(current[day] ?? []), entry] }));
}

/**
 * Retention as code: the handover days older than RETENTION_DAYS go from this device, run when a screen
 * that reads the log loads (and on every write). Writes only when something expired.
 */
export function pruneStaffLog(now: Date = new Date()) {
  const today = handoverDay(now);
  if (hasExpiredDays(STAFF_LOG.read(), today)) STAFF_LOG.set((current) => keepRecentDays(current, today));
}

/** The stored lines for one handover day that read as run-log v1 staff lines (anything else is dropped). */
export function storedStaffLines(log: StaffLog, day: string): RunLine[] {
  return parseRunValues(log[day] ?? []).lines.filter((entry) => entry.type === "decision" && entry.data?.source === "staff");
}

const sample = (at: string, kind: string, data: Record<string, unknown>): RunLine => ({
  v: 1,
  type: "decision",
  kind,
  data: { id: `sample-${at.replace(/:/g, "")}`, ...data, source: "staff", by: "Kjersti Lund", at, sample: true },
});

/**
 * TODO(phase-3): off once a hotel's night clerk uses the screen. Test data: one night clerk's sample
 * night, so the robot-free handover can be shown without typing on stage. It follows the door lock's
 * sample: 213 flagged (no guest card all evening), checked and found empty; a card in 210, which the
 * booking system has free; a wet floor at the entrance, the sign out a minute later. No robot hazard is
 * acknowledged in it: the robot night's own record ("nobody was told") stays as it was. Real entries on
 * this device come on top of it.
 */
export const CLERK_SAMPLE_IS_ON = true;

export const CLERK_SAMPLE: readonly RunLine[] = [
  sample("23:24:00", "room_status", { room: "room-210", status: "opptatt" }),
  sample("02:15:00", "hazard", { place: "lobby", hazard: "wet", since: "02:15:00", signed: true, signedAt: "02:16:00", note: "Ved inngangen, etter regnet." }),
  sample("04:24:00", "room_status", { room: "room-213", status: "klar" }),
  sample("05:48:00", "note", {
    text: "Rolig natt. Støy fra rom 210 rundt 23:20; det var en gjest der, men rommet står ledig i systemet. Radiatoren på 134 bør sees på tidlig; familien fikk et ekstra pledd.",
  }),
];
