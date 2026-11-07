import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseRunLog } from "@/features/nightshift/runlog";
import { DashboardScreen } from "./DashboardScreen";
import { foldNight, selectKpis, selectRooms } from "./selectors";

// The home page is the overview now (it replaced the card launcher); these tests cover what it shows.
// The demo night may be swapped for a better run: the screen must show whatever it holds.
const DEMO = readFileSync(resolve(process.cwd(), "src/features/nightshift/fixtures/sample.jsonl"), "utf8");
const NIGHT = foldNight(parseRunLog(DEMO).lines);
const KPIS = selectKpis(NIGHT);
const ROOMS = selectRooms(NIGHT);
const FIRST_ORDER = NIGHT.workOrders.at(-1);

const fetchMock = vi.fn<typeof fetch>();

/** The key rack. The robot's 2D plan also offers the rooms as buttons, so queries are scoped. */
function rack() {
  return within(screen.getByRole("region", { name: "Romstatus" }));
}

function route({ run = DEMO, runStatus = 200, calls }: { run?: string; runStatus?: number; calls?: Response } = {}) {
  fetchMock.mockImplementation(async (input) => {
    const url = String(input);
    if (url === "/runs/demo.jsonl") return new Response(run, { status: runStatus });
    if (url === "/api/reception/calls") return calls ?? Response.json({ error: "ikke satt opp" }, { status: 503 });
    throw new Error(`unexpected fetch ${url}`);
  });
}

beforeEach(() => {
  // A 503 keeps the reception panel quiet for a minute in this tab, and assigned work orders are
  // kept in localStorage; each test starts fresh.
  sessionStorage.clear();
  localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DashboardScreen (Oversikt, the home page)", () => {
  it("shows the hotel at the 06:00 handover of the demo night", async () => {
    route();
    render(<DashboardScreen />);

    expect(screen.getByText("Hotell Nattskift")).toBeInTheDocument();
    await screen.findByRole("region", { name: "Romstatus" });
    await rack().findByRole("button", { name: /^Rom 319/ });

    expect(screen.getByRole("heading", { level: 1, name: "Oversikt" })).toBeInTheDocument();
    expect(screen.getByText(/^Natt til \p{L}+ \d{1,2}\. \p{L}+ · overlevering 06:00$/u)).toBeInTheDocument();
    expect(screen.getByLabelText("Skiftklokke")).toHaveTextContent("06:00");
    expect(screen.getAllByText("Skiftet er over").length).toBeGreaterThan(0);

    const kpis = screen.getByRole("region", { name: "Natten i tall" });
    for (const value of [KPIS.roomsReady, KPIS.roomsDirty, KPIS.ordersOpen, KPIS.tasksDone]) {
      expect(within(kpis).getAllByText(String(value)).length).toBeGreaterThan(0);
    }
    expect(within(kpis).queryByText(String(KPIS.score))).not.toBeInTheDocument();

    expect(rack().getAllByRole("button", { name: /^Rom \d{3}:/ })).toHaveLength(36);
    // On the seed-1 night: 319 occupied with two guest complaints, 103 ready, 208 behind a DND sign.
    expect(rack().getByRole("button", { name: /^Rom 319: Opptatt, 2 åpne avvik/ })).toBeInTheDocument();
    expect(rack().getByRole("button", { name: /^Rom 103: Klar/ })).toBeInTheDocument();
    expect(rack().getByRole("button", { name: "Rom 105: Ikke sjekket" })).toBeInTheDocument();
    expect(ROOMS.find((room) => room.id === "room-208")?.status).toBe("ikke_forstyrr");

    expect(screen.getByRole("link", { name: /Åpne 3D-kart/ })).toHaveAttribute("href", "/hotell");
    // No WebGL in jsdom: the robot's panel shows B1's 2D plan of the hotel.
    expect(await screen.findByLabelText("Hotellet som plantegning")).toBeInTheDocument();
  });

  it("opens one room's night in a sheet", async () => {
    route();
    render(<DashboardScreen />);
    await screen.findByRole("region", { name: "Romstatus" });
    fireEvent.click(await rack().findByRole("button", { name: /^Rom 319/ }));

    const sheet = screen.getByRole("dialog", { name: "Rom 319" });
    expect(within(sheet).getAllByText("Banket på, gjesten åpnet").length).toBeGreaterThan(0);
    expect(within(sheet).getByText("R-001")).toBeInTheDocument();
    expect(within(sheet).getAllByText("Gjesteklage").length).toBe(2);
  });

  it("lets staff assign and close a work order, which updates the open count", async () => {
    route();
    render(<DashboardScreen />);
    await screen.findByRole("region", { name: "Romstatus" });
    await rack().findByRole("button", { name: /^Rom 319/ });
    const kpis = screen.getByRole("region", { name: "Natten i tall" });

    // The newest order is listed first, so its buttons come first.
    expect(FIRST_ORDER).toBeDefined();
    fireEvent.click(screen.getAllByRole("button", { name: /^Tildel: / })[0]);
    expect(screen.getByText("Tildelt")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Marker løst: / }));
    expect(within(kpis).getByText(String(KPIS.ordersOpen - 1))).toBeInTheDocument();
    expect(screen.getByText("Løst")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Angre løst: / }));
    expect(within(kpis).getAllByText(String(KPIS.ordersOpen)).length).toBeGreaterThan(0);
  });

  it("says honestly that no room needs cleaning and that the receptionist is not connected", async () => {
    route();
    render(<DashboardScreen />);

    expect(await screen.findByText("Ingen rom må vaskes")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Lag renholdsrute" })).not.toBeInTheDocument();
    expect(await screen.findByText("Resepsjonisten er ikke koblet til ennå")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Åpne Resepsjon" })).toHaveAttribute("href", "/resepsjon");
  });

  it("sends the cleaners to the rooms in Må vaskes through Ruter", async () => {
    const night = [
      { v: 1, type: "start", shift: "w2-3fa94c1d07be4e2a9c55d1e8b6a0f217", mode: "practice", seed: 1, t: 1794058477 },
      { v: 1, type: "call", cmd: "status", ok: true, clock: "23:10:00" },
      { v: 1, type: "decision", kind: "room_status", data: { room: "room-214", status: "ma_vaskes", source: "room_check" } },
      { v: 1, type: "decision", kind: "room_status", data: { room: "room-201", status: "ma_vaskes", source: "room_check" } },
    ];
    route({ run: night.map((line) => JSON.stringify(line)).join("\n") });
    render(<DashboardScreen />);

    const [send] = await screen.findAllByRole("link", { name: "Lag renholdsrute" });
    expect(send).toHaveAttribute("href", "/ruter?rom=room-201,room-214");
    expect(rack().getByRole("button", { name: /^Rom 201: Må vaskes/ })).toBeInTheDocument();
  });

  it("lists the receptionist's latest calls when the API answers", async () => {
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
    render(<DashboardScreen />);

    expect(await screen.findByText("Booking med hund")).toBeInTheDocument();
    expect(screen.getByText("Kari Nordmann")).toBeInTheDocument();
    expect(screen.getByText("Booking 20.11.2026–22.11.2026")).toBeInTheDocument();
    expect(screen.getByText("Ring tilbake")).toBeInTheDocument();
  });

  it("shows an error with a retry when the night can't be loaded, and keeps the reception panel", async () => {
    route({ run: "", runStatus: 500 });
    render(<DashboardScreen />);

    expect(await screen.findByText("Fikk ikke lastet natten")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Resepsjon" })).toBeInTheDocument();

    route();
    fireEvent.click(screen.getByRole("button", { name: "Prøv igjen" }));
    await waitFor(() => expect(rack().getAllByRole("button", { name: /^Rom \d{3}:/ })).toHaveLength(36));
  });
});
