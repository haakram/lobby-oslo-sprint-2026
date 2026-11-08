import { osloToday } from "@/features/reception/dates";
import { stays } from "@/features/guests/testData";

/**
 * TODO(phase-3): replace with the PMS integration (the booking system's room status and last night's
 * folio). Test data: what the booking system says about last night, per room. The bookings are the
 * guests' test data (src/features/guests/testData.ts), so Gjester, Oversikt, Rom and Overlevering
 * read one booking system and one occupancy; this file adds last night's room rate per room. Guests
 * are made-up names, never real people. Rooms with no stay last night were vacant in the system.
 */

/**
 * The booking system behind the room check is the team's test data, written after the night to show
 * the join (round 3, domain review): every row the room check derives from it says so on screen.
 * False once the PMS integration reads a real hotel's bookings.
 */
export const PMS_IS_TEST_DATA = true;
/** The page-level line while the bookings are test data (one quiet band, round 4, design review). */
export const TEST_BOOKING_LABEL = "Bookingene er testdata lagt inn av teamet";
/** The small word on a row that rests on a test booking, in the text face (never a mono chip). */
export const TEST_BOOKING_WORD = "testbooking";
/**
 * Where a pilot gets the same evidence without the robot opening a booked room (round 3,
 * legal and security review; PRD § 6: in a pilot the robot only checks rooms the system has as vacant), said as
 * the minimised signal it is (round 4, legal review: one derived signal per room, never who).
 */
export const PILOT_EVIDENCE = "I en pilot: ett signal per rom fra dørlåsen (gjestekort brukt siden kl. 18), aldri kort-id, aldri klokkeslett. Roboten går ikke inn i rom som er booket.";

export type PmsRoom = {
  room: string;
  /** The guest on the booking, when the system has one. */
  guest: string | null;
  /**
   * The booking's departure, YYYY-MM-DD. Before today: the check-out was never recorded, so the system
   * still holds the room tonight (a sleeper when the room is empty). Today: a guest due out, already in
   * tonight's inventory. After today: a stay-over.
   */
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

/**
 * Room id → the booking system's occupied room last night: a stay that began before today and ends
 * today or later, or one whose check-out was never recorded (the system still has that guest in house).
 */
export function pmsLastNight(today: string = osloToday()): ReadonlyMap<string, PmsRoom> {
  const occupied = new Map<string, PmsRoom>();
  for (const stay of stays(today)) {
    if (!stay.room || stay.arrival >= today) continue;
    if (stay.departure < today && !stay.checkoutMissing) continue;
    occupied.set(stay.room, { room: stay.room, guest: stay.name, departure: stay.departure, rate: RATES[stay.room] ?? STANDARD_RATE });
  }
  return occupied;
}

/**
 * Tonight's bookings on the books (the night after the handover): stays that cover tonight. A booking
 * whose check-out was never recorded (213) is not counted: the guest has gone, only the system still
 * holds the room. The kroner the room check finds are extra only if tonight sells out (round 4,
 * founders review), so the screen shows this beside them. TODO(phase-3): read from the PMS.
 */
export function bookedTonight(today: string = osloToday()): number {
  return stays(today).filter((stay) => stay.arrival <= today && stay.departure > today).length;
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
