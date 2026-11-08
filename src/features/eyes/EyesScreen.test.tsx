import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const camera = vi.hoisted(() => ({ status: "ready" as string }));
const sceneCalls = vi.hoisted(() => [] as { on: boolean; cover?: () => readonly unknown[] }[]);
const person = { id: "p1", x: 10, y: 10, w: 50, h: 120, label: "person", score: 0.9 };
const bottle = { id: "b1", x: 200, y: 50, w: 40, h: 90, label: "bottle", score: 0.8 };
const detected = vi.hoisted(() => ({ boxes: [] as unknown[] }));
const crops = vi.hoisted(() => [] as { box: unknown; cover: readonly unknown[] | undefined }[]);

vi.mock("./useCamera", () => ({
  useCamera: () => ({
    video: { current: null },
    status: camera.status,
    size: { width: 640, height: 480 },
    start: vi.fn(),
    retry: vi.fn(),
  }),
}));
vi.mock("./useDetector", () => ({ useDetector: () => ({ status: "ready", boxes: detected.boxes }) }));
// What leaves the phone: the real person boxes, a stand-in for the canvas (jsdom has none).
vi.mock("./cropFrame", async (importActual) => ({
  ...(await importActual<typeof import("./cropFrame")>()),
  cropFrame: (_video: unknown, box: unknown, _maxSide?: number, cover?: readonly unknown[]) => {
    crops.push({ box, cover });
    return "data:image/jpeg;base64,AAAA";
  },
}));
vi.mock("./useLiveIdentify", () => ({ useLiveIdentify: () => ({ results: {}, busy: {}, send: vi.fn() }) }));
// The overlay draws boxes with a ResizeObserver; this test is about what is sent, not how boxes look:
// one plain button per box stands in for tapping it.
vi.mock("./BoxOverlay", async () => {
  const { createElement } = await import("react");
  return {
    BoxOverlay: ({ boxes, onSelect }: { boxes: { id: string; label: string }[]; onSelect: (box: unknown) => void }) =>
      boxes.map((box) => createElement("button", { key: box.id, type: "button", onClick: () => onSelect(box) }, `Boks ${box.label}`)),
  };
});
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
  crops.length = 0;
  detected.boxes = [person, bottle];
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

  it("paints the people in view over on a tapped product crop too, not only on the whole frame", () => {
    render(<EyesScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Boks bottle" }));
    expect(crops).toEqual([{ box: bottle, cover: [person] }]);
  });

  it("says a product held by a person waits for a tap instead of promising live recognition", () => {
    const tall = { id: "p2", x: 0, y: 0, w: 400, h: 470, label: "person", score: 0.9 };
    const held = { id: "b2", x: 260, y: 200, w: 60, h: 150, label: "bottle", score: 0.8 };
    detected.boxes = [tall, held];
    render(<EyesScreen />);
    expect(screen.getByText(/Varer nær en person kjennes ikke igjen automatisk/)).toBeInTheDocument();
  });

  it("never sends a guest's phone: a tap opens the free card that says why", () => {
    const phone = { id: "m1", x: 300, y: 50, w: 40, h: 80, label: "cell phone", score: 0.8 };
    detected.boxes = [phone];
    render(<EyesScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Boks cell phone" }));
    expect(crops).toEqual([]);
    expect(screen.getByText("Mobil")).toBeInTheDocument();
    expect(screen.getByText(/Gjesters ting sendes aldri til gjenkjenning/)).toBeInTheDocument();
  });

  it("tells the user before the camera starts that guests' things are never sent", () => {
    camera.status = "idle";
    render(<EyesScreen />);
    expect(screen.getByText(/Gjesters ting, som mobil, veske, koffert og bok, sendes aldri/)).toBeInTheDocument();
  });
});
