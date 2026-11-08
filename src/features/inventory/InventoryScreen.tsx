"use client";

import { useState } from "react";
import { FigureRow, ModulePage, PanelHead } from "@/features/modules/ModulePage";
import { SourceNote } from "@/features/modules/SourceNote";
import { Badge, Button, Card, cx, Sheet, Stat } from "@/ui";
import { isLow, LAST_COUNT, lowStock, share, STOCK, type StockItem, stockOf, storeName, STORES } from "./testData";

/**
 * Lager og lin: what each store room holds against what it should, low stock flagged. The one
 * action makes today's restocking list from the low items.
 */
export function InventoryScreen() {
  const low = lowStock();
  const short = low.reduce((sum, item) => sum + (item.expected - item.count), 0);
  const [list, setList] = useState(false);

  return (
    <ModulePage
      module="lager"
      lede="Lin og utstyr per lagerrom, mot det rommene trenger ved dagens start."
      actions={
        <Button onClick={() => setList(true)}>
          Lag påfyllingsliste
        </Button>
      }
    >
      <FigureRow label="Lageret i tall">
        <Stat label="Under minimum" value={low.length} unit={`av ${STOCK.length} varer`} tone={low.length > 0 ? "danger" : "success"} />
        <Stat label="Lagerrom" value={STORES.length} />
        <Stat label="Sist talt" value={LAST_COUNT} />
        <Stat label="Å fylle på" value={short} unit="enheter" tone={short > 0 ? "warning" : "default"} />
      </FigureRow>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
        {STORES.map((store) => {
          const items = stockOf(store.id);
          const lowHere = items.filter(isLow).length;
          return (
            <section key={store.id} aria-labelledby={`store-${store.id}`} data-enter>
              <Card className="sm:p-6">
                <PanelHead
                  id={`store-${store.id}`}
                  title={store.name}
                  action={
                    <span className="flex items-center gap-3 text-sm text-muted">
                      {store.floor}. etasje
                      {lowHere > 0 && <Badge tone="danger">{lowHere} lavt</Badge>}
                    </span>
                  }
                />
                <ul className="mt-3 divide-y divide-line">
                  {items.map((item) => (
                    <StockRow key={`${store.id}-${item.item}`} item={item} />
                  ))}
                </ul>
              </Card>
            </section>
          );
        })}
      </div>
      <SourceNote sources="test" />

      <Sheet open={list} onClose={() => setList(false)} title="Påfyllingsliste">
        {low.length === 0 ? (
          <p className="text-base">Ingenting er under minimum. Alle lagerrom har minst ⅓ av det de skal ha.</p>
        ) : (
          <>
            <p className="text-sm text-muted">Det som er under ⅓ av forventet, per lagerrom. Fyll opp til forventet.</p>
            <ul className="mt-3 divide-y divide-line">
              {low.map((item) => (
                <li key={`${item.store}-${item.item}`} className="flex items-baseline justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="font-semibold">{item.item}</span>
                    <span className="text-sm text-muted"> · {storeName(item.store)}</span>
                  </span>
                  <span className="text-sm whitespace-nowrap">
                    <span className="font-mono tabular-nums">+{item.expected - item.count}</span> {item.unit}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        <SourceNote className="mt-4" sources="test" />
      </Sheet>
    </ModulePage>
  );
}

function StockRow({ item }: { item: StockItem }) {
  const low = isLow(item);
  const part = share(item);
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-2.5">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className={cx("truncate", low ? "font-semibold" : "font-medium")}>{item.item}</span>
        {low && <Badge tone="danger">Lavt</Badge>}
      </div>
      <span className="font-mono text-sm tabular-nums">
        {item.count}
        <span className="text-muted"> / {item.expected}</span>
      </span>
      <div className="col-span-2 h-1 overflow-hidden rounded-full bg-sunken" aria-hidden="true">
        {/* One colour that means something (Lavt, with its badge); the count says how full. */}
        <div className={cx("h-full rounded-full", low ? "bg-danger" : "bg-line-strong")} style={{ width: `${Math.round(part * 100)}%` }} />
      </div>
    </li>
  );
}
