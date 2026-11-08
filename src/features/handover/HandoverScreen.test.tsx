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
        `Godkjent av Wybe-serveren: 1 av 1 · nattevakten ${STAFF_DONE} · AI tok 3 samtaler`,
      ),
    ).toBeInTheDocument();
    // The room the system thought occupied, with what it is worth today.
    expect(screen.getByText(/^1 rom kan selges i dag · ca\. [\d\s\u00a0]+ kr \(systemet trodde de var opptatt\)$/)).toBeInTheDocument();
    expect(screen.getByText("Losjiinntekt i natt")).toBeInTheDocument();

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
        /^Roboten fant rom 311 tomt og ryddig, men systemet sa opptatt\. Det kan selges i dag, ca\. [\d\s\u00a0]+ kr\.$/,
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
    expect(screen.getByText(/Signert av Ana Pereira/)).toBeInTheDocument();
    expect(screen.getByText(/^Kvittert \d\d:\d\d$/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Angre kvitteringen" }),
    ).toHaveFocus();
    const stored = JSON.parse(
      localStorage.getItem("lobby:handover-signoff") ?? "{}",
    );
    expect(stored[TODAY]).toMatchObject({ name: "Ana Pereira" });
    expect(stored[TODAY].at).toMatch(/^\d\d:\d\d$/);
    unmount();

    show();
    expect(
      await screen.findByText(/Signert av Ana Pereira/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Angre kvitteringen" }));
    expect(
      screen.getByRole("button", { name: "Kvitter mottatt" }),
    ).toHaveFocus();
    expect(
      JSON.parse(localStorage.getItem("lobby:handover-signoff") ?? "{}"),
    ).toEqual({});
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
