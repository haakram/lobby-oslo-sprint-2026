"use client";

import Link from "next/link";
import { useLayoutEffect, useMemo, useState } from "react";
import { productBySku, type Product } from "@/features/catalog/products";
import { usePicklist } from "@/features/picklist/PicklistProvider";
import { UndoStatus } from "@/features/requests/UndoStatus";
import { Badge, Button, buttonClasses, Card, EmptyState, ErrorState, RouteIcon } from "@/ui";
import { FloorMap } from "./FloorMap";
import { loadRoutes, type LoadedRoutes } from "./loadRoutes";
import { RouteStats } from "./RouteStats";
import { ProductRow, StopList } from "./StopList";
import { bestTour, listOrderMetres, savings, tourLegs } from "./tour";
import type { RouteMatrix } from "./types";

/** Shelf ids in location-code order: "shelf-1a" < "shelf-1b" < "shelf-2a" < "shelf-10a". */
export function byShelf(a: string, b: string): number {
  return a.localeCompare(b, "nb", { numeric: true });
}

/** Groups the pick list by shelf (first product decides the list order) and finds the best tour. */
function plan(m: RouteMatrix, products: Product[]) {
  const productsAt = new Map<string, Product[]>();
  for (const p of products) productsAt.set(p.location, [...(productsAt.get(p.location) ?? []), p]);
  const stops = [...productsAt.keys()];
  const tour = bestTour(m, stops);
  if ("error" in tour) return { ok: false as const, missing: tour };
  const naive = listOrderMetres(m, stops);
  // How a warehouse system prints a pick list: by location code (1A, 1B, 2A, 2B). The fair baseline (the Holio juror).
  const shelfMetres = listOrderMetres(m, [...stops].sort(byShelf));
  return {
    ok: true as const,
    tour,
    naive,
    saved: savings(tour.metres, naive),
    shelfMetres,
    savedOnShelves: savings(tour.metres, shelfMetres),
    legs: tourLegs(m, tour.order),
    productsAt,
  };
}

/**
 * TODO(phase-3): today's restocking order from the stock system. Test data: the floor cupboards'
 * refill, in the order it was written down, so the tab shows a route before anyone has scanned.
 */
export const EXAMPLE_ORDER: readonly string[] = ["FT-1010", "FT-1004", "FT-1008", "FT-1001", "FT-1012"];

/** Plukkliste: the shortest walk to every product on the pick list (Øyne and Stemme fill it). */
export function PicklistMode({ addSku, matrix }: { addSku?: string; matrix?: RouteMatrix }) {
  const { skus, add, remove, clear, seedOnce } = usePicklist();
  const example = skus.length === EXAMPLE_ORDER.length && skus.every((sku, index) => sku === EXAMPLE_ORDER[index]);
  // The scanned list can't be rebuilt from anywhere else: Tøm keeps it for Angre.
  const [cleared, setCleared] = useState<string[] | null>(null);
  if (cleared && skus.length > 0) setCleared(null);
  const empty = () => {
    setCleared([...skus]);
    clear();
  };
  const undoEmpty = () => {
    cleared?.forEach(add);
    setCleared(null);
  };

  // ?sku= from Øyne's "Vis vei". Layout effect: the route includes it before the first paint.
  // Without one, an empty list gets the example order, once per session.
  useLayoutEffect(() => {
    if (addSku) {
      if (productBySku(addSku)) add(addSku);
    } else seedOnce(EXAMPLE_ORDER);
  }, [addSku, add, seedOnce]);

  const loaded: LoadedRoutes = useMemo(() => (matrix ? { ok: true, matrix } : loadRoutes()), [matrix]);
  const products = useMemo(() => skus.map(productBySku).filter((p): p is Product => p !== undefined), [skus]);
  const result = useMemo(
    () => (loaded.ok && products.length > 0 ? plan(loaded.matrix, products) : null),
    [loaded, products],
  );

  // TODO(phase-2): drop the badge when the matrix comes from Track A's router (npm run routes).
  const badge = (
    <p className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted">
      <Badge>Testkart</Badge> Plukklisten bruker et lagerkart til prøve.
      {example && <span>Eksempelordre: påfyll til etasjeskapene, i den rekkefølgen den ble skrevet. Legg til varer fra Øyne for din egen liste.</span>}
    </p>
  );

  if (!loaded.ok) {
    return (
      <ErrorState
        title="Rutekartet kunne ikke leses"
        body="Kartfila er ugyldig. Last siden på nytt, og si fra til skiftleder hvis det skjer igjen."
        action={
          <Button variant="secondary" onClick={() => window.location.reload()}>
            Last siden på nytt
          </Button>
        }
      />
    );
  }

  if (!result) {
    return (
      <div className="flex flex-col gap-4">
        {cleared && cleared.length > 0 && (
          <UndoStatus
            message={cleared.length === 1 ? "Plukklisten er tømt for 1 vare." : `Plukklisten er tømt for ${cleared.length} varer.`}
            onUndo={undoEmpty}
            undoLabel="Angre: legg varene tilbake"
          />
        )}
        <Card className="p-4 sm:p-5">
          <EmptyState
            icon={<RouteIcon className="size-8" />}
            title="Plukklisten er tom"
            body="Legg til varer fra Øyne."
            action={
              <Link href="/oyne" className={buttonClasses("primary")}>
                Åpne Øyne
              </Link>
            }
          />
        </Card>
      </div>
    );
  }

  const m = loaded.matrix;

  if (!result.ok) {
    const name = (id: string) =>
      products.find((p) => p.location === id)?.locationLabel ?? m.nodes[id]?.label ?? id;
    const blocked = result.missing.to === m.start ? result.missing.from : result.missing.to;
    const there = products.filter((p) => p.location === blocked);
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <ErrorState
          title="Ingen rute funnet"
          body={`Kartet har ingen vei fra ${name(result.missing.from)} til ${name(result.missing.to)}. Fjern varen fra plukklisten og prøv igjen.`}
          action={
            there.length > 0 ? (
              <Button onClick={() => there.forEach((p) => remove(p.sku))}>
                Fjern {there.length === 1 ? there[0].name : `varene på ${name(blocked)}`}
              </Button>
            ) : undefined
          }
        />
        <Card className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold tracking-[-0.01em]">Plukkliste</h2>
          {products.map((p) => (
            <ProductRow key={p.sku} product={p} onRemove={remove} />
          ))}
        </Card>
      </div>
    );
  }

  return (
    <div>
      {badge}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-6">
        <div className="flex min-w-0 flex-col gap-4 animate-rise">
          <RouteStats
            metres={result.tour.metres}
            seconds={result.tour.seconds}
            naiveMetres={result.naive}
            saved={result.saved}
            shelfMetres={result.shelfMetres}
            savedOnShelves={result.savedOnShelves}
          />
          <Card className="p-4 sm:p-5">
            <FloorMap matrix={m} legs={result.legs} order={result.tour.order} />
          </Card>
        </div>
        <Card className="flex flex-col gap-5 animate-rise [animation-delay:60ms]">
          <h2 className="text-lg font-semibold tracking-[-0.01em]">Plukkrekkefølge</h2>
          <StopList
            matrix={m}
            legs={result.legs}
            order={result.tour.order}
            productsAt={result.productsAt}
            onRemove={remove}
          />
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <Link href="/oyne" className={buttonClasses("secondary")}>
              Legg til flere varer
            </Link>
            <Button variant="ghost" onClick={empty}>
              Tøm plukklisten
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
