"use client";

import { useId, useState } from "react";
import { type Product, productBySku } from "@/features/catalog/products";
import { Button } from "@/ui";

/**
 * When the camera is not sure and the item carries its own label, the label decides (domain review:
 * a wrong SKU in a warehouse becomes a wrong shipment). The worker types the SKU printed on the item
 * itself, never the shelf's: the guessed shelf's label would only confirm the guess (domain review,
 * round 5). Items with no label are settled by picking among the candidates on Øyne's card. The
 * camera's guess goes on the list only when the label agrees; a label that names another product
 * offers that product instead; anything else says so and keeps what was typed.
 *
 * TODO(phase-3): read the label's barcode with the camera or the handheld's scanner instead of typing.
 */

/** "1001", "ft1001", "FT-1001" → the catalogue product it names, if any. */
export function productFromLabel(typed: string): Product | undefined {
  const clean = typed.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (/^\d{4}$/.test(clean)) return productBySku(`FT-${clean}`);
  const match = /^FT(\d{4})$/.exec(clean);
  return match ? productBySku(`FT-${match[1]}`) : undefined;
}

type Outcome =
  | { kind: "other"; product: Product }
  | { kind: "added"; product: Product }
  | { kind: "unknown"; typed: string }
  | { kind: "empty" };

export function ShelfLabelCheck({ guess, onConfirm }: { guess: Product; onConfirm: (sku: string) => void }) {
  const id = useId();
  const [typed, setTyped] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const check = () => {
    if (!typed.trim()) return setOutcome({ kind: "empty" });
    const found = productFromLabel(typed);
    if (!found) return setOutcome({ kind: "unknown", typed: typed.trim() });
    if (found.sku === guess.sku) {
      setOutcome(null);
      onConfirm(found.sku);
      return;
    }
    setOutcome({ kind: "other", product: found });
  };

  const error = outcome?.kind === "empty" || outcome?.kind === "unknown";
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        check();
      }}
    >
      <label htmlFor={`${id}-sku`} className="text-base font-semibold">
        Bekreft med etiketten
      </label>
      <p id={`${id}-hint`} className="text-sm text-muted">
        Skriv SKU-en fra etiketten på selve varen, ikke fra hylla, for eksempel 1004.
      </p>
      <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-[minmax(0,1fr)_auto]">
        <input
          id={`${id}-sku`}
          name="sku"
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          maxLength={12}
          value={typed}
          onChange={(event) => {
            setTyped(event.target.value);
            if (outcome) setOutcome(null);
          }}
          aria-invalid={error || undefined}
          aria-describedby={`${id}-hint${outcome ? ` ${id}-result` : ""}`}
          className="min-h-12 w-full rounded-md border border-line-strong bg-surface px-4 font-mono text-base text-text transition-colors duration-150 ease-standard aria-[invalid=true]:border-danger"
        />
        <Button type="submit">Bekreft og legg i plukkliste</Button>
      </div>
      <div id={`${id}-result`} aria-live="polite">
        {outcome?.kind === "empty" && <p className="text-sm text-danger">Skriv SKU-en fra etiketten først.</p>}
        {outcome?.kind === "unknown" && (
          <p className="text-sm text-danger">
            Fant ikke «{outcome.typed}» i katalogen. Sjekk etiketten og skriv den på nytt.
          </p>
        )}
        {outcome?.kind === "other" && (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm">
              Etiketten viser {outcome.product.name} (<span className="font-mono">{outcome.product.sku}</span>), ikke {guess.name}. Etiketten gjelder.
            </p>
            <Button
              variant="secondary"
              onClick={() => {
                onConfirm(outcome.product.sku);
                setOutcome({ kind: "added", product: outcome.product });
              }}
            >
              Legg {outcome.product.name} i plukklisten
            </Button>
          </div>
        )}
        {outcome?.kind === "added" && (
          <p className="text-sm text-success">
            Lagt i plukklisten: {outcome.product.name} (<span className="font-mono">{outcome.product.sku}</span>).
          </p>
        )}
      </div>
    </form>
  );
}
