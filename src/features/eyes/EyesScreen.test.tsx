import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const camera = vi.hoisted(() => ({ status: "ready" as string }));
const sceneCalls = vi.hoisted(() => [] as { on: boolean; cover?: () => readonly unknown[] }[]);
const person = { id: "p1", x: 10, y: 10, w: 50, h: 120, label: "person", score: 0.9 };
const bottle = { id: "b1", x: 200, y: 50, w: 40, h: 90, label: "bottle", score: 0.8 };

vi.mock("./useCamera", () => ({
  useCamera: () => ({
    video: { current: null },
    status: camera.status,
    size: { width: 640, height: 480 },
    start: vi.fn(),
    retry: vi.fn(),
  }),
}));
vi.mock("./useDetector", () => ({ useDetector: () => ({ status: "ready", boxes: [person, bottle] }) }));
vi.mock("./useLiveIdentify", () => ({ useLiveIdentify: () => ({ results: {}, busy: {}, send: vi.fn() }) }));
// The overlay draws boxes with a ResizeObserver; this test is about what is sent, not how boxes look.
vi.mock("./BoxOverlay", () => ({ BoxOverlay: () => null }));
vi.mock("./useScene", () => ({
  useScene: (_video: unknown, options: { on: boolean; cover?: () => readonly unknown[] }) => {
    sceneCalls.push(options);
    return { landmarks: [], now: 0 };
  },
}));

import { EyesScreen } from "./EyesScreen";

beforeEach(() => {
  camera.status = "ready";
  sceneCalls.length = 0;
});

describe("EyesScreen privacy defaults", () => {
  it("starts with Omgivelser off, so no whole frame is sent until someone switches it on", () => {
    render(<EyesScreen />);
    expect(screen.getByRole("switch", { name: "Omgivelser" })).toHaveAttribute("aria-checked", "false");
    expect(sceneCalls.at(-1)?.on).toBe(false);
    expect(screen.queryByText(/sender hele bildet hvert 10\. sekund/)).toBeNull();
  });

  it("says that the whole frame goes every 10 s once Omgivelser is on, and covers only the people", () => {
    render(<EyesScreen />);
    fireEvent.click(screen.getByRole("switch", { name: "Omgivelser" }));
    expect(screen.getByText(/Omgivelser sender hele bildet hvert 10\. sekund/)).toBeInTheDocument();
    expect(sceneCalls.at(-1)?.on).toBe(true);
    expect(sceneCalls.at(-1)?.cover?.()).toEqual([person]);
  });

  it("tells the user what leaves the phone before the camera is switched on", () => {
    camera.status = "idle";
    render(<EyesScreen />);
    expect(screen.getByText(/Utsnitt av varer sendes til Claude \(Anthropic, USA\)/)).toBeInTheDocument();
    expect(screen.getByText(/Personer sendes aldri som utsnitt/)).toBeInTheDocument();
  });
});
