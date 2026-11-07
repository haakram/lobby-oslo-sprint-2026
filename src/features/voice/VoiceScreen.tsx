"use client";

import { ConversationProvider } from "@elevenlabs/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { productBySku, type Product } from "@/features/catalog/products";
import { usePicklist } from "@/features/picklist/PicklistProvider";
import { loadRoutes } from "@/features/routes/loadRoutes";
import { bestTour } from "@/features/routes/tour";
import { Badge, Button, buttonClasses, Card, ErrorState, fadeRise, MicIcon } from "@/ui";
import { ConfirmTaskSheet } from "./ConfirmTaskSheet";
import { GUIDES, type GuideStep } from "./guides";
import type { VoiceUi } from "./tools";
import { Transcript } from "./Transcript";
import { useFetteroVoice, type VoicePhase, type VoiceProblem } from "./useFetteroVoice";
import { VoiceOrb } from "./VoiceOrb";

type Shown =
  | { kind: "product"; product: Product }
  | { kind: "route"; skus: string[] }
  | { kind: "guide"; step: GuideStep }
  | { kind: "task"; text: string };

const STATUS: Record<VoicePhase, string> = {
  idle: "Trykk og snakk på ditt eget språk.",
  connecting: "Kobler til Fettero …",
  listening: "Lytter",
  speaking: "Fettero snakker",
};

/** /stemme: talk to Fettero in any language; it answers out loud and shows what it means. */
export function VoiceScreen() {
  return (
    <ConversationProvider>
      <VoiceSession />
    </ConversationProvider>
  );
}

function VoiceSession() {
  const picklist = usePicklist();
  const addToPicklist = picklist.add;
  const [shown, setShown] = useState<Shown | null>(null);
  const [proposed, setProposed] = useState<string | null>(null);
  // The pending task, read synchronously: two tool calls in one tick must not both open the sheet.
  const pending = useRef<string | null>(null);

  // Everything the agent can reach. Each only shows something; a task waits for a tap.
  const ui = useMemo<VoiceUi>(
    () => ({
      showProduct: (product) => setShown({ kind: "product", product }),
      showRoute: (skus) => {
        skus.forEach(addToPicklist);
        setShown({ kind: "route", skus });
      },
      showGuide: (step) => setShown({ kind: "guide", step }),
      proposeTask: (text) => {
        if (pending.current !== null) return false;
        pending.current = text;
        setProposed(text);
        return true;
      },
    }),
    [addToPicklist],
  );

  const voice = useFetteroVoice(ui);
  const { tellAgent } = voice;

  const confirmTask = useCallback(() => {
    const text = pending.current;
    if (text === null) return;
    // TODO(phase-3): hand the confirmed task to Track A's robot queue once it exposes one.
    pending.current = null;
    setShown({ kind: "task", text });
    setProposed(null);
    tellAgent("The worker tapped Bekreft: the proposed robot task is confirmed. In this demo it is not sent to the robot yet.");
  }, [tellAgent]);

  const cancelTask = useCallback(() => {
    pending.current = null;
    setProposed(null);
    tellAgent("The worker tapped Avbryt: the proposed robot task was dropped. Nothing was sent.");
  }, [tellAgent]);

  const busy = voice.phase === "connecting";

  return (
    <main className="flex-1 bg-bg px-4 pt-6 pb-12 sm:px-6 lg:px-10 lg:pt-10">
      <header>
        <h1 className="text-2xl font-bold tracking-[-0.02em] sm:text-3xl sm:tracking-[-0.03em]">Snakk gjennom roboten</h1>
        {/* What works now (agentConfig.ts: the worker's language, eleven of them, answered out loud) and the
            pitched next step. TODO(phase-3): guest translation, a "Gjest" turn and a bokmål line per foreign turn. */}
        <p className="mt-2 max-w-[56ch] text-base text-muted">
          Snakk på ditt språk, så svarer roboten høyt på det samme, på elleve språk. I dag om varer, ruter og
          oppgaver; neste steg er å tolke mellom deg og gjesten.
        </p>
      </header>

      <div className="mt-8 grid max-w-6xl gap-6 lg:mt-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10">
        <section aria-label="Samtalekontroll" className="flex flex-col items-center gap-6 lg:pt-4">
          {voice.problem?.kind === "mic-denied" || voice.problem?.kind === "no-mic" ? (
            <MicrophoneProblem problem={voice.problem} onRetry={voice.start} />
          ) : (
            <>
              <VoiceOrb
                phase={voice.phase}
                getInputVolume={voice.getInputVolume}
                getOutputVolume={voice.getOutputVolume}
              />
              <p aria-live="polite" className="min-h-7 text-center text-lg font-medium text-text">
                {STATUS[voice.phase]}
              </p>
              {voice.connected ? (
                <Button variant="secondary" size="lg" className="w-full max-w-xs" onClick={voice.stop}>
                  Avslutt
                </Button>
              ) : (
                <Button size="lg" className="w-full max-w-xs" loading={busy} onClick={() => void voice.start()}>
                  Snakk med Fettero
                </Button>
              )}
              {voice.problem && <ServiceProblem problem={voice.problem} onRetry={voice.start} />}
            </>
          )}
        </section>

        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <Transcript turns={voice.turns} language={voice.language} />
          </Card>
          <ShownPanel shown={shown} inPicklist={picklist.skus} onAdd={addToPicklist} />
        </div>
      </div>

      <ConfirmTaskSheet text={proposed} onConfirm={confirmTask} onCancel={cancelTask} />
    </main>
  );
}

function MicrophoneProblem({ problem, onRetry }: { problem: VoiceProblem; onRetry: () => void }) {
  const denied = problem.kind === "mic-denied";
  return (
    <Card className="flex w-full max-w-md flex-col items-start gap-4">
      <div className="grid size-14 place-items-center rounded-full bg-danger-soft text-danger">
        <MicIcon className="size-7" />
      </div>
      <h2 className="text-xl font-bold tracking-[-0.02em]">
        {denied ? "Mikrofonen er blokkert" : "Fant ingen mikrofon"}
      </h2>
      {denied ? (
        <>
          <p className="text-base text-muted">Fettero må høre deg for å svare. Slik gir du tilgang:</p>
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-base text-text">
            <li>Trykk på låsen ved siden av adressen øverst.</li>
            <li>Slå på Mikrofon for denne siden.</li>
            <li>Trykk Prøv igjen.</li>
          </ol>
        </>
      ) : (
        <p className="text-base text-muted">
          Koble til en mikrofon, eller åpne appen på telefonen over https, og prøv igjen.
        </p>
      )}
      <Button size="lg" onClick={() => void onRetry()}>
        Prøv igjen
      </Button>
    </Card>
  );
}

function ServiceProblem({ problem, onRetry }: { problem: VoiceProblem; onRetry: () => void }) {
  const notSetUp = problem.kind === "not-set-up";
  return (
    <ErrorState
      className="w-full"
      title={notSetUp ? "Stemmen er ikke satt opp" : "Fikk ikke kontakt med Fettero"}
      body={
        notSetUp
          ? "Agenten er ikke koblet til serveren ennå. Prøv igjen når oppsettet er gjort."
          : "Samtalen ble brutt eller kom aldri i gang. Sjekk nettet og prøv igjen."
      }
      action={
        <Button variant="secondary" onClick={() => void onRetry()}>
          Prøv igjen
        </Button>
      }
    />
  );
}

function ShownPanel({
  shown,
  inPicklist,
  onAdd,
}: {
  shown: Shown | null;
  inPicklist: string[];
  onAdd: (sku: string) => void;
}) {
  const reduced = useReducedMotion();
  const key = shown
    ? shown.kind === "product"
      ? `product-${shown.product.sku}`
      : shown.kind === "route"
        ? `route-${shown.skus.join("-")}`
        : shown.kind === "guide"
          ? `guide-${shown.step}`
          : `task-${shown.text}`
    : "none";

  return (
    <AnimatePresence mode="wait" initial={false}>
      {shown && (
        <motion.div key={key} variants={fadeRise(reduced)} initial="hidden" animate="visible" exit="exit">
          <Card>
            {shown.kind === "product" && (
              <ProductView product={shown.product} added={inPicklist.includes(shown.product.sku)} onAdd={onAdd} />
            )}
            {shown.kind === "route" && <RouteView skus={shown.skus} />}
            {shown.kind === "guide" && <GuideView step={shown.step} />}
            {shown.kind === "task" && <TaskView text={shown.text} />}
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ProductView({ product, added, onAdd }: { product: Product; added: boolean; onAdd: (sku: string) => void }) {
  const id = `shown-${product.sku}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 id={id} className="text-lg font-bold tracking-[-0.01em]">
          {product.name}
        </h2>
        {added && <Badge tone="success">I plukklisten</Badge>}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-base">
        <dt className="text-muted">SKU</dt>
        <dd className="font-mono tabular-nums">{product.sku}</dd>
        <dt className="text-muted">Plass</dt>
        <dd className="font-semibold">{product.locationLabel}</dd>
      </dl>
      <p className="text-base text-muted">{product.description}</p>
      <div className="flex flex-wrap gap-3">
        {added ? (
          <Link href="/ruter" className={buttonClasses("secondary")}>
            Vis rute
          </Link>
        ) : (
          <Button variant="secondary" onClick={() => onAdd(product.sku)}>
            Legg i plukkliste
          </Button>
        )}
      </div>
    </section>
  );
}

type Stop = { location: string; label: string; products: Product[] };

/**
 * Groups the products by shelf and orders the shelves the way /ruter does: the best tour over the
 * route matrix. If the map has no route for them, keeps the spoken order and gives no metres.
 */
function planStops(skus: string[]): { stops: Stop[]; metres: number | null } {
  const byShelf = new Map<string, Stop>();
  for (const product of skus.map(productBySku)) {
    if (!product) continue;
    const stop = byShelf.get(product.location) ?? { location: product.location, label: product.locationLabel, products: [] };
    stop.products.push(product);
    byShelf.set(product.location, stop);
  }
  const loaded = loadRoutes();
  const tour = loaded.ok ? bestTour(loaded.matrix, [...byShelf.keys()]) : null;
  if (!tour || "error" in tour) return { stops: [...byShelf.values()], metres: null };
  return {
    stops: tour.order.flatMap((location) => byShelf.get(location) ?? []),
    metres: Math.round(tour.metres),
  };
}

function RouteView({ skus }: { skus: string[] }) {
  const { stops, metres } = useMemo(() => planStops(skus), [skus]);
  return (
    <section aria-labelledby="shown-route" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="shown-route" className="text-lg font-bold tracking-[-0.01em]">
            {stops.length === 1 ? "1 stopp" : `${stops.length} stopp`}
          </h2>
          {metres !== null && (
            <p className="mt-1 text-base text-muted">
              Beste rute, fra start og tilbake:{" "}
              <span className="font-mono font-medium text-text tabular-nums">{metres}</span>
              <span className="font-mono text-text"> m</span>
            </p>
          )}
        </div>
        <Badge tone="success">Lagt i plukklisten</Badge>
      </div>
      <ol aria-label="Stopp" className="flex flex-col">
        {stops.map((stop, index) => (
          <li key={stop.location} className="flex items-start gap-4 border-t border-line py-3 first:border-t-0 first:pt-0">
            <span
              aria-hidden="true"
              className="grid size-8 shrink-0 place-items-center rounded-sm bg-accent font-mono text-sm font-medium text-on-accent tabular-nums"
            >
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{stop.label}</p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {stop.products.map((product) => (
                  <li key={product.sku} className="text-sm text-muted">
                    {product.name} · <span className="font-mono tabular-nums">{product.sku}</span>
                  </li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ol>
      <Link href="/ruter" className={buttonClasses("secondary")}>
        Vis rute
      </Link>
    </section>
  );
}

function GuideView({ step }: { step: GuideStep }) {
  const guide = GUIDES[step];
  return (
    <section aria-labelledby="shown-guide" className="flex flex-col gap-4">
      <h2 id="shown-guide" className="text-lg font-bold tracking-[-0.01em]">
        {guide.title}
      </h2>
      <ol className="flex flex-col gap-3">
        {guide.steps.map((line, index) => (
          <li key={line} className="grid grid-cols-[2rem_1fr] items-baseline gap-3">
            <span aria-hidden="true" className="font-mono text-sm text-accent-text tabular-nums">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="text-base">{line}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function TaskView({ text }: { text: string }) {
  return (
    <section aria-labelledby="shown-task" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 id="shown-task" className="text-lg font-bold tracking-[-0.01em]">
          Oppgave til roboten
        </h2>
        <Badge tone="success">Bekreftet</Badge>
      </div>
      <p className="text-lg break-words">{text}</p>
      <p className="text-base text-muted">Du bekreftet oppgaven. Den er ikke sendt til roboten ennå (demo).</p>
    </section>
  );
}
