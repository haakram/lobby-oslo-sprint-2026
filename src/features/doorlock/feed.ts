import { type RunLine, parseRunLog } from "@/features/nightshift/runlog";
import type { PmsRoom } from "@/features/rooms/pms";

/**
 * The door lock and the energy slot as a run-log producer (jury round 5, the law juror/the product juror/the founder juror): the
 * lock vendor's room-management system gives Fettero ONE derived signal per room at 06:00, never who.
 * Staff and master cards are filtered out at the source; no card id, no name, no entry list ever
 * reaches the app (docs/PRIVACY.md). A `room_signal` decision per room (docs/runlog.schema.json):
 *
 *   {"v":1,"type":"decision","kind":"room_signal","data":{"room":"room-213","signal":"no_card","since":"22:10:00","source":"door_lock"}}
 *
 * - `no_card`: no guest card used at the door and none in the energy slot since `since` (null: not in
 *   the whole window from 18:00).
 * - `card_in`: a guest card has been in the energy slot since `since`.
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

const card = (room: number, since: string) =>
  `{"v":1,"type":"decision","kind":"room_signal","data":{"room":"room-${room}","signal":"card_in","since":"${since}:00","source":"door_lock"}}`;
const none = (room: number, since: string | null) =>
  `{"v":1,"type":"decision","kind":"room_signal","data":{"room":"room-${room}","signal":"no_card","since":${since ? `"${since}:00"` : "null"},"source":"door_lock"}}`;

/** The sample feed at 06:00, one line per room of the demo hotel, in the run-log format (JSONL). */
export const DOOR_LOCK_SAMPLE = [
  card(131, "22:40"),
  none(132, null),
  card(133, "21:15"),
  card(134, "20:05"),
  card(135, "23:30"),
  card(136, "22:55"),
  none(137, null),
  card(138, "00:20"),
  card(201, "21:50"),
  card(202, "23:10"),
  card(203, "20:40"),
  card(204, "22:20"),
  card(205, "23:45"),
  card(206, "21:30"),
  card(207, "22:05"),
  card(208, "19:50"),
  card(209, "23:58"),
  card(210, "23:05"),
  card(211, "21:00"),
  card(212, "00:35"),
  none(213, "22:10"),
  card(214, "22:45"),
  card(301, "20:30"),
  card(302, "23:20"),
  card(303, "21:40"),
  card(304, "00:05"),
  card(305, "22:15"),
  card(306, "23:00"),
  card(307, "21:25"),
  card(308, "22:50"),
  card(309, "19:30"),
  card(310, "00:50"),
  card(311, "23:35"),
  none(312, null),
  card(313, "22:30"),
  none(314, null),
].join("\n");

/** The sample feed's lines (parsed like any run log; a line the app can't read is dropped). */
export function doorLockLines(text: string = DOOR_LOCK_SAMPLE): RunLine[] {
  return parseRunLog(text).lines;
}

export type DoorSignal = {
  room: string;
  signal: "no_card" | "card_in";
  /** HH:MM:SS, or null: the whole window from 18:00. */
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
    signals.set(room, { room, signal, since: str(data.since) });
  }
  return signals;
}

const hhmm = (clock: string) => clock.slice(0, 5);

/** "ingen kort i energibryteren siden 22:10" · "ingen kort siden kl. 18:00" · "kort i energibryteren siden 23:05". */
export function doorSignalText(signal: DoorSignal): string {
  if (signal.signal === "card_in") return `kort i energibryteren siden ${signal.since ? hhmm(signal.since) : SIGNAL_WINDOW_FROM}`;
  return signal.since ? `ingen kort i energibryteren siden ${hhmm(signal.since)}` : `ingen kort siden kl. ${SIGNAL_WINDOW_FROM}`;
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
