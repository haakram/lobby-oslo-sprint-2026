"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { productBySku } from "@/features/catalog/products";
import { Button, ErrorState, Sheet, Skeleton, cx } from "@/ui";
import { BoxOverlay, type BoxLabel } from "./BoxOverlay";
import { cropFrame } from "./cropFrame";
import { PermissionState } from "./PermissionState";
import { ProductCard } from "./ProductCard";
import { ModelOutput, type IdentifyResult } from "./schema";
import type { Box } from "./smoothBoxes";
import { useCamera } from "./useCamera";
import { useDetector } from "./useDetector";

type Identify =
  | { phase: "idle" }
  | { phase: "loading"; image: string; boxId: string | null }
  | { phase: "done"; image: string; boxId: string | null; result: IdentifyResult }
  | { phase: "error"; image: string; boxId: string | null; title: string; body: string; canRetry: boolean };

class IdentifyError extends Error {
  constructor(
    readonly title: string,
    readonly canRetry: boolean,
  ) {
    super(title);
  }
}

const RETRY_BODY = "Hold varen stille med teksten mot kameraet, og prøv igjen.";

async function requestIdentify(image: string, signal: AbortSignal): Promise<IdentifyResult> {
  let response: Response;
  try {
    response = await fetch("/api/identify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image }),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new IdentifyError("Fikk ikke svar fra serveren", true);
  }
  const data: unknown = await response.json().catch(() => null);
  if (response.status === 429) {
    const message = (data as { error?: unknown } | null)?.error;
    throw new IdentifyError(typeof message === "string" ? message : "Dagens kvote for gjenkjenning er brukt opp.", false);
  }
  const parsed = response.ok ? ModelOutput.safeParse(data) : null;
  if (!parsed?.success) throw new IdentifyError("Fikk ikke kjent igjen varen", true);
  // The product comes from our own catalogue, never from the response.
  const product = parsed.data.sku ? (productBySku(parsed.data.sku) ?? null) : null;
  return { ...parsed.data, sku: product ? product.sku : null, product };
}

const SHEET_TITLE: Record<Identify["phase"], string> = {
  idle: "",
  loading: "Ser på varen",
  done: "Vare funnet",
  error: "Ingen svar",
};

/** Øyne: the live camera with boxes; tap a box or the shutter to identify the product. */
export function EyesScreen() {
  const { video, status: cameraStatus, size: videoSize, retry: retryCamera } = useCamera();
  const [identify, setIdentify] = useState<Identify>({ phase: "idle" });
  // Separate from `identify`, so the sheet keeps its content while it slides away.
  const [sheetOpen, setSheetOpen] = useState(false);
  const [labels, setLabels] = useState<Record<string, BoxLabel>>({});
  const request = useRef<AbortController | null>(null);

  const detector = useDetector(video, cameraStatus === "ready" && !sheetOpen);

  useEffect(() => () => request.current?.abort(), []);

  const setLabel = useCallback((boxId: string | null, label: BoxLabel | null) => {
    if (!boxId) return;
    setLabels((current) => {
      const next = { ...current };
      if (label) next[boxId] = label;
      else delete next[boxId];
      return next;
    });
  }, []);

  const run = useCallback(
    async (box: Box | null) => {
      const element = video.current;
      if (!element || cameraStatus !== "ready") return;
      const image = cropFrame(element, box);
      const boxId = box?.id ?? null;
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;

      setIdentify({ phase: "loading", image, boxId });
      setSheetOpen(true);
      setLabel(boxId, { text: "Ser på varen", state: "busy" });
      try {
        const result = await requestIdentify(image, controller.signal);
        if (controller.signal.aborted) return;
        setIdentify({ phase: "done", image, boxId, result });
        setLabel(
          boxId,
          result.product
            ? { text: result.product.name, state: "known" }
            : { text: "Ikke i katalogen", state: "unknown" },
        );
      } catch (error) {
        if (controller.signal.aborted) return;
        const known = error instanceof IdentifyError ? error : new IdentifyError("Fikk ikke kjent igjen varen", true);
        setIdentify({
          phase: "error",
          image,
          boxId,
          title: known.title,
          body: known.canRetry ? RETRY_BODY : "Les SKU-en på etiketten, eller spør skiftlederen.",
          canRetry: known.canRetry,
        });
        setLabel(boxId, null);
      }
    },
    [video, cameraStatus, setLabel],
  );

  const close = useCallback(() => {
    if (identify.phase === "loading") {
      request.current?.abort();
      setLabel(identify.boxId, null);
    }
    setSheetOpen(false);
  }, [identify, setLabel]);

  const retry = useCallback(() => {
    if (identify.phase !== "error") return;
    // The same box if it is still tracked, otherwise the whole frame.
    void run(detector.boxes.find((box) => box.id === identify.boxId) ?? null);
  }, [identify, detector.boxes, run]);

  const problem = cameraStatus !== "starting" && cameraStatus !== "ready" ? cameraStatus : null;
  const ready = cameraStatus === "ready";

  let hint = "Pek kameraet mot en vare, eller ta bilde av hele varen.";
  if (!ready) hint = "Starter kameraet";
  else if (detector.status === "loading") hint = "Laster gjenkjenning";
  else if (detector.status === "failed") hint = "Live-bokser er av. Ta bilde av varen med utløseren.";
  else if (detector.boxes.length > 0) hint = "Trykk på en boks for å kjenne igjen varen.";

  return (
    <main data-surface="dark" className="relative flex flex-1 flex-col overflow-hidden bg-bg">
      <video
        ref={video}
        muted
        playsInline
        aria-hidden="true"
        className={cx("absolute inset-0 size-full object-cover", !ready && "invisible")}
      />

      {problem ? (
        <>
          <h1 className="px-4 pt-10 text-3xl font-extrabold tracking-[-0.03em] sm:px-8 lg:px-12 lg:pt-16">Øyne</h1>
          <PermissionState problem={problem} onRetry={retryCamera} />
        </>
      ) : (
        <>
          {ready && videoSize && detector.boxes.length === 0 && (
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="relative size-56 opacity-60">
                {["top-0 left-0 border-t-2 border-l-2", "top-0 right-0 border-t-2 border-r-2", "bottom-0 left-0 border-b-2 border-l-2", "bottom-0 right-0 border-b-2 border-r-2"].map((corner) => (
                  <span key={corner} className={cx("absolute size-8 rounded-sm border-text", corner)} />
                ))}
              </div>
            </div>
          )}

          {ready && videoSize && (
            <BoxOverlay boxes={detector.boxes} videoSize={videoSize} labels={labels} onSelect={(box) => void run(box)} />
          )}

          {!ready && (
            <div aria-hidden="true" className="absolute inset-0 grid place-items-center p-8">
              <Skeleton className="aspect-[3/4] w-full max-w-sm rounded-lg" />
            </div>
          )}

          <header className="pointer-events-none relative flex flex-col items-start gap-2 p-4 sm:px-8 lg:px-12 lg:pt-8">
            <h1 className="rounded-md bg-bg/75 px-3 py-1 text-xl font-bold tracking-[-0.02em] backdrop-blur-sm">Øyne</h1>
            <p aria-live="polite" className="rounded-md bg-bg/75 px-3 py-1 text-sm text-text backdrop-blur-sm">
              {hint}
            </p>
          </header>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-6">
            <button
              type="button"
              onClick={() => void run(null)}
              disabled={!ready}
              className="group pointer-events-auto flex flex-col items-center gap-2 rounded-lg p-1 disabled:opacity-50"
            >
              <span className="grid size-[76px] place-items-center rounded-full border-[3px] border-text">
                <span className="size-[60px] rounded-full bg-accent transition-transform duration-150 ease-standard group-active:scale-90" />
              </span>
              <span className="rounded-sm bg-bg/75 px-2 py-0.5 text-sm font-semibold backdrop-blur-sm">
                Identifiser hele bildet
              </span>
            </button>
          </div>
        </>
      )}

      <Sheet
        open={sheetOpen}
        onClose={close}
        title={identify.phase === "done" && !identify.result.product ? "Ukjent vare" : SHEET_TITLE[identify.phase]}
      >
        {identify.phase === "loading" && <CardSkeleton image={identify.image} />}
        {identify.phase === "done" && <ProductCard result={identify.result} />}
        {identify.phase === "error" && (
          <ErrorState
            title={identify.title}
            body={identify.body}
            action={
              identify.canRetry ? (
                <Button onClick={retry}>Prøv igjen</Button>
              ) : (
                <Button variant="secondary" onClick={close}>
                  Lukk
                </Button>
              )
            }
          />
        )}
      </Sheet>
    </main>
  );
}

/** The card's shape while Claude reads the pack, beside the picture that was sent. */
function CardSkeleton({ image }: { image: string }) {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <div className="flex items-start gap-4">
        <div
          role="img"
          aria-label="Bildet som blir sendt"
          className="size-16 shrink-0 rounded-md border border-line bg-sunken bg-cover bg-center"
          style={{ backgroundImage: `url(${image})` }}
        />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-6 w-20 rounded-sm" />
          <Skeleton className="h-9 w-3/4" />
        </div>
      </div>
      <div className="flex flex-col gap-3 border-y border-line py-4">
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-5 w-2/3" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-7 w-24 rounded-sm" />
        <Skeleton className="h-7 w-16 rounded-sm" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    </div>
  );
}
