"use client";

import { useState } from "react";
import { PanelHead } from "@/features/modules/ModulePage";
import { addDays } from "@/features/reception/dates";
import { Badge, Button, Card, cx, RegenIcon, Sheet, Stat } from "@/ui";
import { APARTMENTS, CLEANER, dayWord, firstName, isLow, type Supply } from "./demoData";
import { HostFigures, HostPage } from "./HostPage";
import { type HostReady, toOrder, useHost } from "./HostProvider";

export const SUPPLY_FIGURES = ["Varer på plass", "Påfyll bestilt", "Planlagt vedlikehold", "Fikset siste uke"];

/**
 * Forsyninger og vedlikehold: what each apartment holds against what should be there (counted by the
 * cleaner at every clean), and the few maintenance jobs. The one action orders the top-up.
 *
 * TODO(phase-3): counts from the cleaner's app, orders to the host's supplier.
 */
export function HostSupplies() {
  const host = useHost();
  const [sheet, setSheet] = useState(false);
  return (
    <HostPage
      module="vert-drift"
      lede={`Det som står i hver bolig, talt av ${firstName(CLEANER)} ved hver rengjøring, og det som skal fikses.`}
      figureLabels={SUPPLY_FIGURES}
      actions={<Button onClick={() => setSheet(true)}>Bestill påfyll</Button>}
    >
      {host.kind === "ready" && <Supplies host={host} sheet={sheet} onSheet={setSheet} />}
    </HostPage>
  );
}

function Supplies({ host, sheet, onSheet }: { host: HostReady; sheet: boolean; onSheet: (open: boolean) => void }) {
  const { day } = host;
  const fine = day.supplies.filter((supply) => !isLow(supply)).length;
  const order = toOrder(day.supplies);
  const planned = day.maintenance.filter((entry) => entry.state === "planlagt");
  const fixed = day.maintenance.filter((entry) => entry.state === "fullfort" && entry.day >= -7);

  return (
    <>
      <HostFigures label="Forsyningene i tall">
        <Stat label="Varer på plass" value={fine} unit={`av ${day.supplies.length}`} tone="success" />
        <Stat label="Påfyll bestilt" value={host.ordered ? order.length : 0} unit={host.ordered ? "på vei" : undefined} tone={host.ordered ? "success" : "default"} />
        <Stat label="Planlagt vedlikehold" value={planned.length} />
        <Stat label="Fikset siste uke" value={fixed.length} tone="success" />
      </HostFigures>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:gap-8 2xl:grid-cols-4">
        {APARTMENTS.map((apartment) => {
          const items = day.supplies.filter((supply) => supply.apartment === apartment.id);
          const low = items.filter(isLow).length;
          return (
            <section key={apartment.id} aria-labelledby={`forsyning-${apartment.id}`} data-enter className="min-w-0">
              <Card className="h-full sm:p-6">
                <PanelHead
                  id={`forsyning-${apartment.id}`}
                  title={apartment.name}
                  action={low === 0 ? <Badge tone="success">Alt på plass</Badge> : host.ordered ? <Badge tone="success">Påfyll bestilt</Badge> : undefined}
                />
                <ul className="mt-3 divide-y divide-line">
                  {items.map((supply) => (
                    <SupplyRow key={supply.item} supply={supply} ordered={host.ordered} />
                  ))}
                </ul>
              </Card>
            </section>
          );
        })}
      </div>

      <section aria-labelledby="vedlikehold-heading" data-enter>
        <Card className="sm:p-6">
          <PanelHead id="vedlikehold-heading" title="Vedlikehold" count={day.maintenance.length} note="Planlagt først, så det som er fikset." />
          <ul className="mt-2 divide-y divide-line">
            {day.maintenance.map((entry) => {
              const apartment = APARTMENTS.find((item) => item.id === entry.apartment)!;
              const confirmed = entry.state === "planlagt" && host.serviceConfirmed;
              return (
                <li key={entry.id} className="grid grid-cols-[20px_minmax(0,1fr)] gap-x-3 gap-y-1 py-3 sm:grid-cols-[20px_minmax(0,1fr)_auto] sm:items-center">
                  <RegenIcon name={entry.state === "fullfort" ? "circle-check" : "calendar"} size={18} className={cx("mt-0.5 sm:mt-0", entry.state === "fullfort" ? "text-success" : "text-muted")} />
                  <div className="min-w-0">
                    <p>
                      <span className="font-semibold">{entry.title}</span>
                      <span className="text-sm text-muted"> · {apartment.name}</span>
                    </p>
                    <p className="text-sm text-muted">{entry.text}</p>
                  </div>
                  <div className="col-start-2 flex flex-wrap items-center gap-2 sm:col-start-auto sm:justify-end">
                    {entry.state === "fullfort" ? (
                      <Badge tone="success">Fikset {dayWord(day.today, addDays(day.today, entry.day))}</Badge>
                    ) : confirmed ? (
                      <Badge tone="success">Bekreftet</Badge>
                    ) : (
                      <>
                        <Badge>Planlagt</Badge>
                        <Button variant="secondary" size="sm" onClick={host.confirmService}>
                          Bekreft
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      </section>

      <Sheet open={sheet} onClose={() => onSheet(false)} title="Bestill påfyll">
        {order.length === 0 ? (
          <p className="text-base">Ingenting mangler. Alle boligene har minst halvparten av det som skal stå der.</p>
        ) : host.ordered ? (
          <div role="status" className="flex items-start gap-3">
            <RegenIcon name="circle-check" size={22} className="mt-0.5 shrink-0 text-success" />
            <p className="text-base">
              Bestilt. {firstName(CLEANER)} tar det med ved neste rengjøring, og det vises som fylt opp når det er talt.
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted">Det som er under halvparten, fylt opp til det som skal stå der.</p>
            <ul className="mt-3 divide-y divide-line">
              {order.map((supply) => (
                <li key={`${supply.apartment}-${supply.item}`} className="flex items-baseline justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="font-semibold">{supply.item}</span>
                    <span className="text-sm text-muted"> · {APARTMENTS.find((apartment) => apartment.id === supply.apartment)?.name}</span>
                  </span>
                  <span className="text-sm whitespace-nowrap">
                    <span className="font-mono tabular-nums">+{supply.par - supply.count}</span> {supply.unit}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={host.orderSupplies}>Bestill</Button>
              <Button variant="ghost" onClick={() => onSheet(false)}>
                Ikke nå
              </Button>
            </div>
          </>
        )}
      </Sheet>
    </>
  );
}

function SupplyRow({ supply, ordered }: { supply: Supply; ordered: boolean }) {
  const low = isLow(supply);
  const share = supply.par > 0 ? Math.min(1, supply.count / supply.par) : 1;
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-2.5">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className={cx("truncate", low ? "font-semibold" : "font-medium")}>{supply.item}</span>
        {low && (ordered ? <Badge tone="success">Bestilt</Badge> : <Badge tone="warning">Lav</Badge>)}
      </div>
      <span className="text-sm whitespace-nowrap">
        <span className="font-mono tabular-nums">
          {supply.count}
          <span className="text-muted"> / {supply.par}</span>
        </span>
        <span className="ml-1 text-xs text-muted">{supply.unit}</span>
      </span>
      <div className="col-span-2 h-1 overflow-hidden rounded-full bg-sunken" aria-hidden="true">
        <div className={cx("h-full rounded-full", low ? (ordered ? "bg-line-strong" : "bg-warning") : "bg-success")} style={{ width: `${Math.round(share * 100)}%` }} />
      </div>
    </li>
  );
}
