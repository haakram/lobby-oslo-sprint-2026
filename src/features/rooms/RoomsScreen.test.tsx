import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { foldNight, selectRooms } from "@/features/dashboard/selectors";
import { parseRunLog } from "@/features/nightshift/runlog";
import { osloToday } from "@/features/reception/dates";
import { assignRooms, roomsToClean } from "./housekeeping";
import { RoomsScreen } from "./RoomsScreen";

// The key rack moved here from Oversikt; these tests cover the room board, the sheet and the route.
const DEMO = readFileSync(resolve(process.cwd(), "src/features/nightshift/fixtures/sample.jsonl"), "utf8");
const NIGHT = foldNight(parseRunLog(DEMO).lines);
const ROOMS = selectRooms(NIGHT);

const fetchMock = vi.fn<typeof fetch>();

function rack() {
  return within(screen.getByRole("region", { name: "Romstatus" }));
}

function route({ run = DEMO, runStatus = 200 }: { run?: string; runStatus?: number } = {}) {
  fetchMock.mockImplementation(async (input) => {
    const url = String(input);
    if (url === "/runs/demo.jsonl") return new Response(run, { status: runStatus });
    throw new Error(`unexpected fetch ${url}`);
  });
}

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RoomsScreen (Rom og renhold)", () => {
  it("shows every room of the night's hotel with its status, and opens one room's night", async () => {
    route();
    render(<RoomsScreen />);
    expect(screen.getByRole("heading", { level: 1, name: "Rom og renhold" })).toBeInTheDocument();
    await screen.findByRole("region", { name: "Romstatus" });
    await rack().findByRole("button", { name: /^Rom 319/ });

    expect(rack().getAllByRole("button", { name: /^Rom \d{3}:/ })).toHaveLength(36);
    expect(rack().getByRole("button", { name: /^Rom 319: Opptatt, 2 åpne avvik/ })).toBeInTheDocument();
    expect(rack().getByRole("button", { name: /^Rom 103: Klar/ })).toBeInTheDocument();
    expect(ROOMS.find((room) => room.id === "room-208")?.status).toBe("ikke_forstyrr");

    fireEvent.click(rack().getByRole("button", { name: /^Rom 319/ }));
    const sheet = screen.getByRole("dialog", { name: "Rom 319" });
    expect(within(sheet).getAllByText("Banket på, gjesten åpnet").length).toBeGreaterThan(0);
    expect(within(sheet).getAllByText("Gjesteklage").length).toBe(2);
  });

  it("splits today's round between the cleaners and sends them through Ruter", async () => {
    const night = [
      { v: 1, type: "start", shift: "w2-3fa94c1d07be4e2a9c55d1e8b6a0f217", mode: "practice", seed: 1, t: 1794058477 },
      { v: 1, type: "call", cmd: "status", ok: true, clock: "23:10:00" },
      { v: 1, type: "decision", kind: "room_status", data: { room: "room-214", status: "ma_vaskes", source: "room_check" } },
      { v: 1, type: "decision", kind: "room_status", data: { room: "room-201", status: "ma_vaskes", source: "room_check" } },
    ];
    route({ run: night.map((line) => JSON.stringify(line)).join("\n") });
    render(<RoomsScreen />);

    // One primary on the screen, in the header, above the rack (a phone sees it without scrolling).
    const send = await screen.findByRole("link", { name: "Lag renholdsrute" });
    // Ruter opens on Dagens renhold (the night's dirty rooms and today's departures), where the saving shows.
    expect(send).toHaveAttribute("href", "/ruter");
    expect(send.compareDocumentPosition(screen.getByRole("region", { name: "Romstatus" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(rack().getByRole("button", { name: /^Rom 201: Må vaskes/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Renholdere i dag" })).toBeInTheDocument();

    // "Legg i renholdsrute" on another room adds it to tonight's dirty rooms, not a route of one.
    fireEvent.click(rack().getByRole("button", { name: /^Rom 103/ }));
    const sheet = within(screen.getByRole("dialog", { name: "Rom 103" }));
    expect(sheet.getByRole("link", { name: "Legg i renholdsrute" })).toHaveAttribute("href", "/ruter?rom=room-201,room-214,room-103");
  });

  it("puts the check round in the header when no room must be cleaned", async () => {
    route();
    render(<RoomsScreen />);
    await rack().findByRole("button", { name: /^Rom 319/ });
    const unchecked = ROOMS.filter((room) => room.status === "ukjent").length;
    expect(screen.getAllByRole("link", { name: `Lag sjekkrunde for ${unchecked} rom` })).toHaveLength(1);
    expect(screen.queryByRole("link", { name: "Lag renholdsrute" })).not.toBeInTheDocument();
  });

  it("opens the room a link names (?rom= from a tile on Oversikt) once the night is in", async () => {
    route();
    render(<RoomsScreen initialRoom="room-319" />);
    const sheet = await screen.findByRole("dialog", { name: "Rom 319" });
    expect(within(sheet).getAllByText("Gjesteklage").length).toBe(2);
  });

  it("shows a room sent to reception as Venter på PMS-en on its own rack, never a green Klar, like Oversikt and the 3D map", async () => {
    // The demo night: 213 is free in the room check but still booked, so the rack says "Bekreft først" until reception acts.
    const demo = readFileSync(resolve(process.cwd(), "public/runs/demo.jsonl"), "utf8");
    route({ run: demo });
    const { unmount } = render(<RoomsScreen />);
    expect(await rack().findByRole("button", { name: /^Rom 213: Bekreft først/ })).toBeInTheDocument();
    unmount();

    // Step 2 done (on Rom or Overlevering): sent to reception, the booking system not yet confirming it.
    const at = { at: "06:05", by: "Hanne Vold", receptionist: "Hanne Vold", checks: ["folio", "bagasje", "kort"] };
    localStorage.setItem("lobby:room-check-marks", JSON.stringify({ [osloToday()]: { "room-213": { action: "released", ...at, confirmed: at } } }));
    route({ run: demo });
    render(<RoomsScreen />);
    expect(await rack().findByRole("button", { name: /^Rom 213: Venter på PMS-en/ })).toBeInTheDocument();
    expect(rack().queryByRole("button", { name: /^Rom 213: (Klar|Bekreft først)/ })).not.toBeInTheDocument();
  });

  it("shows an error with a retry when the night can't be loaded", async () => {
    route({ run: "", runStatus: 500 });
    render(<RoomsScreen />);
    expect(await screen.findByText("Fikk ikke lastet natten")).toBeInTheDocument();
    route();
    fireEvent.click(screen.getByRole("button", { name: "Prøv igjen" }));
    await waitFor(() => expect(rack().getAllByRole("button", { name: /^Rom \d{3}:/ })).toHaveLength(36));
  });
});

describe("housekeeping", () => {
  const cleaners = [
    { id: "a", name: "A", role: "Renhold" as const, shift: "dag" as const, area: "1. etasje", phone: "" },
    { id: "b", name: "B", role: "Renhold" as const, shift: "dag" as const, area: "2. etasje", phone: "" },
  ];

  it("puts the dirty rooms first, then the unchecked ones", () => {
    const list = roomsToClean(ROOMS);
    const firstUnchecked = list.findIndex((room) => room.status === "ukjent");
    expect(list.slice(0, firstUnchecked).every((room) => room.status === "ma_vaskes")).toBe(true);
  });

  it("gives each cleaner their own floor and shares the rest", () => {
    const assignments = assignRooms(ROOMS, cleaners);
    expect(assignments.find((a) => a.cleaner.id === "a")?.rooms.every((room) => room.floor === 1 || room.floor === 3)).toBe(true);
    expect(assignments.find((a) => a.cleaner.id === "b")?.rooms.some((room) => room.floor === 2)).toBe(true);
    const total = assignments.reduce((sum, a) => sum + a.rooms.length, 0);
    expect(total).toBe(roomsToClean(ROOMS).length);
  });
});
