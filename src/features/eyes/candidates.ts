import { PRODUCTS, type Product, productBySku } from "@/features/catalog/products";
import type { IdentifyResult } from "./schema";

/**
 * When the camera is not sure, a person picks between the two or three products it could be (domain
 * review, round 5: typing the guessed shelf's label only confirms the shelf, never the item in hand,
 * and an item with no barcode often has no label at all). Pure: the same result gives the same list.
 */

/** The camera's guess and up to two more. */
export const MAX_CANDIDATES = 3;

/** The model's alternatives kept to SKUs the catalogue has, without the guess itself or repeats, at most two. */
export function catalogueAlternatives(skus: readonly string[] | undefined, guess: Product | null): string[] {
  const kept: string[] = [];
  for (const sku of skus ?? []) {
    const product = productBySku(sku);
    if (!product || product.sku === guess?.sku || kept.includes(product.sku)) continue;
    kept.push(product.sku);
    if (kept.length === MAX_CANDIDATES - 1) break;
  }
  return kept;
}

const words = (text: string) => new Set(text.toLowerCase().match(/[\p{L}\d]{3,}/gu) ?? []);

/** Words a product's name and look share with what the camera read and called it. */
function overlap(product: Product, seen: Set<string>): number {
  let shared = 0;
  for (const word of words(`${product.name} ${product.description}`)) if (seen.has(word)) shared += 1;
  return shared;
}

/**
 * What to show a person, most likely first: the guess, the model's alternatives, and (when that is
 * fewer than two) the catalogue's products of the same kind whose name or look shares a word with
 * what the camera read. Never a product the catalogue does not have.
 */
export function candidatesFor(result: Pick<IdentifyResult, "product" | "alternatives" | "textSeen" | "name" | "category">): Product[] {
  const list: Product[] = [];
  const push = (product: Product | null | undefined) => {
    if (product && !list.some((entry) => entry.sku === product.sku) && list.length < MAX_CANDIDATES) list.push(product);
  };
  push(result.product);
  for (const sku of catalogueAlternatives(result.alternatives, result.product)) push(productBySku(sku));
  if (list.length >= 2) return list;
  const category = result.product?.category ?? (result.category === "unknown" ? null : result.category);
  if (!category) return list;
  const seen = words([result.name, ...result.textSeen].join(" "));
  const near = PRODUCTS.filter((product) => product.category === category && !list.some((entry) => entry.sku === product.sku))
    .map((product) => ({ product, score: overlap(product, seen) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  for (const { product } of near) push(product);
  return list;
}
