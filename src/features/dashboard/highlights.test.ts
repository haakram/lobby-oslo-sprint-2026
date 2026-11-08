import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { selectGuestDay } from "@/features/guests/testData";
import { lowStock, STOCK } from "@/features/inventory/testData";
import { parseRunLog } from "@/features/nightshift/runlog";
import type { RequestView } from "@/features/requests/select";
import type { DashboardData } from "./data";
import { moneyHeadline, roomMoney } from "@/features/rooms/money";
import { occupancy, pmsLastNight, revenueLastNight } from "@/features/rooms/pms";
import { reconcileNight } from "@/features/rooms/reconcile";
import {
  atNight,
  figureSources,
  greeting,
  greetingWord,
  daySummary,
  hoursLabel,
  MAX_HIGHLIGHTS,
  MINUTES_PER_HANDBACK,
  minutesSaved,
  nightFacts,
  nightSummary,
  nightTotals,
  nightVerdict,
  selectHighlights,
  shiftHour,
  timeSaved,
  timeSavedMethod,
} from "./highlights";
import { foldNight, selectRobot, selectRooms } from "./selectors";

// Oversikt's good news: the greeting, the night in one sentence and the figures, from the demo data.
const LINES = parseRunLog(readFileSync(resolve(process.cwd(), "src/features/nightshift/fixtures/sample.jsonl"), "utf8")).lines;
const NIGHT = foldNight(LINES);
const PMS = pmsLastNight("2026-11-08");
const MONEY = roomMoney({ reconciliation: reconcileNight(LINES, PMS), marks: {}, revenue: revenueLastNight(36, PMS), rooms: selectRooms(NIGHT), pms: PMS });

function staff(id: string, at: string, status: RequestView["status"]): RequestView {
  return { id, source: "personale", kind: "Utstyr", room: "room-104", text: null, lang: "nb", at, handler: "Kjersti Lund", status, actionable: true, tonight: false };
}

function data(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    role: "admin",
    userName: "Hamad",
    hour: 12,
    loading: false,
    nightStatus: "ready",
    night: NIGHT,
    rooms: selectRooms(NIGHT),
    safety: null,
    money: MONEY,
    robot: selectRobot(NIGHT),
    requests: [staff("m5", "23:40", "fullfort"), staff("m6", "01:15", "fullfort"), staff("m1", "07:12", "fullfort")],
    maintenance: [],
    outOfOrder: [],
    guests: selectGuestDay("2026-11-08"),
    calls: { kind: "not-set-up" },
    retryCalls: () => {},
    stock: STOCK,
    lowStock: lowStock(),
    reviews: { average: 4.71, count: 24 },
    shift: "dag",
    onShift: [],
    ...overrides,
  };
}

describe("the greeting", () => {
  it("is honest about the time of day", () => {
    expect([6, 9, 10, 17, 18, 23, 0, 4].map(greetingWord)).toEqual(["God morgen", "God morgen", "God dag", "God dag", "God kveld", "God kveld", "Hei", "Hei"]);
    expect(greeting(12, "Hamad")).toBe("God dag, Hamad");
    // Shared logins named after their role greet the desk; no name, no comma.
    expect(greeting(7, "Resepsjonist")).toBe("God morgen, resepsjonen");
    expect(greeting(7, "Robotansvarlig")).toBe("God morgen, robotansvarlig");
    expect(greeting(20, null)).toBe("God kveld");
  });

  it("says how the night went: the robot's tally, then what the night staff did besides", () => {
    const totals = nightTotals(data());
    // The robot's figures are its night's one tally; the day staff's 07:12 request is not the night's.
    expect(totals).toEqual({ done: NIGHT.tally.done, total: NIGHT.tally.total, staffDone: 2 });
    expect(nightSummary(data(), totals)).toBe(`Roboten fullførte ${NIGHT.tally.done} av ${NIGHT.tally.total} oppdrag. Nattevakten ordnet 2 til. Ingen rom venter på renhold.`);
    const dirty = data().rooms!.map((room, index) => (index < 3 ? { ...room, status: "ma_vaskes" as const } : room));
    expect(nightSummary(data({ rooms: dirty }), totals)).toMatch(/ Før innsjekk skal 3 rom vaskes\.$/);
  });

  it("never calls a night fine: an ended night is plain, and the facts line says what happened", () => {
    expect(nightVerdict(data(), { done: 71, total: 81 })).toEqual({ text: "Natten er over.", good: false });
    expect(nightVerdict(data(), { done: 49, total: 71 })).toEqual({ text: "Natten er over.", good: false });
    expect(nightVerdict(data({ nightStatus: "loading" }), null).text).toBe("Henter natten …");
    expect(nightVerdict(data({ nightStatus: "error" }), null).text).toBe("Natten er ikke lastet ennå.");
    expect(nightVerdict(data({ robot: { ...selectRobot(NIGHT), ended: false } }), { done: 3, total: 9 })).toEqual({ text: "Natten er i gang.", good: true });
  });
});

describe("the night in facts, by its own clock", () => {
  it("says in green only what is done, and names what needs a person", () => {
    expect(nightFacts({ confirmed: 73, wetFloors: 3, stranger: true })).toEqual({ done: "73 oppgaver bekreftet", attention: "3 våte gulv og 1 ukjent person trenger en eier" });
    expect(nightFacts({ confirmed: 1, wetFloors: 1, stranger: false })).toEqual({ done: "1 oppgave bekreftet", attention: "1 vått gulv trenger en eier" });
    expect(nightFacts({ confirmed: 40, wetFloors: 0, stranger: false })).toEqual({ done: "40 oppgaver bekreftet", attention: null });
  });

  it("greets by the shift clock of the night on screen, and says what the day starts with", () => {
    expect(shiftHour({ clock: "05:58:07" })).toBe(5);
    expect(greeting(shiftHour({ clock: "05:58:07" }) ?? 14, "Siri Haugen")).toBe("God morgen, Siri Haugen");
    expect(shiftHour({ clock: null })).toBeNull();
    expect(shiftHour(null)).toBeNull();
    expect(daySummary(data())).toBe("Ingen rom venter på renhold.");
    expect(daySummary(data({ role: "robot", rooms: null }))).toBeNull();
  });
});

describe("selectHighlights (the figures)", () => {
  it("gives the admin six good-news figures, green where the figure is good, each with its source", () => {
    const figures = selectHighlights(data());
    expect(figures.map((figure) => figure.label)).toEqual(["Belegg i natt", "Losjiinntekt i natt", "Robotens oppdrag i natt", "Timer spart, anslag", "Rom klare til salg", "Gjester fornøyd"]);
    expect(figures).toHaveLength(MAX_HIGHLIGHTS);
    const by = Object.fromEntries(figures.map((figure) => [figure.id, figure]));
    const rooms = data().rooms!.length;
    const revenue = revenueLastNight(rooms);
    expect(by.belegg).toMatchObject({ value: occupancy(revenue, rooms), unit: "%", detail: `${revenue.roomsSold} av ${rooms} rom solgt`, source: "test" });
    expect(by.inntekt).toMatchObject({ unit: "kr", source: "test" });
    expect(by.inntekt.detail).toMatch(/^Snittpris .+ kr · RevPAR .+ kr$/);
    expect(by.oppgaver).toMatchObject({ value: NIGHT.tally.done, unit: `av ${NIGHT.tally.total}`, tone: "success", source: "run-log" });
    expect(by.oppgaver.detail).toMatch(new RegExp(`^Godkjent av dommeren \\(Wybe Night Shift-simulatoren\\): ${NIGHT.tally.done} av ${NIGHT.tally.reported}`));
    expect(by.spart).toMatchObject({ prefix: "ca.", source: "estimate" });
    expect(by.spart.method?.join(" ")).toMatch(/Et anslag, ikke en måling/);
    expect(by.fornoyd).toMatchObject({ value: "4,7", unit: "av 5", tone: "success" });
    // One Klare til salg on every screen: ready and free in the booking system (or released), "av 36", with the money line.
    expect(by.klare).toMatchObject({ value: MONEY.readyToSell, unit: `av ${data().rooms!.length}` });
    expect(by.klare.detail).toBe(moneyHeadline(MONEY) ?? undefined);
    // Nothing on the row is a warning or a danger.
    expect(figures.every((figure) => figure.tone === "success" || figure.tone === "default")).toBe(true);
  });

  it("gives the robot manager the night's work, the rooms checked and the stores instead of bookings", () => {
    expect(selectHighlights(data({ role: "robot" })).map((figure) => figure.id)).toEqual(["oppgaver", "spart", "klare", "sjekket", "lager"]);
    const lager = selectHighlights(data({ role: "robot" })).find((figure) => figure.id === "lager");
    expect(lager).toMatchObject({ value: STOCK.length - 1, unit: `av ${STOCK.length}`, tone: "success" });
  });

  it("leaves the night's figures empty until the night is in, and keeps today's", () => {
    const figures = selectHighlights(data({ night: null, rooms: null, money: null, robot: null, loading: true, nightStatus: "loading" }));
    expect(figures.filter((figure) => figure.fromNight).every((figure) => figure.value === null)).toBe(true);
    expect(figures.find((figure) => figure.id === "belegg")?.value).toEqual(expect.any(Number));
  });

  it("names under the row which figures are the robot's log, which test data, which estimates", () => {
    const line = figureSources(selectHighlights(data()));
    expect(line).toBe(
      "Fra robotens natt (kjøringsloggen): Robotens oppdrag i natt, Rom klare til salg. Testdata til bookingsystemet er koblet til: Belegg i natt, Losjiinntekt i natt, Gjester fornøyd. Anslag: Timer spart.",
    );
  });

  it("estimates the hours the robot saved from the credited tasks, less what it handed back", () => {
    const saved = timeSaved(NIGHT);
    expect(saved.tasks).toBe(NIGHT.tally.done);
    expect(saved.handback).toBe(NIGHT.tally.handedBack * MINUTES_PER_HANDBACK);
    expect(saved.net).toBe(Math.max(0, saved.gross - saved.handback));
    expect(minutesSaved(NIGHT)).toBe(saved.net);
    expect(timeSavedMethod(saved).at(-1)).toBe(`Til sammen ${saved.net} min, ca. ${hoursLabel(saved.net)} t.`);
    expect(hoursLabel(717)).toBe("12");
    expect(hoursLabel(270)).toBe("4,5");
    expect([atNight("23:40"), atNight("05:59"), atNight("06:00"), atNight("21:59"), atNight(null)]).toEqual([true, true, false, false, false]);
  });
});
