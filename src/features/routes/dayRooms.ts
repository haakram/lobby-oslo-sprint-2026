import { selectGuestDay } from "@/features/guests/testData";
import { osloToday } from "@/features/reception/dates";
import type { RoomReport } from "./nightRooms";

/**
 * Dagens renhold: the rooms the cleaners turn today, in the order they come free: the rooms the robot
 * found dirty in the night (free now, at the time it reported them), then today's departures from the
 * booking system at their checkout time. A cleaner who walks them in that order crosses the floors
 * again and again; Ruter shows what the best round saves against it, and against room-number order.
 *
 * TODO(phase-3): the PMS integration brings the departures' checkout times; until then a few are
 * test data here (a "Sen utsjekk 14:00" note on the booking wins), and the rest leave at 11:00.
 */

export type DayRoom = { room: string; why: "natt" | "utsjekk"; at: string };

/** Test data: when today's departures check out (the hotel's checkout is 11:00). */
const CHECKOUT_AT: Record<string, string> = {
  "room-206": "07:30",
  "room-313": "08:00",
  "room-201": "08:45",
  "room-305": "09:15",
  "room-214": "10:00",
};
const DEFAULT_CHECKOUT = "11:00";
const LATE_CHECKOUT = /sen utsjekk (\d{1,2}[:.]\d{2})/i;

function hhmm(clock: string | null): string {
  return clock ? clock.slice(0, 5).replace(".", ":").padStart(5, "0") : "06:00";
}

export function dayRooms(statuses: ReadonlyMap<string, RoomReport>, today: string = osloToday()): DayRoom[] {
  const night: DayRoom[] = [...statuses.values()]
    .filter((report) => report.status === "ma_vaskes")
    .map((report) => ({ room: report.room, why: "natt", at: hhmm(report.clock) }));
  const taken = new Set(night.map((entry) => entry.room));
  const departures: DayRoom[] = selectGuestDay(today).departures.flatMap((stay) => {
    if (!stay.room || taken.has(stay.room) || statuses.get(stay.room)?.status === "ikke_forstyrr") return [];
    taken.add(stay.room);
    const late = stay.notes.map((note) => LATE_CHECKOUT.exec(note)?.[1]).find(Boolean);
    return [{ room: stay.room, why: "utsjekk" as const, at: hhmm(late ?? CHECKOUT_AT[stay.room] ?? DEFAULT_CHECKOUT) }];
  });
  // The night's rooms are free from the hour the robot reported them (before 06:00): they lead.
  return [...night.sort((a, b) => a.at.localeCompare(b.at)), ...departures.sort((a, b) => a.at.localeCompare(b.at))];
}
