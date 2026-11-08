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
 * - **Holdt tilbake**: the system says occupied and the room check found it empty, but the robot put
 *   something in the room tonight that says it is taken: an arriving guest's bags ("the guest checks
 *   in later"), or anything delivered after the check. Never offered for sale (jury round 2, 209: the
 *   robot carried a late arrival's bags in at 01:29, 04:35 and 05:16 while the booking has another
 *   guest there until tomorrow, a double allocation).
 * Read from the run log's `room_status` decisions (docs/ARCHITECTURE.md § 4.3), the last one per room,
 * and its `place` calls. Pure: no clock, no I/O.
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

export type Delivery = {
  room: string;
  /** The shift clock of the `place` call, HH:MM:SS. */
  at: string | null;
  item: string;
  /** An arriving guest's bags (a luggage item, or a `bags` task: "… the guest checks in later"). */
  arrival: boolean;
};

/** What the robot put inside each room tonight (`place` calls that worked), oldest first. */
export function robotDeliveries(lines: readonly RunLine[]): Map<string, Delivery[]> {
  const deliveries = new Map<string, Delivery[]>();
  let task: string | null = null;
  for (const line of lines) {
    if (line.type === "decision" && line.kind === "task_start") task = text((line.data as Record<string, unknown> | undefined)?.kind);
    if (line.type !== "call" || line.cmd !== "place" || !line.ok) continue;
    const args = line.args as Record<string, unknown> | undefined;
    const room = text(args?.where);
    const item = text(args?.item);
    if (!room?.startsWith("room-") || !item) continue;
    const list = deliveries.get(room) ?? [];
    list.push({ room, at: line.clock ?? null, item, arrival: /^luggage/i.test(item) || task === "bags" });
    deliveries.set(room, list);
  }
  return deliveries;
}

/** Minutes into the night (22:00 is 0, 05:59 is 479), so a check and a delivery compare across midnight. */
function nightMinute(clock: string | null): number {
  if (!clock) return -1;
  const hour = Number(clock.slice(0, 2));
  const minute = Number(clock.slice(3, 5));
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return -1;
  return (((hour - 22 + 24) % 24) * 60 + minute) + Number(clock.slice(6, 8) || 0) / 60;
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

export type Sellable = {
  room: string;
  guest: string | null;
  at: string | null;
  /** The booking's departure (YYYY-MM-DD): today is a guest due out who never checked out. */
  departure: string | null;
};
export type GuestFound = { room: string; at: string | null; source: string | null; who: string | null };
export type Held = Sellable & {
  /** When the robot last put something in the room, HH:MM:SS. */
  deliveredAt: string | null;
  /** Every delivery that holds the room, oldest first. */
  deliveries: Delivery[];
  /** An arriving guest's bags among them: the room is promised to today's arrival. */
  arrival: boolean;
};

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
  /** System: occupied. Robot: empty and tidy, but it delivered into the room tonight (bags for an arrival, or after the check). */
  held: Held[];
};

/** "Ms Bakke opens the door of room-328." → "Ms Bakke". */
export function personAtDoor(note: string | null): string | null {
  const match = note ? /^(.{2,40}?) opens the door/.exec(note) : null;
  return match ? match[1] : null;
}

const byRoom = <T extends { room: string }>(a: T, b: T) => a.room.localeCompare(b.room, "nb", { numeric: true });

/**
 * What holds a room the check found empty: an arriving guest's bags put in tonight (before or after
 * the check), or anything the robot delivered after the check. Empty when nothing does.
 */
function holding(deliveries: readonly Delivery[] | undefined, checkedAt: string | null): Delivery[] {
  const after = nightMinute(checkedAt);
  return (deliveries ?? []).filter((delivery) => delivery.arrival || nightMinute(delivery.at) > after);
}

export function reconcileRooms(
  checks: ReadonlyMap<string, RoomCheck>,
  pms: ReadonlyMap<string, PmsRoom>,
  deliveries: ReadonlyMap<string, readonly Delivery[]> = new Map(),
): Reconciliation {
  const sellable: Sellable[] = [];
  const guestFound: GuestFound[] = [];
  const tooEarly: Sellable[] = [];
  const held: Held[] = [];
  for (const check of checks.values()) {
    const booked = pms.get(check.room);
    if (booked && check.status === "klar" && check.source === "room_check") {
      const row: Sellable = { room: check.room, guest: booked.guest, at: check.at, departure: booked.departure };
      const holds = holding(deliveries.get(check.room), check.at);
      if (holds.length > 0) held.push({ ...row, deliveredAt: holds.at(-1)?.at ?? null, deliveries: holds, arrival: holds.some((delivery) => delivery.arrival) });
      else (lateEnough(check.at) ? sellable : tooEarly).push(row);
    } else if (!booked && (check.status === "opptatt" || check.status === "ikke_forstyrr")) {
      guestFound.push({ room: check.room, at: check.at, source: check.source, who: personAtDoor(check.note) });
    }
  }
  return {
    checked: checks.size,
    agree: checks.size - sellable.length - guestFound.length - tooEarly.length - held.length,
    sellable: sellable.sort(byRoom),
    guestFound: guestFound.sort(byRoom),
    tooEarly: tooEarly.sort(byRoom),
    held: held.sort(byRoom),
  };
}

/** The room check of a whole night: the robot's checks and deliveries against the booking system. */
export function reconcileNight(lines: readonly RunLine[], pms: ReadonlyMap<string, PmsRoom>): Reconciliation {
  return reconcileRooms(robotRoomChecks(lines), pms, robotDeliveries(lines));
}

// ---------------------------------------------------------------------------------------------
// What staff did about each one today: released for sale, or a task for reception.

export type RoomCheckMark = {
  /**
   * confirmed: reception confirmed the guest has left (step 1 of selling a room; never one tap).
   * released: marked free to sell (step 2). task: a task for reception (a guest without a booking).
   */
  action: "released" | "task" | "confirmed";
  /** Wall clock HH:MM when it was marked. */
  at: string;
  /** Who marked it (the logged-in name), when known. */
  by: string | null;
  /** When it was marked, ISO (src/ui/stamp.ts), for "Siri Haugen · nå" (older marks have only `at`). */
  stamp?: string;
  /** On a released room: the confirmation it was released on, so Angre steps back to it. */
  confirmed?: { at: string; by: string | null; stamp?: string };
};

/** Marks per day (YYYY-MM-DD, Oslo), then per room: tomorrow starts clean. */
export type RoomCheckMarks = Record<string, Record<string, RoomCheckMark>>;

const ACTIONS = new Set(["released", "task", "confirmed"]);

const isStamp = (value: unknown): boolean => {
  if (!value || typeof value !== "object") return false;
  const stamp = value as Record<string, unknown>;
  return typeof stamp.at === "string" && (stamp.by === null || typeof stamp.by === "string") && (stamp.stamp === undefined || typeof stamp.stamp === "string");
};

const isMark = (value: unknown): value is RoomCheckMark => {
  if (!isStamp(value)) return false;
  const mark = value as Record<string, unknown>;
  return ACTIONS.has(String(mark.action)) && (mark.confirmed === undefined || isStamp(mark.confirmed));
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
