import { type RunLine, parseRunLog } from "@/features/nightshift/runlog";
import type { PmsRoom } from "@/features/rooms/pms";

/**
 * The door lock and the energy slot as a run-log producer (jury round 5): the lock vendor's
 * room-management system gives Fettero ONE derived signal per room at 06:00, never who and never when.
 * Staff and master cards are filtered out at the source; no card id, no name, no entry list and no
 * guest's clock ever reaches the app (docs/PRIVACY.md). A `room_signal` decision per room
 * (docs/runlog.schema.json):
 *
 *   {"v":1,"type":"decision","kind":"room_signal","data":{"room":"room-213","signal":"no_card","since":null,"source":"door_lock"}}
 *   {"v":1,"type":"decision","kind":"room_signal","data":{"room":"room-210","signal":"card_in","source":"door_lock"}}
 *
 * - `no_card`: no guest card used at the door and none in the energy slot in the window (`since` null:
 *   the whole window from 18:00, the only clock the feed carries).
 * - `card_in`: a guest card is in the energy slot, a yes with no clock (round 6, legal review: data
 *   minimisation, Art. 5(1)(c) and 25). A time a feed sends anyway is dropped on read.
 *
 * Read as evidence, never as a sale: a booked room with no card is a room worth a look, and only a person
 * (the night clerk, then reception) turns it into a room to sell. Pure; no I/O.
 */

/** The window the signal covers: a guest card used since 18:00, yes or no (the law juror, round 4). */
export const SIGNAL_WINDOW_FROM = "18:00";

/**
 * TODO(phase-3): the lock vendor's feed (ASSA ABLOY Vingcard/Visionline, Salto, dormakaba). Test data:
 * a sample night for the demo hotel, written by the team in the run-log format, so the handover reads it
 * the way it will read the real feed. True until a hotel's lock system is connected.
 */
export const DOOR_LOCK_IS_TEST_DATA = true;
export const DOOR_LOCK_TEST_LABEL = "Testdata: dørlåsens signal er skrevet av teamet";

const card = (room: number) => `{"v":1,"type":"decision","kind":"room_signal","data":{"room":"room-${room}","signal":"card_in","source":"door_lock"}}`;
const none = (room: number) => `{"v":1,"type":"decision","kind":"room_signal","data":{"room":"room-${room}","signal":"no_card","since":null,"source":"door_lock"}}`;

/** The sample feed at 06:00, one line per room of the demo hotel, in the run-log format (JSONL). */
export const DOOR_LOCK_SAMPLE = [
  card(131),
  none(132),
  card(133),
  card(134),
  card(135),
  card(136),
  none(137),
  card(138),
  card(201),
  card(202),
  card(203),
  card(204),
  card(205),
  card(206),
  card(207),
  card(208),
  card(209),
  card(210),
  card(211),
  card(212),
  none(213),
  card(214),
  card(301),
  card(302),
  card(303),
  card(304),
  card(305),
  card(306),
  card(307),
  card(308),
  card(309),
  card(310),
  card(311),
  none(312),
  card(313),
  none(314),
].join("\n");

/** The sample feed's lines (parsed like any run log; a line the app can't read is dropped). */
export function doorLockLines(text: string = DOOR_LOCK_SAMPLE): RunLine[] {
  return parseRunLog(text).lines;
}

export type DoorSignal = {
  room: string;
  signal: "no_card" | "card_in";
  /** `no_card` only: HH:MM:SS, or null for the whole window from 18:00. Always null on `card_in`: a yes with no clock. */
  since: string | null;
};

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/** The last signal per room from the door lock's lines (other producers' lines are ignored). */
export function doorLockSignals(lines: readonly RunLine[]): Map<string, DoorSignal> {
  const signals = new Map<string, DoorSignal>();
  for (const line of lines) {
    if (line.type !== "decision" || line.kind !== "room_signal") continue;
    const data = line.data ?? {};
    if (data.source !== "door_lock") continue;
    const room = str(data.room);
    const signal = data.signal === "no_card" || data.signal === "card_in" ? data.signal : null;
    if (!room?.startsWith("room-") || !signal) continue;
    // A card in the slot is a yes, never a time a guest came in (a feed that sends one anyway loses it here).
    signals.set(room, { room, signal, since: signal === "card_in" ? null : str(data.since) });
  }
  return signals;
}

const hhmm = (clock: string) => clock.slice(0, 5);

/** "ingen kort i energibryteren siden kl. 18:00" (the window, not a guest's time) · "kort i energibryteren" (a yes, no clock). */
export function doorSignalText(signal: DoorSignal): string {
  if (signal.signal === "card_in") return "kort i energibryteren";
  return `ingen kort i energibryteren siden kl. ${signal.since ? hhmm(signal.since) : SIGNAL_WINDOW_FROM}`;
}

/**
 * Rooms where the door lock and the booking system disagree, the ones a night clerk looks at first:
 * - `empty`: the system holds the room tonight (a guest in house or due out) and no guest card was used;
 * - `unbooked`: the system has the room free and a guest card is in the energy slot.
 * Sorted by room number.
 */
export type DoorFlag = { room: string; kind: "empty" | "unbooked"; signal: DoorSignal; guest: string | null; departure: string | null };

export function doorLockFlags(signals: ReadonlyMap<string, DoorSignal>, pms: ReadonlyMap<string, PmsRoom>): DoorFlag[] {
  const flags: DoorFlag[] = [];
  for (const signal of signals.values()) {
    const booked = pms.get(signal.room);
    if (booked && signal.signal === "no_card") flags.push({ room: signal.room, kind: "empty", signal, guest: booked.guest, departure: booked.departure });
    else if (!booked && signal.signal === "card_in") flags.push({ room: signal.room, kind: "unbooked", signal, guest: null, departure: null });
  }
  return flags.sort((a, b) => a.room.localeCompare(b.room, "nb", { numeric: true }));
}
