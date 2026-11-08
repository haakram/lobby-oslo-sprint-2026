import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardScreen } from "./DashboardScreen";
import { POLL_IDLE_MS, POLL_LIVE_MS, useDashboardRun } from "./useDashboardRun";

// At 06:00 the live shift ends or the viewer goes quiet: the screen must keep tonight's night and
// say so, never swap in the recorded demo night as if it were tonight's.
const DEMO = readFileSync(resolve(process.cwd(), "src/features/nightshift/fixtures/sample.jsonl"), "utf8");
const LIVE_LINES = DEMO.split("\n")
  .filter((line) => line.trim())
  .slice(0, 40)
  .map((line) => JSON.parse(line) as unknown);
const VIEWER = "http://127.0.0.1:8765";
const SHIFT = "w2-3fa94c1d07be4e2a9c55d1e8b6a0f217";

const fetchMock = vi.fn<typeof fetch>();
let viewer: "live" | "idle" | "down" = "live";

async function wait(ms: number) {
  await act(() => vi.advanceTimersByTimeAsync(ms));
}

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  localStorage.clear();
  viewer = "live";
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input) => {
    const url = String(input);
    if (url === "/runs/demo.jsonl") return new Response(DEMO);
    if (url === "/api/reception/calls") return Response.json({ error: "ikke satt opp" }, { status: 503 });
    if (url === `${VIEWER}/api/runs`) {
      if (viewer === "down") throw new TypeError("connection refused");
      return Response.json([{ shift: SHIFT, live: viewer === "live" }]);
    }
    if (url.startsWith(`${VIEWER}/api/run/`)) {
      const from = Number(new URL(url).searchParams.get("from") ?? 0);
      return Response.json({ lines: from === 0 ? LIVE_LINES : [], next: LIVE_LINES.length });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useDashboardRun when a live shift goes away", () => {
  it("keeps the live lines and marks contact lost when the viewer stops answering", async () => {
    const { result } = renderHook(() => useDashboardRun(VIEWER));
    await wait(0);
    expect(result.current).toMatchObject({ source: "live", ended: false, lostAfter: null });
    const lines = result.current.lines;
    expect(lines.length).toBeGreaterThan(0);

    viewer = "down";
    await wait(POLL_LIVE_MS);
    expect(result.current.source).toBe("live");
    expect(result.current.lines).toBe(lines);
    expect(result.current.lostAfter).toEqual(expect.any(Number));

    // Back in contact: the mark goes away.
    viewer = "live";
    await wait(POLL_IDLE_MS);
    expect(result.current).toMatchObject({ source: "live", lostAfter: null });
  });

  it("keeps the night of a shift that has ended, marked as ended", async () => {
    const { result } = renderHook(() => useDashboardRun(VIEWER));
    await wait(0);
    const lines = result.current.lines;

    viewer = "idle";
    await wait(POLL_LIVE_MS);
    expect(result.current).toMatchObject({ source: "live", ended: true, lostAfter: null });
    expect(result.current.lines).toBe(lines);
  });

  it("shows the recording when no live shift was ever seen", async () => {
    viewer = "down";
    const { result } = renderHook(() => useDashboardRun(VIEWER));
    await wait(0);
    expect(result.current).toMatchObject({ source: "demo", ended: false, lostAfter: null, status: "ready" });
  });
});

describe("the top bar's badge", () => {
  it("says Mistet kontakt with the last answer's time, not Opptak, when the viewer goes quiet", async () => {
    render(<DashboardScreen viewerUrl={VIEWER} />);
    await wait(0);
    expect(screen.getByText("Direkte")).toBeInTheDocument();

    viewer = "down";
    await wait(POLL_LIVE_MS);
    expect(screen.getByText(/^Mistet kontakt · sist \d{2}:\d{2}$/)).toBeInTheDocument();
    expect(screen.queryByText("Opptak")).not.toBeInTheDocument();
  });

  it("says Natten er over when the live shift ends", async () => {
    render(<DashboardScreen viewerUrl={VIEWER} />);
    await wait(0);
    viewer = "idle";
    await wait(POLL_LIVE_MS);
    expect(screen.getByText("Natten er over")).toBeInTheDocument();
    expect(screen.queryByText("Opptak")).not.toBeInTheDocument();
  });
});
