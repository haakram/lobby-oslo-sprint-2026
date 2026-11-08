"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, EmptyState, ErrorState, RegenIcon, Sheet, Skeleton, cx } from "@/ui";
import { BoxOverlay, type BoxLabel } from "./BoxOverlay";
import { boxCategory } from "./boxCategory";
import { cocoLabel, isSentToClaude, liveLabel } from "./cocoLabels";
import { cropFrame } from "./cropFrame";
import { PermissionState } from "./PermissionState";
import { ProductCard } from "./ProductCard";
import { KIND_TAG } from "./itemKind";
import { IdentifyError, QUOTA_COPY } from "./requestIdentify";
import type { IdentifyResult } from "./schema";
import type { Box } from "./smoothBoxes";
import { useCamera } from "./useCamera";
import { useDetector } from "./useDetector";
import { useLiveIdentify } from "./useLiveIdentify";
import type { SeenThing } from "./sceneSchedule";
import { useScene } from "./useScene";
import { thingBoxes, thingOver } from "./things";

/**
 * What the sheet shows. For a box, the result lives in `useLiveIdentify` (shared with live
 * recognition); for the whole frame (shutter), it is kept here.
 */
type SheetContent = {
  /** A box we never send to Claude (person, chair …): the card shows its class name only. */
  objectLabel?: string;
  boxId: string | null;
  image: string | null;
  result?: IdentifyResult;
  error?: { title: string; quota: boolean };
};

// One empty list for every render, so the memos below don't rerun when auto recognition is off.
const NO_THINGS: SeenThing[] = [];

const RETRY_BODY = "Hold varen stille med teksten mot kameraet, og prøv igjen.";
const QUOTA_BODY = "Les SKU-en på etiketten, eller spør skiftlederen.";

/** Øyne: the live camera with boxes. Stable boxes are recognised on their own; tap for the card. */
export function EyesScreen() {
  const { video, status: cameraStatus, size: videoSize, start: startCamera, retry: retryCamera } = useCamera();
  const [sheet, setSheet] = useState<SheetContent | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [autoOn, setAutoOn] = useState(true);
  const [sceneOn, setSceneOn] = useState(true);
  // People are boxed and named unless this is off; off, they are left out everywhere, Claude included.
  const [peopleOn, setPeopleOn] = useState(true);
  // Identify and scene share one budget: a 429 from either stops both.
  const [quotaReached, setQuotaReached] = useState(false);
  const onQuota = useCallback(() => setQuotaReached(true), []);
  const request = useRef<AbortController | null>(null);

  const detector = useDetector(video, cameraStatus === "ready" && !sheetOpen, peopleOn);
  const { results, busy, send } = useLiveIdentify(video, detector.boxes, {
    auto: autoOn,
    paused: sheetOpen,
    stopped: quotaReached,
    people: peopleOn,
    onQuota,
  });
  // One scan every 10 s finds both the landmarks (Omgivelser) and the loose things the detector
  // can't see, such as a cap or a pillow (Automatisk gjenkjenning): it runs while either is on.
  const scene = useScene(video, {
    on: (sceneOn || autoOn) && cameraStatus === "ready",
    paused: sheetOpen,
    stopped: quotaReached,
    people: peopleOn,
    onQuota,
  });
  const landmarks = sceneOn ? scene.landmarks : [];
  const things = autoOn ? scene.things : NO_THINGS;
  const scanned = useMemo(
    () => (videoSize ? thingBoxes(things, videoSize, detector.boxes) : []),
    [things, videoSize, detector.boxes],
  );
  const allBoxes = useMemo(() => [...detector.boxes, ...scanned], [detector.boxes, scanned]);

  useEffect(() => () => request.current?.abort(), []);

  const labels = useMemo(() => {
    const next: Record<string, BoxLabel> = {};
    const thingById = new Map(things.map((thing) => [thing.id, thing]));
    for (const box of allBoxes) {
      const result = results[box.id];
      // The detector only finds the box; the name comes from Claude (its own answer for this box, or
      // the scan's for the same spot), or the detector's when it is sure.
      const scan = thingById.get(box.id) ?? (box.label === "person" || !videoSize ? undefined : thingOver(box, things, videoSize));
      const category = scan && !result ? scan.category : boxCategory(box.label, box.score, result);
      const free = liveLabel(box.label, box.score);
      if (busy[box.id]) next[box.id] = { text: "Gjenkjenner …", state: "busy", category };
      else if (result?.product) next[box.id] = { text: result.product.name, state: "known", category };
      // Not in the catalogue: Claude's own name ("Pute"), and what kind of thing it is ("hotellutstyr").
      // Only a supply is "ikke i katalogen": the catalogue lists consumables, not pillows or caps.
      else if (result) next[box.id] = { text: result.name || free, state: "missing", category, note: KIND_TAG[result.kind] };
      // The scan named it but nobody checked the catalogue yet, so a supply says nothing extra.
      else if (scan) next[box.id] = { text: scan.name, state: "scanned", category, note: scan.kind === "supply" ? null : KIND_TAG[scan.kind] };
      else next[box.id] = { text: free, state: isSentToClaude(box.label) ? "product" : "object", category };
    }
    return next;
  }, [allBoxes, things, videoSize, results, busy]);

  /** Identifies a box (or the whole frame) on request and opens the sheet. */
  const run = useCallback(
    async (box: Box | null) => {
      const element = video.current;
      if (!element || cameraStatus !== "ready") return;
      const image = cropFrame(element, box);
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      setSheet({ boxId: box?.id ?? null, image });
      setSheetOpen(true);
      try {
        const result = await send(image, box, controller.signal);
        if (!controller.signal.aborted && !box) setSheet((current) => current && { ...current, result });
      } catch (error) {
        if (controller.signal.aborted) return;
        const known = error instanceof IdentifyError ? error : new IdentifyError("Fikk ikke kjent igjen varen");
        setSheet((current) => current && { ...current, error: { title: known.title, quota: known.quota } });
      }
    },
    [video, cameraStatus, send],
  );

  const select = useCallback(
    (box: Box) => {
      if (!isSentToClaude(box.label)) {
        // A live person box is never sent: a small card with the class name, for free.
        setSheet({ boxId: null, image: null, objectLabel: cocoLabel(box.label) });
        setSheetOpen(true);
      } else if (results[box.id] || busy[box.id]) {
        // Already recognised (or being recognised live): open the card without a new request.
        setSheet({ boxId: box.id, image: null });
        setSheetOpen(true);
      } else {
        void run(box);
      }
    },
    [results, busy, run],
  );

  const close = useCallback(() => {
    request.current?.abort();
    setSheetOpen(false);
  }, []);

  const retry = useCallback(() => {
    // The same box if it is still tracked, otherwise the whole frame.
    void run(allBoxes.find((box) => box.id === sheet?.boxId) ?? null);
  }, [allBoxes, sheet, run]);

  const problem = cameraStatus !== "idle" && cameraStatus !== "starting" && cameraStatus !== "ready" ? cameraStatus : null;
  const ready = cameraStatus === "ready";
  const autoActive = autoOn && !quotaReached;

  let hint = "Pek kameraet mot en vare, eller ta bilde av hele varen.";
  if (!ready) hint = "Starter kameraet";
  else if (detector.status === "loading") hint = "Laster gjenkjenning";
  else if (detector.status === "failed") hint = "Live-bokser er av. Ta bilde av varen med utløseren.";
  else if (allBoxes.length > 0 && autoActive) hint = "Hold varen stille, så kjenner Fettero den igjen.";
  else if (allBoxes.length > 0) hint = "Trykk på en boks for å kjenne igjen varen.";

  // What the sheet shows, derived so a live result fills an open sheet as soon as it lands.
  const sheetResult = sheet?.boxId ? (results[sheet.boxId] ?? sheet.result) : sheet?.result;
  const sheetBusy = sheet?.boxId ? busy[sheet.boxId] : !sheet?.error;
  const sheetError =
    sheet?.error ?? (!sheetResult && !sheetBusy ? { title: "Fikk ikke kjent igjen varen", quota: false } : undefined);
  let sheetTitle = "Ser på varen";
  if (sheet?.objectLabel) sheetTitle = "Gjenstand";
  else if (sheetResult?.product) sheetTitle = "Vare funnet";
  else if (sheetResult) sheetTitle = sheetResult.kind === "supply" ? "Ukjent vare" : "Dette ser roboten";
  else if (sheetError) sheetTitle = "Ingen svar";
  const seenLabels = [...new Set(landmarks.map((mark) => mark.label))];

  return (
    <main data-surface="dark" className="relative flex flex-1 flex-col overflow-hidden bg-bg">
      <video
        ref={video}
        muted
        playsInline
        aria-hidden="true"
        className={cx("absolute inset-0 size-full object-cover", !ready && "invisible")}
      />

      {cameraStatus === "idle" ? (
        <>
          <h1 className="px-4 pt-8 text-2xl font-bold tracking-[-0.02em] sm:px-6 lg:px-10 lg:pt-10">Robotens øyne</h1>
          <CameraStart onStart={startCamera} />
        </>
      ) : problem ? (
        <>
          <h1 className="px-4 pt-8 text-2xl font-bold tracking-[-0.02em] sm:px-6 lg:px-10 lg:pt-10">Robotens øyne</h1>
          <PermissionState problem={problem} onRetry={retryCamera} />
        </>
      ) : (
        <>
          {ready && videoSize && allBoxes.length === 0 && (
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="relative size-56 opacity-60">
                {["top-0 left-0 border-t-2 border-l-2", "top-0 right-0 border-t-2 border-r-2", "bottom-0 left-0 border-b-2 border-l-2", "bottom-0 right-0 border-b-2 border-r-2"].map((corner) => (
                  <span key={corner} className={cx("absolute size-8 rounded-sm border-text", corner)} />
                ))}
              </div>
            </div>
          )}

          {ready && videoSize && (
            <BoxOverlay
              boxes={allBoxes}
              landmarks={landmarks}
              now={scene.now}
              videoSize={videoSize}
              labels={labels}
              onSelect={select}
            />
          )}

          {!ready && (
            <div aria-hidden="true" className="absolute inset-0 grid place-items-center p-8">
              <Skeleton className="aspect-[3/4] w-full max-w-sm rounded-lg" />
            </div>
          )}

          <header className="pointer-events-none relative flex flex-col items-start gap-2 p-4 sm:px-8 lg:px-12 lg:pt-8">
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <h1 className="rounded-sm bg-bg/75 px-3 py-1 text-xl font-bold tracking-[-0.02em] backdrop-blur-sm">Robotens øyne</h1>
              <div className="flex flex-wrap gap-2">
                <Switch
                  label="Automatisk gjenkjenning"
                  on={autoActive}
                  disabled={quotaReached}
                  onToggle={() => setAutoOn((on) => !on)}
                />
                <Switch
                  label="Omgivelser"
                  on={sceneOn && !quotaReached}
                  disabled={quotaReached}
                  onToggle={() => setSceneOn((on) => !on)}
                />
                <Switch label="Personer" on={peopleOn} disabled={false} onToggle={() => setPeopleOn((on) => !on)} />
              </div>
            </div>
            <p aria-live="polite" className="rounded-md bg-bg/75 px-3 py-1 text-sm text-text backdrop-blur-sm">
              {hint}
            </p>
            {seenLabels.length > 0 && (
              <p className="rounded-md border border-dashed border-text bg-bg/75 px-3 py-1 text-sm backdrop-blur-sm">
                <span className="text-muted">Ser: </span>
                <span className="font-semibold">{seenLabels.join(" · ")}</span>
              </p>
            )}
            {quotaReached && (
              <p role="status" className="rounded-md bg-warning-soft px-3 py-1 text-sm font-semibold text-warning">
                {QUOTA_COPY} Automatisk gjenkjenning og omgivelser er slått av.
              </p>
            )}
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

      <Sheet open={sheetOpen} onClose={close} title={sheetTitle}>
        {sheet?.objectLabel ? (
          <ObjectCard label={sheet.objectLabel} />
        ) : sheetResult ? (
          <ProductCard result={sheetResult} />
        ) : sheetError ? (
          <ErrorState
            title={sheetError.title}
            body={sheetError.quota ? QUOTA_BODY : RETRY_BODY}
            // Out of quota there is nothing to retry; the sheet's own Lukk closes it.
            action={sheetError.quota ? undefined : <Button onClick={retry}>Prøv igjen</Button>}
          />
        ) : (
          <CardSkeleton image={sheet?.image ?? null} />
        )}
      </Sheet>
    </main>
  );
}

/** Before the browser is asked: what the camera is for, and the one tap that asks. */
function CameraStart({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-1 items-center px-4 py-12 sm:px-8 lg:px-12">
      <EmptyState
        icon={<RegenIcon name="eye" size={32} />}
        title="Se det roboten ser"
        body="Roboten ser gjennom kameraet og kjenner igjen varer og omgivelser. Nettleseren spør om lov første gang."
        action={
          <Button size="lg" onClick={onStart}>
            Slå på kameraet
          </Button>
        }
      />
    </div>
  );
}

/** A person's live box: the detector names them for free, and the box is never sent to Claude. */
function ObjectCard({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <Badge>Ikke en vare</Badge>
      <p className="text-2xl font-bold tracking-[-0.02em]">{label}</p>
      <p className="text-base text-muted">
        Fettero kjenner igjen personer selv, uten å sende bildet, så dette kostet ingenting. Trykk på boksene
        rundt det personen har på seg eller holder, eller ta bilde av hele bildet. Slå av «Personer» for å
        utelate dem.
      </p>
    </div>
  );
}

/** A live feature on or off, so a demo can stop it spending. */
function Switch({
  label,
  on,
  disabled,
  onToggle,
}: {
  label: string;
  on: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onToggle}
      className="pointer-events-auto flex min-h-12 items-center gap-3 rounded-md bg-bg/75 px-3 text-sm font-semibold backdrop-blur-sm disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span
        aria-hidden="true"
        className={cx(
          "relative h-6 w-10 shrink-0 rounded-full border transition-colors duration-150 ease-standard",
          on ? "border-accent bg-accent" : "border-line-strong bg-sunken",
        )}
      >
        <span
          className={cx(
            "absolute top-0.5 left-0.5 size-[18px] rounded-full transition-transform duration-150 ease-standard",
            on ? "translate-x-4 bg-on-accent" : "bg-text",
          )}
        />
      </span>
      {label}
    </button>
  );
}

/** The card's shape while Claude reads the pack, beside the picture that was sent (when there is one). */
function CardSkeleton({ image }: { image: string | null }) {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <div className="flex items-start gap-4">
        {image ? (
          <div
            role="img"
            aria-label="Bildet som blir sendt"
            className="size-16 shrink-0 rounded-md border border-line bg-sunken bg-cover bg-center"
            style={{ backgroundImage: `url(${image})` }}
          />
        ) : (
          <Skeleton className="size-16 shrink-0" />
        )}
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
