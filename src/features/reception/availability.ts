import { addDays, daysBetween, parseIsoDate } from "./dates";
import {
  directPrice,
  findRoomType,
  ROOM_TYPES,
  type RoomType,
  type RoomTypeId,
} from "./hotel";

export const MAX_NIGHTS = 30;
export const MAX_DAYS_AHEAD = 365;
export const MAX_GUESTS = 8;
export const NEXT_FREE_WINDOW = 14;

/** Conference weekend and New Year's Eve: every room is taken. */
export const FULLY_BOOKED_DATES: readonly string[] = ["2026-11-13", "2026-11-14", "2026-12-31"];

/** Rooms taken that night. */
export type Occupancy = (date: string, room: RoomTypeId) => number;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic fake occupancy: 30–100 % of the rooms, fully booked on FULLY_BOOKED_DATES. */
export function defaultOccupancy(date: string, room: RoomTypeId): number {
  const type = ROOM_TYPES.find((r) => r.id === room);
  if (!type) return 0;
  if (FULLY_BOOKED_DATES.includes(date)) return type.rooms;
  const percent = 30 + (hash(date + room) % 71);
  return Math.min(type.rooms, Math.round((type.rooms * percent) / 100));
}

export type StayQuery = { arrival: unknown; departure: unknown; guests: unknown; room?: unknown };

export type StayProblem =
  | { kind: "bad-date"; field: "arrival" | "departure" }
  | { kind: "past" }
  | { kind: "order" }
  | { kind: "too-long" }
  | { kind: "too-far" }
  | { kind: "guests" }
  | { kind: "unknown-room"; room: string }
  | { kind: "room-too-small"; room: RoomType };

export type RoomOffer = {
  room: RoomType;
  nights: number;
  freeRooms: number;
  directTotal: number;
  otaTotal: number;
};

export type AvailabilityResult =
  | {
      ok: true;
      today: string;
      arrival: string;
      departure: string;
      nights: number;
      guests: number;
      offers: RoomOffer[];
      nextFreeArrival: string | null;
    }
  | { ok: false; today: string; problem: StayProblem };

function freeRooms(room: RoomType, arrival: string, nights: number, occupancy: Occupancy): number {
  let free = room.rooms;
  for (let i = 0; i < nights; i++) {
    free = Math.min(free, room.rooms - occupancy(addDays(arrival, i), room.id));
  }
  return Math.max(0, free);
}

function offersFor(
  rooms: readonly RoomType[],
  arrival: string,
  nights: number,
  occupancy: Occupancy,
): RoomOffer[] {
  return rooms.flatMap((room) => {
    const free = freeRooms(room, arrival, nights, occupancy);
    return free > 0
      ? [
          {
            room,
            nights,
            freeRooms: free,
            directTotal: directPrice(room) * nights,
            otaTotal: room.otaPrice * nights,
          },
        ]
      : [];
  });
}

export function checkAvailability(
  query: StayQuery,
  options: { today?: string; occupancy?: Occupancy } = {},
): AvailabilityResult {
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const occupancy = options.occupancy ?? defaultOccupancy;
  const fail = (problem: StayProblem): AvailabilityResult => ({ ok: false, today, problem });

  const arrival = parseIsoDate(query.arrival);
  if (!arrival) return fail({ kind: "bad-date", field: "arrival" });
  const departure = parseIsoDate(query.departure);
  if (!departure) return fail({ kind: "bad-date", field: "departure" });

  if (arrival < today) return fail({ kind: "past" });
  const nights = daysBetween(arrival, departure);
  if (nights < 1) return fail({ kind: "order" });
  if (nights > MAX_NIGHTS) return fail({ kind: "too-long" });
  if (daysBetween(today, arrival) > MAX_DAYS_AHEAD) return fail({ kind: "too-far" });

  const guests = query.guests;
  if (typeof guests !== "number" || !Number.isInteger(guests) || guests < 1 || guests > MAX_GUESTS) {
    return fail({ kind: "guests" });
  }

  let candidates: readonly RoomType[] = ROOM_TYPES;
  if (query.room !== undefined && query.room !== null && query.room !== "") {
    const wanted = typeof query.room === "string" ? findRoomType(query.room) : undefined;
    if (!wanted) return fail({ kind: "unknown-room", room: String(query.room) });
    if (wanted.maxGuests < guests) return fail({ kind: "room-too-small", room: wanted });
    candidates = [wanted];
  }
  candidates = candidates.filter((r) => r.maxGuests >= guests);

  const offers = offersFor(candidates, arrival, nights, occupancy);
  let nextFreeArrival: string | null = null;
  if (offers.length === 0) {
    for (let d = 1; d <= NEXT_FREE_WINDOW; d++) {
      const day = addDays(arrival, d);
      if (offersFor(candidates, day, nights, occupancy).length > 0) {
        nextFreeArrival = day;
        break;
      }
    }
  }

  return { ok: true, today, arrival, departure, nights, guests, offers, nextFreeArrival };
}
