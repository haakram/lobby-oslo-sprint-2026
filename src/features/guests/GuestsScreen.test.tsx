import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { foldNight, selectRooms } from "@/features/dashboard/selectors";
import { parseRunLog } from "@/features/nightshift/runlog";
import { GuestsScreen } from "./GuestsScreen";
import { selectGuestDay } from "./testData";

// Gjester og bookinger: arrivals and departures with what to do next, and the call-backs within reach.
const DEMO = readFileSync(resolve(process.cwd(), "src/features/nightshift/fixtures/sample.jsonl"), "utf8");
const ROOMS = selectRooms(foldNight(parseRunLog(DEMO).lines));
const DAY = selectGuestDay();

const CALL = {
  id: "conv_1",
  startedAt: "2026-11-07T21:15:00.000Z",
  title: "Booking med hund",
  summary: "Gjesten vil bo to netter med en liten hund.",
  callerName: "Kari Nordmann",
  requestType: "booking",
  arrival: "2026-11-20",
  departure: "2026-11-22",
  guests: 2,
  needsCallback: true,
};

const fetchMock = vi.fn<typeof fetch>();

function route({ runStatus = 200 }: { runStatus?: number } = {}) {
  fetchMock.mockImplementation(async (input) => {
    const url = String(input);
    if (url === "/runs/demo.jsonl") return new Response(runStatus === 200 ? DEMO : "", { status: runStatus });
    if (url === "/api/reception/calls") return Response.json({ calls: [CALL] });
    throw new Error(`unexpected fetch ${url}`);
  });
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GuestsScreen (Gjester og bookinger)", () => {
  it("offers the ready rooms beside an arrival with no room, and a way to ring a caller back", async () => {
    route();
    render(<GuestsScreen />);
    const arrivals = within(screen.getByRole("region", { name: /^Ankomster i dag/ }));
    const ready = ROOMS.filter((room) => room.status === "klar").length;
    const noRoom = DAY.arrivals.filter((stay) => !stay.room).length;
    expect(noRoom).toBeGreaterThan(0);
    const links = await arrivals.findAllByRole("link", { name: `${ready} klare rom` });
    expect(links).toHaveLength(noRoom);
    expect(links[0]).toHaveAttribute("href", "/rom");

    const reception = within(screen.getByRole("region", { name: "Fra resepsjonisten" }));
    expect(await reception.findByRole("link", { name: "Ring tilbake" })).toHaveAttribute("href", "/resepsjon");
    // The call's time carries its day, since the list is not only today's.
    expect(reception.getByText(/\d{2}:\d{2}/).textContent).not.toMatch(/^\d{2}:\d{2}$/);
  });

  it("says a departing room's status is unknown when the night failed, instead of leaving a blank", async () => {
    route({ runStatus: 500 });
    render(<GuestsScreen />);
    const departures = within(screen.getByRole("region", { name: /^Avreiser i dag/ }));
    const withRoom = DAY.departures.filter((stay) => stay.room).length;
    expect(await departures.findAllByText("Status ukjent")).toHaveLength(withRoom);
  });
});
