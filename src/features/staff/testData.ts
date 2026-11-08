/**
 * TODO(phase-3): replace with the staff-planning integration (shift plan, clock-in).
 * Test data: a ~36-room hotel's crew for one day. Made-up names, never real people.
 */

export type StaffRole = "Resepsjon" | "Renhold" | "Vedlikehold" | "Frokost" | "Nattevakt";

export type ShiftId = "natt" | "dag" | "kveld";

/** Three shifts that meet: the 06:00 handover is the night's end and the day's start. */
export const SHIFTS: readonly { id: ShiftId; label: string; from: string; to: string }[] = [
  { id: "natt", label: "Natt", from: "22:00", to: "06:00" },
  { id: "dag", label: "Dag", from: "06:00", to: "14:00" },
  { id: "kveld", label: "Kveld", from: "14:00", to: "22:00" },
];

export type StaffMember = {
  id: string;
  name: string;
  role: StaffRole;
  /** The shift today, or null on a day off. */
  shift: ShiftId | null;
  /** Floors or area the person covers today. */
  area: string | null;
  phone: string;
};

const PEOPLE: Array<Omit<StaffMember, "id">> = [
  { name: "Siri Haugen", role: "Resepsjon", shift: "dag", area: "Resepsjonen", phone: "intern 101" },
  { name: "Omar Haddad", role: "Resepsjon", shift: "kveld", area: "Resepsjonen", phone: "intern 101" },
  { name: "Roboten", role: "Nattevakt", shift: "natt", area: "Hele hotellet", phone: "Lobby" },
  { name: "Kjersti Lund", role: "Nattevakt", shift: "natt", area: "Resepsjonen (bakvakt)", phone: "intern 102" },
  { name: "Ana Pereira", role: "Renhold", shift: "dag", area: "1. etasje", phone: "intern 211" },
  { name: "Mariam Osei", role: "Renhold", shift: "dag", area: "2. etasje", phone: "intern 212" },
  { name: "Beata Kowalczyk", role: "Renhold", shift: "dag", area: "3. etasje", phone: "intern 213" },
  { name: "Jens Myhre", role: "Renhold", shift: null, area: null, phone: "intern 214" },
  { name: "Trond Eikeland", role: "Vedlikehold", shift: "dag", area: "Teknisk rom, alle etasjer", phone: "intern 301" },
  { name: "Linnea Berg", role: "Frokost", shift: "dag", area: "Frokostsalen", phone: "intern 401" },
  { name: "Samuel Adeyemi", role: "Frokost", shift: null, area: null, phone: "intern 402" },
  { name: "Hanne Vold", role: "Resepsjon", shift: "natt", area: "Resepsjonen", phone: "intern 103" },
];

export const STAFF: readonly StaffMember[] = PEOPLE.map((person, index) => ({ id: `staff-${index + 1}`, ...person }));

const hourOf = (clock: string) => Number(clock.slice(0, 2));

/** The shift running at a wall-clock hour (Oslo), read off SHIFTS so the plan and "Nå" never disagree. */
export function shiftAt(hour: number): ShiftId {
  for (const shift of SHIFTS) {
    const from = hourOf(shift.from);
    const to = hourOf(shift.to);
    if (from < to ? hour >= from && hour < to : hour >= from || hour < to) return shift.id;
  }
  return "natt";
}

export function onShift(shift: ShiftId, staff: readonly StaffMember[] = STAFF): StaffMember[] {
  return staff.filter((member) => member.shift === shift);
}

export function byRole(role: StaffRole, staff: readonly StaffMember[] = STAFF): StaffMember[] {
  return staff.filter((member) => member.role === role);
}

/** The cleaners on today's day shift, who take the rooms the night found. */
export function cleanersToday(staff: readonly StaffMember[] = STAFF): StaffMember[] {
  return staff.filter((member) => member.role === "Renhold" && member.shift === "dag");
}

/** The Oslo hour right now, for the shift clock. */
export function osloHour(now: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Oslo", hour: "2-digit", hourCycle: "h23" }).format(now));
}
