// @vitest-environment node
import { describe, expect, it } from "vitest";
import { daysBetween } from "@/features/reception/dates";
import { APARTMENTS, guardsFor, hostDay, staysAround, type Turnover } from "./demoData";

// Sunday 8 November 2026, 12:45 in Oslo (CET): mid-turnover, the moment the demo is built around.
const MIDDAY = new Date("2026-11-08T11:45:00Z");

describe("the host's demo day", () => {
  it("is deterministic: the same moment always gives the same day", () => {
    expect(hostDay(MIDDAY)).toEqual(hostDay(new Date(MIDDAY.getTime())));
  });

  it("follows today: the dates move with the calendar, the story stays", () => {
    const later = hostDay(new Date("2027-03-14T11:45:00Z"));
    expect(later.today).toBe("2027-03-14");
    expect(later.apartments.map((entry) => entry.status)).toEqual(hostDay(MIDDAY).apartments.map((entry) => entry.status));
    expect(later.month.month).toBe("mars");
  });

  it("shows a well-run property at midday: one apartment for each status, every arrival covered", () => {
    const day = hostDay(MIDDAY);
    expect(day.today).toBe("2026-11-08");
    expect(day.minute).toBe(12 * 60 + 45);
    expect(day.apartments.map((entry) => [entry.apartment.id, entry.status])).toEqual([
      ["lokka", "ny-gjest"],
      ["frogner", "gjest-inne"],
      ["toyen", "rengjores"],
      ["bjorvika", "klar"],
    ]);
    const lokka = day.apartments[0];
    expect(lokka.line).toBe("Lukas Becker kommer 15:00 · 2 gjester");
    expect(lokka.guards.every((guard) => guard.ok)).toBe(true);
    expect(lokka.guards.map((guard) => guard.word)).toEqual(["Rengjøres nå", "Kode sendt i går 18:00"]);
    expect(day.problems).toEqual([]);
  });

  it("walks each turnover step by step with who handles it: the smart lock, the robot, the cleaner, the code", () => {
    const [lokka, toyen] = hostDay(MIDDAY).turnovers;
    expect(lokka.steps.map((step) => [step.title, step.state, step.handler.kind])).toEqual([
      ["Utsjekk", "done", "automatikk"],
      ["Støvsuging", "done", "robot"],
      ["Rengjøring", "active", "renholder"],
      ["Innsjekk", "planned", "automatikk"],
    ]);
    expect(toyen.steps.map((step) => step.title)).toEqual(["Utsjekk", "Rengjøring", "Kode til neste gjest"]);
    // By 18:30 every step of the day is done, tomorrow's lockbox codes (sent at 18:00) included.
    const evening = hostDay(new Date("2026-11-08T17:30:00Z"));
    expect(evening.turnovers.flatMap((turnover) => turnover.steps).every((step) => step.state === "done")).toBe(true);
    expect(evening.apartments.map((entry) => entry.status)).toEqual(["gjest-inne", "gjest-inne", "klar", "klar"]);
  });

  it("raises the worst case (not cleaned, or no code, before check-in) as a failed guard", () => {
    const late: Turnover = { apartment: "lokka", checkOutBy: 660, checkedOutAt: 640, cleaning: { start: 900, end: 960 }, checkedInAt: 920, checkInFrom: 900, codeSent: { day: 0, at: 1000 } };
    const guards = guardsFor(late, 700);
    expect(guards.map((guard) => [guard.id, guard.ok, guard.word])).toEqual([
      ["rengjort", false, "Ikke rengjort før innsjekk"],
      ["kode", false, "Koden er ikke sendt"],
    ]);
  });

  it("puts the good numbers first: a full month, a high rating, hours saved", () => {
    const { month } = hostDay(MIDDAY);
    expect(month.month).toBe("november");
    expect(month.occupancy).toBeGreaterThan(0.8);
    expect(month.occupancy).toBeLessThanOrEqual(1);
    expect(month.rating).toBeGreaterThan(4.9);
    expect(month.bookings).toBeGreaterThan(20);
    expect(month.earned).toBeGreaterThan(0);
    expect(month.booked).toBeGreaterThan(month.earned);
    expect(month.hoursSaved).toBeGreaterThan(0);
    expect(month.tasksDone).toBeGreaterThan(month.hoursSaved);
    expect(month.perApartment.map((entry) => entry.apartment.id)).toEqual(APARTMENTS.map((apartment) => apartment.id));
  });

  it("never books an apartment twice for one night, nor one guest in two places in the next 14 days", () => {
    const stays = staysAround("2026-11-08");
    for (const apartment of APARTMENTS) {
      const mine = stays.filter((stay) => stay.apartment === apartment.id);
      for (let i = 1; i < mine.length; i += 1) expect(daysBetween(mine[i - 1].to, mine[i].from), `${apartment.id} ${mine[i].from}`).toBeGreaterThanOrEqual(0);
    }
    const arrivals = hostDay(MIDDAY).arrivals.map((stay) => stay.guest);
    expect(new Set(arrivals).size).toBe(arrivals.length);
  });

  it("keeps the inbox to invented guests, translated, and mostly answered by the auto-replies", () => {
    const { threads, log } = hostDay(MIDDAY);
    expect(threads.filter((thread) => thread.reply.kind === "waiting")).toHaveLength(1);
    expect(threads.filter((thread) => thread.reply.kind === "auto").length).toBeGreaterThanOrEqual(4);
    expect(threads.find((thread) => thread.lang === "it")?.text).toMatch(/tirsdag/);
    expect(log.length).toBeGreaterThan(5);
    expect(log.every((entry) => entry.minutesAgo >= 0 && entry.minutesAgo < 24 * 60)).toBe(true);
  });

  it("has exactly one low supply on the demo day: the coffee at Løkka", () => {
    const low = hostDay(MIDDAY).supplies.filter((supply) => supply.count < supply.par * 0.25);
    expect(low.map((supply) => [supply.apartment, supply.item])).toEqual([["lokka", "Kaffe"]]);
  });
});
