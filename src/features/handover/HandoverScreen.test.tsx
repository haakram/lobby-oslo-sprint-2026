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
    expect(await screen.findByText("1 av 1 holder · 1 til en person")).toBeInTheDocument();
    // The robot's figure is its night's one tally; the referee and the simulator sit behind "Slik vet vi det".
    expect(screen.getByText("Robotens oppdrag")).toBeInTheDocument();
    const proof = within(screen.getByRole("region", { name: "Natten i tall" })).getByText("Slik vet vi det").closest("details");
    expect(proof).toHaveTextContent(
      `Hver «ferdig» er bekreftet av simulatoren (Wybe Night Shift): 1 av 1. Nattevakten fullførte ${STAFF_DONE} forespørsler selv. AI-resepsjonisten tok 3 samtaler (eksempler). I et ekte hotell finnes ingen dommer: der bekrefter gjesten, resepsjonen eller dørlåsloggen.`,
    );
    expect(screen.queryByText(/dommeren i Wybe|godkjent av dommeren/)).not.toBeInTheDocument();
    // The money leads with the certain cost: a room in use with no booking; the room found free is said as time, with its own link.
    const figures = screen.getByRole("region", { name: "Natten i tall" });
    expect(within(figures).getByText("Rom 210 i bruk uten booking")).toBeInTheDocument();
    // The risk, not an opportunity (round 7, legal review).
    expect(within(figures).getByText("En natt ingen fakturerer · PMS-en kan selge rommet til en ny gjest i dag")).toBeInTheDocument();
    // One money story (round 7): the room found free names its own kroner, conditional.
    expect(within(figures).getByRole("link", { name: /^Rom 311: funnet ledig 5 timer tidligere · ca\. [\d\s\u00a0]+ kr hvis utsolgt/ })).toHaveAttribute("href", "#sak-sellable");
    expect(within(figures).queryByText(/ellers usolgt/)).not.toBeInTheDocument();
    // Safety: the night clerk's sample lobby floor is added to the robot night's (none of its own here).
    expect(within(figures).getByText("Sikkerhet, straks")).toBeInTheDocument();
    expect(within(figures).getByText("1 vått gulv")).toBeInTheDocument();
    // Last night's revenue and the guest matters are rear-view figures: not on the manager's page.
    expect(screen.queryByText("Losjiinntekt i natt")).not.toBeInTheDocument();
    expect(screen.queryByText("Gjestesaker løst")).not.toBeInTheDocument();
    // No green summary line: it repeated the figures (round 6, design review).
    expect(screen.queryByText("1 oppgave bekreftet")).not.toBeInTheDocument();

    const open = screen.getByRole("region", { name: /^Åpent nå/ });
    expect(within(open).getByText("Rom 210: i bruk uten booking. Sjekk registreringen før rommet selges igjen.")).toBeInTheDocument();
    expect(within(open).getByText("Lobbyen · meldt 02:15 av Kjersti Lund · skilt satt ut 02:16")).toBeInTheDocument();
    expect(within(open).getByText("Gjest venter")).toBeInTheDocument();
    // Owners are the hotel's roles (round 4, design review), not the reader's name on every row.
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
    // Append-only (round 7, legal review): the day's receipts are a log.
    expect(stored[TODAY]).toHaveLength(1);
    expect(stored[TODAY][0]).toMatchObject({ name: "Ana Pereira" });
    expect(stored[TODAY][0].stamp).toMatch(/^\d{4}-\d\d-\d\dT/);
    unmount();

    show();
    expect(
      await screen.findByText("Kvittert av Ana Pereira · nå"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Angre kvitteringen" }));
    expect(
      screen.getByRole("button", { name: "Kvitter mottatt" }),
    ).toHaveFocus();
    // Angre appends a withdrawal, never deletes the receipt, and the page says so.
    const log = JSON.parse(localStorage.getItem("lobby:handover-signoff") ?? "{}")[TODAY];
    expect(log).toHaveLength(2);
    expect(log[0]).toMatchObject({ name: "Ana Pereira" });
    expect(log[1]).toMatchObject({ name: "Ana Pereira", withdrawn: true });
    expect(screen.getByText("Kvittering trukket tilbake av Ana Pereira · nå.")).toBeInTheDocument();
    expect(screen.getByText("Ikke kvittert ennå")).toBeInTheDocument();
  });

  it("sells the room in the open list in two steps that leave evidence, then waits for the booking system: never done, the kroner shown on the row", async () => {
    serve(() => new Response(TEST_NIGHT_JSONL, { status: 200 }));
    show();
    const open = await screen.findByRole("region", { name: /^Åpent nå/ });
    // While a room waits, its step is the page's one orange action; Kvitter mottatt is quiet.
    const confirm = within(open).getByRole("button", { name: "Bekreft med resepsjonen: rom 311" });
    expect(confirm.className).toMatch(/bg-accent/);
    expect(screen.getByRole("button", { name: "Kvitter mottatt" }).className).not.toMatch(/bg-accent/);
    expect(within(open).queryByRole("button", { name: "Send til resepsjonen: rom 311" })).not.toBeInTheDocument();
    // Who confirmed starts empty (round 6, legal review: a prefilled name is a claim nobody made).
    const who = within(open).getByLabelText("Hvem i resepsjonen bekreftet?");
    expect(who).toHaveValue("");
    for (const label of ["Folioen er gjort opp", "Ingen bagasje på rommet", "Nøkkelkortet er sperret"]) fireEvent.click(within(open).getByLabelText(label));
    fireEvent.click(confirm);
    expect(within(open).getByText("Skriv navnet først.")).toBeInTheDocument();
    expect(within(open).queryByText(/^Bekreftet av Hanne Vold/)).not.toBeInTheDocument();
    fireEvent.change(who, { target: { value: "Hanne Vold" } });
    fireEvent.click(confirm);
    expect(within(open).getByText("Bekreftet av Hanne Vold (resepsjon) · folio, bagasje, kort")).toBeInTheDocument();
    fireEvent.click(within(open).getByRole("button", { name: "Send til resepsjonen: rom 311" }));
    // Pending said once on the row, never "Gjort i dag" or "Ledig for salg".
    expect(within(open).getAllByText("Venter på PMS-en")).toHaveLength(1);
    expect(within(open).getByText("Rom 311: funnet ledig 5 timer tidligere, sendt til resepsjonen.")).toBeInTheDocument();
    expect(within(open).queryByText("Gjort i dag")).not.toBeInTheDocument();
    expect(within(open).queryByText("Ledig for salg")).not.toBeInTheDocument();
    const figures = screen.getByRole("region", { name: "Natten i tall" });
    expect(within(figures).getByRole("link", { name: /^Rom 311: sendt til resepsjonen · venter på PMS-en/ })).toBeInTheDocument();
    expect(within(figures).queryByText(/Frigitt/)).not.toBeInTheDocument();
    // Nothing waits for the money step now: the signature carries the orange.
    expect(screen.getByRole("button", { name: "Kvitter mottatt" }).className).toMatch(/bg-accent/);
    // The print carries the masthead, the line and who made it; on test data no shredding line (no real guest); no contact address is invented.
    const footer = screen.getByText("Lobby · Natten, ærlig overlevert. · Team Lobby, Oslo Sprint 2026 · Testdata: ingen ekte gjester.");
    expect(footer.textContent).not.toMatch(/Makuleres/);
    expect(footer.tagName).toBe("FOOTER");
    expect(footer.textContent).not.toMatch(/@|kontakt|https?:|www\./i);
    expect(document.querySelector("[data-print-masthead]")).toHaveTextContent(/^Lobby\s*Natten, ærlig overlevert\./);
  });

  it("on the demo night reads act → evidence → sign: safety in the bell's red, the catch, the sleeper with its test-data note, the signature last", async () => {
    const demo = readFileSync(resolve(process.cwd(), "public/runs/demo.jsonl"), "utf8");
    serve(() => new Response(demo, { status: 200 }));
    show();
    const open = await screen.findByRole("region", { name: /^Åpent nå/ });
    // Safety is never quieter than "Gjest venter" (round 3, design review): the danger tone, as in the bell.
    const safety = within(open).getAllByText("Sikkerhet");
    expect(safety).toHaveLength(2);
    expect(safety[0].className).toMatch(/text-danger/);
    expect(within(open).getByText("Gjest venter").className).toMatch(/text-warning/);
    // Safety says straks and how long each hazard waited for a person; the night clerk's lobby floor is added.
    expect(within(open).getAllByText("straks")).toHaveLength(2);
    expect(within(open).getByText("Korridor 2B siden 23:51 · roboten skled · 6 t 9 min uten at noen ble varslet")).toBeInTheDocument();
    expect(within(open).getByText("Lobbyen · meldt 02:15 av Kjersti Lund · skilt satt ut 02:16")).toBeInTheDocument();
    expect(within(open).getByText("4 t 43 min uten at noen ble varslet")).toBeInTheDocument();
    // The robot itself at 06:00: off its charger with the master keycard, before the night shift leaves.
    expect(within(open).getByText(/^Roboten står ved heis, 1\. etasje med hovednøkkelkortet, ikke på lader, 20 % batteri\./)).toBeInTheDocument();
    // 209 in neutral ink, drawn as two points (round 7: its memory and its eyes disagree, a person checks; a guest is booked there);
    // the test data said once in a quiet band, a small word on each booking row.
    expect(within(open).getByText("Sjekk rommet")).toBeInTheDocument();
    expect(within(open).getByText("Rom 209: robotens minne og øyne er uenige.")).toBeInTheDocument();
    expect(within(open).queryByText(/dobbelt tildelt|holdt tilbake/i)).not.toBeInTheDocument();
    // The pitch line as a heading (round 7): 210 and 213, where the booking system and the door lock disagree, together.
    const group = within(open).getByRole("heading", { name: "Bookingsystemet og dørlåsen er uenige · 2 rom" }).closest("li")!;
    expect(within(group).getAllByRole("listitem").map((row) => row.id).filter(Boolean)).toEqual(["sak-guest-room-210", "sak-sellable"]);
    expect(within(open).queryByText(/^Testdata:/)).not.toBeInTheDocument();
    expect(within(open).getAllByText("· testbooking")).toHaveLength(2);
    // The evidence as chips: 213 rests on the door lock, the night clerk and the robot.
    const sale = document.getElementById("sak-sellable")!;
    expect(within(sale).getByRole("list", { name: "Kilder" })).toHaveTextContent(/Dørlåsen· ingen kort siden kl\. 18.*Nattevakt· tomt 04:24 · eksempel.*Roboten· tomt 04:24/);
    expect(within(sale).getByText("Bekreftet av tre kilder")).toBeInTheDocument();
    const band = document.querySelector("[data-demo-band]");
    expect(band).toHaveTextContent(
      "Demo: én ekte natt fra robotens simulator. Bookinger og dørlås er testdata, merket «testbooking». Nattevaktens registreringer er eksempler, merket «Eksempel». Det du gjør her, lagres på denne enheten.",
    );
    // The catch leads the figures: the room itself, and the robot's own two clocks at 16 px in ink.
    const figures = screen.getByRole("region", { name: "Natten i tall" });
    // A room, never a count (round 7): "Rom 209", labelled with what disagrees, and what a person does.
    expect(within(figures).getByText("Robotens minne og øyne er uenige")).toBeInTheDocument();
    expect(within(figures).queryByText(/Holdt tilbake/)).not.toBeInTheDocument();
    expect(within(figures).getByText("Rom").parentElement).toHaveTextContent(/^Rom\s*209$/);
    expect(within(figures).getByText("Sjekk rommet før innsjekk")).toBeInTheDocument();
    const points = within(figures).getByRole("list", { name: "Fra robotens egen logg" });
    expect(points).toHaveTextContent(/01:29\s*bagasje inn\s*03:47\s*meldt tomt/);
    expect(points.className).toMatch(/text-base/);
    expect(within(figures).getByText("Rom 210 i bruk uten booking")).toBeInTheDocument();
    // Each figure jumps to its row (round 4, product and design review); 213 has its own link under the money.
    const hrefs = within(figures).getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual(["#sak-held-room-209", "#sak-guest-room-210", "#sak-sellable", "#sak-wet-floors", "#vurderinger-overlevering"]);
    // One count: the safety figure, Åpent nå's breakdown and its total (each wet floor a sak).
    expect(within(figures).getByText("4 våte gulv · 1 ukjent person · 4 ikke varslet")).toBeInTheDocument();
    expect(within(open).getByText("5 straks · 8 med frist i dag")).toBeInTheDocument();
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

  it("records who was told about a safety item, warns at the signature while one was told to nobody, and keeps both on this device", async () => {
    const demo = readFileSync(resolve(process.cwd(), "public/runs/demo.jsonl"), "utf8");
    serve(() => new Response(demo, { status: 200 }));
    show();
    const open = await screen.findByRole("region", { name: /^Åpent nå/ });
    const sign = screen.getByRole("region", { name: "Kvitter mottatt" });
    // A calm warning, never a block: 3 wet floors and the stranger nobody was told about in the night.
    expect(within(sign).getByText(/^4 sikkerhetssaker er ikke varslet til noen\./)).toBeInTheDocument();
    fireEvent.click(within(open).getByRole("button", { name: "Varsle Trond Eikeland" }));
    expect(within(open).getByText("Varslet Trond Eikeland")).toBeInTheDocument();
    expect(within(open).getByText(/· Ana Pereira · nå · registrert her, ingen SMS ennå$/)).toBeInTheDocument();
    expect(within(open).getByRole("button", { name: "Angre: varslet Trond Eikeland" })).toHaveFocus();
    expect(within(sign).getByText(/^1 sikkerhetssak er ikke varslet til noen\./)).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Natten i tall" })).getByText("4 våte gulv · 1 ukjent person · 1 ikke varslet")).toBeInTheDocument();
    // Kept per hazard (round 7): one line per wet floor the row covers, the night clerk's lobby floor among them.
    const stored = JSON.parse(localStorage.getItem("lobby:handover-varslet") ?? "{}");
    expect(stored[TODAY]).toHaveLength(4);
    expect(stored[TODAY].find((line: { hazard: string }) => line.hazard === "wet:lobby")).toMatchObject({ to: "Trond Eikeland", by: "Ana Pereira" });
    // The receipt says what was not done.
    fireEvent.click(within(sign).getByRole("button", { name: "Kvitter mottatt" }));
    expect(within(sign).getByText(/, med 13 åpne saker, 1 sikkerhetssak ikke varslet\. Kvitteringen er lagret på denne enheten\.$/)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("lobby:handover-signoff") ?? "{}")[TODAY][0]).toMatchObject({ open: 13, untold: 1 });
    // Angre appends a correction (round 7): the Varsle stays in the log, struck through on the row.
    fireEvent.click(within(open).getByRole("button", { name: "Angre: varslet Trond Eikeland" }));
    expect(within(open).getByRole("button", { name: "Varsle Trond Eikeland" })).toHaveFocus();
    const log = JSON.parse(localStorage.getItem("lobby:handover-varslet") ?? "{}")[TODAY];
    expect(log).toHaveLength(8);
    expect(log.filter((line: { undo?: boolean }) => line.undo)).toHaveLength(4);
    expect(within(open).getByText(/· angret av Ana Pereira · nå$/)).toBeInTheDocument();
  });

  it("builds the same page without a robot from owner B's switch: no robot figure, card or band, the clerk's entries instead", async () => {
    const demo = readFileSync(resolve(process.cwd(), "public/runs/demo.jsonl"), "utf8");
    serve(() => new Response(demo, { status: 200 }));
    show();
    await screen.findByRole("region", { name: /^Åpent nå/ });
    expect(screen.getByRole("button", { name: "Med robot" })).toHaveAttribute("aria-pressed", "true");
    expect(document.getElementById("vurderinger-overlevering")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Uten robot" }));
    expect(screen.getByRole("button", { name: "Uten robot" })).toHaveAttribute("aria-pressed", "true");
    // What only a robot gives is gone, said in one line; the night clerk's count stands where the robot's figure was.
    expect(document.getElementById("vurderinger-overlevering")).toBeNull();
    expect(screen.getByText(/^Ingen robot i natt:/)).toBeInTheDocument();
    const figures = screen.getByRole("region", { name: "Natten i tall" });
    expect(within(figures).queryByText("Robotens oppdrag")).not.toBeInTheDocument();
    expect(within(figures).getByText("Fra nattevakten")).toBeInTheDocument();
    // B's line says what the page rests on; the robot night's demo band and the robot's state are not shown.
    expect(document.querySelector("[data-demo-band]")).toBeNull();
    expect(screen.queryByText(/^Roboten står ved/)).not.toBeInTheDocument();
    expect(screen.getByText(/^Uten robot: bookingsystemet, dørlåsen/)).toBeInTheDocument();
    // The evidence chips without a robot: the door lock and the night clerk, two sources outside a robot.
    const sale = document.getElementById("sak-sellable")!;
    expect(within(sale).getByText("Bekreftet av to kilder")).toBeInTheDocument();
    expect(within(sale).queryByText("Roboten")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Med robot" }));
    expect(document.getElementById("vurderinger-overlevering")).not.toBeNull();
  });

  it("carries a Varsle across Med robot / Uten robot: it is kept per hazard, so the clerk's lobby floor reads as told on both (round 7)", async () => {
    const demo = readFileSync(resolve(process.cwd(), "public/runs/demo.jsonl"), "utf8");
    serve(() => new Response(demo, { status: 200 }));
    show();
    let open = await screen.findByRole("region", { name: /^Åpent nå/ });
    // Med robot: the grouped wet floors' Varsle covers all four, the lobby among them.
    fireEvent.click(within(open).getAllByRole("button", { name: "Varsle Trond Eikeland" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Uten robot" }));
    open = screen.getByRole("region", { name: /^Åpent nå/ });
    const lobby = within(open).getByText(/^Vått gulv i lobbyen/).closest("li")!;
    expect(within(lobby).getByText("Varslet Trond Eikeland")).toBeInTheDocument();
    expect(within(lobby).queryByRole("button", { name: "Varsle Trond Eikeland" })).not.toBeInTheDocument();
    // Without a robot, the rooms where lock and booking disagree stand together too, then everything by deadline.
    expect(within(open).getByRole("heading", { name: "Bookingsystemet og dørlåsen er uenige · 2 rom" })).toBeInTheDocument();
    const dues = [...open.querySelectorAll("li[id^='sak-'] .font-mono")].map((due) => due.textContent ?? "");
    expect(dues).toEqual([...dues].sort());
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
