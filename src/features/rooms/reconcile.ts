import type { RunLine } from "@/features/nightshift/runlog";
import { createLocalStore, recordOf } from "@/features/modules/localStore";
import type { PmsRoom } from "./pms";

/**
 * The robot's room checks against the booking system (hotels call these room discrepancies). Two kinds
 * matter in the morning:
 * - **Kan selges**: the system says occupied, the robot's room check found the room empty and tidy
 *   (a guest who left without checking out). The room can be sold again today.
 * - **Gjest uten booking**: the system says vacant, the robot met a guest (a knock answered) or a
 *   Do-Not-Disturb sign. Reception checks the registration.
 * Read from the run log's `room_status` decisions (docs/ARCHITECTURE.md § 4.3), the last one per room.
 * Pure: no clock, no I/O.
 */

export type RoomCheck = {
  room: string;
  status: string;
  /** room_check · knock · door_sign. */
  source: string | null;
  /** The shift clock when the robot decided, HH:MM:SS. */
  at: string | null;
  /** What the robot saw, as the server described it (English). */
  note: string | null;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/** The robot's last word on every room it looked at tonight. */
export function robotRoomChecks(lines: readonly RunLine[]): Map<string, RoomCheck> {
  const checks = new Map<string, RoomCheck>();
  let clock: string | null = null;
  for (const line of lines) {
    if ((line.type === "call" || line.type === "state") && line.clock) clock = line.clock;
    if (line.type !== "decision" || line.kind !== "room_status") continue;
    const data = line.data as Record<string, unknown> | undefined;
    const room = text(data?.room);
    const status = text(data?.status);
    if (!room || !status) continue;
    checks.set(room, { room, status, source: text(data?.source), at: clock, note: text(data?.note) });
  }
  return checks;
}

/**
 * A check before this hour does not prove a room empty: guests are out for dinner at 22:40. The night
 * runs 22:00 to 06:00, so "after 01:00" is a clock from 01:00 up to noon.
 */
export const EMPTY_PROOF_FROM_HOUR = 1;

function lateEnough(at: string | null): boolean {
  if (!at) return false;
  const hour = Number(at.slice(0, 2));
  return Number.isFinite(hour) && hour >= EMPTY_PROOF_FROM_HOUR && hour < 12;
}

export type Sellable = { room: string; guest: string | null; at: string | null };
export type GuestFound = { room: string; at: string | null; source: string | null; who: string | null };

export type Reconciliation = {
  /** Rooms the robot gave a status tonight. */
  checked: number;
  /** Checked rooms where the robot and the booking system agree. */
  agree: number;
  /** System: occupied. Robot (room check after 01:00): empty and tidy. */
  sellable: Sellable[];
  /** System: vacant. Robot: a guest answered, or a Do-Not-Disturb sign. */
  guestFound: GuestFound[];
  /** Empty-and-tidy checks before 01:00 on rooms the system has as occupied: not counted. */
  tooEarly: Sellable[];
};

/** "Ms Bakke opens the door of room-328." → "Ms Bakke". */
export function personAtDoor(note: string | null): string | null {
  const match = note ? /^(.{2,40}?) opens the door/.exec(note) : null;
  return match ? match[1] : null;
}

const byRoom = <T extends { room: string }>(a: T, b: T) => a.room.localeCompare(b.room, "nb", { numeric: true });

export function reconcileRooms(checks: ReadonlyMap<string, RoomCheck>, pms: ReadonlyMap<string, PmsRoom>): Reconciliation {
  const sellable: Sellable[] = [];
  const guestFound: GuestFound[] = [];
  const tooEarly: Sellable[] = [];
  for (const check of checks.values()) {
    const booked = pms.get(check.room);
    if (booked && check.status === "klar" && check.source === "room_check") {
      const row = { room: check.room, guest: booked.guest, at: check.at };
      (lateEnough(check.at) ? sellable : tooEarly).push(row);
    } else if (!booked && (check.status === "opptatt" || check.status === "ikke_forstyrr")) {
      guestFound.push({ room: check.room, at: check.at, source: check.source, who: personAtDoor(check.note) });
    }
  }
  return {
    checked: checks.size,
    agree: checks.size - sellable.length - guestFound.length - tooEarly.length,
    sellable: sellable.sort(byRoom),
    guestFound: guestFound.sort(byRoom),
    tooEarly: tooEarly.sort(byRoom),
  };
}

// ---------------------------------------------------------------------------------------------
// What staff did about each one today: released for sale, or a task for reception.

export type RoomCheckMark = {
  action: "released" | "task";
  /** Wall clock HH:MM when it was marked. */
  at: string;
  /** Who marked it (the logged-in name), when known. */
  by: string | null;
};

/** Marks per day (YYYY-MM-DD, Oslo), then per room: tomorrow starts clean. */
export type RoomCheckMarks = Record<string, Record<string, RoomCheckMark>>;

const isMark = (value: unknown): value is RoomCheckMark => {
  if (!value || typeof value !== "object") return false;
  const mark = value as Record<string, unknown>;
  return (mark.action === "released" || mark.action === "task") && typeof mark.at === "string" && (mark.by === null || typeof mark.by === "string");
};

const isDay = (value: unknown): value is Record<string, RoomCheckMark> => !!value && typeof value === "object" && !Array.isArray(value);

export const ROOM_CHECK_MARKS = createLocalStore<RoomCheckMarks>(
  "lobby:room-check-marks",
  (raw) => Object.fromEntries(Object.entries(recordOf(raw, isDay)).map(([day, marks]) => [day, recordOf(marks, isMark)])),
  {},
);

export function markRoom(day: string, room: string, mark: RoomCheckMark | null) {
  ROOM_CHECK_MARKS.set((current) => {
    const today = { ...(current[day] ?? {}) };
    if (mark) today[room] = mark;
    else delete today[room];
    return { ...current, [day]: today };
  });
}
