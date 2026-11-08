import { addDays, daysBetween, osloToday } from "@/features/reception/dates";

/**
 * TODO(phase-3): replace with the PMS integration (bookings, check-ins, guest profiles).
 * Test data for a ~36-room hotel: made-up guests, never real people. Dates are relative to today so
 * the screens always show a plausible day: arrivals, departures and guests in house.
 */

export type StayStatus = "in-house" | "arriving" | "departing" | "booked";

export type Stay = {
  id: string;
  /** The booking's name, as written on the registration card. */
  name: string;
  room: string | null;
  /** YYYY-MM-DD. */
  arrival: string;
  departure: string;
  guests: number;
  /** What the receptionist must have ready: a pet, an allergy, a cot. */
  notes: string[];
  source: "pms" | "resepsjonist";
  /** The booking was made today (the day's new bookings). */
  bookedToday: boolean;
  /**
   * Due out before today and the check-out was never recorded, so the booking system still has the
   * guest in house tonight and the room cannot be sold (a sleeper, when the room is in fact empty).
   */
  checkoutMissing?: boolean;
};

type Seed = {
  name: string;
  room: string | null;
  from: number;
  to: number;
  guests?: number;
  notes?: string[];
  source?: Stay["source"];
  /** When the booking was made, in days from today (0: today). Older bookings leave it out. */
  booked?: number;
  /** Due out on `to` (in the past), the check-out never recorded: the system still shows the guest in house. */
  checkoutMissing?: boolean;
};

/**
 * Offsets in days from today: negative is past. Rooms are the demo night's hotel (131–138, 201–214,
 * 301–314, the seed-16 night in public/runs/demo.jsonl). These bookings are the booking system:
 * last night 31 of 36 rooms were sold (rooms/pms.ts reads them from here); 137 is closed for
 * maintenance and 132, 210, 312, 314 were free. 209 and 213 are booked, and the robot found them
 * empty and tidy: 213's guest was due out YESTERDAY and the check-out was never recorded, so the
 * system still has him in house and holds the room tonight (a real sleeper: a due-out-today room is
 * already in tonight's inventory, jury round 3); it is sold after reception confirms. 209 is Hiroshi
 * Sato's until tomorrow and the robot carried an arriving guest's bags in there three times (a double
 * allocation, held back); 210 has no booking, and the robot met a guest there. The team wrote these
 * bookings after the night to show the room check (the screens say so: "Testdata: bookingen er lagt
 * inn av teamet"); the simulator's own hotel has no booking system.
 */
const SEEDS: Seed[] = [
  // In house
  { name: "Ingrid Solbakken", room: "room-131", from: -2, to: 1 },
  { name: "Tomasz Wierzbicki", room: "room-133", from: -1, to: 2, guests: 2 },
  { name: "Familien Haugland", room: "room-134", from: -3, to: 1, guests: 4, notes: ["Barneseng"] },
  { name: "Aisha Rahimi", room: "room-135", from: -1, to: 3 },
  { name: "Gunnar Holm", room: "room-136", from: -2, to: 1 },
  { name: "Emma Kristiansen", room: "room-138", from: -1, to: 2, guests: 2 },
  { name: "Martin Skogen", room: "room-202", from: -2, to: 1 },
  { name: "Yuki Tanaka", room: "room-204", from: -2, to: 2 },
  { name: "Sara Lindgren", room: "room-205", from: -1, to: 2, guests: 2 },
  { name: "Thomas Berg", room: "room-207", from: -3, to: 1 },
  { name: "Nora Lindqvist", room: "room-208", from: -2, to: 1, notes: ["Ikke forstyrr til 10:00"] },
  { name: "Hiroshi Sato", room: "room-209", from: -1, to: 1 },
  { name: "Astrid Moe", room: "room-211", from: -2, to: 3, guests: 2 },
  { name: "Petter Aas", room: "room-212", from: -1, to: 1 },
  // Due out yesterday, the check-out never recorded: the system still holds 213 tonight, and the robot
  // found it empty and tidy at 04:24 (a real sleeper: the room would otherwise stand unsold tonight).
  { name: "Ola Nygård", room: "room-213", from: -2, to: -1, checkoutMissing: true },
  { name: "Liv Austad", room: "room-301", from: -1, to: 3 },
  { name: "Håkon Teigen", room: "room-302", from: -1, to: 2 },
  { name: "Marte Eide", room: "room-303", from: -2, to: 1, guests: 2 },
  { name: "Javier Ortega", room: "room-304", from: -1, to: 2 },
  { name: "Ida Halvorsen", room: "room-306", from: -2, to: 1 },
  { name: "Lars Engen", room: "room-308", from: -1, to: 2, guests: 2 },
  { name: "Olav Rønning", room: "room-309", from: -5, to: 2, notes: ["Rullestol, trenger heis"] },
  { name: "Mehmet Yilmaz", room: "room-310", from: -1, to: 1 },
  { name: "Silje Mørk", room: "room-311", from: -1, to: 1 },
  { name: "Sander Haug", room: "room-307", from: -1, to: 2 },
  // Leaving today; housekeeping turns most of these rooms for today's arrivals
  { name: "Erlend Vik", room: "room-201", from: -4, to: 0 },
  { name: "Margit og Sverre Dahl", room: "room-203", from: -1, to: 0, guests: 2, notes: ["Sen utsjekk 14:00"] },
  { name: "Jonas Bjørnstad", room: "room-206", from: -1, to: 0 },
  { name: "Camille Rousseau", room: "room-214", from: -3, to: 0, guests: 2 },
  { name: "Fatima El-Amin", room: "room-305", from: -2, to: 0, notes: ["Nøttefri frokost"] },
  { name: "Daniel Okafor", room: "room-313", from: -2, to: 0, guests: 2 },
  // Arriving today
  { name: "Kari Nordvik", room: "room-132", from: 0, to: 2, guests: 2, notes: ["Har med hund"], source: "resepsjonist", booked: 0 },
  { name: "Anders Lie", room: "room-201", from: 0, to: 1 },
  { name: "Familien Strand", room: "room-206", from: 0, to: 3, guests: 3, notes: ["Barneseng"] },
  { name: "Elena Petrova", room: "room-214", from: 0, to: 2, notes: ["Sen ankomst, etter 23:00"], source: "resepsjonist", booked: 0 },
  { name: "Bjørn Hestnes", room: "room-305", from: 0, to: 1, booked: 0 },
  { name: "Priya Nair", room: "room-313", from: 0, to: 2, guests: 2, notes: ["Allergi: fjær"] },
  { name: "Lukas Brandt", room: null, from: 0, to: 1, booked: 0 },
  // Booked ahead
  { name: "Maren Sæther", room: null, from: 1, to: 3, guests: 2, booked: 0 },
  { name: "Ola Fjeldstad", room: null, from: 2, to: 4, booked: 0, source: "resepsjonist" },
  { name: "Sofia Marchetti", room: null, from: 3, to: 5, notes: ["Tidlig innsjekk"], source: "resepsjonist", booked: 0 },
  { name: "Henrik Dale", room: null, from: 4, to: 6, guests: 2, booked: 0 },
  { name: "Amira Hassan", room: null, from: 6, to: 8, booked: 0 },
  { name: "Familien Bakke", room: null, from: 12, to: 15, guests: 4, notes: ["Barneseng"], booked: 0 },
  { name: "Jan Vidar Sund", room: null, from: 1, to: 2 },
];

/** "7.11" from "2026-11-07": a date the way a front desk writes it. */
function deskDate(day: string): string {
  const [, month, date] = day.split("-").map(Number);
  return `${date}.${month}`;
}

export function stays(today: string = osloToday()): Stay[] {
  return SEEDS.map((seed, index) => {
    const departure = addDays(today, seed.to);
    const checkoutMissing = Boolean(seed.checkoutMissing) && departure < today;
    return {
      id: `stay-${index + 1}`,
      name: seed.name,
      room: seed.room,
      arrival: addDays(today, seed.from),
      departure,
      guests: seed.guests ?? 1,
      notes: [...(checkoutMissing ? [`Skulle reist ${deskDate(departure)}, utsjekk ikke registrert`] : []), ...(seed.notes ?? [])],
      source: seed.source ?? "pms",
      bookedToday: seed.booked === 0,
      checkoutMissing,
    };
  });
}

export function stayStatus(stay: Stay, today: string): StayStatus {
  if (stay.arrival === today) return "arriving";
  if (stay.departure === today) return "departing";
  if (stay.arrival < today && stay.departure > today) return "in-house";
  // The check-out was never recorded: the booking system still has the guest in house.
  if (stay.checkoutMissing && stay.arrival < today) return "in-house";
  return "booked";
}

export const STAY_WORD: Record<StayStatus, string> = {
  "in-house": "På huset",
  arriving: "Ankommer i dag",
  departing: "Reiser i dag",
  booked: "Booket",
};

export type GuestDay = {
  today: string;
  arrivals: Stay[];
  departures: Stay[];
  /** Sleeping here tonight: in house and arriving. */
  inHouse: Stay[];
  booked: Stay[];
  /** Stays with something to have ready. */
  withNotes: Stay[];
  /** Rooms booked for tonight, for the occupancy figure. */
  roomsTonight: number;
  /** Bookings made today, for any date. */
  bookedToday: Stay[];
};

export function selectGuestDay(today: string = osloToday()): GuestDay {
  const all = stays(today);
  const by = (status: StayStatus) => all.filter((stay) => stayStatus(stay, today) === status);
  const arrivals = by("arriving");
  const departures = by("departing");
  const staying = by("in-house");
  const inHouse = [...staying, ...arrivals].sort((a, b) => (a.room ?? "z").localeCompare(b.room ?? "z"));
  return {
    today,
    arrivals,
    departures,
    inHouse,
    booked: by("booked").sort((a, b) => a.arrival.localeCompare(b.arrival)),
    withNotes: inHouse.filter((stay) => stay.notes.length > 0),
    roomsTonight: new Set(inHouse.map((stay) => stay.room ?? stay.id)).size,
    bookedToday: all.filter((stay) => stay.bookedToday),
  };
}

export function nights(stay: Stay): number {
  return Math.max(1, daysBetween(stay.arrival, stay.departure));
}

/**
 * TODO(phase-3): replace with the review feed (booking sites, the post-stay survey).
 * Test data: the last fortnight's guest ratings, 1–5.
 */
export const REVIEWS: readonly number[] = [5, 5, 4, 5, 5, 4, 5, 5, 5, 4, 5, 5, 4, 5, 5, 5, 4, 5, 5, 4, 5, 5, 5, 4];

/** The average rating and how many it is made of; null with no ratings. */
export function reviewScore(ratings: readonly number[] = REVIEWS): { average: number; count: number } | null {
  if (ratings.length === 0) return null;
  return { average: ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length, count: ratings.length };
}
