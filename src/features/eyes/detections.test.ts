import { describe, expect, it } from "vitest";
import { COVER_SCORE, DETECTOR_MAX_RESULTS, MAX_SHOWN, SHOW_SCORE, splitDetections, toBoxes } from "./detections";
import type { Box } from "./smoothBoxes";

const box = (label: string, score: number, x = 0): Box => ({ id: "", x, y: 0, w: 10, h: 20, label, score });

describe("detector options", () => {
  it("asks MediaPipe for every detection, not the top five", () => {
    expect(DETECTOR_MAX_RESULTS).toBeLessThan(0);
    expect(COVER_SCORE).toBeLessThan(SHOW_SCORE);
  });
});

describe("splitDetections", () => {
  it("covers every person in a crowded frame while the screen draws only the five most likely boxes", () => {
    // Twelve people and eight bottles: the old cap of five would have left at least seven people uncovered.
    const people = Array.from({ length: 12 }, (_, index) => box("person", 0.5 + index * 0.01, index * 20));
    const bottles = Array.from({ length: 8 }, (_, index) => box("bottle", 0.9 - index * 0.01, 300 + index * 20));
    const { shown, people: covered } = splitDetections([...bottles, ...people]);
    expect(covered).toHaveLength(12);
    expect(new Set(covered)).toEqual(new Set(people));
    expect(shown).toHaveLength(MAX_SHOWN);
    expect(shown.map((item) => item.score)).toEqual([0.9, 0.89, 0.88, 0.87, 0.86]);
  });

  it("covers a person ranked below five other objects, and one too faint to draw", () => {
    const objects = Array.from({ length: 5 }, (_, index) => box("chair", 0.95 - index * 0.01, index * 20));
    const behind = box("person", 0.45, 200);
    const faint = box("person", 0.32, 260);
    const { shown, people } = splitDetections([...objects, behind, faint]);
    expect(shown).not.toContain(behind);
    expect(shown).not.toContain(faint);
    expect(people).toEqual([behind, faint]);
  });

  it("does not cover what is too unlikely to be a person, nor draw it", () => {
    const { shown, people } = splitDetections([box("person", 0.2)]);
    expect(people).toEqual([]);
    expect(shown).toEqual([]);
  });
});

describe("toBoxes", () => {
  it("reads the top category and drops detections without a box", () => {
    const boxes = toBoxes([
      { boundingBox: { originX: 1, originY: 2, width: 3, height: 4 }, categories: [{ categoryName: "person", score: 0.7 }] },
      { categories: [{ categoryName: "bottle", score: 0.9 }] },
    ]);
    expect(boxes).toEqual([{ id: "", x: 1, y: 2, w: 3, h: 4, label: "person", score: 0.7 }]);
  });
});
