import { describe, expect, it } from "vitest";
import { BELONGING_CLASSES, COCO_CLASSES, PRODUCT_CLASSES, cocoLabel, isBelongingClass, isProductClass } from "./cocoLabels";

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
    for (const name of ["bottle", "cup", "toothbrush", "bowl"]) {
      expect(isProductClass(name)).toBe(true);
    }
  });

  it("never sends a guest's belongings: phones, bags, suitcases, books and the like", () => {
    for (const name of ["cell phone", "handbag", "backpack", "suitcase", "book", "keyboard", "remote", "mouse", "teddy bear"]) {
      expect(isProductClass(name)).toBe(false);
      expect(isBelongingClass(name)).toBe(true);
    }
    for (const name of BELONGING_CLASSES) expect(PRODUCT_CLASSES).not.toContain(name);
    expect(isBelongingClass("bottle")).toBe(false);
  });

  it("keeps people, furniture, vehicles and animals away from Claude", () => {
    for (const name of ["person", "chair", "dining table", "car", "dog", "tv", "spaceship"]) {
      expect(isProductClass(name)).toBe(false);
    }
  });

  it("only allows real COCO classes", () => {
    for (const name of [...PRODUCT_CLASSES, ...BELONGING_CLASSES]) expect(COCO_CLASSES).toContain(name);
  });
});
