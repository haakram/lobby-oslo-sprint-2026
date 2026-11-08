"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useMemo, useState } from "react";
import { useSession } from "@/features/auth";
import type { Product } from "@/features/catalog/products";
import { usePicklist } from "@/features/picklist/PicklistProvider";
import { ShelfLabelCheck } from "@/features/picklist/ShelfLabelCheck";
import { UndoStatus } from "@/features/requests/UndoStatus";
import { Badge, Button, RouteIcon, type BadgeTone } from "@/ui";
import { candidatesFor } from "./candidates";
import { appendEyesLine, eyesAvvikLine, removeEyesLine } from "./deviations";
import type { IdentifyResult } from "./schema";

const CONFIDENCE: Record<IdentifyResult["confidence"], { tone: BadgeTone; label: string }> = {
  high: { tone: "success", label: "Sikker" },
  medium: { tone: "warning", label: "Ganske sikker" },
  low: { tone: "warning", label: "Usikker, sjekk varen" },
};

type Reported = { day: string; id: string; at: string };

/**
 * The identify result: what the product is, where it lives, and what to do with it. When the camera
 * is not sure, a person decides (domain review, round 5): the two or three products it could be,
 * each with its look from the catalogue, *Ja, det er denne* on each and *Ingen av disse*, which
 * becomes an avvik on Overlevering 06:00. The guessed SKU stays hidden until a person has chosen, so
 * nothing reaches the pick list or the route on the camera's word alone.
 */
export function ProductCard({ result }: { result: IdentifyResult }) {
  const router = useRouter();
  const { skus, add } = usePicklist();
  const { user } = useSession();
  const product = result.product;
  const unsure = result.confidence !== "high";
  const candidates = useMemo(() => candidatesFor(result), [result]);
  const [chosen, setChosen] = useState<Product | null>(null);
  const [reported, setReported] = useState<Reported | null>(null);

  // A sure match, one already on the pick list, or the person's own choice: shown with its SKU.
  const confirmed = chosen ?? (product && (!unsure || skus.includes(product.sku)) ? product : null);
  const asking = !confirmed && !reported && candidates.length > 0 && (unsure || !product);

  const report = (shown: readonly Product[]) => {
    const now = new Date();
    const line = eyesAvvikLine({ candidates: shown, name: result.name, textSeen: result.textSeen }, { by: user?.name ?? "Ukjent", now });
    const day = appendEyesLine(line, now);
    const data = line.type === "decision" ? line.data : undefined;
    setReported({ day, id: String(data?.id ?? ""), at: String(data?.at ?? "").slice(0, 5) });
  };
  const undoReport = () => {
    if (reported) removeEyesLine(reported.day, reported.id);
    setReported(null);
  };

  const badge = chosen ? (
    <Badge>Valgt av deg</Badge>
  ) : confirmed || (product && !reported) ? (
    <Badge tone={CONFIDENCE[result.confidence].tone}>{CONFIDENCE[result.confidence].label}</Badge>
  ) : (
    <Badge tone="warning">{reported ? "Meldt som avvik" : "Ikke i katalogen"}</Badge>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-start gap-2">
        <div className="flex flex-wrap gap-2">{badge}</div>
        <p className="text-2xl font-bold tracking-[-0.02em]">{confirmed ? confirmed.name : result.name}</p>
      </div>

      {confirmed && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-y border-line py-4">
          <dt className="text-sm text-muted">SKU</dt>
          <dd className="font-mono text-sm tabular-nums">{confirmed.sku}</dd>
          <dt className="text-sm text-muted">Plassering</dt>
          <dd className="text-base font-medium">{confirmed.locationLabel}</dd>
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

      {confirmed ? (
        <div className="flex flex-col gap-3">
          {/* One column on a narrow phone: "Legg i plukkliste" needs more than half of 390 px. */}
          <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
            <Button variant="secondary" onClick={() => router.push("/ruter?sku=" + encodeURIComponent(confirmed.sku))}>
              <RouteIcon />
              Vis vei
            </Button>
            {skus.includes(confirmed.sku) ? (
              <Button disabled>I plukklisten</Button>
            ) : (
              <Button onClick={() => add(confirmed.sku)}>Legg i plukkliste</Button>
            )}
          </div>
          {chosen && (
            <div>
              <Button variant="ghost" size="sm" onClick={() => setChosen(null)}>
                Velg en annen
              </Button>
            </div>
          )}
        </div>
      ) : reported ? (
        <UndoStatus
          message={`Meldt som avvik${reported.at ? ` kl. ${reported.at}` : ""}. Renhold ser det under Åpent nå på Overlevering 06:00.`}
          onUndo={undoReport}
          undoLabel="Angre avviket"
        />
      ) : asking ? (
        <CandidatePick
          candidates={candidates}
          onChoose={setChosen}
          onNone={() => report(candidates)}
          labelCheck={product ? <ShelfLabelCheck guess={product} onConfirm={add} /> : null}
        />
      ) : (
        <div className="flex flex-col items-start gap-3">
          <p className="text-base text-muted">
            Varen finnes ikke i katalogen. Prøv igjen med teksten vendt mot kameraet, eller meld den som avvik.
          </p>
          <Button variant="secondary" onClick={() => report([])}>
            Meld som avvik
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * The two or three products the camera thinks it could be, with how each looks in the catalogue, so
 * the person compares them with the item in hand. No answer is loud: none of the buttons is orange.
 * The label check stays for items that do carry their own label.
 */
function CandidatePick({
  candidates,
  onChoose,
  onNone,
  labelCheck,
}: {
  candidates: readonly Product[];
  onChoose: (product: Product) => void;
  onNone: () => void;
  labelCheck: ReactNode;
}) {
  return (
    <section aria-labelledby="kandidater-heading" className="flex flex-col gap-3">
      <div>
        <h3 id="kandidater-heading" className="text-base font-semibold">
          {candidates.length === 1 ? "Er det denne?" : "Er det en av disse?"}
        </h3>
        <p className="text-sm text-muted">Kameraet er ikke sikkert. Sammenlign med varen du holder.</p>
      </div>
      <ul className="flex flex-col gap-2">
        {candidates.map((candidate) => (
          <li
            key={candidate.sku}
            className="flex flex-col gap-3 rounded-md border border-line p-3 min-[400px]:flex-row min-[400px]:items-center min-[400px]:justify-between"
          >
            <div className="min-w-0">
              <p className="text-base font-semibold">{candidate.name}</p>
              <p className="text-sm text-muted">{candidate.description}</p>
              <p className="text-sm text-muted">{candidate.locationLabel}</p>
            </div>
            <Button variant="secondary" size="sm" className="shrink-0" aria-label={`Ja, det er denne: ${candidate.name}`} onClick={() => onChoose(candidate)}>
              Ja, det er denne
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex flex-col items-start gap-1">
        <Button variant="secondary" onClick={onNone}>
          Ingen av disse
        </Button>
        <p className="text-sm text-muted">Blir et avvik på Overlevering 06:00, med eier og frist.</p>
      </div>
      {labelCheck && (
        <details className="border-t border-line pt-2">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-accent-text hover:underline pointer-fine:min-h-8">
            Varen har egen etikett med SKU
          </summary>
          <div className="pt-2">{labelCheck}</div>
        </details>
      )}
    </section>
  );
}
