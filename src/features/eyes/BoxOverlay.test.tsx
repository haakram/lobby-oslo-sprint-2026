import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BoxOverlay, stackBoxes, type BoxLabel } from "./BoxOverlay";
import type { Box } from "./smoothBoxes";

// jsdom does no layout: the overlay learns its size from a ResizeObserver, faked here at 400 × 300.
class FakeResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe() {
    this.callback([{ contentRect: { width: 400, height: 300 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  disconnect() {}
}

const VIDEO = { width: 400, height: 300 };
const box = (id: string, over: Partial<Box> = {}): Box => ({ id, x: 10, y: 60, w: 100, h: 80, label: "bottle", score: 0.9, ...over });

const LABELS: Record<string, BoxLabel> = {
  a: { text: "Tannkrem", state: "known", category: "hygiene" },
  b: { text: "Flaske", state: "product", category: "hygiene" },
  c: { text: "Kaffekopp", state: "missing", category: "food" },
  d: { text: "Gjenkjenner …", state: "busy", category: "unknown" },
  e: { text: "Person", state: "object", category: "person" },
};

function renderOverlay(boxes: Box[], labels = LABELS, onSelect = vi.fn()) {
  render(<BoxOverlay boxes={boxes} landmarks={[]} now={0} videoSize={VIDEO} labels={labels} onSelect={onSelect} />);
  return onSelect;
}

describe("BoxOverlay", () => {
  beforeEach(() => vi.stubGlobal("ResizeObserver", FakeResizeObserver));
  afterEach(() => vi.unstubAllGlobals());

  it("says each box's state in words, not by colour alone", () => {
    renderOverlay(["a", "b", "c", "d"].map((id) => box(id)).concat(box("e", { label: "person" })));
    expect(screen.getByRole("button", { name: "Tannkrem, i katalogen, vis kortet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Flaske, ikke sjekket, vis kortet" })).toHaveTextContent("Flaske · trykk for å sjekke");
    expect(screen.getByRole("button", { name: "Kaffekopp, ikke i katalogen, vis kortet" })).toHaveTextContent("Kaffekopp · ikke i katalogen");
    expect(screen.getByRole("button", { name: "Gjenkjenner …, vis kortet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Person" })).toBeInTheDocument();
  });

  it("puts a kind note in place of the state's word, and says nothing for a scanned supply", () => {
    renderOverlay([box("p"), box("q", { x: 200 }), box("r", { x: 300 })], {
      p: { text: "Pute", state: "missing", category: "linen", note: "hotellutstyr" },
      q: { text: "Caps", state: "scanned", category: "other", note: "gjestens eiendel" },
      r: { text: "Sjampo", state: "scanned", category: "hygiene", note: null },
    });
    expect(screen.getByRole("button", { name: "Pute, hotellutstyr, vis kortet" })).toHaveTextContent("Pute · hotellutstyr");
    expect(screen.getByRole("button", { name: "Caps, gjestens eiendel, vis kortet" })).toHaveTextContent("Caps · gjestens eiendel");
    expect(screen.getByRole("button", { name: "Sjampo, vis kortet" })).toHaveTextContent(/^Sjampo$/);
  });

  it("colours each box by its category, tag and corners alike", () => {
    renderOverlay([box("a"), box("c", { x: 200 }), box("e", { label: "person", x: 0, y: 0, w: 400, h: 300 })]);
    const frame = (name: string) => screen.getByRole("button", { name }).parentElement!;
    expect(frame("Tannkrem, i katalogen, vis kortet").style.getPropertyValue("--box")).toBe("light-dark(#0a6e65, #3fd8c6)");
    expect(frame("Kaffekopp, ikke i katalogen, vis kortet").style.getPropertyValue("--box")).toBe("light-dark(#566300, #d2e04a)");
    expect(frame("Person").style.getPropertyValue("--box")).toBe("light-dark(#0b5cad, #6cb8ff)");
  });

  it("puts a small box inside a person on top, and makes the person tappable on its tag only", () => {
    const person = box("e", { label: "person", x: 0, y: 0, w: 400, h: 300 });
    const bottle = box("a", { x: 150, y: 100, w: 60, h: 80 });
    const onSelect = renderOverlay([bottle, person]);

    const small = screen.getByRole("button", { name: "Tannkrem, i katalogen, vis kortet" });
    const big = screen.getByRole("button", { name: "Person" });
    expect(Number(small.parentElement!.style.zIndex)).toBeGreaterThan(Number(big.parentElement!.style.zIndex));
    // The person's frame lets taps through; only its tag button catches them, not the whole box.
    expect(big.parentElement!.className).toContain("pointer-events-none");
    expect(big.className).not.toContain("inset-0");
    expect(small.className).toContain("inset-0");

    fireEvent.click(small);
    expect(onSelect).toHaveBeenCalledWith(bottle);
  });
});

describe("BoxOverlay stacking", () => {
  beforeEach(() => vi.stubGlobal("ResizeObserver", FakeResizeObserver));
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the boxes' z-index inside the overlay, so they never cover the switches or the shutter", () => {
    renderOverlay([box("a")]);
    const overlay = screen.getByRole("button", { name: "Tannkrem, i katalogen, vis kortet" }).parentElement!.parentElement!;
    expect(overlay.className).toContain("isolate");
  });
});

describe("BoxOverlay on a cropped video", () => {
  beforeEach(() => vi.stubGlobal("ResizeObserver", FakeResizeObserver));
  afterEach(() => vi.unstubAllGlobals());

  it("cuts a box to the visible part, so its tag stays on screen", () => {
    // A 16:9 video in the 400 × 300 view is scaled to 300 high and 533 wide; 66 px fall off each side.
    render(
      <BoxOverlay
        boxes={[box("e", { label: "person", x: 0, y: 0, w: 300, h: 300 })]}
        landmarks={[]}
        now={0}
        videoSize={{ width: 533, height: 300 }}
        labels={LABELS}
        onSelect={vi.fn()}
      />,
    );
    const frame = screen.getByRole("button", { name: "Person" }).parentElement!;
    expect(frame.style.transform).toBe("translate3d(0px, 0px, 0)");
    expect(parseFloat(frame.style.width)).toBeCloseTo(300 - 66.5, 0);
  });
});

describe("stackBoxes", () => {
  it("orders biggest first and cuts a box that reaches past the frame", () => {
    const huge = box("p", { label: "person", x: -50, y: -40, w: 600, h: 500 });
    const small = box("s", { x: 100, y: 100, w: 40, h: 40 });
    const [first, second] = stackBoxes([small, huge], VIDEO);
    expect(first.box.id).toBe("p");
    expect(first.area).toEqual({ x: 0, y: 0, w: 400, h: 300 });
    expect(first.tagOnly).toBe(true);
    expect(second.tagOnly).toBe(false);
  });

  it("taps a big non-person box on its tag only too", () => {
    const [stacked] = stackBoxes([box("t", { label: "dining table", x: 0, y: 0, w: 300, h: 200 })], VIDEO);
    expect(stacked.tagOnly).toBe(true);
  });
});
