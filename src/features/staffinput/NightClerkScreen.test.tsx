import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionProvider } from "@/features/auth/SessionProvider";
import { NightClerkScreen } from "./NightClerkScreen";

const DEMO = readFileSync(resolve(process.cwd(), "public/runs/demo.jsonl"), "utf8");
const session = { user: { u: "kjersti", name: "Kjersti Lund", role: "admin" as const }, view: "admin" as const, effectiveRole: "admin" as const, exp: 0 };
const fetchMock = vi.fn<typeof fetch>();

function serve(ok = true) {
  fetchMock.mockImplementation(async (input) => {
    if (String(input) === "/runs/demo.jsonl") return ok ? new Response(DEMO, { status: 200 }) : new Response("nope", { status: 500 });
    throw new Error(`unexpected fetch ${String(input)}`);
  });
}

function show() {
  return render(
    <SessionProvider session={session}>
      <NightClerkScreen />
    </SessionProvider>,
  );
}

/** Every line stored on this device, whatever handover day it went to. */
function stored(): Record<string, unknown>[] {
  const raw = localStorage.getItem("lobby:nattevakt-logg");
  return raw ? (Object.values(JSON.parse(raw)).flat() as Record<string, unknown>[]) : [];
}

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => vi.unstubAllGlobals());

describe("Nattevaktens logg", () => {
  it("starts with the rooms the door lock wants checked, against the booking system", async () => {
    serve();
    show();
    const check = within(screen.getByRole("region", { name: /Sjekk disse først/ }));
    // The sample night (test data) already checked both: each folds to one line with the lock's signal.
    expect((await check.findByText(/sjekket: tomt og ryddig/, undefined, { timeout: 5000 })).closest("li")).toHaveTextContent("213 sjekket: tomt og ryddig (ingen kort i energibryteren siden 22:10)");
    expect(check.getByText(/sjekket: ikke tomt/).closest("li")).toHaveTextContent("210 sjekket: ikke tomt (kort i energibryteren siden 23:05)");
    expect(check.queryByRole("button")).not.toBeInTheDocument();
    expect(check.getByText(/ett signal per rom, aldri hvem/)).toBeInTheDocument();
  });

  it("offers a flagged room nobody has checked, against the booking system, and opens it in one tap", async () => {
    serve();
    // The sample's 213 check taken back on this device: the flag is open again.
    localStorage.setItem("lobby:nattevakt-logg", JSON.stringify(Object.fromEntries(["2026-11-07", "2026-11-08", "2026-11-09", new Date().toISOString().slice(0, 10)].map((day) => [day, [{ v: 1, type: "decision", kind: "retracted", data: { id: "r1", target: "sample-042400", source: "staff", by: "Kjersti Lund" } }]]))));
    show();
    const check = within(screen.getByRole("region", { name: /Sjekk disse først/ }));
    expect(check.getByText(/Ingen kort i energibryteren siden 22:10, men systemet har Ola Nygård der\./)).toBeInTheDocument();
    fireEvent.click(check.getByRole("button", { name: "Sjekk rom 213" }));
    const rooms = within(screen.getByRole("region", { name: "Rom" }));
    // The demo night's 2,500 lines load first; under a full test run that takes a while.
    const heading = await rooms.findByRole("heading", { name: "Rom 213" }, { timeout: 5000 });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(rooms.getByText("Systemet: Ola Nygård, skulle reist 7.11 (utsjekk ikke registrert)")).toBeInTheDocument();
    expect(rooms.getByRole("button", { name: "2. etasje" })).toHaveAttribute("aria-pressed", "true");
  });

  it("logs a room in two taps as the robot's own run-log line, with her name, and takes it back by adding a line", async () => {
    serve();
    show();
    const rooms = within(screen.getByRole("region", { name: "Rom" }));
    fireEvent.click(await rooms.findByRole("button", { name: "2. etasje" }, { timeout: 5000 }));
    fireEvent.click(rooms.getByRole("button", { name: "Rom 204" }));
    expect(rooms.getByRole("heading", { name: "Rom 204" })).toBeInTheDocument();
    expect(rooms.getByText(/^Systemet: Yuki Tanaka til /)).toBeInTheDocument();
    expect(rooms.getByText("Dørlåsen: kort i energibryteren siden 22:20")).toBeInTheDocument();
    // The worst case is the wrong room sold: the screen says the look never sells it.
    expect(rooms.getByText(/«Tom og ryddig» selger ikke rommet/)).toBeInTheDocument();

    fireEvent.click(rooms.getByRole("button", { name: /^Ikke tom/ }));
    expect(stored()).toEqual([
      expect.objectContaining({ v: 1, type: "decision", kind: "room_status", data: expect.objectContaining({ room: "room-204", status: "opptatt", source: "staff", by: "Kjersti Lund" }) }),
    ]);
    expect(rooms.getByRole("button", { name: /^Ikke tom/ })).toHaveAttribute("aria-pressed", "true");
    expect(rooms.getByText(/^Logget: ikke tomt · Kjersti Lund/)).toBeInTheDocument();
    const tonight = within(screen.getByRole("region", { name: /Logget i natt/ }));
    expect(tonight.getByText("Rom 204: ikke tomt")).toBeInTheDocument();

    fireEvent.click(rooms.getByRole("button", { name: "Angre: rom 204" }));
    expect(stored()).toHaveLength(2);
    expect(stored()[1]).toMatchObject({ kind: "retracted", data: { target: (stored()[0].data as { id: string }).id, source: "staff" } });
    expect(tonight.getByText("Rom 204: ikke tomt")).toHaveClass("line-through");
    expect(rooms.getByRole("button", { name: /^Ikke tom/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("asks where a safety item is before it sends it, then logs it for the top of the handover", async () => {
    serve();
    show();
    const form = within(screen.getByRole("region", { name: "Noe som kan skade en gjest" }));
    fireEvent.click(form.getByRole("button", { name: "Meld fra til morgenvakten" }));
    expect(form.getByText("Velg hvor det er, så vet morgenvakten hvor hun skal gå.")).toBeInTheDocument();
    expect(form.getByLabelText("Hvor")).toHaveFocus();
    expect(stored()).toEqual([]);

    fireEvent.click(form.getByRole("button", { name: "Dør" }));
    fireEvent.change(form.getByLabelText("Hvor"), { target: { value: "corridor-2b" } });
    fireEvent.change(form.getByLabelText(/Mer om det/), { target: { value: "Branndøra står på gløtt" } });
    fireEvent.click(form.getByRole("button", { name: "Meld fra til morgenvakten" }));
    expect(stored()).toEqual([
      expect.objectContaining({ kind: "security_event", data: expect.objectContaining({ place: "corridor-2b", event: "door_open", note: "Branndøra står på gløtt", source: "staff" }) }),
    ]);
    expect(form.getByText("Dør i korridor 2B er meldt.")).toBeInTheDocument();
    expect(form.getByLabelText("Hvor")).toHaveValue("");
  });

  it("saves a note for the morning, and says what is missing when it is empty", async () => {
    serve();
    show();
    const note = screen.getByRole("textbox", { name: "Notat til morgenvakten" });
    fireEvent.click(screen.getByRole("button", { name: "Lagre notatet" }));
    expect(screen.getByText("Skriv noe først.")).toBeInTheDocument();
    fireEvent.change(note, { target: { value: "Heisen på 3 lager lyd." } });
    fireEvent.click(screen.getByRole("button", { name: "Lagre notatet" }));
    expect(stored()).toEqual([expect.objectContaining({ kind: "note", data: expect.objectContaining({ text: "Heisen på 3 lager lyd.", by: "Kjersti Lund" }) })]);
    expect(screen.getByText("Notatet står i overleveringen.")).toBeInTheDocument();
    expect(note).toHaveValue("");
  });

  it("keeps safety and the note when the rooms can't load", async () => {
    serve(false);
    show();
    expect(await screen.findByText("Fikk ikke lastet rommene", undefined, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prøv igjen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Meld fra til morgenvakten" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Notat til morgenvakten" })).toBeInTheDocument();
  });
});
