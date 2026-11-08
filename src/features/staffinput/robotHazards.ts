import type { NightSafety } from "@/features/handover/safety";
import { placeLabel } from "@/features/dashboard/labels";
import { inNightHours, placePhrase } from "./read";

/**
 * The robot's hazards for the night clerk, as they happen (round 6, domain review: "06:00 is the wrong
 * moment for safety"; the differentiator is proof that a person acknowledged the alert). Nattevaktens
 * logg lists what the robot's run log says can hurt a guest, at the robot's clock, each with a *Kvitter*
 * tap (entries.ts `acknowledgeLine`); Overlevering shows how long each one waited for a person.
 *
 * The hazards are the handover's own (handover/safety.ts `nightSafety`: wet floors without a sign, the
 * person the robot refused at door after door), so the two screens name the same items and the same
 * clocks. A live run grows its log, so a hazard appears on /natt when the robot reports it. Pure; only
 * a type import from handover, so the handover may import this file.
 */

/** The night ends here: a hazard nobody acknowledged in the night waited until the handover. */
export const NIGHT_END = "06:00:00";

export type RobotHazard = {
  /** The key an acknowledgement is stored under (robotHazardKey). */
  key: string;
  hazard: "wet" | "person";
  place: string | null;
  /** The robot's clock, HH:MM:SS: wet (without a sign) since, or the first refusal. */
  at: string | null;
  /** "Vått gulv i korridor 2B" · "En person i badekåpe ba roboten slippe ham inn på 7 rom". */
  title: string;
  /** One line on what the robot saw and what to do. */
  detail: string;
};

/**
 * The key of a robot hazard: `since` is `WetFloor.since` for a wet floor, `StrangerIncident.first` for the
 * person. The same wet floor with a new since (its sign moved away later) is a new hazard.
 */
export function robotHazardKey(item: { hazard: "wet" | "person"; place?: string | null; since: string | null }): string {
  return item.hazard === "wet" ? `wet:${item.place ?? "-"}:${item.since ?? "-"}` : `person:${item.since ?? "-"}`;
}

const hm = (clock: string) => clock.slice(0, 5);

/** "korridor 3C": a place's name inside a sentence. */
function placeName(place: string): string {
  const label = placeLabel(place);
  return label.charAt(0).toLowerCase() + label.slice(1);
}

/** The robot's hazards from the handover's safety read, oldest first. */
export function robotHazardsOf(safety: NightSafety | null): RobotHazard[] {
  if (!safety) return [];
  const hazards: RobotHazard[] = safety.wetFloors.map((floor) => ({
    key: robotHazardKey({ hazard: "wet", place: floor.place, since: floor.since }),
    hazard: "wet",
    place: floor.place,
    at: floor.since,
    title: `Vått gulv ${placePhrase(floor.place)}`,
    detail: floor.slippedAt
      ? "Roboten skled der. Ingen skilt."
      : floor.signMoved
        ? `Roboten flyttet skiltet herfra${floor.signMoved.to ? ` til ${placeName(floor.signMoved.to)}` : ""}. Ingen skilt nå.`
        : "Roboten fant det. Ingen skilt.",
  }));
  const person = safety.stranger;
  if (person) {
    const rooms = person.rooms.length || person.refusals.length;
    const more = person.refusals.length > 1;
    hazards.push({
      key: robotHazardKey({ hazard: "person", since: person.first }),
      hazard: "person",
      place: null,
      at: person.first,
      // Neutral, in the handover's words (select.ts strangerText): who it was, nobody knows yet.
      title: `En person i badekåpe ba roboten slippe ham inn på ${rooms === 1 ? "ett rom" : `${rooms} rom`}`,
      detail: `${more ? "Roboten sa nei hver gang" : "Roboten sa nei"}${more ? `, sist kl. ${hm(person.last)}` : ""}. Sjekk først om en gjest er låst ute.`,
    });
  }
  return hazards.sort((a, b) => nightMinutes(a.at) - nightMinutes(b.at));
}

/** Minutes into the night from noon, so 23:51 comes before 00:38 (HH:MM; seconds are not shown, so not counted). */
function nightMinutes(clock: string | null): number {
  if (!clock || !/^\d{2}:\d{2}/.test(clock)) return 0;
  const hour = Number(clock.slice(0, 2));
  return (hour < 12 ? hour + 24 : hour) * 60 + Number(clock.slice(3, 5));
}

/** Whole minutes from one night clock to a later one, on the clocks a reader sees (23:51 → 06:00 is 369). */
export function waitMinutes(from: string, to: string): number {
  return Math.max(0, nightMinutes(to) - nightMinutes(from));
}

/** "6 t 9 min" · "8 min" · "1 t" · "under 1 min". */
export function waitText(minutes: number): string {
  if (minutes < 1) return "under 1 min";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} t` : `${hours} t ${rest} min`;
}

export type HazardWait = {
  /** Minutes the hazard waited for a person: to the acknowledgement made in the night, else to 06:00. Null without the robot's clock. */
  minutes: number | null;
  acknowledged: boolean;
  /** The acknowledgement has a night clock (typed by day on a demo, it says "nå", never a clock). */
  inNight: boolean;
};

/** How long a robot hazard waited for a person, from the robot's clock to the acknowledgement (or to the end of the night). */
export function hazardWait(robotAt: string | null, ack: { at: string | null } | null | undefined, end: string = NIGHT_END): HazardWait {
  const inNight = Boolean(ack) && inNightHours(ack?.at);
  const to = inNight && ack?.at ? ack.at : end;
  return { minutes: robotAt ? waitMinutes(robotAt, to) : null, acknowledged: Boolean(ack), inNight };
}
