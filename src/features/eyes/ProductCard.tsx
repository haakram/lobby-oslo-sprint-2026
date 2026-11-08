"use client";

import { useRouter } from "next/navigation";
import { usePicklist } from "@/features/picklist/PicklistProvider";
import { Badge, Button, RouteIcon, type BadgeTone } from "@/ui";
import { KIND_BADGE, KIND_TAG } from "./itemKind";
import type { IdentifyResult } from "./schema";

const CONFIDENCE: Record<IdentifyResult["confidence"], { tone: BadgeTone; label: string }> = {
  high: { tone: "success", label: "Sikker" },
  medium: { tone: "warning", label: "Ganske sikker" },
  low: { tone: "warning", label: "Usikker, sjekk varen" },
};

/**
 * The identify result: what the thing is, where it lives when we stock it, what to do with it, and
 * (for the whole picture) one sentence about everything in view plus the other things seen.
 */
export function ProductCard({ result }: { result: IdentifyResult }) {
  const router = useRouter();
  const { skus, add } = usePicklist();
  const product = result.product;
  const confidence = CONFIDENCE[result.confidence];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-start gap-2">
        <div className="flex flex-wrap gap-2">
          {product ? (
            <Badge tone={confidence.tone}>{confidence.label}</Badge>
          ) : (
            // Only a supply can be missing from the catalogue; a pillow or a cap is just what it is.
            <Badge tone={result.kind === "supply" ? "warning" : "neutral"}>{KIND_BADGE[result.kind]}</Badge>
          )}
        </div>
        <p className="text-2xl font-bold tracking-[-0.02em]">{product ? product.name : result.name}</p>
        {result.summary && <p className="text-base">{result.summary}</p>}
      </div>

      {result.seen.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm text-muted">Ser også</h3>
          <ul className="flex flex-wrap gap-2">
            {result.seen.map((item, index) => (
              <li key={`${index}-${item.name}`} className="rounded-sm bg-sunken px-2 py-1 text-sm">
                <span className="font-semibold">{item.name}</span>
                {KIND_TAG[item.kind] && <span className="text-muted"> · {KIND_TAG[item.kind]}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {product && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-y border-line py-4">
          <dt className="text-sm text-muted">SKU</dt>
          <dd className="font-mono text-sm tabular-nums">{product.sku}</dd>
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
          <Button variant="secondary" onClick={() => router.push("/ruter?sku=" + encodeURIComponent(product.sku))}>
            <RouteIcon />
            Vis vei
          </Button>
          {skus.includes(product.sku) ? (
            <Button disabled>I plukklisten</Button>
          ) : (
            <Button onClick={() => add(product.sku)}>Legg i plukkliste</Button>
          )}
        </div>
      ) : result.kind === "supply" ? (
        <p className="text-base text-muted">
          Varen finnes ikke i katalogen. Sjekk etiketten, eller prøv igjen med teksten vendt mot kameraet.
        </p>
      ) : null}
    </div>
  );
}
