import { describe, expect, it } from "vitest";
import { PRODUCTS, productBySku } from "./products";

const SHELVES = ["shelf-1a", "shelf-1b", "shelf-2a", "shelf-2b"];

describe("catalogue", () => {
  it("has 12 products", () => {
    expect(PRODUCTS).toHaveLength(12);
  });

  it("has unique SKUs in the FT-1xxx test range", () => {
    const skus = PRODUCTS.map((p) => p.sku);
    expect(new Set(skus).size).toBe(skus.length);
    for (const sku of skus) expect(sku).toMatch(/^FT-1\d{3}$/);
  });

  it("places every product on one of the four stub shelves, all four used", () => {
    for (const p of PRODUCTS) expect(SHELVES).toContain(p.location);
    expect(new Set(PRODUCTS.map((p) => p.location)).size).toBe(4);
  });

  it("finds a product by SKU", () => {
    expect(productBySku("FT-1001")?.name).toBeDefined();
    expect(productBySku("nope")).toBeUndefined();
  });
});
