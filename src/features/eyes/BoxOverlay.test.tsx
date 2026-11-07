import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BoxOverlay, type BoxLabel } from "./BoxOverlay";
import type { Box } from "./smoothBoxes";

// jsdom does no layout: the overlay learns its size from a ResizeObserver, faked here at 400 × 300.
class FakeResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe() {
    this.callback([{ contentRect: { width: 400, height: 300 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  disconnect() {}
}

const box = (id: string): Box => ({ id, x: 10, y: 60, w: 100, h: 80, label: "bottle", score: 0.9 });

const LABELS: Record<string, BoxLabel> = {
  a: { text: "Tannkrem", state: "known" },
  b: { text: "Flaske", state: "product" },
  c: { text: "Kaffekopp", state: "missing" },
  d: { text: "Gjenkjenner …", state: "busy" },
  e: { text: "Stol", state: "object" },
};

describe("BoxOverlay", () => {
  beforeEach(() => vi.stubGlobal("ResizeObserver", FakeResizeObserver));
  afterEach(() => vi.unstubAllGlobals());

  it("says each box's state in words, not by colour alone", () => {
    render(
      <BoxOverlay
        boxes={["a", "b", "c", "d", "e"].map(box)}
        landmarks={[]}
        now={0}
        videoSize={{ width: 400, height: 300 }}
        labels={LABELS}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Tannkrem, i katalogen, vis kortet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Flaske, ikke sjekket, vis kortet" })).toHaveTextContent("Flaske · trykk for å sjekke");
    expect(screen.getByRole("button", { name: "Kaffekopp, ikke i katalogen, vis kortet" })).toHaveTextContent("Kaffekopp · ikke i katalogen");
    expect(screen.getByRole("button", { name: "Gjenkjenner …, vis kortet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stol" })).toBeInTheDocument();
  });
});
