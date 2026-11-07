import { describe, expect, it } from "vitest";
import { MAX_MISSED_FRAMES, smoothBoxes, type Box } from "./smoothBoxes";

const box = (over: Partial<Box> = {}): Box => ({
  id: "",
  x: 0,
  y: 0,
  w: 200,
  h: 200,
  label: "bottle",
  score: 0.8,
  ...over,
});

describe("smoothBoxes", () => {
  it("moves a box 35 % of the way towards its new position and keeps its id", () => {
    const [first] = smoothBoxes([], [box()]);
    const [moved] = smoothBoxes([first], [box({ x: 100 })]);
    expect(moved.id).toBe(first.id);
    expect(moved.x).toBeCloseTo(35);
    expect(moved.y).toBe(0);
  });

  it("gives a box that matches nothing a new id", () => {
    const [a] = smoothBoxes([], [box()]);
    const next = smoothBoxes([a], [box(), box({ x: 1000, y: 1000 })]);
    expect(next).toHaveLength(2);
    expect(next[0].id).toBe(a.id);
    expect(next[1].id).not.toBe(a.id);
    expect(next[1].id).not.toBe("");
  });

  it("keeps an unseen box for a while, then drops it after 10 missed frames", () => {
    let boxes = smoothBoxes([], [box()]);
    for (let frame = 1; frame < MAX_MISSED_FRAMES; frame++) {
      boxes = smoothBoxes(boxes, []);
      expect(boxes).toHaveLength(1);
    }
    boxes = smoothBoxes(boxes, []);
    expect(boxes).toHaveLength(0);
    expect(MAX_MISSED_FRAMES).toBe(10);
  });

  it("does not return the internal missed-frame counter", () => {
    const [b] = smoothBoxes([], [box()]);
    expect(Object.keys(b).sort()).toEqual(["h", "id", "label", "score", "w", "x", "y"]);
  });
});
