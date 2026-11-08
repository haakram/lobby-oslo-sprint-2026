import { describe, expect, it } from "vitest";
import { COCO_CLASSES, MIN_LABEL_SCORE, TRUSTED_CLASSES, cocoLabel, isSentToClaude, liveLabel } from "./cocoLabels";

describe("cocoLabel", () => {
  it("has a non-empty bokmål label for all 80 COCO classes", () => {
    expect(COCO_CLASSES).toHaveLength(80);
    expect(new Set(COCO_CLASSES).size).toBe(80);
    for (const name of COCO_CLASSES) expect(cocoLabel(name).trim()).not.toBe("");
  });

  it("translates the everyday classes", () => {
    expect(cocoLabel("person")).toBe("Person");
    expect(cocoLabel("cup")).toBe("Kopp");
    expect(cocoLabel("bottle")).toBe("Flaske");
    expect(cocoLabel("cell phone")).toBe("Mobil");
    expect(cocoLabel("dining table")).toBe("Bord");
    expect(cocoLabel("tv")).toBe("Skjerm");
  });

  it("calls anything else a Gjenstand", () => {
    expect(cocoLabel("spaceship")).toBe("Gjenstand");
    expect(cocoLabel("")).toBe("Gjenstand");
  });
});

describe("liveLabel", () => {
  it("names a trusted class the detector is sure of", () => {
    expect(liveLabel("bottle", 0.9)).toBe("Flaske");
    expect(liveLabel("cup", MIN_LABEL_SCORE)).toBe("Kopp");
  });

  it("says Ukjent for the classes a pillow or towel is mistaken for", () => {
    for (const name of ["vase", "potted plant", "teddy bear", "bed", "couch", "tv", "kite"]) {
      expect(liveLabel(name, 0.95)).toBe("Ukjent");
    }
  });

  it("says Ukjent when the detector is unsure, except for a person", () => {
    expect(liveLabel("bottle", MIN_LABEL_SCORE - 0.01)).toBe("Ukjent");
    expect(liveLabel("person", 0.41)).toBe("Person");
  });

  it("only trusts real COCO classes", () => {
    for (const name of TRUSTED_CLASSES) expect(COCO_CLASSES).toContain(name);
  });
});

describe("isSentToClaude", () => {
  it("sends every box but a person, whatever the detector guessed", () => {
    for (const name of ["bottle", "vase", "potted plant", "bed", "chair", "spaceship"]) {
      expect(isSentToClaude(name)).toBe(true);
    }
    expect(isSentToClaude("person")).toBe(false);
  });
});
