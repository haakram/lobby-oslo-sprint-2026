import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { selectGuestDay } from "@/features/guests/testData";
import { lowStock, STOCK } from "@/features/inventory/testData";
import { parseRunLog } from "@/features/nightshift/runlog";
import type { RequestView } from "@/features/requests/select";
import type { DashboardData } from "./data";
import { atNight, greeting, greetingWord, hoursLabel, MAX_HIGHLIGHTS, minutesSaved, nightSummary, nightTotals, nightVerdict, selectHighlights } from "./highlights";
import { foldNight, selectRobot, selectRooms } from "./selectors";

// Oversikt's good news: the greeting, the night in one sentence and the figures, from the demo data.
const NIGHT = foldNight(parseRunLog(readFileSync(resolve(process.cwd(), "src/features/nightshift/fixtures/sample.jsonl"), "utf8")).lines);

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

  it("says how the night went in one sentence: the robot's and the night staff's tasks together", () => {
    const totals = nightTotals(data());
    // The day staff's 07:12 request is not the night's.
    expect(totals).toEqual({ done: NIGHT.tasksDone + 2, total: NIGHT.tasks.size + 2 });
    expect(nightSummary(data(), totals)).toBe(`Roboten og nattevakten fullførte ${NIGHT.tasksDone + 2} av ${NIGHT.tasks.size + 2} oppgaver, og ingen rom venter på renhold.`);
    const dirty = data().rooms!.map((room, index) => (index < 3 ? { ...room, status: "ma_vaskes" as const } : room));
    expect(nightSummary(data({ rooms: dirty }), totals)).toMatch(/, og 3 rom skal vaskes før innsjekk\.$/);
  });

  it("calls a night that went well fine, and is plain about the rest", () => {
    expect(nightVerdict(data(), { done: 71, total: 81 })).toEqual({ text: "Natten gikk fint.", good: true });
    expect(nightVerdict(data(), { done: 49, total: 71 })).toEqual({ text: "Natten er over.", good: false });
    expect(nightVerdict(data({ nightStatus: "loading" }), null).text).toBe("Henter natten …");
    expect(nightVerdict(data({ nightStatus: "error" }), null).text).toBe("Natten er ikke lastet ennå.");
    expect(nightVerdict(data({ robot: { ...selectRobot(NIGHT), ended: false } }), { done: 3, total: 9 })).toEqual({ text: "Natten er i gang.", good: true });
  });
});

describe("selectHighlights (the figures)", () => {
  it("gives the admin six good-news figures, green where the figure is good", () => {
    const figures = selectHighlights(data());
    expect(figures.map((figure) => figure.label)).toEqual(["Nye bookinger i dag", "Belegg i natt", "Oppgaver fullført i natt", "Timer spart av roboten", "Rom klare til salg", "Gjester fornøyd"]);
    expect(figures).toHaveLength(MAX_HIGHLIGHTS);
    const by = Object.fromEntries(figures.map((figure) => [figure.id, figure]));
    expect(by.bookinger).toMatchObject({ value: 10 });
    expect(by.belegg).toMatchObject({ value: 86, unit: "%", tone: "success" });
    expect(by.oppgaver).toMatchObject({ value: NIGHT.tasksDone + 2, unit: `av ${NIGHT.tasks.size + 2}`, tone: "success" });
    expect(by.fornoyd).toMatchObject({ value: "4,7", unit: "av 5", tone: "success" });
    const ready = data().rooms!.filter((room) => room.status === "klar").length;
    expect(by.klare).toMatchObject({ value: ready, unit: `av ${ready} ledige`, tone: "success" });
    // Nothing on the row is a warning or a danger.
    expect(figures.every((figure) => figure.tone === "success" || figure.tone === "default")).toBe(true);
  });

  it("gives the robot manager the night's work, the rooms checked and the stores instead of bookings", () => {
    expect(selectHighlights(data({ role: "robot" })).map((figure) => figure.id)).toEqual(["oppgaver", "spart", "klare", "sjekket", "lager"]);
    const lager = selectHighlights(data({ role: "robot" })).find((figure) => figure.id === "lager");
    expect(lager).toMatchObject({ value: STOCK.length - 1, unit: `av ${STOCK.length}`, tone: "success" });
  });

  it("leaves the night's figures empty until the night is in, and keeps today's", () => {
    const figures = selectHighlights(data({ night: null, rooms: null, robot: null, loading: true, nightStatus: "loading" }));
    expect(figures.filter((figure) => figure.fromNight).every((figure) => figure.value === null)).toBe(true);
    expect(figures.find((figure) => figure.id === "bookinger")?.value).toBe(10);
  });

  it("estimates the hours the robot saved from the tasks it finished", () => {
    expect(minutesSaved(NIGHT)).toBeGreaterThan(NIGHT.tasksDone * 5);
    expect(hoursLabel(717)).toBe("12");
    expect(hoursLabel(270)).toBe("4,5");
    expect([atNight("23:40"), atNight("05:59"), atNight("06:00"), atNight("21:59"), atNight(null)]).toEqual([true, true, false, false, false]);
  });
});
