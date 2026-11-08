import { osloToday } from "@/features/reception/dates";
import { stays } from "@/features/guests/testData";

/**
 * TODO(phase-3): replace with the PMS integration (the booking system's room status and last night's
 * folio). Test data: what the booking system says about last night, per room. The bookings are the
 * guests' test data (src/features/guests/testData.ts), so Gjester, Oversikt, Rom and Overlevering
 * read one booking system and one occupancy; this file adds last night's room rate per room. Guests
 * are made-up names, never real people. Rooms with no stay last night were vacant in the system.
 */

export type PmsRoom = {
  room: string;
  /** The guest on the booking, when the system has one. */
  guest: string | null;
  /** The booking's departure, YYYY-MM-DD: today is a guest due out (a sleeper when the room is empty). */
  departure: string;
  /** Last night's room rate, NOK, breakfast included. */
  rate: number;
};

/** Last night's rate per room, NOK; a room not listed sold at the standard double's 1 450. */
const RATES: Readonly<Record<string, number>> = {
  "room-131": 1090,
  "room-133": 1090,
  "room-134": 1990,
  "room-136": 1090,
  "room-137": 1090,
  "room-205": 1990,
  "room-208": 1190,
  "room-214": 1990,
  "room-301": 1190,
  "room-305": 1190,
  "room-309": 2490,
  "room-313": 1190,
};
const STANDARD_RATE = 1450;

/** Room id → the booking system's occupied room last night (a stay that began before today and ends today or later). */
export function pmsLastNight(today: string = osloToday()): ReadonlyMap<string, PmsRoom> {
  const occupied = new Map<string, PmsRoom>();
  for (const stay of stays(today)) {
    if (!stay.room || stay.arrival >= today || stay.departure < today) continue;
    occupied.set(stay.room, { room: stay.room, guest: stay.name, departure: stay.departure, rate: RATES[stay.room] ?? STANDARD_RATE });
  }
  return occupied;
}

export type RoomRevenue = {
  roomsSold: number;
  /** Losjiinntekt, NOK. */
  revenue: number;
  /** Snittpris per solgt rom (ADR), NOK, rounded. */
  adr: number;
  /** Inntekt per tilgjengelig rom (RevPAR), NOK, rounded. */
  revpar: number;
};

/** Last night's room revenue from the booking system, against the rooms the hotel has. */
export function revenueLastNight(roomsInHotel: number, pms: ReadonlyMap<string, PmsRoom> = pmsLastNight()): RoomRevenue {
  const sold = [...pms.values()];
  const revenue = sold.reduce((sum, entry) => sum + entry.rate, 0);
  return {
    roomsSold: sold.length,
    revenue,
    adr: sold.length ? Math.round(revenue / sold.length) : 0,
    revpar: roomsInHotel > 0 ? Math.round(revenue / roomsInHotel) : 0,
  };
}

/** Last night's occupancy, percent of the rooms the hotel has: the one occupancy every screen shows. */
export function occupancy(revenue: RoomRevenue, roomsInHotel: number): number {
  return roomsInHotel > 0 ? Math.round((revenue.roomsSold / roomsInHotel) * 100) : 0;
}

/**
 * What the rooms the robot found sellable are worth today, in NOK: rooms × last night's average rate
 * (ADR), to the nearest hundred, so the screen says "ca. 2 900 kr". An estimate at test-data prices.
 */
export function sellableValue(rooms: number, revenue: RoomRevenue): number {
  return Math.round((rooms * revenue.adr) / 100) * 100;
}
