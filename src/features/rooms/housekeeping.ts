import type { RoomView } from "@/features/dashboard/selectors";
import type { StaffMember } from "@/features/staff/testData";

/**
 * Today's cleaning round, split between the cleaners on the day shift: the rooms the night marked
 * "må vaskes" first, then the rooms nobody checked. A cleaner takes the floor in their area; floors
 * without a cleaner are shared round-robin.
 * TODO(phase-3): the PMS integration brings departures and the housekeeping plan; this derives one
 * from the robot's night and the test shift plan.
 */

export type Assignment = { cleaner: StaffMember; floor: number | null; rooms: RoomView[] };

const FLOOR_IN_AREA = /^(\d)\. etasje/;

export function floorOfArea(area: string | null): number | null {
  const match = area ? FLOOR_IN_AREA.exec(area) : null;
  return match ? Number(match[1]) : null;
}

/** Rooms that need a visit today, most urgent first. */
export function roomsToClean(rooms: readonly RoomView[]): RoomView[] {
  const dirty = rooms.filter((room) => room.status === "ma_vaskes");
  const unchecked = rooms.filter((room) => room.status === "ukjent");
  return [...dirty, ...unchecked];
}

export function assignRooms(rooms: readonly RoomView[], cleaners: readonly StaffMember[]): Assignment[] {
  const assignments: Assignment[] = cleaners.map((cleaner) => ({ cleaner, floor: floorOfArea(cleaner.area), rooms: [] }));
  if (assignments.length === 0) return [];
  let next = 0;
  for (const room of roomsToClean(rooms)) {
    const own = assignments.find((assignment) => assignment.floor === room.floor);
    const target = own ?? assignments[next++ % assignments.length];
    target.rooms.push(room);
  }
  return assignments;
}
