import { describe, expect, it } from "vitest";
import { coverRect, cropPlan, personBoxes, touchesPerson } from "./cropFrame";
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

describe("touchesPerson", () => {
  const person = box("person", 0, 0, 400, 900);

  it("is true for a bottle in a hand and for one just beside the person (inside the cover margin)", () => {
    expect(touchesPerson(box("bottle", 260, 380, 60, 150), [person])).toBe(true);
    // The person's cover reaches 60 px past their right edge (15 % of 400): a bottle 30 px away is inside it.
    expect(touchesPerson(box("bottle", 430, 380, 60, 150), [person])).toBe(true);
  });

  it("is false for a bottle on a shelf well away from the person, or with nobody in view", () => {
    expect(touchesPerson(box("bottle", 700, 380, 60, 150), [person])).toBe(false);
    expect(touchesPerson(box("bottle", 260, 380, 60, 150), [])).toBe(false);
  });
});

describe("cropPlan", () => {
  it("covers the person on a product crop and draws only the product's own box back on top", () => {
    const person = box("person", 0, 0, 400, 900);
    const bottle = box("bottle", 200, 400, 100, 200);
    const plan = cropPlan(1280, 960, bottle, 768, [person]);
    // The crop: the bottle with 10 % padding, 10 px and 20 px each side.
    expect(plan.source).toEqual({ x: 190, y: 380, w: 120, h: 240 });
    expect(plan.scale).toBe(1);
    // The person's cover fills the whole crop (it reaches well past it on every side) ...
    expect(plan.covers).toEqual([{ x: 0, y: 0, w: 120, h: 240 }]);
    // ... and the bottle alone, without the padding where the hand and the person are, comes back.
    expect(plan.keep).toEqual({ x: 10, y: 20, w: 100, h: 200 });
  });

  it("draws nothing back when nobody is in view, and covers people on a whole frame with no product kept", () => {
    const bottle = box("bottle", 200, 400, 100, 200);
    expect(cropPlan(1280, 960, bottle, 768, []).keep).toBeNull();
    const whole = cropPlan(1280, 960, null, 640, [box("person", 0, 0, 400, 900)]);
    expect(whole.scale).toBe(0.5);
    expect(whole).toMatchObject({ width: 640, height: 480, keep: null });
    expect(whole.covers).toHaveLength(1);
  });

  it("never paints over the tapped box itself when it is listed among the people", () => {
    const person = box("person", 0, 0, 400, 900);
    expect(cropPlan(1280, 960, person, 768, [person]).covers).toEqual([]);
  });
});
