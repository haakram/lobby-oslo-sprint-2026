"use client";

import Link from "next/link";
import { useLayoutEffect, useMemo, type ReactNode } from "react";
import { productBySku, type Product } from "@/features/catalog/products";
import { usePicklist } from "@/features/picklist/PicklistProvider";
import { Badge, Button, buttonClasses, Card, EmptyState, ErrorState, RouteIcon } from "@/ui";
import { FloorMap } from "./FloorMap";
import { loadRoutes, type LoadedRoutes } from "./loadRoutes";
import { RouteStats } from "./RouteStats";
import { ProductRow, StopList } from "./StopList";
import { bestTour, listOrderMetres, savings, tourLegs } from "./tour";
import type { RouteMatrix } from "./types";

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="flex-1 px-4 pt-10 pb-12 sm:px-8 lg:px-12 lg:pt-16">
      <header className="flex max-w-6xl flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-[-0.03em]">Ruter</h1>
          <p className="mt-3 max-w-[48ch] text-lg text-muted">
            Korteste vei til alle varene på plukklisten, fra start og tilbake.
          </p>
        </div>
        {/* TODO(phase-2): drop the badge when the matrix comes from Track A's router (npm run routes). */}
        <Badge>Testkart</Badge>
      </header>
      <div className="mt-8 max-w-6xl lg:mt-10">{children}</div>
    </main>
  );
}

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

export function RoutesScreen({ addSku, matrix }: { addSku?: string; matrix?: RouteMatrix }) {
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

  if (!loaded.ok) {
    return (
      <Shell>
        <ErrorState
          title="Rutekartet kunne ikke leses"
          body="Kartfila er ugyldig. Last siden på nytt, og si fra til skiftleder hvis det skjer igjen."
        />
      </Shell>
    );
  }

  if (!result) {
    return (
      <Shell>
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
      </Shell>
    );
  }

  const m = loaded.matrix;

  if (!result.ok) {
    const name = (id: string) =>
      products.find((p) => p.location === id)?.locationLabel ?? m.nodes[id]?.label ?? id;
    return (
      <Shell>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
          <ErrorState
            title="Ingen rute funnet"
            body={`Kartet har ingen vei fra ${name(result.missing.from)} til ${name(result.missing.to)}. Fjern varen fra plukklisten og prøv igjen.`}
          />
          <Card className="flex flex-col gap-2">
            <h2 className="text-xl font-semibold tracking-tight">Plukkliste</h2>
            {products.map((p) => (
              <ProductRow key={p.sku} product={p} onRemove={remove} />
            ))}
          </Card>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
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
    </Shell>
  );
}
