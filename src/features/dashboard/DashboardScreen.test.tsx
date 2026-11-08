import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canAccess, type Role } from "@/features/auth/roles";
import { SessionProvider } from "@/features/auth/SessionProvider";
import { type ModuleId, MODULES } from "@/features/modules/registry";
import { parseRunLog } from "@/features/nightshift/runlog";
import { MANUAL_REQUESTS } from "@/features/requests/testData";
import { occupancy, revenueLastNight } from "@/features/rooms/pms";
import { DashboardScreen } from "./DashboardScreen";
import { atNight } from "./highlights";
import { placeLabel } from "./labels";
import { foldNight, selectRobot, selectRooms } from "./selectors";

// Oversikt is the whole hotel at a glance, good news first: a greeting with how the night went, the
// hotel's figures and one widget per module the role may open. What needs a person is in the bell
// (src/features/notifications), not on this page. The demo night may be swapped for a better run:
// the expectations below are read off the same fixture.
const DEMO = readFileSync(resolve(process.cwd(), "src/features/nightshift/fixtures/sample.jsonl"), "utf8");
const NIGHT = foldNight(parseRunLog(DEMO).lines);
const ROOMS = selectRooms(NIGHT);
const ROBOT = selectRobot(NIGHT);
// The robot's figures are the one tally of its night (nightshift/outcomes.ts); the night staff's are said apart.
const STAFF_DONE = MANUAL_REQUESTS.filter((request) => atNight(request.at) && request.status === "fullfort").length;
const DONE = NIGHT.tally.done;
const TOTAL = NIGHT.tally.total;
const ADMIN_FIGURES = ["Belegg i natt", "Losjiinntekt i natt", "Robotens oppdrag i natt", "Timer spart, anslag", "Rom klare til salg", "Gjester fornøyd"];

/** The widget's heading as the registry names the module; the robot's widget is "Roboten". */
function widgetName(id: ModuleId): RegExp {
  const name = id === "hotell3d" ? "Roboten" : MODULES.find((module) => module.id === id)?.name;
  return new RegExp(`^${name}`);
}

const WIDGET_MODULES = MODULES.filter((module) => module.widget);

const fetchMock = vi.fn<typeof fetch>();

function route({ run = DEMO, runStatus = 200, calls }: { run?: string; runStatus?: number; calls?: Response } = {}) {
  fetchMock.mockImplementation(async (input) => {
    const url = String(input);
    if (url === "/runs/demo.jsonl") return new Response(run, { status: runStatus });
    if (url === "/api/reception/calls") return calls ?? Response.json({ error: "ikke satt opp" }, { status: 503 });
    throw new Error(`unexpected fetch ${url}`);
  });
}

function as(role: Role, children: ReactNode) {
  const session = { user: { u: role, name: "Test", role }, view: role, effectiveRole: role, exp: 0 };
  return <SessionProvider session={session}>{children}</SessionProvider>;
}

function rooms() {
  return within(screen.getByRole("region", { name: "Rom og renhold" }));
}

function figures() {
  return within(screen.getByRole("region", { name: "Hotellet i tall" }));
}

/** A figure's value and unit, read from the line above its label. */
function figure(label: string): string {
  return figures().getByText(label).previousElementSibling?.textContent ?? "";
}

beforeEach(() => {
  // A 503 keeps the reception widget quiet for a minute in this tab, and the staff-kept statuses of
  // work orders live in localStorage; each test starts fresh.
  sessionStorage.clear();
  localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DashboardScreen (Oversikt, the home page)", () => {
  it("shows the admin the whole hotel: the top bar, the greeting, the figures and one widget per module", async () => {
    route();
    render(as("admin", <DashboardScreen />));

    expect(screen.getByText("Hotell Nattskift")).toBeInTheDocument();
    await rooms().findByRole("link", { name: /^Rom 319/ });

    // The top bar: the night, the shift clock at the handover, the robot's chip.
    expect(screen.getByText(/^Natt til \p{L}+ \d{1,2}\. \p{L}+ · overlevering 06:00$/u)).toBeInTheDocument();
    expect(screen.getByText("Skiftklokke").parentElement).toHaveTextContent("Skiftklokke 06:00");
    expect(screen.getAllByText("Skiftet er over").length).toBeGreaterThan(0);

    // Good news first: the greeting is the page's heading, honest about the time of day.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^(God morgen|God dag|God kveld|Hei), Test$/);
    expect(screen.getByText(`Roboten fullførte ${DONE} av ${TOTAL} oppdrag. Nattevakten ordnet ${STAFF_DONE} til. Ingen rom venter på renhold.`, { exact: false })).toBeInTheDocument();

    // Six figures along one rule: last night's rooms and money, the robot's night, the rooms, the guests.
    for (const label of ADMIN_FIGURES) expect(figures().getByText(label)).toBeInTheDocument();
    // One occupancy: the booking system's last night, as on Gjester and Overlevering.
    const revenue = revenueLastNight(ROOMS.length);
    expect(figure("Belegg i natt")).toBe(`${occupancy(revenue, ROOMS.length)}%`);
    expect(figures().getByText(`${revenue.roomsSold} av ${ROOMS.length} rom solgt`)).toBeInTheDocument();
    expect(figures().getByText(/^Snittpris [\d\s\u00a0]+ kr · RevPAR [\d\s\u00a0]+ kr$/)).toBeInTheDocument();
    // The night's misses are part of its total, not a red count of their own; the server's verdict is said.
    expect(figure("Robotens oppdrag i natt")).toBe(`${DONE}av ${TOTAL}`);
    expect(figures().getByText(new RegExp(`^Godkjent av Wybe-serveren: ${NIGHT.tally.done} av ${NIGHT.tally.reported}`))).toBeInTheDocument();
    expect(screen.queryByText(/feilet/)).not.toBeInTheDocument();
    // The estimate says it is one, and how it is made.
    expect(figure("Timer spart, anslag")).toMatch(/^ca\./);
    expect(figures().getByText("Slik regner vi")).toBeInTheDocument();
    // Under the row: which figures are the robot's log, which test data, which estimates.
    expect(figures().getByText(/^Fra robotens natt \(kjøringsloggen\): Robotens oppdrag i natt, Rom klare til salg\. Testdata/)).toHaveTextContent(/Anslag: Timer spart\.$/);

    // One widget per module that has one, in registry order; the robot is one small widget.
    const widgets = WIDGET_MODULES.map((module) => screen.getByRole("region", { name: widgetName(module.id) }));
    expect(widgets).toHaveLength(8);
    const order = widgets.map((widget) => widget.compareDocumentPosition(widgets[0]));
    expect(order.slice(1).every((position) => position & Node.DOCUMENT_POSITION_PRECEDING)).toBe(true);

    // The key rack in small: every room a tile, linking into Rom og renhold.
    expect(rooms().getAllByRole("link", { name: /^Rom \d{3}:/ })).toHaveLength(ROOMS.length);
    expect(rooms().getByRole("link", { name: /^Rom 319: Opptatt, avvik/ })).toHaveAttribute("href", "/rom?rom=room-319");
    expect(rooms().getByRole("link", { name: /^Rom 103: Klar/ })).toBeInTheDocument();
    expect(rooms().getByRole("link", { name: "Åpne Rom og renhold" })).toHaveAttribute("href", "/rom");
    // The tiles say their status with an icon too, not only the tile colour.
    expect(rooms().getByRole("link", { name: /^Rom 319:/ }).querySelectorAll("svg").length).toBeGreaterThan(0);
  });

  it("has no Nå band and no red or amber on the page: what needs a person is in the bell", async () => {
    route();
    const { container } = render(as("admin", <DashboardScreen />));
    await rooms().findByRole("link", { name: /^Rom 319/ });

    expect(screen.queryByRole("region", { name: "Oversikt" })).not.toBeInTheDocument();
    expect(screen.queryByText(/venter på noen|høy prioritet|under minimum:/)).not.toBeInTheDocument();
    // The demo night has no room to clean, so nothing on Oversikt is painted as a warning or danger.
    expect(container.querySelectorAll('[class*="danger"], [class*="warning"]')).toHaveLength(0);
    // Green carries the good news: the figures and the widgets' first lines.
    expect(container.querySelectorAll(".text-success").length).toBeGreaterThan(4);
  });

  it("leads the widgets with what got done: requests and work orders done first, stock above minimum", async () => {
    route();
    render(as("admin", <DashboardScreen />));
    await rooms().findByRole("link", { name: /^Rom 319/ });

    const requests = within(screen.getByRole("region", { name: /^Forespørsler/ }));
    expect(requests.getByText(/av \d+ fullført/)).toBeInTheDocument();
    expect(requests.getAllByText(/fullført$/).length).toBeGreaterThan(0);
    within(requests.getByRole("list", { name: "Sist fullført" }))
      .getAllByRole("listitem")
      .forEach((row) => expect(row).toHaveTextContent(/fullført/));

    const maintenance = within(screen.getByRole("region", { name: /^Vedlikehold/ }));
    expect(maintenance.getByText(/løst i dag/)).toBeInTheDocument();
    expect(maintenance.getByRole("list", { name: "Sist løst" })).toBeInTheDocument();

    const stock = within(screen.getByRole("region", { name: /^Lager og lin/ }));
    expect(stock.getByText(/av 16 varer over minimum/)).toBeInTheDocument();
  });

  it("makes the cleaning route the primary action when the night found rooms to clean", async () => {
    const night = [
      { v: 1, type: "start", shift: "w2-3fa94c1d07be4e2a9c55d1e8b6a0f217", mode: "practice", seed: 1, t: 1794058477 },
      { v: 1, type: "call", cmd: "status", ok: true, clock: "23:10:00" },
      { v: 1, type: "decision", kind: "room_status", data: { room: "room-214", status: "ma_vaskes", source: "room_check" } },
      { v: 1, type: "decision", kind: "room_status", data: { room: "room-201", status: "ma_vaskes", source: "room_check" } },
    ];
    route({ run: night.map((line) => JSON.stringify(line)).join("\n") });
    render(as("admin", <DashboardScreen />));

    const send = await screen.findByRole("link", { name: "Lag renholdsrute" });
    expect(send).toHaveAttribute("href", "/ruter?rom=room-201,room-214");
    expect(screen.getByText(/2 rom skal vaskes før innsjekk\.$/)).toBeInTheDocument();
    // One primary action on the page, and it is this one.
    expect(screen.getAllByRole("link", { name: /^Lag / })).toHaveLength(1);
    expect(rooms().getByRole("link", { name: /^Rom 201: Må vaskes/ })).toBeInTheDocument();
  });

  it("offers a check round instead when no room must be cleaned and some are unchecked", async () => {
    route();
    render(as("admin", <DashboardScreen />));
    const unchecked = ROOMS.filter((room) => room.status === "ukjent").length;
    expect(await screen.findByRole("link", { name: `Lag sjekkrunde for ${unchecked} rom` })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Lag renholdsrute" })).not.toBeInTheDocument();
  });

  it.each<[Role, ModuleId[], ModuleId[]]>([
    ["receptionist", ["rom", "gjester", "foresporsler", "ansatte", "resepsjon"], ["vedlikehold", "lager", "hotell3d"]],
    ["robot", ["rom", "foresporsler", "vedlikehold", "lager", "hotell3d"], ["gjester", "ansatte", "resepsjon"]],
  ])("shows the %s only the modules they may open", async (role, shown, hidden) => {
    route();
    render(as(role, <DashboardScreen />));
    await rooms().findByRole("link", { name: /^Rom 319/ });

    for (const id of shown) expect(screen.getByRole("region", { name: widgetName(id) })).toBeInTheDocument();
    for (const id of hidden) expect(screen.queryByRole("region", { name: widgetName(id) })).not.toBeInTheDocument();
    for (const entry of WIDGET_MODULES) expect(shown.includes(entry.id) || hidden.includes(entry.id), entry.id).toBe(true);
    expect(shown.every((id) => canAccess(role, MODULES.find((entry) => entry.id === id)!.route))).toBe(true);
  });

  it.each<[Role, string[], string[]]>([
    ["receptionist", ADMIN_FIGURES, ["Rom sjekket av roboten", "Varer over minimum"]],
    ["robot", ["Robotens oppdrag i natt", "Timer spart, anslag", "Rom klare til salg", "Rom sjekket av roboten", "Varer over minimum"], ["Belegg i natt", "Losjiinntekt i natt", "Gjester fornøyd"]],
  ])("shows the %s only the figures of screens they may open", async (role, shown, hidden) => {
    route();
    render(as(role, <DashboardScreen />));
    await rooms().findByRole("link", { name: /^Rom 319/ });
    for (const label of shown) expect(figures().getByText(label)).toBeInTheDocument();
    for (const label of hidden) expect(figures().queryByText(label)).not.toBeInTheDocument();
  });

  it("greets a shared login by its desk, not by the role's name", async () => {
    route();
    const session = { user: { u: "resepsjon", name: "Resepsjonist", role: "receptionist" as const }, view: "receptionist" as const, effectiveRole: "receptionist" as const, exp: 0 };
    render(
      <SessionProvider session={session}>
        <DashboardScreen />
      </SessionProvider>,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^(God morgen|God dag|God kveld|Hei), resepsjonen$/);
  });

  it("says an empty night is empty, not still loading", async () => {
    route({ run: "" });
    render(as("admin", <DashboardScreen />));
    expect(await rooms().findByText("Ingen natt å vise ennå.")).toBeInTheDocument();
    expect(screen.getByText("Ingen natt å vise ennå.", { selector: "h1 + p span" })).toBeInTheDocument();
  });

  it("shows the robot as one small widget with its night as a total, and the way into the 3D map", async () => {
    route();
    render(as("robot", <DashboardScreen />));
    const robot = within(await screen.findByRole("region", { name: "Roboten" }));
    await robot.findByText("Skift slutt");

    expect(robot.getByText(placeLabel(ROBOT.location))).toBeInTheDocument();
    expect(robot.getByText(String(DONE)).parentElement).toHaveTextContent(`${DONE} av ${TOTAL} oppdrag fullført`);
    expect(robot.queryByText(/feilet/)).not.toBeInTheDocument();
    expect(robot.getByRole("link", { name: "Vis i 3D-kartet" })).toHaveAttribute("href", "/hotell");
    expect(robot.getByRole("link", { name: "Natteskift" })).toHaveAttribute("href", "/natteskift");
    expect(screen.queryByLabelText("Hotellet som plantegning")).not.toBeInTheDocument();
  });

  it("says honestly that the receptionist is not connected, and lists the calls when the API answers", async () => {
    route();
    const first = render(as("receptionist", <DashboardScreen />));
    const reception = within(await screen.findByRole("region", { name: "Resepsjon" }));
    expect(await reception.findByText("Resepsjonisten er ikke koblet til ennå")).toBeInTheDocument();
    expect(reception.getByRole("link", { name: "Åpne Resepsjon" })).toHaveAttribute("href", "/resepsjon");
    first.unmount();
    sessionStorage.clear();

    const call = {
      id: "conv_1",
      startedAt: "2026-11-07T21:15:00.000Z",
      durationSecs: 95,
      status: "done",
      title: "Booking med hund",
      summary: "Gjesten vil bo to netter med en liten hund.",
      language: "en",
      callerName: "Kari Nordmann",
      callbackNumber: null,
      requestType: "booking",
      arrival: "2026-11-20",
      departure: "2026-11-22",
      roomType: "double",
      guests: 2,
      needsCallback: true,
    };
    route({ calls: Response.json({ calls: [call] }) });
    render(as("receptionist", <DashboardScreen />));

    expect(await screen.findByText("Booking med hund")).toBeInTheDocument();
    expect(screen.getByText("Kari Nordmann")).toBeInTheDocument();
    expect(screen.getByText("Booking 20.11.2026–22.11.2026")).toBeInTheDocument();
    // A plain tag: the call-back itself is an alert in the bell.
    expect(screen.getByText("Ring tilbake")).not.toHaveClass("text-warning");
  });

  it("shows an error with a retry when the night can't be loaded, and keeps the rest of the hotel", async () => {
    route({ run: "", runStatus: 500 });
    render(as("admin", <DashboardScreen />));

    expect(await screen.findByText("Fikk ikke lastet natten")).toBeInTheDocument();
    expect(screen.getByText("Natten er ikke lastet ennå.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Gjester og bookinger" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /^Lager og lin/ })).toBeInTheDocument();
    expect(screen.getByText("Ingen data fra natten")).toBeInTheDocument();
    // The night's widgets and figures say it isn't there, instead of loading forever.
    expect(rooms().getByText(/^Ikke lastet/)).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Roboten" })).getByText(/^Ikke lastet/)).toBeInTheDocument();
    expect(figure("Robotens oppdrag i natt")).toBe("–");
    // Today's figures don't hang on the night.
    expect(figure("Belegg i natt")).toMatch(/^\d+%$/);

    route();
    fireEvent.click(screen.getByRole("button", { name: "Prøv igjen" }));
    await waitFor(() => expect(rooms().getAllByRole("link", { name: /^Rom \d{3}:/ })).toHaveLength(ROOMS.length));
    expect(screen.queryByText("Fikk ikke lastet natten")).not.toBeInTheDocument();
  });
});
