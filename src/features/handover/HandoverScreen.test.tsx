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
  it("shows the night's good news, what is open with an owner and a time, and what happened", async () => {
    serve(() => new Response(TEST_NIGHT_JSONL, { status: 200 }));
    show();
    // The labels stand under skeletons while the night loads; the details come with it.
    expect(await screen.findByText("1 støyklage")).toBeInTheDocument();
    expect(screen.getByText("Gjestesaker løst")).toBeInTheDocument();
    // The robot's figure is its night's one tally, with the server's verdict on every "done".
    expect(screen.getByText("Robotens oppdrag")).toBeInTheDocument();
    expect(
      screen.getByText(
        `Godkjent av dommeren (Wybe Night Shift-simulatoren): 1 av 1 · nattevakten ${STAFF_DONE} · AI tok 3 samtaler`,
      ),
    ).toBeInTheDocument();
    // The money is the first figure: the room the system thought occupied, sold after a confirmation.
    const figures = screen.getByRole("region", { name: "Natten i tall" });
    expect(within(figures).getByText("Kan selges etter bekreftelse")).toBeInTheDocument();
    expect(within(figures).getByText("Rom 311")).toBeInTheDocument();
    expect(within(figures).getByText("Frigitt i dag: ingen ennå")).toBeInTheDocument();
    expect(screen.getByText("Losjiinntekt i natt")).toBeInTheDocument();
    // One factual line, green only for what is done.
    expect(screen.getByText("1 oppgave bekreftet")).toBeInTheDocument();

    const open = screen.getByRole("region", { name: /^Åpent nå/ });
    expect(
      within(open).getByText(
        "Rom 210: en gjest uten booking. Sjekk registreringen.",
      ),
    ).toBeInTheDocument();
    expect(within(open).getByText("Gjest venter")).toBeInTheDocument();
    expect(within(open).getAllByText("Siri Haugen").length).toBeGreaterThan(0);

    const night = screen.getByRole("region", { name: "Dette skjedde i natt" });
    expect(
      within(night).getByText(
        /^Roboten fant rom 311 tomt og ryddig, men systemet sa opptatt\. Det kan selges etter bekreftelse, ca\. [\d\s\u00a0]+ kr\.$/,
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
      await screen.findByText(/Kvittert av Ana Pereira/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Angre kvitteringen" }));
    expect(
      screen.getByRole("button", { name: "Kvitter mottatt" }),
    ).toHaveFocus();
    expect(
      JSON.parse(localStorage.getItem("lobby:handover-signoff") ?? "{}"),
    ).toEqual({});
  });

  it("sells the room right in the open list, in two steps, and the money figure moves with it", async () => {
    serve(() => new Response(TEST_NIGHT_JSONL, { status: 200 }));
    show();
    const open = await screen.findByRole("region", { name: /^Åpent nå/ });
    expect(within(open).queryByRole("button", { name: "Merk rom 311 som ledig for salg" })).not.toBeInTheDocument();
    fireEvent.click(within(open).getByRole("button", { name: "Bekreft med resepsjonen: rom 311" }));
    fireEvent.click(within(open).getByRole("button", { name: "Merk rom 311 som ledig for salg" }));
    expect(within(open).getByText("Ledig for salg")).toBeInTheDocument();
    expect(within(open).getByText("Gjort i dag")).toBeInTheDocument();
    const figures = screen.getByRole("region", { name: "Natten i tall" });
    expect(within(figures).getByText("Frigitt for salg i dag")).toBeInTheDocument();
    expect(within(figures).getByText(/^Frigitt i dag: 1 rom · ca\. [\d\s\u00a0]+ kr$/)).toBeInTheDocument();
    // The print carries the name, the line and who made it; no contact address exists, so none is invented.
    const footer = screen.getByText("Fettero · Natten, ærlig overlevert. · Team Fettero, Oslo Sprint 2026");
    expect(footer.tagName).toBe("FOOTER");
    expect(footer.textContent).not.toMatch(/@|kontakt|https?:|www\./i);
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
