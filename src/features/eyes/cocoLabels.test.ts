import { describe, expect, it } from "vitest";
import { COCO_CLASSES, PRODUCT_CLASSES, cocoLabel, isProductClass } from "./cocoLabels";

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

describe("isProductClass", () => {
  it("lets product-like classes through", () => {
    for (const name of ["bottle", "cup", "book", "toothbrush", "backpack", "cell phone"]) {
      expect(isProductClass(name)).toBe(true);
    }
  });

  it("keeps people, furniture, vehicles and animals away from Claude", () => {
    for (const name of ["person", "chair", "dining table", "car", "dog", "tv", "spaceship"]) {
      expect(isProductClass(name)).toBe(false);
    }
  });

  it("only allows real COCO classes", () => {
    for (const name of PRODUCT_CLASSES) expect(COCO_CLASSES).toContain(name);
  });
});
