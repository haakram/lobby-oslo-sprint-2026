import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionProvider } from "@/features/auth/SessionProvider";
import { RequestsScreen } from "./RequestsScreen";
import { sourceFromQuery } from "./select";

// A short night: the robot fails one request (towels, Rom 108) and leaves one open when the shift ends
// (room service, Rom 104). Its look from corridor 1a shows room 134 (the radiator call's room).
const NIGHT = [
  { v: 1, type: "start", shift: "w2-0000000000000000000000000000000a", mode: "practice", seed: 1, t: 1794058477 },
  { v: 1, type: "state", clock: "22:00:00", location: "charging-dock", score: 0 },
  { v: 1, type: "call", cmd: "look", args: {}, ok: true, clock: "22:00:30", result: { location: "corridor-1a", floor: 1, exits: [{ to: "room-134", metres: 4 }] } },
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

    const before = screen.getAllByRole("listitem").indexOf(rowWith("«Two towels for room 108, please»"));
    fireEvent.click(failed);
    const towels = rowWith("«Two towels for room 108, please»");
    // It keeps its place in the list (the same row index), with its Angre under it.
    expect(screen.getAllByRole("listitem").indexOf(towels)).toBe(before);
    expect(within(towels).getByText("Pågår")).toBeInTheDocument();
    // Nobody logged in: the stamp says "Personalet", and how long ago, never a clock.
    expect(within(towels).getByText("Personalet tok saken · nå")).toBeInTheDocument();
    expect(within(towels).getByRole("button", { name: "Marker fullført: Utstyr, Rom 108" })).toBeInTheDocument();
  });

  it("stamps an action with who did it and how long ago, never the wall clock (jury round 3)", async () => {
    route();
    const session = { user: { u: "siri", name: "Siri Haugen", role: "admin" as const }, view: "admin" as const, effectiveRole: "admin" as const, exp: 0 };
    render(
      <SessionProvider session={session}>
        <RequestsScreen />
      </SessionProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Ta saken: Romservice, Rom 104" }));
    const tray = rowWith("«A tray to room 104»");
    // Still the first row of the robot's group, where the hand tapped it.
    const handback = screen.getByRole("heading", { name: /^Roboten ga videre/ }).parentElement as HTMLElement;
    expect(within(handback).getAllByRole("listitem")[0]).toBe(tray);
    const stamp = within(tray).getByText("Siri Haugen tok saken · nå");
    expect(stamp.textContent).not.toMatch(/\d{1,2}:\d{2}/);
    expect(JSON.parse(localStorage.getItem("lobby:request-stamps") ?? "{}")["robot:R-002"]).toMatchObject({ act: "took", who: "Siri Haugen" });

    // Angre puts the stamp back too.
    fireEvent.click(within(tray).getByRole("button", { name: "Angre: Romservice, Rom 104" }));
    expect(within(rowWith("«A tray to room 104»")).getByText("Roboten · trenger en person")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("lobby:request-stamps") ?? "{}")).toEqual({});
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

  it("closes a request that is already in progress with one click, and keeps the row where it stood until the next action", async () => {
    route();
    render(<RequestsScreen />);
    await screen.findByRole("button", { name: /^Ta over/ });
    // req-m2 comes from staff already in progress (Pågår), not Ny: the first click must close it.
    fireEvent.click(screen.getByRole("button", { name: "Marker fullført: Romservice, Rom 134" }));
    const done = rowWith("Frokost på rommet 08:30, fire personer.");
    expect(within(done).getByText("Fullført")).toBeInTheDocument();
    // The status line and Angre sit in the row itself: nothing jumps away from the hand that tapped.
    expect(within(done).getByRole("status")).toHaveTextContent("Romservice, Rom 134 står nå under Fullført.");
    const pagar = screen.getByRole("heading", { name: /^Pågår/ }).nextElementSibling as HTMLElement;
    expect(within(pagar).getAllByRole("listitem")).toContain(done);

    // The next action lets it go to its own group.
    fireEvent.click(screen.getByRole("button", { name: "Ta over: Utstyr, Rom 108" }));
    const fullfort = screen.getByRole("heading", { name: /^Fullført/ }).nextElementSibling as HTMLElement;
    expect(within(fullfort).getByText("Frokost på rommet 08:30, fire personer.")).toBeInTheDocument();
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
    // One number per fact (round 5): the figure counts every source and names the robot's share, the figure Oversikt shows.
    expect(screen.getByText(/^Fullført, alle kilder · roboten 0 av 2$/)).toBeInTheDocument();
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
    expect(within(moved).getByText("Personalet la den i robotens kø · nå · sendes når roboten er koblet til")).toBeInTheDocument();
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

  it("pins what the robot handed back first; calls that arrive a moment later go in their own group below (jury round 3)", async () => {
    let answer: (value: Response) => void = () => {};
    const call = { id: "c9", startedAt: "2026-11-08T05:40:00.000Z", title: "Håndklær", summary: "Gjesten i rom 214 mangler håndklær", callerName: "Kari Nordmann", requestType: null, arrival: null, departure: null, guests: null, needsCallback: true };
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/runs/demo.jsonl") return new Response(NIGHT, { status: 200 });
      if (url === "/api/reception/calls") return new Promise<Response>((resolve) => (answer = resolve));
      throw new Error(`unexpected fetch ${url}`);
    });
    render(<RequestsScreen today="2026-11-08" demo={[]} />);
    await screen.findByRole("button", { name: "Ta over: Utstyr, Rom 108" });
    const headings = () => screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent?.replace(/\d+$/, ""));
    expect(headings()[0]).toBe("Roboten ga videre");
    // The phone's place is held while its calls are on their way.
    expect(headings()[1]).toBe("Fra telefonen");
    expect(screen.getByText("Henter telefonen")).toBeInTheDocument();
    const firstRow = () => screen.getAllByRole("listitem")[0];
    expect(within(firstRow()).getByText("«A tray to room 104»")).toBeInTheDocument();

    answer(Response.json({ calls: [call] }));
    expect(await screen.findByText("Gjesten i rom 214 mangler håndklær")).toBeInTheDocument();
    expect(headings()[0]).toBe("Roboten ga videre");
    expect(within(firstRow()).getByText("«A tray to room 104»")).toBeInTheDocument();
    const phone = screen.getByRole("heading", { name: /^Fra telefonen/ }).nextElementSibling as HTMLElement;
    expect(within(phone).getByText("Gjesten i rom 214 mangler håndklær")).toBeInTheDocument();
  });

  it("files a call for a room the hotel doesn't have as Ukjent rom, for reception, with no robot button", async () => {
    const call = { id: "c222", startedAt: "2026-11-08T05:45:00.000Z", title: "Utstyr", summary: "Gjesten i rom 222 mangler håndklær", callerName: "Test Testesen", requestType: null, arrival: null, departure: null, guests: null, needsCallback: true };
    route({ calls: () => Response.json({ calls: [call] }) });
    render(<RequestsScreen today="2026-11-08" demo={[]} />);
    const row = rowWith(await screen.findByText("Gjesten i rom 222 mangler håndklær").then((el) => el.textContent ?? ""));
    expect(within(row).getByText("Ukjent rom")).toBeInTheDocument();
    expect(within(row).getByText("Hotellet har ikke rom 222. Ring gjesten tilbake og spør hvilket rom det gjelder.")).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /^Send roboten/ })).not.toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Ta saken: Ukjent rom" })).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Se samtalen: Ukjent rom" })).toBeInTheDocument();
    const phone = screen.getByRole("heading", { name: /^Fra telefonen/ }).nextElementSibling as HTMLElement;
    expect(within(phone).getAllByRole("listitem")).toContain(row);
  });

  it("opens on the robot's requests with ?filter=robot, the hand-backs first", async () => {
    expect(sourceFromQuery("robot")).toBe("robot");
    expect(sourceFromQuery(["telefon"])).toBe("telefon");
    expect(sourceFromQuery("noe-annet")).toBeNull();
    expect(sourceFromQuery(undefined)).toBeNull();
    route();
    render(<RequestsScreen today="2026-11-08" initialSource="robot" />);
    await screen.findByRole("button", { name: "Ta over: Utstyr, Rom 108" });
    expect(screen.getByRole("button", { name: "Roboten" })).toHaveAttribute("aria-pressed", "true");
    expect(within(screen.getAllByRole("listitem")[0]).getByText("«A tray to room 104»")).toBeInTheDocument();
    expect(screen.queryByText("Rom 214 ønsker to ekstra håndklær.")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^Fra telefonen/ })).not.toBeInTheDocument();
  });
});

// The robot refuses two follow-ups: the referee raises the score after one (+5), not after the other.
const DECLINES = [
  { v: 1, type: "start", shift: "w2-0000000000000000000000000000000b", mode: "practice", seed: 1, t: 1794058477 },
  { v: 1, type: "state", clock: "22:00:00", location: "charging-dock", score: 0 },
  { v: 1, type: "decision", kind: "request", data: { request: "R-010", kind: "followup", text: "Front desk passed on a call from 108: the guest says the water bottle they ordered an hour ago never came." } },
  { v: 1, type: "decision", kind: "task_start", data: { request: "R-010", kind: "followup", room: "room-108", item: "water-bottle" } },
  { v: 1, type: "call", cmd: "report", args: { request: "R-010", outcome: "declined", note: "No water-bottle order from 108 on record tonight; nothing was ordered." }, ok: true, clock: "01:00:00", result: "Noted." },
  { v: 1, type: "decision", kind: "task_failed", data: { request: "R-010", status: "declined", note: "No water-bottle order from 108 on record tonight; nothing was ordered." } },
  { v: 1, type: "state", clock: "01:00:01", location: "lobby", score: 5 },
  { v: 1, type: "decision", kind: "request", data: { request: "R-011", kind: "spill", text: "Someone mentioned a spill on floor 2." } },
  { v: 1, type: "decision", kind: "task_start", data: { request: "R-011", kind: "spill", room: null } },
  { v: 1, type: "call", cmd: "report", args: { request: "R-011", outcome: "declined", note: "No new wet patch on floor 2 and no wet-floor sign in stock." }, ok: true, clock: "02:00:00", result: "Noted." },
  { v: 1, type: "decision", kind: "task_failed", data: { request: "R-011", status: "declined", note: "No new wet patch on floor 2 and no wet-floor sign in stock." } },
  { v: 1, type: "state", clock: "02:00:01", location: "lobby", score: 5 },
  { v: 1, type: "end", score: 5, requests_served: 0, reason: "server ended: time" },
]
  .map((line) => JSON.stringify(line))
  .join("\n");

describe("RequestsScreen: the robot's refusals are a decision for a person (jury round 3)", () => {
  it("splits them by the referee's verdict, the unapproved one first, and gives one anyway in one tap with a stamp", async () => {
    route({ run: () => new Response(DECLINES, { status: 200 }) });
    const session = { user: { u: "siri", name: "Siri Haugen", role: "admin" as const }, view: "admin" as const, effectiveRole: "admin" as const, exp: 0 };
    render(
      <SessionProvider session={session}>
        <RequestsScreen today="2026-11-08" demo={[]} />
      </SessionProvider>,
    );
    const water = await screen.findByRole("button", { name: "Gi det likevel: Oppfølging, Rom 108" });
    expect(screen.getByText(/1 melding uten bestilling · 1 ikke godkjent\./)).toBeInTheDocument();
    expect(screen.queryByText(/falsk/)).not.toBeInTheDocument();
    const avvist = screen.getByRole("heading", { name: /^Avvist etter sjekk/ }).parentElement as HTMLElement;
    const [first, second] = within(avvist).getAllByRole("listitem");
    expect(within(first).getByText("Ikke godkjent av dommeren: se på denne først.")).toBeInTheDocument();
    expect(within(first).getByRole("button", { name: "Sjekk likevel: Søl" })).toBeInTheDocument();
    expect(within(second).getByText("Godkjent av dommeren.")).toBeInTheDocument();
    expect(within(second).getByText("Roboten sjekket først · din beslutning")).toBeInTheDocument();

    fireEvent.click(water);
    const given = rowWith("«Front desk passed on a call from 108: the guest says the water bottle they ordered an hour ago never came.»");
    expect(within(given).getByText("Pågår")).toBeInTheDocument();
    expect(within(given).getByText("Siri Haugen ga det likevel · nå")).toBeInTheDocument();
    expect(within(given).getByRole("button", { name: "Marker fullført: Oppfølging, Rom 108" })).toBeInTheDocument();
    expect(screen.getByText(/· 1 gitt likevel\./)).toBeInTheDocument();
  });
});
