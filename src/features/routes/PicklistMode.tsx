"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { productBySku, type Product } from "@/features/catalog/products";
import type { GuideLanguage, PicklistWords } from "@/features/picklist/guides";
import { usePicklistWords } from "@/features/picklist/language";
import { PickingGuides } from "@/features/picklist/PickingGuides";
import { usePicklist } from "@/features/picklist/PicklistProvider";
import { Badge, Button, buttonClasses, Card, EmptyState, ErrorState, RouteIcon } from "@/ui";
import { FloorMap } from "./FloorMap";
import { loadRoutes, type LoadedRoutes } from "./loadRoutes";
import { RouteStats } from "./RouteStats";
import { ProductRow, StopList, via } from "./StopList";
import { bestTour, listOrderMetres, savings, tourLegs } from "./tour";
import { replaceQuery } from "./urlState";
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
  // How a warehouse system prints a pick list: by location code (1A, 1B, 2A, 2B). The fair baseline (domain review).
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
export function PicklistMode({ showSku, matrix }: { showSku?: string; matrix?: RouteMatrix }) {
  const { skus, add, remove, clear, seedOnce } = usePicklist();
  // The pick list's own words follow the work guides' language, kept on this device (Holio pain 9).
  const { language, words } = usePicklistWords();
  const lang = language === "nb" ? undefined : language;
  // ?sku= (Øyne's "Vis vei") shows the way to that one shelf until "Se plukklisten" (domain review, round 4).
  const [previewClosed, setPreviewClosed] = useState(false);
  const preview = showSku && !previewClosed ? productBySku(showSku) : undefined;
  const closePreview = () => {
    setPreviewClosed(true);
    replaceQuery({ sku: null });
    seedOnce(EXAMPLE_ORDER);
  };
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

  // An address never puts anything on the pick list: only "Legg i plukkliste", the label check or the
  // voice agent do (a guessed SKU in ?sku= once went straight on the list; domain review, round 4).
  // Without ?sku=, an empty list gets the example order, once per session, before the first paint.
  useLayoutEffect(() => {
    if (!showSku) seedOnce(EXAMPLE_ORDER);
  }, [showSku, seedOnce]);

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

  if (preview) {
    return (
      <div>
        {badge}
        <ShelfPreview matrix={loaded.matrix} product={preview} inList={skus.includes(preview.sku)} onClose={closePreview} words={words} lang={lang} />
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex flex-col gap-4">
        {cleared && cleared.length > 0 && <EmptiedStatus count={cleared.length} onUndo={undoEmpty} words={words} lang={lang} />}
        <Card className="p-4 sm:p-5" lang={lang}>
          <EmptyState
            icon={<RouteIcon className="size-8" />}
            title={words.emptyTitle}
            body={words.emptyBody}
            action={
              <Link href="/oyne" className={buttonClasses("primary")}>
                {words.openEyes}
              </Link>
            }
          />
        </Card>
        <PickingGuides />
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
        <Card className="flex flex-col gap-2" lang={lang}>
          <h2 className="text-lg font-semibold tracking-[-0.01em]">{words.heading}</h2>
          {products.map((p) => (
            <ProductRow key={p.sku} product={p} onRemove={remove} words={words} />
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
        <Card className="flex flex-col gap-5 animate-rise [animation-delay:60ms]" lang={lang}>
          <h2 className="text-lg font-semibold tracking-[-0.01em]">{words.heading}</h2>
          <StopList
            matrix={m}
            legs={result.legs}
            order={result.tour.order}
            productsAt={result.productsAt}
            onRemove={remove}
            words={words}
          />
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <Link href="/oyne" className={buttonClasses("secondary")}>
              {words.addMore}
            </Link>
            <Button variant="ghost" onClick={empty}>
              {words.empty}
            </Button>
          </div>
        </Card>
      </div>
      <PickingGuides className="mt-6" />
    </div>
  );
}

/**
 * After *Tøm plukklisten*: what was emptied and *Angre*, in the pick list's language, with the focus on
 * *Angre* (as Forespørsler's undo row does).
 */
function EmptiedStatus({ count, onUndo, words, lang }: { count: number; onUndo: () => void; words: PicklistWords; lang?: GuideLanguage }) {
  const box = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    box.current?.querySelector("button")?.focus();
  }, []);
  return (
    <p ref={box} role="status" lang={lang} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-sunken py-1 pr-1 pl-4 text-sm">
      <span className="min-w-0 flex-1">{words.emptied(count)}</span>
      <Button variant="ghost" size="sm" onClick={onUndo} aria-label={words.undoLabel}>
        {words.undo}
      </Button>
    </p>
  );
}

/**
 * Øyne's *Vis vei*: the way from the start to one product's shelf and back, nothing else. The product's
 * name and shelf only, never its SKU (the shelf label carries it), and the pick list is left as it is.
 */
function ShelfPreview({
  matrix,
  product,
  inList,
  onClose,
  words,
  lang,
}: {
  matrix: RouteMatrix;
  product: Product;
  inList: boolean;
  onClose: () => void;
  words: PicklistWords;
  lang?: GuideLanguage;
}) {
  const tour = bestTour(matrix, [product.location]);
  const back = (
    <Button variant="secondary" onClick={onClose} lang={lang}>
      {words.seeList}
    </Button>
  );
  if ("error" in tour) {
    return <ErrorState title="Ingen rute funnet" body={`Kartet har ingen vei til ${product.locationLabel}.`} action={back} />;
  }
  const legs = tourLegs(matrix, tour.order);
  const there = legs[0];
  const start = matrix.nodes[matrix.start].label ?? matrix.start;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-6">
      <Card className="p-4 sm:p-5 animate-rise">
        <FloorMap matrix={matrix} legs={legs} order={tour.order} />
      </Card>
      {/* On a phone the answer (which shelf, how far) comes before the map. */}
      <Card className="flex flex-col gap-4 animate-rise [animation-delay:60ms] max-lg:order-first">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.01em]">Veien til {product.locationLabel}</h2>
          <p className="mt-1 text-sm text-muted">
            {matrix.nodes[product.location].floor}. etasje ·{" "}
            <span className="font-mono whitespace-nowrap text-text tabular-nums">{Math.round(there.metres)} m</span> fra {start}
            {via(matrix, there)}
          </p>
        </div>
        <p className="border-t border-line pt-4 text-base font-medium">{product.name}</p>
        <p className="text-sm text-muted">
          {inList ? "Står i plukklisten." : "Bare veien: varen er ikke lagt i plukklisten."}
        </p>
        <div>{back}</div>
      </Card>
    </div>
  );
}
