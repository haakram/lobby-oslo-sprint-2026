/**
 * TODO(phase-3): replace with the PMS integration (the booking system's room status and last night's
 * folio). Test data: what the booking system says about last night, per room, made up to sit beside
 * the recorded demo night so the robot's room checks have something real-looking to be compared with.
 * Guests are made-up names, never real people. Rooms not listed were vacant in the system.
 */

export type PmsRoom = {
  room: string;
  /** The guest on the booking, when the system has one. */
  guest: string | null;
  /** Last night's room rate, NOK, breakfast included. */
  rate: number;
};

/** Rooms the booking system had as occupied last night. */
const OCCUPIED: readonly PmsRoom[] = [
  { room: "room-101", guest: "Ingrid Solbakken", rate: 1090 },
  { room: "room-102", guest: null, rate: 1450 },
  { room: "room-103", guest: "Tomasz Wierzbicki", rate: 1090 },
  { room: "room-104", guest: "Familien Haugland", rate: 1990 },
  { room: "room-105", guest: "Aisha Rahimi", rate: 1450 },
  { room: "room-106", guest: null, rate: 1090 },
  { room: "room-107", guest: null, rate: 1090 },
  { room: "room-108", guest: null, rate: 1450 },
  { room: "room-201", guest: "Erlend Vik", rate: 1450 },
  { room: "room-203", guest: "Margit og Sverre Dahl", rate: 1450 },
  { room: "room-204", guest: "Yuki Tanaka", rate: 1450 },
  { room: "room-205", guest: null, rate: 1990 },
  { room: "room-206", guest: "Jonas Bjørnstad", rate: 1450 },
  { room: "room-208", guest: "Nora Lindqvist", rate: 1190 },
  { room: "room-209", guest: null, rate: 1450 },
  { room: "room-211", guest: null, rate: 1450 },
  { room: "room-212", guest: "Petter Aas", rate: 1450 },
  { room: "room-213", guest: null, rate: 1450 },
  { room: "room-214", guest: "Camille Rousseau", rate: 1990 },
  { room: "room-321", guest: "Liv Austad", rate: 1190 },
  { room: "room-322", guest: "Håkon Teigen", rate: 1450 },
  { room: "room-323", guest: null, rate: 1450 },
  { room: "room-325", guest: "Fatima El-Amin", rate: 1190 },
  { room: "room-326", guest: null, rate: 1450 },
  { room: "room-329", guest: "Olav Rønning", rate: 2490 },
  { room: "room-330", guest: "Mehmet Yilmaz", rate: 1450 },
  { room: "room-331", guest: "Silje Mørk", rate: 1450 },
  { room: "room-333", guest: "Daniel Okafor", rate: 1190 },
];

/** Room id → the booking system's occupied room. Absent: vacant in the system. */
export function pmsLastNight(): ReadonlyMap<string, PmsRoom> {
  return new Map(OCCUPIED.map((entry) => [entry.room, entry]));
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
