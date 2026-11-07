import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildTimeline, snapshotAt } from "@/features/replay";
import { NightShiftScreen } from "./NightShiftScreen";
import { parseRunLog } from "./runlog";
import { viewerBase } from "./useRun";

const SAMPLE = readFileSync(resolve(process.cwd(), "src/features/nightshift/fixtures/sample.jsonl"), "utf8");
// The demo night changes when a better live run is published; the screen must show whatever it holds.
const TIMELINE = buildTimeline(parseRunLog(SAMPLE).lines);
const END = snapshotAt(TIMELINE, TIMELINE.duration);
const LAST_DECISION = [...TIMELINE.events].reverse().find((event) => event.decision)!;
const SHIFT = "w2-3fa94c1d07be4e2a9c55d1e8b6a0f217";

const fetchMock = vi.fn<typeof fetch>();

function textResponse(body: string, status = 200) {
  return new Response(body, { status });
}

function serveDemo() {
  fetchMock.mockImplementation(async () => textResponse(SAMPLE));
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  // jsdom has no scrolling; the room card asks to be scrolled into view.
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("NightShiftScreen, replay", () => {
  it("shows the finished demo shift: score, clock, tasks, the hotel and the decision feed", async () => {
    serveDemo();
    render(<NightShiftScreen />);

    expect(await screen.findByText("Ferdig")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/runs/demo.jsonl", expect.anything());
    const stats = screen.getByRole("group", { name: "Skiftet i tall" });
    expect(within(stats).getByText(String(END.score))).toBeInTheDocument();
    expect(within(stats).getByText(END.clock)).toBeInTheDocument();
    expect(within(stats).getByText(String(END.tasksDone))).toBeInTheDocument();
    expect(screen.getByRole("figure", { name: "Hotellet som plantegning" })).toBeInTheDocument();
    expect(screen.getAllByText(LAST_DECISION.text).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Spill av/ })).toBeEnabled();
  });

  it("hides the Direkte source when no viewer URL is set, and links to the 3D hotel", async () => {
    serveDemo();
    render(<NightShiftScreen />);
    await screen.findByText("Ferdig");
    expect(screen.queryByRole("button", { name: "Direkte" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Åpne hotellet i 3D" })).toHaveAttribute("href", "/hotell");
  });

  it("plays the night from 22:00 on Spill av and pauses again", async () => {
    serveDemo();
    render(<NightShiftScreen />);
    await screen.findByText("Ferdig");

    fireEvent.click(screen.getByRole("button", { name: "Spill av fra 22:00" }));
    expect(screen.getByText("Spilles av")).toBeInTheDocument();
    const stats = screen.getByRole("group", { name: "Skiftet i tall" });
    expect(within(stats).getByText(/^22:00/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByText("Pauset")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Spill av" })).toBeEnabled();
  });

  it("scrubs the timeline to a moment of the night", async () => {
    serveDemo();
    render(<NightShiftScreen />);
    await screen.findByText("Ferdig");

    fireEvent.change(screen.getByRole("slider", { name: "Tidspunkt på natten" }), { target: { value: "320" } });
    const stats = screen.getByRole("group", { name: "Skiftet i tall" });
    expect(within(stats).getByText("22:05:20")).toBeInTheDocument();
    // Mid-way through R-001 the robot is on floor 3 with the charger.
    expect(screen.getAllByText("R-001 · Lader til 319").length).toBeGreaterThan(0);
  });

  it("opens a room's details when a room on the map is chosen, and closes them again", async () => {
    serveDemo();
    render(<NightShiftScreen />);
    await screen.findByText("Ferdig");

    fireEvent.click(screen.getByRole("button", { name: /^Rom 319:/ }));
    const card = screen.getByRole("heading", { name: "Rom 319" }).closest("[data-room]")!;
    expect(card).toHaveAttribute("data-room", "room-319");
    expect(within(card as HTMLElement).getByText(/^Oppgaver/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Rom 319:/ })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Lukk Rom 319" }));
    expect(screen.queryByRole("heading", { name: "Rom 319" })).not.toBeInTheDocument();
  });

  it("lists exactly as many failed tasks as the figure counts, each with a 3D link", async () => {
    serveDemo();
    render(<NightShiftScreen />);
    await screen.findByText("Ferdig");

    const stats = screen.getByRole("group", { name: "Skiftet i tall" });
    expect(within(stats).getAllByText(String(END.tasksFailed)).length).toBeGreaterThan(0);
    const section = screen.getByRole("region", { name: /^Feilet/ });
    expect(within(section).getByText(String(END.tasksFailed))).toBeInTheDocument();
    const rows = END.tasksFailed === 0 ? [] : within(section).getAllByRole("listitem");
    expect(rows).toHaveLength(END.tasksFailed);
    for (const row of rows) expect(within(row).getByRole("link", { name: /^Vis i 3D-kartet kl\. / })).toBeInTheDocument();
  });

  it("opens the room's card right under the map, from the room list too, and scrolls it into view", async () => {
    serveDemo();
    const scrolled = vi.mocked(window.HTMLElement.prototype.scrollIntoView);
    render(<NightShiftScreen />);
    await screen.findByText("Ferdig");

    const moment = screen.getByRole("region", { name: "Et øyeblikk av natten" });
    fireEvent.change(within(moment).getByRole("combobox", { name: "Velg rom" }), { target: { value: "room-319" } });
    const card = within(moment).getByRole("heading", { name: "Rom 319" }).closest("[data-room]")!;
    expect(card).toHaveAttribute("data-room", "room-319");
    // The card follows the map in the page, not the failures column far above it.
    const map = within(moment).getByRole("figure", { name: "Hotellet som plantegning" });
    expect(map.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(scrolled).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(within(moment).getByRole("button", { name: /^Rom 319:/ })).toHaveAttribute("aria-pressed", "true");

    fireEvent.change(within(moment).getByRole("combobox", { name: "Velg rom" }), { target: { value: "" } });
    expect(screen.queryByRole("heading", { name: "Rom 319" })).not.toBeInTheDocument();
  });

  it("says what went wrong and retries when the recording can't be loaded", async () => {
    fetchMock.mockResolvedValueOnce(textResponse("", 500));
    render(<NightShiftScreen />);

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Fikk ikke lastet opptaket")).toBeInTheDocument();

    fetchMock.mockResolvedValueOnce(textResponse(SAMPLE));
    fireEvent.click(within(alert).getByRole("button", { name: "Prøv igjen" }));
    expect(await screen.findByText("Ferdig")).toBeInTheDocument();
  });

  it("shows an empty state when the recording has no readable lines", async () => {
    fetchMock.mockResolvedValue(textResponse("not a run log\n"));
    render(<NightShiftScreen />);
    expect(await screen.findByRole("heading", { name: "Opptaket er tomt" })).toBeInTheDocument();
  });
});

describe("NightShiftScreen, live", () => {
  const VIEWER = "http://127.0.0.1:8765";

  it("offers Direkte next to Opptak when a viewer URL is set", async () => {
    serveDemo();
    render(<NightShiftScreen viewerUrl={VIEWER} />);
    await screen.findByText("Ferdig");
    const sources = screen.getByRole("group", { name: "Kilde" });
    expect(within(sources).getByRole("button", { name: "Opptak" })).toHaveAttribute("aria-pressed", "true");
    expect(within(sources).getByRole("button", { name: "Direkte" })).toHaveAttribute("aria-pressed", "false");
  });

  it("follows the live shift from the viewer server", async () => {
    const lines = [
      { v: 1, type: "start", shift: SHIFT, mode: "practice", seed: 3 },
      { v: 1, type: "state", clock: "22:05:10", location: "corridor-1b", score: 16 },
    ];
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/runs/demo.jsonl")) return textResponse(SAMPLE);
      if (url === `${VIEWER}/api/runs`) {
        return textResponse(JSON.stringify([{ shift: SHIFT, mode: "practice", seed: 3, live: true, score: 16 }]));
      }
      if (url === `${VIEWER}/api/run/${SHIFT}?from=0`) return textResponse(JSON.stringify({ lines, next: 2 }));
      return textResponse(JSON.stringify({ lines: [], next: 2 }));
    });
    render(<NightShiftScreen viewerUrl={VIEWER} />);
    await screen.findByText("Ferdig");

    fireEvent.click(screen.getByRole("button", { name: "Direkte" }));
    expect(await screen.findByText("Pågår")).toBeInTheDocument();
    const stats = screen.getByRole("group", { name: "Skiftet i tall" });
    expect(within(stats).getByText("16")).toBeInTheDocument();
    expect(within(stats).getByText("22:05:10")).toBeInTheDocument();
    expect(within(stats).getByText("Korridor 1b")).toBeInTheDocument();
  });

  it("says the viewer server can't be reached", async () => {
    fetchMock.mockImplementation(async (input) => {
      if (String(input).endsWith("/runs/demo.jsonl")) return textResponse(SAMPLE);
      throw new TypeError("Failed to fetch");
    });
    render(<NightShiftScreen viewerUrl={VIEWER} />);
    await screen.findByText("Ferdig");

    fireEvent.click(screen.getByRole("button", { name: "Direkte" }));
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Fikk ikke kontakt med viewer-serveren")).toBeInTheDocument();
  });

  it("never asks the viewer server for a shift id it doesn't trust", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/runs/demo.jsonl")) return textResponse(SAMPLE);
      if (url === `${VIEWER}/api/runs`) return textResponse(JSON.stringify([{ shift: "../../.env", live: true }]));
      return textResponse(JSON.stringify({ lines: [], next: 0 }));
    });
    render(<NightShiftScreen viewerUrl={VIEWER} />);
    await screen.findByText("Ferdig");

    fireEvent.click(screen.getByRole("button", { name: "Direkte" }));
    expect(await screen.findByRole("heading", { name: "Ingen skift ennå" })).toBeInTheDocument();
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/run/"))).toBe(false));
  });
});

describe("viewerBase", () => {
  it("accepts an http(s) URL and drops a trailing slash", () => {
    expect(viewerBase("http://127.0.0.1:8765/")).toBe("http://127.0.0.1:8765");
    expect(viewerBase(" https://viewer.local/hotel ")).toBe("https://viewer.local/hotel");
  });

  it("treats unset, blank or non-http values as no viewer", () => {
    expect(viewerBase(undefined)).toBeNull();
    expect(viewerBase("")).toBeNull();
    expect(viewerBase("javascript:alert(1)")).toBeNull();
    expect(viewerBase("not a url")).toBeNull();
  });
});
