"use client";

import Link from "next/link";
import { useLayoutEffect, useMemo } from "react";
import { productBySku, type Product } from "@/features/catalog/products";
import { usePicklist } from "@/features/picklist/PicklistProvider";
import { Badge, Button, buttonClasses, Card, EmptyState, ErrorState, RouteIcon } from "@/ui";
import { FloorMap } from "./FloorMap";
import { loadRoutes, type LoadedRoutes } from "./loadRoutes";
import { RouteStats } from "./RouteStats";
import { ProductRow, StopList } from "./StopList";
import { bestTour, listOrderMetres, savings, tourLegs } from "./tour";
import type { RouteMatrix } from "./types";

/** Groups the pick list by shelf (first product decides the list order) and finds the best tour. */
function plan(m: RouteMatrix, products: Product[]) {
  const productsAt = new Map<string, Product[]>();
  for (const p of products) productsAt.set(p.location, [...(productsAt.get(p.location) ?? []), p]);
  const stops = [...productsAt.keys()];
  const tour = bestTour(m, stops);
  if ("error" in tour) return { ok: false as const, missing: tour };
  const naive = listOrderMetres(m, stops);
  return {
    ok: true as const,
    tour,
    naive,
    saved: savings(tour.metres, naive),
    legs: tourLegs(m, tour.order),
    productsAt,
  };
}

/** Plukkliste: the shortest walk to every product on the pick list (Øyne and Stemme fill it). */
export function PicklistMode({ addSku, matrix }: { addSku?: string; matrix?: RouteMatrix }) {
  const { skus, add, remove, clear } = usePicklist();

  // ?sku= from Øyne's "Vis vei". Layout effect: the route includes it before the first paint.
  useLayoutEffect(() => {
    if (addSku && productBySku(addSku)) add(addSku);
  }, [addSku, add]);

  const loaded: LoadedRoutes = useMemo(() => (matrix ? { ok: true, matrix } : loadRoutes()), [matrix]);
  const products = useMemo(() => skus.map(productBySku).filter((p): p is Product => p !== undefined), [skus]);
  const result = useMemo(
    () => (loaded.ok && products.length > 0 ? plan(loaded.matrix, products) : null),
    [loaded, products],
  );

  // TODO(phase-2): drop the badge when the matrix comes from Track A's router (npm run routes).
  const badge = (
    <p className="mb-4 flex items-center gap-2 text-sm text-muted">
      <Badge>Testkart</Badge> Plukklisten bruker et lagerkart til prøve.
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
          <h2 className="text-xl font-semibold tracking-tight">Plukkliste</h2>
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
          />
          <Card className="p-4 sm:p-5">
            <FloorMap matrix={m} legs={result.legs} order={result.tour.order} />
          </Card>
        </div>
        <Card className="flex flex-col gap-5 animate-rise [animation-delay:60ms]">
          <h2 className="text-xl font-semibold tracking-tight">Plukkrekkefølge</h2>
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
            <Button variant="ghost" onClick={clear}>
              Tøm plukklisten
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
