import { describe, expect, it } from "vitest";
import { productBySku } from "@/features/catalog/products";
import {
  MIN_SPACING_MS,
  REUSE_WINDOW_MS,
  STABLE_MS,
  nextAutoIdentify,
  trackFirstSeen,
  type AutoInput,
  type RecentResult,
} from "./autoIdentify";
import type { IdentifyResult } from "./schema";
import type { Box } from "./smoothBoxes";

const box = (id: string, over: Partial<Box> = {}): Box => ({
  id,
  x: 100,
  y: 100,
  w: 200,
  h: 300,
  label: "bottle",
  score: 0.8,
  ...over,
});

const shampoo: IdentifyResult = {
  sku: "FT-1001",
  name: "Sjampo 250 ml",
  category: "hygiene",
  textSeen: ["Sjampo"],
  confidence: "high",
  product: productBySku("FT-1001")!,
};

const NOW = 100_000;

/** One box, seen long enough to be stable, nothing in flight, nothing paused. */
function input(over: Partial<AutoInput> = {}): AutoInput {
  return {
    boxes: [box("a")],
    now: NOW,
    firstSeen: new Map([["a", NOW - STABLE_MS]]),
    attempted: new Set(),
    inFlight: false,
    lastRequestAt: null,
    paused: false,
    stopped: false,
    recent: [],
    ...over,
  };
}

describe("trackFirstSeen", () => {
  it("keeps the first time each box was seen and forgets boxes that are gone", () => {
    const first = trackFirstSeen(new Map(), [box("a")], 1000);
    const second = trackFirstSeen(first, [box("a"), box("b")], 1500);
    expect(second.get("a")).toBe(1000);
    expect(second.get("b")).toBe(1500);
    const third = trackFirstSeen(second, [box("b")], 2000);
    expect(third.has("a")).toBe(false);
  });
});

describe("nextAutoIdentify", () => {
  it("identifies a box once it has been stable for the threshold, not before", () => {
    expect(nextAutoIdentify(input({ firstSeen: new Map([["a", NOW - STABLE_MS + 1]]) }))).toBeNull();
    expect(nextAutoIdentify(input())).toEqual({ kind: "identify", box: box("a") });
  });

  it("waits while a request is in flight", () => {
    expect(nextAutoIdentify(input({ inFlight: true }))).toBeNull();
  });

  it("leaves at least 2 s between requests", () => {
    expect(nextAutoIdentify(input({ lastRequestAt: NOW - MIN_SPACING_MS + 1 }))).toBeNull();
    expect(nextAutoIdentify(input({ lastRequestAt: NOW - MIN_SPACING_MS }))).not.toBeNull();
  });

  it("identifies each box id only once", () => {
    expect(nextAutoIdentify(input({ attempted: new Set(["a"]) }))).toBeNull();
  });

  it("does nothing while paused (sheet open, tab hidden or switched off)", () => {
    expect(nextAutoIdentify(input({ paused: true }))).toBeNull();
  });

  it("sends nothing after the quota ran out", () => {
    expect(nextAutoIdentify(input({ stopped: true }))).toBeNull();
  });

  it("picks the largest stable box first", () => {
    const small = box("a", { w: 50, h: 50 });
    const large = box("b", { x: 400, w: 300, h: 300 });
    const result = nextAutoIdentify(
      input({ boxes: [small, large], firstSeen: new Map([["a", 0], ["b", 0]]) }),
    );
    expect(result).toEqual({ kind: "identify", box: large });
  });

  it("never sends people, furniture or other non-product classes", () => {
    const person = box("a", { label: "person" });
    expect(nextAutoIdentify(input({ boxes: [person] }))).toBeNull();
    const chair = box("a", { label: "chair" });
    expect(nextAutoIdentify(input({ boxes: [chair], recent: [{ box: box("old"), result: shampoo, at: NOW }] }))).toBeNull();
  });

  it("skips a large non-product box and takes the product-like one", () => {
    const table = box("a", { label: "dining table", w: 600, h: 400 });
    const cup = box("b", { label: "cup", x: 700 });
    const result = nextAutoIdentify(input({ boxes: [table, cup], firstSeen: new Map([["a", 0], ["b", 0]]) }));
    expect(result).toEqual({ kind: "identify", box: cup });
  });

  describe("reuse", () => {
    const recent = (over: Partial<RecentResult> = {}): RecentResult[] => [
      { box: box("old"), result: shampoo, at: NOW - 1000, ...over },
    ];

    it("reuses a recent result for a new box in the same place, without a request", () => {
      expect(nextAutoIdentify(input({ recent: recent() }))).toEqual({
        kind: "reuse",
        box: box("a"),
        result: shampoo,
      });
    });

    it("reuses even while a request is in flight or the quota is gone, since it costs nothing", () => {
      expect(nextAutoIdentify(input({ recent: recent(), inFlight: true, stopped: true }))?.kind).toBe("reuse");
    });

    it("does not reuse a result older than 10 s", () => {
      const old = recent({ at: NOW - REUSE_WINDOW_MS - 1 });
      expect(nextAutoIdentify(input({ recent: old }))?.kind).toBe("identify");
    });

    it("does not reuse a result from somewhere else in the frame", () => {
      const elsewhere = recent({ box: box("old", { x: 900, y: 600 }) });
      expect(nextAutoIdentify(input({ recent: elsewhere }))?.kind).toBe("identify");
    });

    it("does not reuse a result without a catalogue match", () => {
      const unknown = recent({ result: { ...shampoo, sku: null, product: null } });
      expect(nextAutoIdentify(input({ recent: unknown }))?.kind).toBe("identify");
    });
  });
});
