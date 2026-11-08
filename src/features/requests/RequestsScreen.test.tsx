import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionProvider } from "@/features/auth/SessionProvider";
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
  it("does not ask for the phone as the robot manager (the server would answer 403) and shows no phone error", async () => {
    route();
    const session = { user: { u: "robot", name: "Robot", role: "robot" as const }, view: "robot" as const, effectiveRole: "robot" as const, exp: 0 };
    render(
      <SessionProvider session={session}>
        <RequestsScreen />
      </SessionProvider>,
    );
    await screen.findByRole("button", { name: "Ta over: Utstyr, Rom 108" });
    expect(fetchMock.mock.calls.map(([input]) => String(input))).not.toContain("/api/reception/calls");
    expect(screen.queryByText(/Fikk ikke hentet telefonen/)).not.toBeInTheDocument();
    expect(screen.queryByText(/resepsjonisten er ikke koblet til/i)).not.toBeInTheDocument();
  });

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
    fireEvent.click(screen.getByRole("button", { name: "Marker fullført: Romservice, Rom 134" }));
    const done = rowWith("Frokost på rommet 08:30, fire personer.");
    expect(within(done).getByText("Fullført")).toBeInTheDocument();
    expect(screen.getByText("Romservice, Rom 134 står nå under Fullført.")).toBeInTheDocument();
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
    // No seeded calls: with the receptionist not connected, the phone filter is honestly empty.
    render(<RequestsScreen demo={[]} />);
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

  it("files the AI receptionist's calls as tasks (Telefon (AI)) and sends one to the robot in one tap; Angre takes it back", async () => {
    route();
    render(<RequestsScreen today="2026-11-08" />);
    const towels = await screen.findByRole("button", { name: "Send roboten: Utstyr, Rom 214" });
    const row = rowWith("Rom 214 ønsker to ekstra håndklær.");
    expect(within(row).getByText("Telefon (AI)")).toBeInTheDocument();
    expect(within(row).getByText("Forslag: roboten")).toBeInTheDocument();
    // A radiator is for a person: no robot button, the technician on shift instead.
    const radiator = rowWith(/Radiatoren på rom 134 virker ikke/);
    expect(within(radiator).queryByRole("button", { name: /^Send roboten/ })).not.toBeInTheDocument();
    expect(within(radiator).getByRole("button", { name: "Gi til Trond Eikeland: Teknisk, Rom 134" })).toBeInTheDocument();

    fireEvent.click(towels);
    const moved = rowWith("Rom 214 ønsker to ekstra håndklær.");
    // Nothing reaches the robot yet (TODO(phase-3)): the screen never says "sendt til roboten".
    expect(within(moved).getByText("I robotens kø")).toBeInTheDocument();
    expect(within(moved).getByText("Lagt i robotens kø · sendes når roboten er koblet til")).toBeInTheDocument();
    expect(screen.queryByText(/sendt til roboten/)).not.toBeInTheDocument();
    const status = screen.getByText("Utstyr, Rom 214 er lagt i robotens kø. Den sendes når roboten er koblet til.").closest("[role=status]") as HTMLElement;
    fireEvent.click(within(status).getByRole("button", { name: "Angre: Utstyr, Rom 214" }));
    expect(within(rowWith("Rom 214 ønsker to ekstra håndklær.")).getByText("Forslag: roboten")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("lobby:phone-task-assignments") ?? "{}")).toEqual({});
  });

  it("opens the call a phone task came from: the guest's words, what the receptionist noted, the call's length", async () => {
    route();
    render(<RequestsScreen today="2026-11-08" />);
    fireEvent.click(await screen.findByRole("button", { name: "Se samtalen: Utstyr, Rom 214" }));
    const sheet = screen.getByRole("dialog", { name: "Samtalen kl. 01:47" });
    expect(within(sheet).getByText("«Hi, this is room 214. Could we please get two extra towels?»")).toBeInTheDocument();
    expect(within(sheet).getByText("Camille Rousseau")).toBeInTheDocument();
    expect(within(sheet).getByText("0:48")).toBeInTheDocument();
  });

  it("files a message the receptionist took down in this browser when it names a room, with a link to the record", async () => {
    localStorage.setItem(
      "resepsjon-records-v1",
      JSON.stringify([{ kind: "message", id: "rec-7", createdAt: "2026-11-08T05:20:00.000Z", name: "Ola Gjest", phone: "+47 400 00 777", topic: "other", message: "Rom 205 trenger en ekstra pute.", urgent: false }]),
    );
    route();
    render(<RequestsScreen today="2026-11-08" demo={[]} />);
    fireEvent.click(await screen.findByRole("button", { name: "Se samtalen: Utstyr, Rom 205" }));
    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByRole("link", { name: "Åpne beskjeden i Resepsjon" })).toHaveAttribute("href", "/resepsjon#record-rec-7");
    expect(within(sheet).getByText("777")).toBeInTheDocument();
  });

  it("lists the task Rom made for a guest the booking system doesn't have", async () => {
    localStorage.setItem("lobby:room-check-marks", JSON.stringify({ "2026-11-08": { "room-328": { action: "task", at: "06:05", by: "Ana Pereira" } } }));
    route();
    render(<RequestsScreen today="2026-11-08" demo={[]} />);
    await screen.findByText("Roboten møtte en gjest på rommet, men bookingsystemet har det som ledig.");
    const row = rowWith("Roboten møtte en gjest på rommet, men bookingsystemet har det som ledig.");
    expect(within(row).getByText("Romsjekk")).toBeInTheDocument();
    expect(within(row).getByText("Resepsjonen · laget av Ana Pereira")).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Ta saken: Sjekk registreringen, Rom 328" })).toBeInTheDocument();
  });
});
