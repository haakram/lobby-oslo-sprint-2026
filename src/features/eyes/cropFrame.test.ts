import { describe, expect, it } from "vitest";
import { coverRect, personBoxes } from "./cropFrame";
import type { Box } from "./smoothBoxes";

const box = (label: string, x = 100, y = 100, w = 200, h = 400): Box => ({ id: label, x, y, w, h, label, score: 0.9 });

describe("personBoxes", () => {
  it("keeps only people: products and furniture stay visible in a whole frame", () => {
    expect(personBoxes([box("person"), box("bottle"), box("chair"), box("person", 600)]).map((b) => b.x)).toEqual([100, 600]);
  });
});

describe("coverRect", () => {
  const canvas = { width: 640, height: 480 };

  it("covers the person with room to spare, scaled to the canvas", () => {
    // 15 % padding of a 200 × 400 box: 30 px and 60 px each side, then halved by the scale.
    expect(coverRect(box("person"), 0, 0, 0.5, canvas)).toEqual({ x: 35, y: 20, w: 130, h: 260 });
  });

  it("clips to the canvas when the person stands at the edge", () => {
    expect(coverRect(box("person", 500, 300, 300, 400), 0, 0, 1, canvas)).toEqual({ x: 455, y: 240, w: 185, h: 240 });
  });

  it("returns null for a person outside the frame", () => {
    expect(coverRect(box("person", 2000, 2000), 0, 0, 1, canvas)).toBeNull();
  });
});
