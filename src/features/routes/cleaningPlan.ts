import type { HotelMap } from "./hotelMap";
import { hotelMatrix } from "./hotelRouter";
import { bestTour, elevatorRides, listOrderMetres, savings, tourLegs } from "./tour";
import type { NoRoute, RouteMatrix, Tour, TourLeg } from "./types";

export type CleaningPlan = {
  matrix: RouteMatrix;
  tour: Tour;
  legs: TourLeg[];
  /** Metres for visiting the rooms in the order they were given (the list), from the start and back. */
  givenMetres: number;
  saved: { metres: number; percent: number };
  elevatorRides: number;
};

/**
 * The best round from `start` through every room and back, and what it saves against walking the
 * rooms in the order given. Null for no rooms; a NoRoute when the map has no way to one of them.
 */
export function planCleaning(
  map: HotelMap,
  { start, rooms, cart }: { start: string; rooms: string[]; cart: boolean },
): CleaningPlan | NoRoute | null {
  if (rooms.length === 0) return null;
  const matrix = hotelMatrix(map, start, rooms, { cart });
  const tour = bestTour(matrix, rooms);
  if ("error" in tour) return tour;
  const givenMetres = listOrderMetres(matrix, rooms);
  return {
    matrix,
    tour,
    legs: tourLegs(matrix, tour.order),
    givenMetres,
    saved: savings(tour.metres, givenMetres),
    elevatorRides: elevatorRides(matrix, tour.path),
  };
}

/** "ca. 9 min" for a number of seconds; never less than a minute. */
export function minutesText(seconds: number): string {
  return `ca. ${Math.max(1, Math.round(seconds / 60))} min`;
}
