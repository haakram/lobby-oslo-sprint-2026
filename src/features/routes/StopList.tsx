import type { Product } from "@/features/catalog/products";
import { PICKLIST_WORDS, type PicklistWords } from "@/features/picklist/guides";
import { Button } from "@/ui";
import type { RouteMatrix, TourLeg } from "./types";

/** " via heis" / " via trapp" (or the guide language's words) when a leg changes floor, else nothing. */
export function via(m: RouteMatrix, leg: TourLeg, words: PicklistWords = PICKLIST_WORDS.nb): string {
  const kinds = new Set(leg.path.map((id) => m.nodes[id].kind));
  if (kinds.has("elevator")) return ` ${words.viaLift}`;
  if (kinds.has("stairwell")) return ` ${words.viaStairs}`;
  return "";
}

/** One product with its SKU and a way to take it off the pick list. The name is the catalogue's, in bokmål. */
export function ProductRow({ product, onRemove, words = PICKLIST_WORDS.nb }: { product: Product; onRemove: (sku: string) => void; words?: PicklistWords }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="min-w-0">
        <span lang="nb" className="block truncate text-base">
          {product.name}
        </span>
        <span className="font-mono text-sm text-muted tabular-nums">{product.sku}</span>
      </p>
      <Button variant="ghost" className="shrink-0 text-sm" aria-label={words.removeLabel(product.name)} onClick={() => onRemove(product.sku)}>
        {words.remove}
      </Button>
    </div>
  );
}

/** The stops in walking order, each with the distance from the previous one and what to pick there. */
export function StopList({
  matrix,
  legs,
  order,
  productsAt,
  onRemove,
  words = PICKLIST_WORDS.nb,
}: {
  matrix: RouteMatrix;
  legs: TourLeg[];
  order: string[];
  productsAt: Map<string, Product[]>;
  onRemove: (sku: string) => void;
  /** The pick list's words in the guide language (bokmål by default). */
  words?: PicklistWords;
}) {
  const back = legs.at(-1);
  return (
    <div>
      <p className="text-sm text-muted">
        {words.start}:{" "}
        <span lang="nb" className="text-text">
          {matrix.nodes[matrix.start].label ?? matrix.start}
        </span>
      </p>
      <ol aria-label={words.heading} className="mt-3 flex flex-col">
        {order.map((id, i) => {
          const products = productsAt.get(id) ?? [];
          const leg = legs[i];
          return (
            <li key={id} className="relative flex gap-3 pb-5 last:pb-0">
              {i < order.length - 1 && (
                // The tape between stops.
                <span aria-hidden="true" className="absolute top-9 bottom-1 left-4 w-0.5 -translate-x-1/2 bg-line" />
              )}
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent font-mono text-sm font-medium text-on-accent tabular-nums">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <h3 lang="nb" className="text-base font-semibold">
                  {products[0]?.locationLabel ?? matrix.nodes[id].label ?? id}
                </h3>
                <p className="text-sm text-muted">
                  {words.floor(matrix.nodes[id].floor)} ·{" "}
                  <span className="font-mono whitespace-nowrap tabular-nums">{Math.round(leg.metres)} m</span>{" "}
                  {i === 0 ? words.fromStart : words.fromStop(i)}
                  {via(matrix, leg, words)}
                </p>
                <div className="mt-2 flex flex-col gap-1">
                  {products.map((p) => (
                    <ProductRow key={p.sku} product={p} onRemove={onRemove} words={words} />
                  ))}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      {back && (
        <p className="mt-4 border-t border-line pt-3 text-sm text-muted">
          {words.backToStart}: <span className="font-mono whitespace-nowrap text-text tabular-nums">{Math.round(back.metres)} m</span>
          {via(matrix, back, words)}
        </p>
      )}
    </div>
  );
}
