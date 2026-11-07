import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardScreen } from "./DashboardScreen";
import { ReceptionPanel } from "./ReceptionPanel";
import { POLL_IDLE_MS, POLL_LIVE_MS } from "./useDashboardRun";
import { CALLS_URL, NOT_SET_UP_QUIET_MS } from "./useReceptionCalls";

// The public /api is rate limited (30 requests a minute per IP): the overview must ask little and
// never loop. These tests count requests over minutes of fake time.
const DEMO = readFileSync(resolve(process.cwd(), "src/features/nightshift/fixtures/sample.jsonl"), "utf8");
const VIEWER = "http://127.0.0.1:8765";
const MINUTE = 60_000;

const fetchMock = vi.fn<typeof fetch>();
let viewer: "down" | "idle" | "live" = "down";

function calls(match: string) {
  return fetchMock.mock.calls.filter(([input]) => String(input).startsWith(match)).length;
}

async function wait(ms: number) {
  await act(() => vi.advanceTimersByTimeAsync(ms));
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
}

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  setHidden(false);
  viewer = "down";
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input) => {
    const url = String(input);
    if (url === CALLS_URL) return Response.json({ error: "ikke satt opp" }, { status: 503 });
    if (url === "/runs/demo.jsonl") return new Response(DEMO);
    if (url === `${VIEWER}/api/runs`) {
      if (viewer === "down") throw new TypeError("connection refused");
      return Response.json([{ shift: "w2-3fa94c1d07be4e2a9c55d1e8b6a0f217", live: viewer === "live" }]);
    }
    if (url.startsWith(`${VIEWER}/api/run/`)) return Response.json({ lines: [], next: 0 });
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Resepsjon panel request budget", () => {
  it("asks once on mount and never again on its own after a 503", async () => {
    render(<ReceptionPanel />);
    await wait(0);
    expect(calls(CALLS_URL)).toBe(1);
    expect(screen.getByText("Resepsjonisten er ikke koblet til ennå")).toBeInTheDocument();

    await wait(10 * MINUTE);
    expect(calls(CALLS_URL)).toBe(1);
  });

  it("asks again only when staff press Prøv igjen", async () => {
    render(<ReceptionPanel />);
    await wait(0);
    fireEvent.click(screen.getByRole("button", { name: "Prøv igjen: Resepsjon" }));
    await wait(0);
    expect(calls(CALLS_URL)).toBe(2);
    await wait(10 * MINUTE);
    expect(calls(CALLS_URL)).toBe(2);
  });

  it("makes one request under React's dev double mount", async () => {
    render(
      <StrictMode>
        <ReceptionPanel />
      </StrictMode>,
    );
    await wait(0);
    expect(calls(CALLS_URL)).toBe(1);
  });

  it("stays quiet for a minute after a 503, even when the page mounts again (a reload)", async () => {
    const first = render(<ReceptionPanel />);
    await wait(0);
    first.unmount();

    const again = render(<ReceptionPanel />);
    await wait(0);
    expect(calls(CALLS_URL)).toBe(1);
    expect(screen.getByText("Resepsjonisten er ikke koblet til ennå")).toBeInTheDocument();
    again.unmount();

    await wait(NOT_SET_UP_QUIET_MS);
    render(<ReceptionPanel />);
    await wait(0);
    expect(calls(CALLS_URL)).toBe(2);
  });
});

describe("the whole overview's request budget", () => {
  it("loads the night and the calls once, with no viewer configured", async () => {
    render(<DashboardScreen />);
    await wait(10 * MINUTE);
    // The night is read twice, by the desk's own fold and by the 3D hotel's replay engine, and never
    // again. TODO(ui): share one load once useHotelReplay can take parsed lines.
    expect(calls("/runs/demo.jsonl")).toBe(2);
    expect(calls(CALLS_URL)).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("looks at a viewer that is down only every 30 s", async () => {
    render(<DashboardScreen viewerUrl={VIEWER} />);
    await wait(0);
    expect(calls(`${VIEWER}/api/runs`)).toBe(1);
    await wait(2 * MINUTE);
    expect(calls(`${VIEWER}/api/runs`)).toBe(1 + (2 * MINUTE) / POLL_IDLE_MS);
    expect(calls(CALLS_URL)).toBe(1);
  });

  it("follows a live shift every 3 s", async () => {
    viewer = "live";
    render(<DashboardScreen viewerUrl={VIEWER} />);
    await wait(0);
    await wait(30_000);
    expect(calls(`${VIEWER}/api/runs`)).toBe(1 + 30_000 / POLL_LIVE_MS);
  });

  it("does not poll the viewer while the tab is hidden, and picks up when it is shown", async () => {
    setHidden(true);
    render(<DashboardScreen viewerUrl={VIEWER} />);
    await wait(5 * MINUTE);
    expect(calls(`${VIEWER}/api/runs`)).toBe(0);

    setHidden(false);
    document.dispatchEvent(new Event("visibilitychange"));
    await wait(0);
    expect(calls(`${VIEWER}/api/runs`)).toBe(1);
  });
});
