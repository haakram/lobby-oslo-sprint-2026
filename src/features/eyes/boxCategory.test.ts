import { describe, expect, it } from "vitest";
import { productBySku } from "@/features/catalog/products";
import { boxCategory } from "./boxCategory";
import type { IdentifyResult } from "./schema";

const answer = (over: Partial<IdentifyResult>): IdentifyResult => ({
  sku: null,
  name: "Pute",
  category: "linen",
  textSeen: [],
  kind: "room",
  summary: "",
  seen: [],
  confidence: "high",
  product: null,
  ...over,
});

describe("boxCategory", () => {
  it("keeps a person a person", () => {
    expect(boxCategory("person", 0.45)).toBe("person");
  });

  it("is unknown while the detector's class is a guess", () => {
    expect(boxCategory("vase", 0.9)).toBe("unknown");
    expect(boxCategory("bottle", 0.45)).toBe("unknown");
  });

  it("uses the detector's class when it is sure", () => {
    expect(boxCategory("bottle", 0.9)).toBe("hygiene");
    expect(boxCategory("banana", 0.9)).toBe("food");
    expect(boxCategory("laptop", 0.9)).toBe("other");
  });

  it("lets Claude's answer decide, the catalogue's category first", () => {
    expect(boxCategory("vase", 0.9, answer({}))).toBe("linen");
    expect(boxCategory("vase", 0.9, answer({ category: "hygiene", product: productBySku("FT-1001")! }))).toBe(
      productBySku("FT-1001")!.category,
    );
    expect(boxCategory("cup", 0.9, answer({ category: "unknown" }))).toBe("unknown");
  });
});
