import { byRoomNumber, type HotelGraph } from "./hotelMap";
import { hotelMatrix } from "./hotelRouter";
import { bestTour, elevatorRides, listOrderMetres, listOrderTour, savings, tourLegs } from "./tour";
import type { NoRoute, RouteMatrix, Tour, TourLeg } from "./types";

export type CleaningPlan = {
  matrix: RouteMatrix;
  tour: Tour;
  legs: TourLeg[];
  /** Metres for visiting the rooms in the order they were given (the list), from the start and back. */
  givenMetres: number;
  /** The same walk's time (seconds, lift waits included) and lift rides. */
  givenSeconds: number;
  givenRides: number;
  saved: { metres: number; percent: number };
  /** The same rooms in room-number order (how a list is often printed), and what the best round saves on it. */
  numberMetres: number;
  savedOnNumbers: { metres: number; percent: number };
  elevatorRides: number;
};

/**
 * The best round from `start` through every room and back, and what it saves against walking the
 * rooms in the order given. Null for no rooms; a NoRoute when the map has no way to one of them.
 */
export function planCleaning(
  map: HotelGraph,
  { start, rooms, cart }: { start: string; rooms: string[]; cart: boolean },
): CleaningPlan | NoRoute | null {
  if (rooms.length === 0) return null;
  const matrix = hotelMatrix(map, start, rooms, { cart });
  const tour = bestTour(matrix, rooms);
  if ("error" in tour) return tour;
  const given = listOrderTour(matrix, rooms);
  const givenMetres = given.metres;
  const numberMetres = listOrderMetres(matrix, [...rooms].sort(byRoomNumber));
  return {
    matrix,
    tour,
    legs: tourLegs(matrix, tour.order),
    givenMetres,
    givenSeconds: given.seconds,
    givenRides: elevatorRides(matrix, given.path),
    saved: savings(tour.metres, givenMetres),
    numberMetres,
    savedOnNumbers: savings(tour.metres, numberMetres),
    elevatorRides: elevatorRides(matrix, tour.path),
  };
}

/** "ca. 9 min" for a number of seconds; never less than a minute. */
export function minutesText(seconds: number): string {
  return `ca. ${Math.max(1, Math.round(seconds / 60))} min`;
}
