"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import {
  Badge,
  type BadgeTone,
  Button,
  buttonClasses,
  Card,
  cx,
  EmptyState,
  ErrorState,
  fadeRise,
  MoonIcon,
  Skeleton,
  Stat,
} from "@/ui";
import type { Decision, RunSummary } from "./runlog";
import { type RunView, useLive, useReplay, viewerBase } from "./useRun";

// TODO(phase-2): real run from Hamad. Until then this is a copy of fixtures/sample.jsonl (test data).
const DEMO_RUN = "/runs/demo.jsonl";

type Tab = "replay" | "live";

const KIND: Record<string, { label: string; tone: BadgeTone }> = {
  plan: { label: "Plan", tone: "neutral" },
  task_start: { label: "Startet", tone: "neutral" },
  task_done: { label: "Fullført", tone: "success" },
  task_failed: { label: "Feilet", tone: "danger" },
  brain: { label: "Claude", tone: "accent" },
  note: { label: "Notat", tone: "neutral" },
};

/** The robot's night shift, from run log v1: a replay of the recording, or the live shift. */
export function NightShiftScreen({ viewerUrl }: { viewerUrl?: string }) {
  const base = viewerBase(viewerUrl);
  const [tab, setTab] = useState<Tab>("replay");
  const replay = useReplay(DEMO_RUN);
  const live = useLive(base, tab === "live");
  const view: RunView = tab === "live" ? live : replay;
  const ready = view.status === "ready";

  return (
    <main data-surface="dark" className="flex-1 bg-bg px-4 pt-10 pb-12 sm:px-8 lg:px-12 lg:pt-16">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold tracking-[-0.03em]">Natteskift</h1>
            {ready && <Badge tone={view.summary.live ? "accent" : "success"}>{view.summary.live ? "Pågår" : "Ferdig"}</Badge>}
          </div>
          <p className="mt-3 max-w-[48ch] text-lg text-muted">Robotens skift i natt, steg for steg.</p>
        </div>
        {base && (
          <a href={base} target="_blank" rel="noreferrer" className={buttonClasses("secondary")}>
            Åpne 3D
          </a>
        )}
      </header>

      {base && <Tabs tab={tab} onChange={setTab} />}

      <div className="mt-8 max-w-4xl">
        {view.status === "loading" && <LoadingRun />}
        {view.status === "error" &&
          (tab === "live" ? (
            <ErrorState
              title="Fikk ikke kontakt med viewer-serveren"
              body="Sjekk at viewer-serveren kjører på denne maskinen. Vi prøver igjen hvert andre sekund."
              action={<Button variant="secondary" onClick={live.retry}>Prøv igjen</Button>}
            />
          ) : (
            <ErrorState
              title="Fikk ikke lastet opptaket"
              body="Sjekk nettet og prøv igjen."
              action={<Button variant="secondary" onClick={replay.retry}>Prøv igjen</Button>}
            />
          ))}
        {view.status === "empty" &&
          (tab === "live" ? (
            <EmptyState
              icon={<MoonIcon className="size-8" />}
              title="Ingen skift ennå"
              body="Start et skift med agenten, så dukker det opp her."
            />
          ) : (
            <EmptyState
              icon={<MoonIcon className="size-8" />}
              title="Opptaket er tomt"
              body="Legg inn en kjøringslogg fra roboten, så spilles skiftet av her."
            />
          ))}
        {ready && (
          <>
            <StatRow summary={view.summary} />
            {tab === "replay" && (
              <div className="mt-6 flex flex-wrap items-center gap-4">
                <Button size="lg" loading={replay.playing} onClick={replay.play}>
                  Spill av
                </Button>
                <span className="text-sm text-muted">Spilles av i 10 × fart.</span>
              </div>
            )}
            {view.skipped > 0 && (
              <p className="mt-4 text-sm text-muted">
                <span className="font-mono tabular-nums">{view.skipped}</span>{" "}
                {view.skipped === 1 ? "linje" : "linjer"} i loggen kunne ikke leses og er hoppet over.
              </p>
            )}
            <DecisionFeed decisions={view.summary.decisions} />
          </>
        )}
      </div>
    </main>
  );
}

function Tabs({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "replay", label: "Opptak" },
    { id: "live", label: "Live" },
  ];
  return (
    <div role="tablist" aria-label="Kilde" className="mt-8 inline-flex gap-1 rounded-md border border-line bg-surface p-1">
      {tabs.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={tab === id}
          onClick={() => onChange(id)}
          className={cx(
            "relative min-h-12 rounded-md px-5 text-base font-semibold transition-colors duration-150 ease-standard",
            tab === id ? "bg-sunken text-text" : "text-muted hover:text-text",
          )}
        >
          {label}
          {tab === id && <span aria-hidden="true" className="absolute inset-x-4 bottom-1 h-0.5 rounded-sm bg-accent" />}
        </button>
      ))}
    </div>
  );
}

function StatRow({ summary }: { summary: RunSummary }) {
  return (
    <Card role="group" aria-label="Skiftet i tall">
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
        <Stat label="Poeng" value={summary.score} tone="accent" />
        <Stat label="Klokke" value={summary.clock ?? "–"} />
        <Stat label="Oppgaver fullført" value={summary.tasksDone} tone="success" />
        <Stat label="Oppgaver feilet" value={summary.tasksFailed} />
      </div>
      <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-1 border-t border-line pt-4 text-sm text-muted">
        <div className="flex gap-2">
          <dt>Posisjon</dt>
          <dd className="font-mono text-text">{summary.location ?? "–"}</dd>
        </div>
        <div className="flex gap-2">
          <dt>Skift</dt>
          <dd className="max-w-[24ch] truncate font-mono text-text">{summary.shift ?? "–"}</dd>
        </div>
        {summary.seed !== null && (
          <div className="flex gap-2">
            <dt>Seed</dt>
            <dd className="font-mono tabular-nums text-text">{summary.seed}</dd>
          </div>
        )}
      </dl>
    </Card>
  );
}

function DecisionFeed({ decisions }: { decisions: Decision[] }) {
  const reduced = useReducedMotion();
  const variants = fadeRise(reduced);

  return (
    <section aria-labelledby="decisions-heading" className="mt-10">
      <h2 id="decisions-heading" className="text-xl font-bold tracking-[-0.02em]">
        Beslutninger
      </h2>
      {decisions.length === 0 ? (
        <p className="mt-3 text-base text-muted">Roboten har ikke tatt noen valg ennå.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {decisions.map((decision) => {
              const kind = KIND[decision.kind] ?? { label: decision.kind, tone: "neutral" as const };
              return (
                <motion.li
                  key={decision.id}
                  layout={!reduced}
                  variants={variants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="flex items-start gap-3 rounded-md border border-line bg-surface px-4 py-3"
                >
                  <Badge tone={kind.tone} className="mt-0.5">
                    {kind.label}
                  </Badge>
                  <span className="min-w-0 text-base break-words">{decision.text || "Uten detaljer"}</span>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}

function LoadingRun() {
  return (
    <div aria-busy="true" aria-label="Laster skiftet">
      <div className="grid grid-cols-2 gap-6 rounded-lg border border-line bg-surface p-5 sm:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="flex flex-col gap-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-7 w-24" />
          </div>
        ))}
      </div>
      <Skeleton className="mt-6 h-14 w-36" />
      <div className="mt-10 flex flex-col gap-2">
        {[0, 1, 2, 3, 4].map((index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}
