import { type SelfContradiction, selfContradictions } from "@/features/nightshift/conduct";
import type { RunLine } from "@/features/nightshift/runlog";
import { createLocalStore, recordOf } from "@/features/modules/localStore";
import { osloToday } from "@/features/reception/dates";
import { keepRecentDays } from "@/features/staffinput/retention";
import type { PmsRoom } from "./pms";

/**
 * The robot's room checks against the booking system (hotels call these room discrepancies). The kinds
 * that matter in the morning:
 * - **Kan selges**: the system holds the room tonight (a guest due out before today whose check-out was
 *   never recorded, or a stay-over), and the robot's room check found it empty and tidy. Released, it
 *   is a room-night that would otherwise stand unsold.
 * - **Reiser i dag**: empty and tidy, but the guest is due out today: the room is already in tonight's
 *   inventory in every booking system (round 3, founders and domain review), so it is no extra sale, only
 *   an early clean and an early check-in.
 * - **Gjest uten booking**: the system says vacant, the robot met a guest (a knock answered) or a
 *   Do-Not-Disturb sign. Reception checks the registration.
 * - **Holdt tilbake**: the system says occupied and the room check found it empty, but the robot put
 *   something in the room tonight that says it is taken: an arriving guest's bags ("the guest checks
 *   in later"), or anything delivered after the check. Never offered for sale (round 2, 209: the
 *   robot carried a late arrival's bags in at 01:29, 04:35 and 05:16 while the booking has another
 *   guest there until tomorrow, a double allocation).
 * - **Flere ankomster**: the robot carried bags for two or more arrivals into one room tonight (round
 *   3, domain review: 212 got three, 304 two). Read from the robot's own log, no booking system needed.
 * - **Motsier seg selv**: the robot's room check reported the room empty and tidy after it had itself
 *   put something inside earlier that night (round 4, domain review: luggage-209 placed at 01:29, "Nobody
 *   is here. The room is tidy." at 03:47). The camera and the task log disagree, so the room is never
 *   offered, with or without a booking system. The rule is owner C's `selfContradictions`
 *   (nightshift/conduct.ts), the same one the judgement card's "8 av 9 holder mot egen logg" counts.
 * Read from the run log's `room_status` decisions (docs/ARCHITECTURE.md § 4.3), the last one per room,
 * and its `place` calls. Pure: no clock, no I/O (today is passed in).
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
  /** The request the robot was working on (one arrival per bags request), when the log names it. */
  request: string | null;
};

/** What the robot put inside each room tonight (`place` calls that worked), oldest first. */
export function robotDeliveries(lines: readonly RunLine[]): Map<string, Delivery[]> {
  const deliveries = new Map<string, Delivery[]>();
  let task: string | null = null;
  let request: string | null = null;
  for (const line of lines) {
    if (line.type === "decision" && line.kind === "task_start") {
      const data = line.data as Record<string, unknown> | undefined;
      task = text(data?.kind);
      request = text(data?.request);
    }
    if (line.type !== "call" || line.cmd !== "place" || !line.ok) continue;
    const args = line.args as Record<string, unknown> | undefined;
    const room = text(args?.where);
    const item = text(args?.item);
    if (!room?.startsWith("room-") || !item) continue;
    const list = deliveries.get(room) ?? [];
    list.push({ room, at: line.clock ?? null, item, arrival: /^luggage/i.test(item) || task === "bags", request });
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
  /**
   * The booking's departure (YYYY-MM-DD). Before today: the check-out was never recorded (the system
   * still holds the room). After today: a stay-over the desk must confirm gone.
   */
  departure: string | null;
};
export type GuestFound = { room: string; at: string | null; source: string | null; who: string | null };
/** The robot's own log contradicts its room check: it put something inside before it reported the room empty. */
export type Contradiction = {
  room: string;
  /** The room check's request (R-049), so a screen can say how it was counted. */
  request: string | null;
  /** When the room check said empty, HH:MM:SS. */
  checkedAt: string | null;
  /** The earliest delivery into the room before that check. */
  placedAt: string | null;
  item: string;
  /** It was an arriving guest's bags. */
  arrival: boolean;
};

export type Held = Sellable & {
  /** When the robot last put something in the room, HH:MM:SS. */
  deliveredAt: string | null;
  /** Every delivery that holds the room, oldest first. */
  deliveries: Delivery[];
  /** An arriving guest's bags among them: the room is promised to today's arrival. */
  arrival: boolean;
  /** How many arrivals' bags went in (distinct bags requests): 3 at 209 on the demo night. */
  arrivals: number;
  /** The room check said empty after the robot had already put something inside (209 at 01:29 / 03:47). */
  contradiction: Contradiction | null;
};
/** A room the robot carried bags into for two or more arrivals tonight: more guests than it holds. */
export type Crowded = {
  room: string;
  /** Distinct arrivals (bags requests). */
  arrivals: number;
  /** When each arrival's bags went in, HH:MM:SS, oldest first. */
  at: (string | null)[];
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
  /** System: due out today. Robot (after 01:00): empty and tidy. Already in tonight's inventory: no extra sale. */
  dueOut: Sellable[];
  /** Bags for two or more arrivals in one room (from the robot's log alone), rooms not already held. */
  crowded: Crowded[];
  /**
   * Every room whose room check said empty after the robot put something inside it earlier tonight,
   * booked or not (from the robot's log alone). A booked one is also in `held`, with the same contradiction.
   */
  contradicted: Contradiction[];
};

/** One per arrival: the bags requests (or, without one, the luggage items) that went into a room. */
function arrivalsOf(deliveries: readonly Delivery[]): Delivery[] {
  const seen = new Set<string>();
  return deliveries.filter((delivery) => {
    if (!delivery.arrival) return false;
    const key = delivery.request ?? delivery.item;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

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

/** Owner C's self-contradictions (nightshift/conduct.ts), keyed by room id: the last one per room, as the room's last check. */
function contradictionsByRoom(found: readonly SelfContradiction[]): Map<string, Contradiction> {
  const rooms = new Map<string, Contradiction>();
  for (const entry of found) {
    const first = entry.placed[0];
    if (!first) continue;
    const room = `room-${entry.room}`;
    rooms.set(room, { room, request: entry.request, checkedAt: entry.clock, placedAt: first.clock, item: first.item, arrival: /^luggage/i.test(first.item) });
  }
  return rooms;
}

/**
 * `today` (YYYY-MM-DD) splits a guest due out today (no extra sale) from a room the system holds
 * tonight; without it every empty-and-tidy booked room counts as one to sell.
 */
export function reconcileRooms(
  checks: ReadonlyMap<string, RoomCheck>,
  pms: ReadonlyMap<string, PmsRoom>,
  deliveries: ReadonlyMap<string, readonly Delivery[]> = new Map(),
  today?: string,
  /** The robot's room checks its own log contradicts (owner C's `selfContradictions`). */
  selfContradicted: readonly SelfContradiction[] = [],
): Reconciliation {
  const contradictions = contradictionsByRoom(selfContradicted);
  const sellable: Sellable[] = [];
  const guestFound: GuestFound[] = [];
  const tooEarly: Sellable[] = [];
  const held: Held[] = [];
  const dueOut: Sellable[] = [];
  const contradicted: Contradiction[] = [];
  for (const check of checks.values()) {
    // Only while the room's last word is still the contradicted "empty": a later check supersedes it.
    const contradiction = check.status === "klar" && check.source === "room_check" ? (contradictions.get(check.room) ?? null) : null;
    if (contradiction) contradicted.push(contradiction);
    const booked = pms.get(check.room);
    if (booked && check.status === "klar" && check.source === "room_check") {
      const row: Sellable = { room: check.room, guest: booked.guest, at: check.at, departure: booked.departure };
      const holds = holding(deliveries.get(check.room), check.at);
      if (holds.length > 0) {
        held.push({
          ...row,
          deliveredAt: holds.at(-1)?.at ?? null,
          deliveries: holds,
          arrival: holds.some((delivery) => delivery.arrival),
          arrivals: arrivalsOf(holds).length,
          contradiction,
        });
      } else if (!lateEnough(check.at)) tooEarly.push(row);
      else if (today !== undefined && booked.departure === today) dueOut.push(row);
      else sellable.push(row);
    } else if (!booked && (check.status === "opptatt" || check.status === "ikke_forstyrr")) {
      guestFound.push({ room: check.room, at: check.at, source: check.source, who: personAtDoor(check.note) });
    }
  }
  const heldRooms = new Set(held.map((row) => row.room));
  const crowded: Crowded[] = [];
  for (const [room, list] of deliveries) {
    const arrivals = arrivalsOf(list);
    if (arrivals.length >= 2 && !heldRooms.has(room)) crowded.push({ room, arrivals: arrivals.length, at: arrivals.map((delivery) => delivery.at) });
  }
  // A contradicted room the system has as free still disagrees with itself: it is not an agreement.
  const unbookedContradictions = contradicted.filter((row) => !heldRooms.has(row.room)).length;
  return {
    checked: checks.size,
    agree: checks.size - sellable.length - guestFound.length - tooEarly.length - held.length - dueOut.length - unbookedContradictions,
    sellable: sellable.sort(byRoom),
    guestFound: guestFound.sort(byRoom),
    tooEarly: tooEarly.sort(byRoom),
    held: held.sort(byRoom),
    dueOut: dueOut.sort(byRoom),
    crowded: crowded.sort(byRoom),
    contradicted: contradicted.sort(byRoom),
  };
}

/** The room check of a whole night: the robot's checks and deliveries against the booking system. */
export function reconcileNight(lines: readonly RunLine[], pms: ReadonlyMap<string, PmsRoom>, today?: string): Reconciliation {
  return reconcileRooms(robotRoomChecks(lines), pms, robotDeliveries(lines), today, selfContradictions(lines));
}

// ---------------------------------------------------------------------------------------------
// What staff did about each one today: released for sale, or a task for reception.

/** What reception checked before a room the robot found empty is sold (round 4, legal review): all three, each a tick. */
export const CONFIRM_CHECKS = [
  { id: "folio", label: "Folioen er gjort opp", short: "folio" },
  { id: "bagasje", label: "Ingen bagasje på rommet", short: "bagasje" },
  { id: "kort", label: "Nøkkelkortet er sperret", short: "kort" },
] as const;

export type ConfirmCheck = (typeof CONFIRM_CHECKS)[number]["id"];

/** Step 1's evidence: who at reception confirmed, and what they checked (stored with who recorded it and when). */
export type Confirmation = {
  at: string;
  /** Who recorded it (the logged-in name). */
  by: string | null;
  stamp?: string;
  /** The receptionist who confirmed (round 4: a name, not the person tapping). */
  receptionist?: string;
  /** What reception checked: every one of CONFIRM_CHECKS before step 2 opens. */
  checks?: ConfirmCheck[];
};

export type RoomCheckMark = {
  /**
   * confirmed: reception confirmed the guest has left (step 1 of selling a room; never one tap), with
   * the receptionist's name and the three checks. released: sent to reception to check the guest out in
   * the booking system (step 2): the pilot reads the PMS and never writes it, so the room reads "Venter
   * på PMS-en" until the booking system shows it free. task: a task for reception (a guest without a booking).
   */
  action: "released" | "task" | "confirmed";
  /** Wall clock HH:MM when it was marked. */
  at: string;
  /** Who marked it (the logged-in name), when known. */
  by: string | null;
  /** When it was marked, ISO (src/ui/stamp.ts), for "Siri Haugen · nå" (older marks have only `at`). */
  stamp?: string;
  /** Step 1 on a confirmed mark: the receptionist who confirmed. */
  receptionist?: string;
  /** Step 1 on a confirmed mark: what reception checked. */
  checks?: ConfirmCheck[];
  /** On a released room: the confirmation it was released on, so Angre steps back to it. */
  confirmed?: Confirmation;
};

const CHECK_IDS = new Set<string>(CONFIRM_CHECKS.map((check) => check.id));

/** Every one of the three checks is ticked. */
export function allChecked(checks: readonly string[] | undefined): boolean {
  return CONFIRM_CHECKS.every((check) => checks?.includes(check.id));
}

/** Marks per day (YYYY-MM-DD, Oslo), then per room: tomorrow starts clean. */
export type RoomCheckMarks = Record<string, Record<string, RoomCheckMark>>;

const ACTIONS = new Set(["released", "task", "confirmed"]);

const isStamp = (value: unknown): boolean => {
  if (!value || typeof value !== "object") return false;
  const stamp = value as Record<string, unknown>;
  return (
    typeof stamp.at === "string" &&
    (stamp.by === null || typeof stamp.by === "string") &&
    (stamp.stamp === undefined || typeof stamp.stamp === "string") &&
    (stamp.receptionist === undefined || typeof stamp.receptionist === "string") &&
    (stamp.checks === undefined || (Array.isArray(stamp.checks) && stamp.checks.every((check) => typeof check === "string" && CHECK_IDS.has(check))))
  );
};

const isMark = (value: unknown): value is RoomCheckMark => {
  if (!isStamp(value)) return false;
  const mark = value as Record<string, unknown>;
  return ACTIONS.has(String(mark.action)) && (mark.confirmed === undefined || isStamp(mark.confirmed));
};

const isDay = (value: unknown): value is Record<string, RoomCheckMark> => !!value && typeof value === "object" && !Array.isArray(value);

/**
 * Today's marks per day (YYYY-MM-DD). They name receptionists, so they are kept 30 days on this device,
 * pruned on load and on write (round 6, legal review: retention as code, the night clerk's RETENTION_DAYS).
 */
export const ROOM_CHECK_MARKS = createLocalStore<RoomCheckMarks>(
  "lobby:room-check-marks",
  (raw) => keepRecentDays(Object.fromEntries(Object.entries(recordOf(raw, isDay)).map(([day, marks]) => [day, recordOf(marks, isMark)])), osloToday()),
  {},
);

export function markRoom(day: string, room: string, mark: RoomCheckMark | null) {
  ROOM_CHECK_MARKS.set((current) => {
    const today = { ...(current[day] ?? {}) };
    if (mark) today[room] = mark;
    else delete today[room];
    return { ...keepRecentDays(current, day), [day]: today };
  });
}
