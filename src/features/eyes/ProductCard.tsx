"use client";

import { useRouter } from "next/navigation";
import { usePicklist } from "@/features/picklist/PicklistProvider";
import { ShelfLabelCheck } from "@/features/picklist/ShelfLabelCheck";
import { Badge, Button, RouteIcon, type BadgeTone } from "@/ui";
import type { IdentifyResult } from "./schema";

const CONFIDENCE: Record<IdentifyResult["confidence"], { tone: BadgeTone; label: string }> = {
  high: { tone: "success", label: "Sikker" },
  medium: { tone: "warning", label: "Ganske sikker" },
  low: { tone: "warning", label: "Usikker, sjekk varen" },
};

/** The identify result: what the product is, where it lives, and what to do with it. */
export function ProductCard({ result }: { result: IdentifyResult }) {
  const router = useRouter();
  const { skus, add } = usePicklist();
  const product = result.product;
  const confidence = CONFIDENCE[result.confidence];
  // Not sure: the label decides before anything goes on the pick list (jury round 3, the Holio juror).
  const unsure = result.confidence !== "high";
  const added = product ? skus.includes(product.sku) : false;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-start gap-2">
        <div className="flex flex-wrap gap-2">
          {product ? (
            <Badge tone={confidence.tone}>{confidence.label}</Badge>
          ) : (
            <Badge tone="warning">Ikke i katalogen</Badge>
          )}
        </div>
        <p className="text-2xl font-bold tracking-[-0.02em]">{product ? product.name : result.name}</p>
      </div>

      {product && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-y border-line py-4">
          <dt className="text-sm text-muted">SKU</dt>
          {/* While unsure the guess's SKU stays hidden, so the label check is a real check, not a copy. */}
          <dd className="font-mono text-sm tabular-nums">{unsure && !added ? <span className="font-sans text-muted">Sjekkes mot etiketten</span> : product.sku}</dd>
          <dt className="text-sm text-muted">Plassering</dt>
          <dd className="text-base font-medium">{product.locationLabel}</dd>
        </dl>
      )}

      {result.textSeen.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm text-muted">Tekst på pakken</h3>
          <ul className="flex flex-wrap gap-2">
            {result.textSeen.map((line, index) => (
              <li key={`${index}-${line}`} className="rounded-sm bg-sunken px-2 py-1 font-mono text-sm">
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}

      {product ? (
        // One column on a narrow phone: "Legg i plukkliste" needs more than half of 390 px.
        <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
          {/* While unsure there is no way round the label: no Vis vei until it agrees (jury round 4, the Holio juror). */}
          {(!unsure || added) && (
            <Button variant="secondary" onClick={() => router.push("/ruter?sku=" + encodeURIComponent(product.sku))}>
              <RouteIcon />
              Vis vei
            </Button>
          )}
          {added ? (
            <Button disabled>I plukklisten</Button>
          ) : unsure ? null : (
            <Button onClick={() => add(product.sku)}>Legg i plukkliste</Button>
          )}
          {unsure && !added && (
            <div className="min-[400px]:col-span-2">
              <ShelfLabelCheck guess={product} onConfirm={add} />
            </div>
          )}
        </div>
      ) : (
        <p className="text-base text-muted">
          Varen finnes ikke i katalogen. Sjekk etiketten, eller prøv igjen med teksten vendt mot kameraet.
        </p>
      )}
    </div>
  );
}
