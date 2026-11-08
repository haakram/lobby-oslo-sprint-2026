import { describe, expect, it } from "vitest";
import { LANDMARK_LABELS, MAX_LANDMARKS, MAX_THINGS, SceneResponse, cleanLandmarks, cleanThings } from "./sceneSchema";

const mark = (label: string, x = 0.1, y = 0.2, w = 0.3, h = 0.4) => ({ label, x, y, w, h });
const thing = (name: string, x = 0.1, y = 0.2, w = 0.3, h = 0.4, kind: "guest" | "person" | "room" = "guest") => ({
  name,
  category: "other" as const,
  kind,
  x,
  y,
  w,
  h,
});

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
    expect(SceneResponse.safeParse({ landmarks: [mark("Dør")], things: [] }).success).toBe(true);
    expect(SceneResponse.safeParse({ landmarks: [mark("Romskip")], things: [] }).success).toBe(false);
    expect(SceneResponse.safeParse({ landmarks: [mark("Dør", 2)], things: [] }).success).toBe(false);
    expect(SceneResponse.safeParse({}).success).toBe(false);
  });

  it("accepts clean things and rejects a bad kind, an empty name or a box outside the image", () => {
    const ok = { landmarks: [], things: [thing("Caps")] };
    expect(SceneResponse.safeParse(ok).success).toBe(true);
    expect(SceneResponse.safeParse({ landmarks: [], things: [{ ...thing("Caps"), kind: "alien" }] }).success).toBe(false);
    expect(SceneResponse.safeParse({ landmarks: [], things: [thing("")] }).success).toBe(false);
    expect(SceneResponse.safeParse({ landmarks: [], things: [thing("Caps", 1.5)] }).success).toBe(false);
  });
});

describe("cleanThings", () => {
  it("keeps named things, trimmed, and clamps their boxes", () => {
    expect(cleanThings([thing("  Caps "), thing("Pute", -0.25, 0.5, 0.75, 1, "room")])).toEqual([
      thing("Caps"),
      { ...thing("Pute", 0, 0.5, 0.5, 0.5, "room") },
    ]);
  });

  it("drops people, empty names and empty boxes", () => {
    expect(cleanThings([thing("Person", 0.1, 0.1, 0.5, 0.8, "person"), thing("  "), thing("Mobil", 1.2)])).toEqual([]);
  });

  it("cuts long names and keeps at most eight", () => {
    const [long] = cleanThings([thing("x".repeat(80))]);
    expect(long.name).toHaveLength(40);
    expect(cleanThings(Array.from({ length: 12 }, () => thing("Nøkler")))).toHaveLength(MAX_THINGS);
  });
});
