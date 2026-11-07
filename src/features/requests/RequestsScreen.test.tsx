import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RequestsScreen } from "./RequestsScreen";

// A short night: the robot fails one request (towels, Rom 108) and leaves one open when the shift ends
// (room service, Rom 104).
const NIGHT = [
  { v: 1, type: "start", shift: "w2-0000000000000000000000000000000a", mode: "practice", seed: 1, t: 1794058477 },
  { v: 1, type: "state", clock: "22:00:00", location: "charging-dock", score: 0 },
  { v: 1, type: "decision", kind: "request", data: { request: "R-001", kind: "amenity", text: "Two towels for room 108, please" } },
  { v: 1, type: "decision", kind: "task_start", data: { request: "R-001", kind: "amenity", room: "room-108" } },
  { v: 1, type: "state", clock: "22:10:00", location: "lobby", score: 0 },
  { v: 1, type: "decision", kind: "task_failed", data: { request: "R-001" } },
  { v: 1, type: "decision", kind: "request", data: { request: "R-002", kind: "tray", text: "A tray to room 104" } },
  { v: 1, type: "state", clock: "05:55:00", location: "lobby", score: 0 },
  { v: 1, type: "decision", kind: "task_start", data: { request: "R-002", kind: "tray", room: "room-104" } },
  { v: 1, type: "end", score: 10, requests_served: 0, reason: "server ended: time" },
]
  .map((line) => JSON.stringify(line))
  .join("\n");

const fetchMock = vi.fn<typeof fetch>();

function route({ run = () => new Response(NIGHT, { status: 200 }), calls = () => Response.json({ error: "ikke satt opp" }, { status: 503 }) }: { run?: () => Response; calls?: () => Response } = {}) {
  fetchMock.mockImplementation(async (input) => {
    const url = String(input);
    if (url === "/runs/demo.jsonl") return run();
    if (url === "/api/reception/calls") return calls();
    throw new Error(`unexpected fetch ${url}`);
  });
}

/** The row (list item) a piece of its text sits in. */
function rowWith(text: string | RegExp): HTMLElement {
  const row = screen.getByText(text).closest("li");
  if (!row) throw new Error(`no row for ${text}`);
  return row;
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

describe("RequestsScreen (Forespørsler)", () => {
  it("lets staff take over what the robot failed and what it left open", async () => {
    route();
    render(<RequestsScreen />);
    const failed = await screen.findByRole("button", { name: "Ta over: Utstyr, Rom 108" });
    expect(screen.getByRole("button", { name: "Ta saken: Romservice, Rom 104" })).toBeInTheDocument();
    expect(within(rowWith("«Two towels for room 108, please»")).getByText("Roboten · trenger en person")).toBeInTheDocument();

    fireEvent.click(failed);
    const towels = rowWith("«Two towels for room 108, please»");
    expect(within(towels).getByText("Pågår")).toBeInTheDocument();
    expect(within(towels).getByText("Personalet tok over fra roboten")).toBeInTheDocument();
    expect(within(towels).getByRole("button", { name: "Marker fullført: Utstyr, Rom 108" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^Roboten fikk det ikke til/ })).not.toBeInTheDocument();
  });

  it("says where the row went and puts the focus on Angre, which puts it back", async () => {
    route();
    render(<RequestsScreen />);
    fireEvent.click(await screen.findByRole("button", { name: "Ta over: Utstyr, Rom 108" }));

    const status = screen.getByRole("status", { name: "" });
    expect(status).toHaveTextContent("Utstyr, Rom 108 står nå under Pågår.");
    const undo = within(status).getByRole("button", { name: "Angre: Utstyr, Rom 108" });
    expect(undo).toHaveFocus();

    fireEvent.click(undo);
    expect(screen.queryByText(/står nå under/)).not.toBeInTheDocument();
    const back = screen.getByRole("button", { name: "Ta over: Utstyr, Rom 108" });
    expect(back).toHaveFocus();
    expect(within(rowWith("«Two towels for room 108, please»")).getByText("Feilet")).toBeInTheDocument();
  });

  it("closes a request that is already in progress with one click, and shows it first under Fullført", async () => {
    route();
    render(<RequestsScreen />);
    await screen.findByRole("button", { name: /^Ta over/ });
    // req-m2 comes from staff already in progress (Pågår), not Ny: the first click must close it.
    fireEvent.click(screen.getByRole("button", { name: "Marker fullført: Romservice, Rom 104" }));
    const done = rowWith("Frokost på rommet 08:30, fire personer.");
    expect(within(done).getByText("Fullført")).toBeInTheDocument();
    expect(screen.getByText("Romservice, Rom 104 står nå under Fullført.")).toBeInTheDocument();
    const fullfort = screen.getByRole("heading", { name: /^Fullført/ }).nextElementSibling as HTMLElement;
    expect(within(fullfort).getAllByRole("listitem")[0]).toBe(done);
  });

  it("says when the night failed to load, offers Prøv igjen, and keeps the other sources", async () => {
    let runOk = false;
    route({ run: () => (runOk ? new Response(NIGHT, { status: 200 }) : new Response("", { status: 500 })) });
    render(<RequestsScreen />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Fikk ikke lastet natten");
    // The staff and voice requests stay, and the note under the list no longer claims the run log.
    expect(screen.getByText("To ekstra puter og et pledd.")).toBeInTheDocument();
    expect(screen.queryByText(/Fra robotens natt/)).not.toBeInTheDocument();

    runOk = true;
    fireEvent.click(within(alert).getByRole("button", { name: "Prøv igjen å laste natten" }));
    expect(await screen.findByRole("button", { name: "Ta over: Utstyr, Rom 108" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText(/Fra robotens natt/)).toBeInTheDocument();
  });

  it("says when the phone failed, with Prøv igjen, and when the receptionist is not connected", async () => {
    route({ calls: () => new Response("boom", { status: 500 }) });
    const { unmount } = render(<RequestsScreen />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Fikk ikke hentet telefonen");
    fireEvent.click(within(alert).getByRole("button", { name: "Prøv igjen å hente telefonen" }));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url) === "/api/reception/calls")).toHaveLength(2));
    unmount();

    route();
    render(<RequestsScreen />);
    expect(await screen.findByText("Telefonen er ikke med i listen: resepsjonisten er ikke koblet til ennå.")).toBeInTheDocument();
    expect(screen.queryByText(/Fra AI-resepsjonisten/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Telefon" }));
    expect(screen.getByText("Resepsjonisten er ikke koblet til ennå.")).toBeInTheDocument();
  });

  it("shows the phone's callbacks with the caller in the text, not as the one who has the case", async () => {
    const call = { id: "c1", startedAt: "2026-11-07T21:15:00.000Z", title: "Sen ankomst", summary: "Kommer etter midnatt", callerName: "Kari Nordmann", requestType: null, arrival: null, departure: null, guests: null, needsCallback: true };
    route({ calls: () => Response.json({ calls: [call] }) });
    render(<RequestsScreen />);
    const row = rowWith(await screen.findByText("Ring tilbake til Kari Nordmann: Kommer etter midnatt").then((el) => el.textContent ?? ""));
    expect(within(row).getByText("Resepsjon")).toBeInTheDocument();
    expect(screen.getByText(/Fra AI-resepsjonisten/)).toBeInTheDocument();
  });

  it("holds the figures while the night is loading instead of showing a calm zero", async () => {
    let release: (value: Response) => void = () => {};
    route({ run: () => new Promise<Response>((resolve) => (release = resolve)) as unknown as Response });
    render(<RequestsScreen />);
    expect(await screen.findByText("Henter robotens natt")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    release(new Response(NIGHT, { status: 200 }));
    expect(await screen.findByRole("button", { name: "Ta over: Utstyr, Rom 108" })).toBeInTheDocument();
    expect(screen.queryByText("Henter robotens natt")).not.toBeInTheDocument();
  });
});
