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
    expect((await check.findByText(/sjekket: tomt og ryddig/, undefined, { timeout: 5000 })).closest("li")).toHaveTextContent("213 sjekket: tomt og ryddig (ingen kort i energibryteren siden kl. 18:00)");
    expect(check.getByText(/sjekket: ikke tomt/).closest("li")).toHaveTextContent("210 sjekket: ikke tomt (kort i energibryteren)");
    expect(check.queryByRole("button")).not.toBeInTheDocument();
    expect(check.getByText(/ett signal per rom, aldri kort-id, aldri klokkeslett/)).toBeInTheDocument();
  });

  it("offers a flagged room nobody has checked, against the booking system, and opens it in one tap", async () => {
    serve();
    // The sample's 213 check taken back on this device: the flag is open again.
    localStorage.setItem("lobby:nattevakt-logg", JSON.stringify(Object.fromEntries(["2026-11-07", "2026-11-08", "2026-11-09", new Date().toISOString().slice(0, 10)].map((day) => [day, [{ v: 1, type: "decision", kind: "retracted", data: { id: "r1", target: "sample-042400", source: "staff", by: "Kjersti Lund" } }]]))));
    show();
    const check = within(screen.getByRole("region", { name: /Sjekk disse først/ }));
    expect(check.getByText(/Ingen kort i energibryteren siden kl\. 18:00, men systemet har Ola Nygård der\./)).toBeInTheDocument();
    fireEvent.click(check.getByRole("button", { name: "Sjekk rom 213" }));
    const rooms = within(screen.getByRole("region", { name: "Rom" }));
    // The demo night's 2,500 lines load first; under a full test run that takes a while.
    const heading = await rooms.findByRole("heading", { name: "Rom 213" }, { timeout: 5000 });
    await waitFor(() => expect(heading).toHaveFocus());
    // A flagged room: the guest's name (she is checking his departure) and the lock's word, without a time.
    expect(rooms.getByText("Systemet: Ola Nygård, skulle reist 7.11 (utsjekk ikke registrert)")).toBeInTheDocument();
    expect(rooms.getByText("Dørlåsen: ingen kort i energibryteren siden kl. 18:00")).toBeInTheDocument();
    expect(rooms.getByRole("button", { name: "2. etasje" })).toHaveAttribute("aria-pressed", "true");
  });

  it("logs a room in two taps as the robot's own run-log line, with her name, and takes it back by adding a line", async () => {
    serve();
    show();
    const rooms = within(screen.getByRole("region", { name: "Rom" }));
    fireEvent.click(await rooms.findByRole("button", { name: "2. etasje" }, { timeout: 5000 }));
    fireEvent.click(rooms.getByRole("button", { name: "Rom 204" }));
    expect(rooms.getByRole("heading", { name: "Rom 204" })).toBeInTheDocument();
    // An unflagged booked room (round 6, legal review): "booket", no guest name, no lock line.
    expect(rooms.getByText(/^Systemet: booket til /)).toBeInTheDocument();
    expect(rooms.queryByText(/Yuki Tanaka/)).not.toBeInTheDocument();
    expect(rooms.queryByText(/^Dørlåsen:/)).not.toBeInTheDocument();
    expect(rooms.getByText("Rommet er booket: bank på og vent før du går inn.")).toBeInTheDocument();
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

    // A wet floor (the default) also asks whether a sign is out.
    expect(form.getByText("Svar ja eller nei, så vet morgenvakten om gulvet står uten skilt.")).toBeInTheDocument();
    fireEvent.click(form.getByRole("button", { name: "Dør" }));
    // A door has no sign to put out: the question goes.
    expect(form.queryByRole("group", { name: "Skilt satt ut?" })).not.toBeInTheDocument();
    fireEvent.change(form.getByLabelText("Hvor"), { target: { value: "corridor-2b" } });
    fireEvent.change(form.getByLabelText(/Mer om det/), { target: { value: "Branndøra står på gløtt" } });
    fireEvent.click(form.getByRole("button", { name: "Meld fra til morgenvakten" }));
    expect(stored()).toEqual([
      expect.objectContaining({ kind: "security_event", data: expect.objectContaining({ place: "corridor-2b", event: "door_open", note: "Branndøra står på gløtt", source: "staff" }) }),
    ]);
    expect(form.getByText("Dør i korridor 2B er meldt.")).toBeInTheDocument();
    expect(form.getByLabelText("Hvor")).toHaveValue("");
  });

  it("asks whether a sign is out on a wet floor (required, two equal answers) and stores it with the time", async () => {
    serve();
    show();
    const form = within(screen.getByRole("region", { name: "Noe som kan skade en gjest" }));
    fireEvent.change(form.getByLabelText("Hvor"), { target: { value: "lobby" } });
    fireEvent.click(form.getByRole("button", { name: "Meld fra til morgenvakten" }));
    expect(form.getByText("Svar ja eller nei, så vet morgenvakten om gulvet står uten skilt.")).toBeInTheDocument();
    expect(form.getByRole("button", { name: "Ja" })).toHaveFocus();
    expect(stored()).toEqual([]);
    const sign = within(form.getByRole("group", { name: "Skilt satt ut?" }));
    expect(sign.getByRole("button", { name: "Nei" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(sign.getByRole("button", { name: "Ja" }));
    fireEvent.click(form.getByRole("button", { name: "Meld fra til morgenvakten" }));
    const [line] = stored();
    expect(line).toMatchObject({ kind: "hazard", data: expect.objectContaining({ place: "lobby", hazard: "wet", signed: true, source: "staff" }) });
    expect((line.data as { signedAt: string }).signedAt).toBe((line.data as { at: string }).at);
    expect(form.getByText("Vått gulv i lobbyen er meldt, skilt satt ut.")).toBeInTheDocument();
    // The answer resets for the next report.
    expect(form.getByRole("button", { name: "Ja" })).toHaveAttribute("aria-pressed", "false");
  });

  it("records a sign put out later on a wet floor reported without one, by adding a line", async () => {
    serve();
    show();
    const form = within(screen.getByRole("region", { name: "Noe som kan skade en gjest" }));
    fireEvent.change(form.getByLabelText("Hvor"), { target: { value: "corridor-2b" } });
    fireEvent.click(form.getByRole("button", { name: "Nei" }));
    fireEvent.click(form.getByRole("button", { name: "Meld fra til morgenvakten" }));
    expect(stored()[0]).toMatchObject({ data: expect.objectContaining({ signed: false, signedAt: null }) });
    const tonight = within(screen.getByRole("region", { name: /Logget i natt/ }));
    // The sample's lobby floor already has its sign: only the new one offers the button.
    expect(tonight.getAllByRole("button", { name: /^Skilt satt ut:/ })).toHaveLength(1);
    fireEvent.click(tonight.getByRole("button", { name: "Skilt satt ut: Vått gulv i korridor 2B" }));
    expect(stored()[1]).toMatchObject({ kind: "sign_placed", data: expect.objectContaining({ target: (stored()[0].data as { id: string }).id, source: "staff" }) });
    expect(tonight.getByText("Skilt satt ut i korridor 2B")).toBeInTheDocument();
    expect(tonight.queryByRole("button", { name: /^Skilt satt ut:/ })).not.toBeInTheDocument();
    expect(tonight.getByText(/skilt satt ut 02:16 · eksempel/)).toBeInTheDocument();
  });

  it("shows the robot's hazards at its clock, newest first, and records who acknowledged each and when", async () => {
    serve();
    show();
    const robot = within(screen.getByRole("region", { name: /Fra roboten/ }));
    const kvitter = await robot.findAllByRole("button", { name: /^Kvitter:/ }, { timeout: 5000 });
    expect(kvitter.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Kvitter: Vått gulv i korridor 1C",
      "Kvitter: Vått gulv i korridor 3D",
      "Kvitter: En person i badekåpe ba roboten slippe ham inn på 7 rom",
      "Kvitter: Vått gulv i korridor 2B",
    ]);
    expect(robot.getByText("4 ikke kvittert")).toBeInTheDocument();
    expect(robot.getByText("23:51")).toBeInTheDocument();
    expect(robot.getByText("Roboten skled der. Ingen skilt.")).toBeInTheDocument();

    fireEvent.click(robot.getByRole("button", { name: "Kvitter: Vått gulv i korridor 2B" }));
    expect(stored()).toEqual([
      expect.objectContaining({ kind: "acknowledged", data: expect.objectContaining({ target: "wet:corridor-2b:23:51:33", hazard: "wet", place: "corridor-2b", robotAt: "23:51:33", source: "staff", by: "Kjersti Lund" }) }),
    ]);
    expect(robot.getByText("3 ikke kvittert")).toBeInTheDocument();
    expect(robot.getByText(/^Kvittert av Kjersti Lund/)).toBeInTheDocument();
    const tonight = within(screen.getByRole("region", { name: /Logget i natt/ }));
    expect(tonight.getByText("Kvitterte robotens melding: vått gulv i korridor 2B")).toBeInTheDocument();

    fireEvent.click(robot.getByRole("button", { name: "Angre kvitteringen: Vått gulv i korridor 2B" }));
    expect(stored()[1]).toMatchObject({ kind: "retracted", data: { target: (stored()[0].data as { id: string }).id } });
    expect(robot.getByText("4 ikke kvittert")).toBeInTheDocument();
  });

  it("says the log is kept on this device for 30 days", async () => {
    serve();
    show();
    expect(within(screen.getByRole("region", { name: /Logget i natt/ })).getByText(/Lagres på denne enheten i 30 dager\./)).toBeInTheDocument();
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
    expect(within(screen.getByRole("region", { name: "Rom" })).getByRole("button", { name: "Prøv igjen" })).toBeInTheDocument();
    // The robot's box says the same, with its own retry.
    expect(within(screen.getByRole("region", { name: /Fra roboten/ })).getByText(/Fikk ikke lastet det roboten meldte/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Meld fra til morgenvakten" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Notat til morgenvakten" })).toBeInTheDocument();
  });
});
