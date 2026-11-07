import { describe, expect, it } from "vitest";
import { LANDMARK_LABELS, MAX_LANDMARKS, SceneResponse, cleanLandmarks } from "./sceneSchema";

const mark = (label: string, x = 0.1, y = 0.2, w = 0.3, h = 0.4) => ({ label, x, y, w, h });

describe("cleanLandmarks", () => {
  it("keeps allowlisted labels as they are", () => {
    expect(cleanLandmarks([mark("Dør"), mark("Heis")])).toEqual([mark("Dør"), mark("Heis")]);
  });

  it("drops labels outside the allowlist", () => {
    expect(cleanLandmarks([mark("Romskip"), mark("dør"), mark("Trapp")])).toEqual([mark("Trapp")]);
  });

  it("clamps each edge into the image", () => {
    const [clamped] = cleanLandmarks([mark("Dør", -0.25, 0.5, 0.75, 1)]);
    expect(clamped).toEqual({ label: "Dør", x: 0, y: 0.5, w: 0.5, h: 0.5 });
  });

  it("drops boxes with no area left after clamping", () => {
    expect(cleanLandmarks([mark("Dør", 1.2, 0.1, 0.3, 0.3), mark("Heis", 0.2, 0.2, 0, 0.5)])).toEqual([]);
  });

  it("keeps at most six", () => {
    const many = Array.from({ length: 9 }, () => mark("Skilt"));
    expect(cleanLandmarks(many)).toHaveLength(MAX_LANDMARKS);
    expect(MAX_LANDMARKS).toBe(6);
  });

  it("has the twelve agreed labels", () => {
    expect(LANDMARK_LABELS).toEqual([
      "Dør",
      "Heis",
      "Trapp",
      "Nødutgang",
      "Skilt",
      "Brannslukker",
      "Vindu",
      "Resepsjon",
      "Hylle",
      "Tralle",
      "Søppelbøtte",
      "Rømningsvei",
    ]);
  });
});

describe("SceneResponse", () => {
  it("accepts a list of clean landmarks and rejects anything else", () => {
    expect(SceneResponse.safeParse({ landmarks: [mark("Dør")] }).success).toBe(true);
    expect(SceneResponse.safeParse({ landmarks: [mark("Romskip")] }).success).toBe(false);
    expect(SceneResponse.safeParse({ landmarks: [mark("Dør", 2)] }).success).toBe(false);
    expect(SceneResponse.safeParse({}).success).toBe(false);
  });
});
