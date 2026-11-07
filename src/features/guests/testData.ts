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
};

type Seed = { name: string; room: string | null; from: number; to: number; guests?: number; notes?: string[]; source?: Stay["source"] };

/** Offsets in days from today: negative is past. Rooms are tonight's hotel (1xx–3xx). */
const SEEDS: Seed[] = [
  // In house
  { name: "Ingrid Solbakken", room: "room-101", from: -2, to: 1 },
  { name: "Tomasz Wierzbicki", room: "room-103", from: -1, to: 2, guests: 2 },
  { name: "Familien Haugland", room: "room-104", from: -3, to: 1, guests: 4, notes: ["Barneseng"] },
  { name: "Aisha Rahimi", room: "room-105", from: -1, to: 3 },
  { name: "Erlend Vik", room: "room-201", from: -4, to: 0 },
  { name: "Margit og Sverre Dahl", room: "room-203", from: -1, to: 0, guests: 2, notes: ["Sen utsjekk 14:00"] },
  { name: "Yuki Tanaka", room: "room-204", from: -2, to: 2 },
  { name: "Jonas Bjørnstad", room: "room-206", from: -1, to: 0 },
  { name: "Nora Lindqvist", room: "room-208", from: -2, to: 1, notes: ["Ikke forstyrr til 10:00"] },
  { name: "Petter Aas", room: "room-212", from: -1, to: 1 },
  { name: "Camille Rousseau", room: "room-214", from: -3, to: 0, guests: 2 },
  { name: "Håkon Teigen", room: "room-322", from: -1, to: 2 },
  { name: "Fatima El-Amin", room: "room-325", from: -2, to: 0, notes: ["Nøttefri frokost"] },
  { name: "Olav Rønning", room: "room-329", from: -5, to: 2, notes: ["Rullestol, trenger heis"] },
  { name: "Silje Mørk", room: "room-331", from: -1, to: 1 },
  { name: "Daniel Okafor", room: "room-333", from: -2, to: 0, guests: 2 },
  { name: "Liv Austad", room: "room-321", from: -1, to: 3 },
  { name: "Mehmet Yilmaz", room: "room-330", from: -1, to: 1 },
  // Arriving today
  { name: "Kari Nordvik", room: "room-102", from: 0, to: 2, guests: 2, notes: ["Har med hund"], source: "resepsjonist" },
  { name: "Anders Lie", room: "room-202", from: 0, to: 1 },
  { name: "Familien Strand", room: "room-205", from: 0, to: 3, guests: 3, notes: ["Barneseng"] },
  { name: "Elena Petrova", room: "room-323", from: 0, to: 2, notes: ["Sen ankomst, etter 23:00"], source: "resepsjonist" },
  { name: "Bjørn Hestnes", room: "room-326", from: 0, to: 1 },
  { name: "Priya Nair", room: null, from: 0, to: 2, guests: 2, notes: ["Allergi: fjær"] },
  { name: "Lukas Brandt", room: null, from: 0, to: 1 },
  // Booked ahead
  { name: "Maren Sæther", room: null, from: 1, to: 3, guests: 2 },
  { name: "Ola Fjeldstad", room: null, from: 2, to: 4 },
  { name: "Sofia Marchetti", room: null, from: 3, to: 5, notes: ["Tidlig innsjekk"], source: "resepsjonist" },
];

export function stays(today: string = osloToday()): Stay[] {
  return SEEDS.map((seed, index) => ({
    id: `stay-${index + 1}`,
    name: seed.name,
    room: seed.room,
    arrival: addDays(today, seed.from),
    departure: addDays(today, seed.to),
    guests: seed.guests ?? 1,
    notes: seed.notes ?? [],
    source: seed.source ?? "pms",
  }));
}

export function stayStatus(stay: Stay, today: string): StayStatus {
  if (stay.arrival === today) return "arriving";
  if (stay.departure === today) return "departing";
  if (stay.arrival < today && stay.departure > today) return "in-house";
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
  };
}

export function nights(stay: Stay): number {
  return Math.max(1, daysBetween(stay.arrival, stay.departure));
}
