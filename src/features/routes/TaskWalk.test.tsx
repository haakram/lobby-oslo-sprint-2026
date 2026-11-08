import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BASE_HOTEL } from "@/features/hotel";
import { parseRunValues } from "@/features/nightshift/runlog";
import { robotWalk } from "./robotWalk";
import { STEP_MS, TaskWalk } from "./TaskWalk";

const call = (clock: string, cmd: string, args: Record<string, unknown>, result: unknown = "ok") => ({ v: 1, type: "call", cmd, args, ok: true, clock, result });
const move = (clock: string, to: string, metres?: number) => call(clock, "move", { to }, metres === undefined ? { at: to } : { at: to, metres });
const decision = (kind: string, data: Record<string, unknown>) => ({ v: 1, type: "decision", kind, data });

// Room service to Rom 201: ask the desk, fetch the tray at the kitchen pass, ride up, deliver.
const LINES = parseRunValues([
  { v: 1, type: "state", clock: "23:00:00", location: "front-desk", score: 0 },
  decision("task_start", { request: "R-012", kind: "tray", room: "room-201" }),
  call("23:00:30", "ask", { person: "clerk", question: "Who ordered?" }),
  move("23:00:38", "lobby", 8),
  move("23:00:50", "corridor-1a", 9),
  move("23:01:05", "corridor-1b", 13),
  move("23:01:15", "corridor-1c", 10),
  move("23:01:25", "kitchen-pass", 6),
  call("23:01:30", "pick", { item: "tray-201" }),
  move("23:01:40", "corridor-1c", 6),
  move("23:01:50", "corridor-1b", 10),
  move("23:02:05", "corridor-1a", 13),
  move("23:02:15", "lobby", 9),
  move("23:02:21", "elevator-1", 6),
  move("23:03:00", "elevator-2"),
  move("23:03:06", "corridor-2a", 4),
  call("23:03:10", "knock", { door: "room-201" }),
  call("23:03:15", "place", { item: "tray-201", where: "room-201" }),
  call("23:03:16", "report", { request: "R-012", outcome: "done" }),
  decision("task_done", { request: "R-012", status: "done" }),
]).lines;
const TASK = robotWalk(LINES, BASE_HOTEL).tasks[0];

function renderWalk() {
  return render(<TaskWalk map={BASE_HOTEL} statuses={new Map()} task={TASK} legend={null} />);
}

/** The stop the status line says is in view, e.g. "Stopp 2 av 4: Kjøkkenluke". */
function inView(): string {
  return screen.getByText(/^Stopp/).textContent ?? "";
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("TaskWalk (Ruter → Robot, one task)", () => {
  it("lists the stops in walking order, numbered like the pins on the map", () => {
    const { container } = renderWalk();
    const stops = within(screen.getByRole("list", { name: "Stoppene på veien" })).getAllByRole("button");
    expect(stops.map((stop) => stop.textContent)).toEqual([
      expect.stringMatching(/^1Resepsjon · spør resepsjonen/),
      expect.stringMatching(/^2Kjøkkenluke · hent brett til 201.*46 m/),
      expect.stringMatching(/^3Heis til 2\. etasje · fra 1\. etasje/),
      expect.stringMatching(/^4Korridor 2A · bank på rom 201, lever brett til 201, meld fullført/),
    ]);
    const pins = [...container.querySelectorAll<HTMLElement>("[data-pin-step]")].map((pin) => pin.textContent);
    expect(pins).toEqual(["1", "2", "3", "4"]);
    expect(screen.getByText(/^Start:/)).toHaveTextContent("Start: Resepsjon · 23:00");
  });

  it("does not play by itself: it opens paused on the first stop", () => {
    const { container } = renderWalk();
    expect(inView()).toBe("Stopp 1 av 4: Resepsjon");
    act(() => vi.advanceTimersByTime(STEP_MS * 5));
    expect(inView()).toBe("Stopp 1 av 4: Resepsjon");
    expect(screen.getByRole("button", { name: "Spill av" })).toBeInTheDocument();
    expect(container.querySelector('[data-pin-state="here"]')).toHaveTextContent("1");
    expect(container.querySelectorAll('[data-pin-state="ahead"]')).toHaveLength(3);
    const first = within(screen.getByRole("list", { name: "Stoppene på veien" })).getAllByRole("button")[0];
    expect(first).toHaveAttribute("aria-current", "step");
  });

  it("plays stop by stop, pauses, and stops at the end", () => {
    renderWalk();
    fireEvent.click(screen.getByRole("button", { name: "Spill av" }));
    act(() => vi.advanceTimersByTime(STEP_MS));
    expect(inView()).toBe("Stopp 2 av 4: Kjøkkenluke");

    const pause = screen.getByRole("button", { name: "Pause" });
    fireEvent.click(pause);
    act(() => vi.advanceTimersByTime(STEP_MS * 3));
    expect(inView()).toBe("Stopp 2 av 4: Kjøkkenluke");

    fireEvent.click(screen.getByRole("button", { name: "Spill av" }));
    act(() => vi.advanceTimersByTime(STEP_MS));
    act(() => vi.advanceTimersByTime(STEP_MS));
    expect(inView()).toBe("Stopp 4 av 4: Korridor 2A");
    // At the end it stops by itself and offers Spill av again.
    expect(screen.getByRole("button", { name: "Spill av" })).toBeInTheDocument();
  });

  it("starts again from the first stop with Start på nytt, and jumps to a stop picked in the list", () => {
    renderWalk();
    fireEvent.click(within(screen.getByRole("list", { name: "Stoppene på veien" })).getAllByRole("button")[2]);
    expect(inView()).toBe("Stopp 3 av 4: Heis til 2. etasje");
    fireEvent.click(screen.getByRole("button", { name: "Start på nytt" }));
    expect(inView()).toBe("Stopp 1 av 4: Resepsjon");
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(STEP_MS));
    expect(inView()).toBe("Stopp 2 av 4: Kjøkkenluke");
  });
});
