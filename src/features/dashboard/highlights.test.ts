import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { selectGuestDay } from "@/features/guests/testData";
import { lowStock, STOCK } from "@/features/inventory/testData";
import { doneBasis, selfContradictions } from "@/features/nightshift/conduct";
import { declineSplit } from "@/features/nightshift/declines";
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
  declineShort,
  hoursLabel,
  MAX_HIGHLIGHTS,
  MINUTES_PER_HANDBACK,
  minutesSaved,
  nightFacts,
  nightSummary,
  PILOT_ROUTES,
  readyDetail,
  nightTotals,
  nightVerdict,
  robotDetail,
  robotShort,
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

  it("says what the done rested on when the basis is known (round 5, robot-domain review): 64 confirmed by the simulator, 9 on the robot's own judgement, 8 holding", () => {
    const demo = parseRunLog(readFileSync(resolve(process.cwd(), "public/runs/demo.jsonl"), "utf8")).lines;
    const facts = nightFacts({ confirmed: 73, wetFloors: 3, stranger: true, basis: doneBasis(demo), contradictions: selfContradictions(demo) });
    expect(facts).toEqual({
      done: "73 oppgaver ferdig",
      basis: "64 bekreftet av simulatoren, 9 på robotens egen vurdering: 8 holder mot egen logg",
      attention: "3 våte gulv og 1 ukjent person trenger en eier",
    });
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
  it("gives the pilot admin the pilot's figures only, green where the figure is good, each with its source, and no vanity figure", () => {
    const figures = selectHighlights(data());
    // Round 5 (product and marketing reviews): the pilot's cut on Oversikt too; no Losjiinntekt, no bookings of the day.
    expect(figures.map((figure) => figure.label)).toEqual(["Belegg i natt", "Robotens oppdrag i natt", "Rom klare til salg nå", "Rom sjekket av roboten"]);
    // Review round 3 (product review): no hours-saved estimate and no test-data guest rating on screen one.
    expect(figures.some((figure) => figure.id === "spart" || figure.id === "fornoyd")).toBe(false);
    expect(figures.length).toBeLessThanOrEqual(MAX_HIGHLIGHTS);
    expect(PILOT_ROUTES.has("/overlevering") && PILOT_ROUTES.has("/rom") && !PILOT_ROUTES.has("/gjester")).toBe(true);
    const by = Object.fromEntries([...figures, ...selectHighlights(data({ role: "receptionist" }))].map((figure) => [figure.id, figure]));
    const rooms = data().rooms!.length;
    const revenue = revenueLastNight(rooms);
    expect(by.belegg).toMatchObject({ value: occupancy(revenue, rooms), unit: "%", detail: `${revenue.roomsSold} av ${rooms} rom solgt`, source: "test" });
    expect(by.inntekt).toMatchObject({ unit: "kr", source: "test" });
    expect(by.inntekt.detail).toMatch(/^Snittpris .+ kr · RevPAR .+ kr$/);
    expect(by.oppgaver).toMatchObject({ value: NIGHT.tally.done, unit: `av ${NIGHT.tally.total}`, tone: "success", source: "run-log" });
    // One line a manager reads; the referee is one tap away, behind "Slik vet vi det".
    expect(by.oppgaver.detail).toBe(robotShort(NIGHT.tally));
    expect(by.oppgaver).toMatchObject({ methodLabel: "Slik vet vi det" });
    expect(by.oppgaver.method?.[0]).toMatch(new RegExp(`^Bekreftet av Wybe Night Shift-simulatoren, som ikke finnes i et ekte hotell: ${NIGHT.tally.done} av ${NIGHT.tally.reported} «ferdig»`));
    expect(by.oppgaver.method?.[0]).not.toMatch(/dommer/);
    // One Klare til salg on every screen: ready and free in the booking system (or released), "av 36", with the rooms named.
    expect(by.klare).toMatchObject({ value: MONEY.readyToSell, unit: `av ${data().rooms!.length}` });
    expect(by.klare.detail).toBe(readyDetail(data()) ?? moneyHeadline(MONEY) ?? undefined);
    // Nothing on the row is a warning or a danger.
    expect(figures.every((figure) => figure.tone === "success" || figure.tone === "default")).toBe(true);
  });

  it("gives the robot manager the night's work, the rooms checked and the stores instead of bookings", () => {
    expect(selectHighlights(data({ role: "robot" })).map((figure) => figure.id)).toEqual(["oppgaver", "klare", "sjekket", "lager"]);
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
    expect(line).toBe("Fra robotens natt (kjøringsloggen): Robotens oppdrag i natt, Rom klare til salg nå, Rom sjekket av roboten. Testdata til bookingsystemet er koblet til: Belegg i natt.");
    expect(figureSources(selectHighlights(data({ role: "receptionist" })))).toBe(
      "Fra robotens natt (kjøringsloggen): Robotens oppdrag i natt, Rom klare til salg nå. Testdata til bookingsystemet er koblet til: Belegg i natt, Losjiinntekt i natt, Nye bookinger i dag.",
    );
  });

  it("names the rooms behind Klare til salg, so its 1 and the room check's 1 are never read as one room (round 5, marketing review)", () => {
    const room = (id: string, status: "klar" | "opptatt", extra: { held?: boolean; toConfirm?: boolean } = {}) =>
      ({ ...selectRooms(NIGHT)[0], id, number: id.slice(5), status, closed: false, ...extra });
    const money = { ...MONEY, readyToSell: 1, toSell: [{ ...MONEY.toSell[0], room: "room-213" }], released: [], caught: ["room-209"], toSellValue: 1500 } as typeof MONEY;
    const rooms = [room("room-314", "klar"), room("room-213", "opptatt", { toConfirm: true }), room("room-209", "opptatt", { held: true }), room("room-101", "opptatt")];
    expect(readyDetail({ money, rooms })?.replace(/\s/g, " ")).toBe("Klar nå: rom 314 · etter bekreftelse: rom 213, ca. 1 500 kr hvis utsolgt · holdt tilbake: rom 209");
    // When the rack and the figure disagree, the plain money line instead of a wrong name.
    expect(readyDetail({ money: { ...money, readyToSell: 2 }, rooms })).toBeNull();
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

describe("the robot figure's refusals, split by the referee (the judgement card's count)", () => {
  it("on the demo night: the refusals in a manager's words (never \"falske klager\"), 1 not approved, never \"8 avvist uten bestilling\"", () => {
    const lines = parseRunLog(readFileSync(resolve(process.cwd(), "public/runs/demo.jsonl"), "utf8")).lines;
    const night = foldNight(lines);
    const detail = robotDetail(night, declineSplit(lines), doneBasis(lines));
    expect(detail).toBe(
      `Bekreftet av Wybe Night Shift-simulatoren, som ikke finnes i et ekte hotell: ${night.tally.done} av ${night.tally.reported} «ferdig» (64 etter at poengsummen steg, 9 på robotens egen vurdering) · 6 meldinger uten bestilling og 1 alt levert · 1 ikke godkjent`,
    );
    expect(detail).not.toMatch(/8 avvist uten bestilling|falsk/);
    expect(robotShort(night.tally)).toBe(`Alle ${night.tally.done} «ferdig» bekreftet · ${night.tally.handedBack} til en person`);
    // Without the split, the plain count.
    expect(declineShort(null, 3)).toBe("3 avvist etter sjekk");
    expect(declineShort(null, 0)).toBeNull();
  });
});
