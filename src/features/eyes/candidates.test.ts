import { describe, expect, it } from "vitest";
import { productBySku } from "@/features/catalog/products";
import { candidatesFor, catalogueAlternatives, MAX_CANDIDATES } from "./candidates";

const shampoo = productBySku("FT-1001")!;

describe("catalogueAlternatives", () => {
  it("keeps only SKUs the catalogue has, without the guess or repeats, at most two", () => {
    expect(catalogueAlternatives(["FT-1001", "FT-9999", "FT-1003", "FT-1003", "FT-1002", "FT-1006"], shampoo)).toEqual(["FT-1003", "FT-1002"]);
    expect(catalogueAlternatives(undefined, null)).toEqual([]);
  });
});

describe("candidatesFor", () => {
  const base = { name: "Hvit flaske", category: "hygiene" as const, textSeen: [] as string[] };

  it("is the guess first, then the model's alternatives, never more than three", () => {
    const list = candidatesFor({ ...base, product: shampoo, alternatives: ["FT-1003", "FT-1002", "FT-1006"] });
    expect(list.map((product) => product.sku)).toEqual(["FT-1001", "FT-1003", "FT-1002"]);
    expect(list.length).toBeLessThanOrEqual(MAX_CANDIDATES);
  });

  it("adds products of the same kind that share a word with what the camera read when the model gave fewer than two", () => {
    const list = candidatesFor({ ...base, product: shampoo, alternatives: [], textSeen: ["Dusjsåpe", "frisk duft"] });
    expect(list[0].sku).toBe("FT-1001");
    expect(list.map((product) => product.sku)).toContain("FT-1003");
    expect(list.every((product) => product.category === "hygiene")).toBe(true);
  });

  it("offers nothing it can't stand on: no product, no alternatives and no known kind is an empty list", () => {
    expect(candidatesFor({ name: "Hvit sprayflaske", category: "unknown", textSeen: ["Glassrens"], product: null })).toEqual([]);
  });
});
