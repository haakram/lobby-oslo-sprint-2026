import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionProvider } from "@/features/auth/SessionProvider";
import { atNight } from "@/features/dashboard/highlights";
import { MANUAL_REQUESTS } from "@/features/requests/testData";
import { TEST_NIGHT_JSONL } from "@/features/rooms/testNight";
import { HandoverScreen } from "./HandoverScreen";

const TODAY = "2026-11-08";
const session = {
  user: { u: "hamad", name: "Ana Pereira", role: "admin" as const },
  view: "admin" as const,
  effectiveRole: "admin" as const,
  exp: 0,
};
const fetchMock = vi.fn<typeof fetch>();

// The night staff's share follows the shared demo data (their finished requests 22:00–06:00), not a magic number.
const STAFF_DONE = MANUAL_REQUESTS.filter((request) => request.status === "fullfort" && atNight(request.at)).length;

function serve(run: () => Response) {
  fetchMock.mockImplementation(async (input) => {
    if (String(input) === "/runs/demo.jsonl") return run();
    throw new Error(`unexpected fetch ${String(input)}`);
  });
}

function show() {
  return render(
    <SessionProvider session={session}>
      <HandoverScreen today={TODAY} />
    </SessionProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("HandoverScreen (Overlevering 06:00)", () => {
  it("shows the night's decision figures, what is open with an owner and a time, and what happened", async () => {
    serve(() => new Response(TEST_NIGHT_JSONL, { status: 200 }));
    show();
    // The labels stand under skeletons while the night loads; the details come with it.
    expect(await screen.findByText("1 «ferdig» bekreftet · 1 til en person")).toBeInTheDocument();
    // The robot's figure is its night's one tally; the referee and the simulator sit behind "Slik vet vi det".
    expect(screen.getByText("Robotens oppdrag")).toBeInTheDocument();
    const proof = within(screen.getByRole("region", { name: "Natten i tall" })).getByText("Slik vet vi det").closest("details");
    expect(proof).toHaveTextContent(
      `Hver «ferdig» er godkjent av dommeren i Wybe Night Shift-simulatoren: 1 av 1. Nattevakten fullførte ${STAFF_DONE} forespørsler selv. AI-resepsjonisten tok 3 samtaler. I et hotell finnes ingen dommer: der bekrefter dørlåsloggen og robotens foto.`,
    );
    expect(screen.queryByText(/Godkjent av dommeren \(Wybe/)).not.toBeInTheDocument();
    // The money: the room the system holds tonight, sold after a confirmation; then the safety items.
    const figures = screen.getByRole("region", { name: "Natten i tall" });
    // What the room check buys is time; the kroner are real only if tonight sells out, so tonight's bookings stand beside them.
    expect(within(figures).getByText("Funnet ledig 5 timer tidligere")).toBeInTheDocument();
    expect(within(figures).getByText(/^Rom 311 · hvis natten blir utsolgt · 31 av \d+ booket i kveld$/)).toBeInTheDocument();
    expect(within(figures).queryByText(/ellers usolgt/)).not.toBeInTheDocument();
    expect(within(figures).getByText("Sikkerhet, straks")).toBeInTheDocument();
    expect(within(figures).getByText("Ingenting som kan skade en gjest")).toBeInTheDocument();
    // Last night's revenue and the guest matters are rear-view figures: not on the manager's page.
    expect(screen.queryByText("Losjiinntekt i natt")).not.toBeInTheDocument();
    expect(screen.queryByText("Gjestesaker løst")).not.toBeInTheDocument();
    // One factual line, green only for what is done.
    expect(screen.getByText("1 oppgave bekreftet")).toBeInTheDocument();

    const open = screen.getByRole("region", { name: /^Åpent nå/ });
    expect(
      within(open).getByText(
        "Rom 210: en gjest uten booking. Sjekk registreringen.",
      ),
    ).toBeInTheDocument();
    expect(within(open).getByText("Gjest venter")).toBeInTheDocument();
    // Owners are the hotel's roles (jury round 4, the design juror), not the reader's name on every row.
    expect(within(open).getAllByText("Resepsjon").length).toBeGreaterThan(0);
    expect(within(open).queryByText("Siri Haugen")).not.toBeInTheDocument();

    const night = screen.getByRole("region", { name: "Dette skjedde i natt" });
    expect(
      within(night).getByText(
        /^Roboten fant rom 311 tomt og ryddig, men systemet holder det opptatt\. Det kan selges etter bekreftelse, ca\. [\d\s\u00a0]+ kr hvis natten blir utsolgt\.$/,
      ),
    ).toBeInTheDocument();
    expect(within(night).getByText("Kjersti Lund")).toBeInTheDocument();
    expect(screen.getByText("Ikke kvittert ennå")).toBeInTheDocument();
  });

  it("signs the handover with the name and the time, keeps it for the day, and Angre takes it back", async () => {
    serve(() => new Response(TEST_NIGHT_JSONL, { status: 200 }));
    const { unmount } = show();
    fireEvent.click(
      await screen.findByRole("button", { name: "Kvitter mottatt" }),
    );
    // Who and how long ago, never a wall-clock time; and it says where it is kept.
    expect(screen.getByText("Kvittert av Ana Pereira · nå")).toBeInTheDocument();
    expect(screen.getByText("Kvittert nå")).toBeInTheDocument();
    expect(screen.getByText(/er overlevert, med \d+ åpne? saker?\. Kvitteringen er lagret på denne enheten\.$/)).toBeInTheDocument();
    expect(screen.queryByText(/Nattevakten ser/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Angre kvitteringen" }),
    ).toHaveFocus();
    const stored = JSON.parse(
      localStorage.getItem("lobby:handover-signoff") ?? "{}",
    );
    expect(stored[TODAY]).toMatchObject({ name: "Ana Pereira" });
    expect(stored[TODAY].stamp).toMatch(/^\d{4}-\d\d-\d\dT/);
    unmount();

    show();
    expect(
      await screen.findByText("Kvittert av Ana Pereira · nå"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Angre kvitteringen" }));
    expect(
      screen.getByRole("button", { name: "Kvitter mottatt" }),
    ).toHaveFocus();
    expect(
      JSON.parse(localStorage.getItem("lobby:handover-signoff") ?? "{}"),
    ).toEqual({});
  });

  it("sells the room in the open list in two steps that leave evidence, then waits for the booking system: never done, the kroner shown on the row", async () => {
    serve(() => new Response(TEST_NIGHT_JSONL, { status: 200 }));
    show();
    const open = await screen.findByRole("region", { name: /^Åpent nå/ });
    // While a room waits, its step is the page's one orange action; Kvitter mottatt is quiet.
    const confirm = within(open).getByRole("button", { name: "Bekreft med resepsjonen: rom 311" });
    expect(confirm.className).toMatch(/bg-accent/);
    expect(screen.getByRole("button", { name: "Kvitter mottatt" }).className).not.toMatch(/bg-accent/);
    expect(within(open).queryByRole("button", { name: "Send rom 311 til resepsjonen" })).not.toBeInTheDocument();
    for (const label of ["Folioen er gjort opp", "Ingen bagasje på rommet", "Nøkkelkortet er sperret"]) fireEvent.click(within(open).getByLabelText(label));
    fireEvent.click(confirm);
    expect(within(open).getByText("Bekreftet av Hanne Vold (resepsjon) · folio, bagasje, kort")).toBeInTheDocument();
    fireEvent.click(within(open).getByRole("button", { name: "Send rom 311 til resepsjonen" }));
    // Pending in a word on the row and on the step, never "Gjort i dag" or "Ledig for salg".
    expect(within(open).getAllByText("Venter på PMS-en")).toHaveLength(2);
    expect(within(open).queryByText("Gjort i dag")).not.toBeInTheDocument();
    expect(within(open).queryByText("Ledig for salg")).not.toBeInTheDocument();
    // The figure that changed is where the presenter is: the kroner on the row.
    expect(within(open).getByText("sendt til resepsjonen · venter på PMS-en")).toBeInTheDocument();
    const figures = screen.getByRole("region", { name: "Natten i tall" });
    expect(within(figures).getByText("Sendt til resepsjonen")).toBeInTheDocument();
    expect(within(figures).getByText("Rom 311 · venter på PMS-en")).toBeInTheDocument();
    expect(within(figures).queryByText(/Frigitt/)).not.toBeInTheDocument();
    // Nothing waits for the money step now: the signature carries the orange.
    expect(screen.getByRole("button", { name: "Kvitter mottatt" }).className).toMatch(/bg-accent/);
    // The print carries the masthead, the line, who made it and that it names guests; no contact address exists, so none is invented.
    const footer = screen.getByText("Fettero · Natten, ærlig overlevert. · Team Fettero, Oslo Sprint 2026 · Inneholder personopplysninger. Makuleres etter vakten.");
    expect(footer.tagName).toBe("FOOTER");
    expect(footer.textContent).not.toMatch(/@|kontakt|https?:|www\./i);
    expect(document.querySelector("[data-print-masthead]")).toHaveTextContent(/^Fettero\s*Natten, ærlig overlevert\./);
  });

  it("on the demo night reads act → evidence → sign: safety in the bell's red, the catch, the sleeper with its test-data note, the signature last", async () => {
    const demo = readFileSync(resolve(process.cwd(), "public/runs/demo.jsonl"), "utf8");
    serve(() => new Response(demo, { status: 200 }));
    show();
    const open = await screen.findByRole("region", { name: /^Åpent nå/ });
    // Safety is never quieter than "Gjest venter" (jury round 3, the design juror): the danger tone, as in the bell.
    const safety = within(open).getAllByText("Sikkerhet");
    expect(safety).toHaveLength(2);
    expect(safety[0].className).toMatch(/text-danger/);
    expect(within(open).getByText("Gjest venter").className).toMatch(/text-warning/);
    // Safety says straks and who was told: nobody, so "varsle nå".
    expect(within(open).getAllByText("Ingen ble varslet i natt: varsle nå.")).toHaveLength(2);
    expect(within(open).getAllByText("straks")).toHaveLength(2);
    // The robot itself at 06:00: off its charger with the master keycard, before the night shift leaves.
    expect(within(open).getByText(/^Roboten står ved heis, 1\. etasje, ikke på lader, 20 % batteri\. Den har fortsatt hovednøkkelkortet/)).toBeInTheDocument();
    // The catch, said as what Fettero did; the test data said once in a quiet band, a small word on each booking row.
    expect(within(open).getByText("Fettero holdt rommet tilbake")).toBeInTheDocument();
    expect(within(open).queryByText(/^Testdata:/)).not.toBeInTheDocument();
    expect(within(open).getAllByText("· testbooking")).toHaveLength(2);
    const band = document.querySelector("[data-demo-band]");
    expect(band).toHaveTextContent(
      "Demo: én ekte natt fra Wybe-simulatoren (seed 16). Bookingene er testdata lagt inn av teamet, merket «testbooking». I en pilot: ett signal per rom fra dørlåsen (gjestekort brukt siden kl. 18), aldri hvem.",
    );
    // The catch leads the figures, as the robot's own contradiction; then the money, with tonight's bookings.
    const figures = screen.getByRole("region", { name: "Natten i tall" });
    expect(within(figures).getByText("Holdt tilbake fra salg")).toBeInTheDocument();
    expect(within(figures).getByText("Rom 209: meldt tomt kl. 03:47, men roboten satte inn bagasje kl. 01:29")).toBeInTheDocument();
    expect(within(figures).getByText("Rom 213 · hvis natten blir utsolgt · 31 av 36 booket i kveld")).toBeInTheDocument();
    // Each figure jumps to its row (jury round 4, the product juror/the design juror).
    const hrefs = within(figures).getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual(["#sak-held-room-209", "#sak-sellable", "#sak-wet-floors", "#vurderinger-overlevering"]);
    for (const href of hrefs) expect(document.getElementById(href!.slice(1))).not.toBeNull();
    // Orange is the one thing to do: the links on the rows are quiet ink.
    for (const link of within(open).getAllByRole("link")) expect(link.className).not.toMatch(/text-accent/);
    // Reading order: the work, the robot's judgement card, the signature last.
    const card = document.getElementById("vurderinger-overlevering");
    const sign = screen.getByRole("region", { name: "Kvitter mottatt" });
    expect(card).not.toBeNull();
    expect(open.compareDocumentPosition(card!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card!.compareDocumentPosition(sign) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("says when there is no night yet, and when the night failed to load, with Prøv igjen", async () => {
    serve(() => new Response("", { status: 200 }));
    const { unmount } = show();
    expect(
      await screen.findByText("Ingen natt å overlevere ennå"),
    ).toBeInTheDocument();
    unmount();

    let ok = false;
    serve(() =>
      ok
        ? new Response(TEST_NIGHT_JSONL, { status: 200 })
        : new Response("", { status: 500 }),
    );
    show();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Fikk ikke lastet natten");
    ok = true;
    fireEvent.click(within(alert).getByRole("button", { name: "Prøv igjen" }));
    expect(
      await screen.findByRole("button", { name: "Kvitter mottatt" }),
    ).toBeInTheDocument();
  });
});
