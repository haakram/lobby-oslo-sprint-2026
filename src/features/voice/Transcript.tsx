"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { Badge, EmptyState, fadeRise } from "@/ui";
import { languageLabel, type LanguageCode } from "./language";
import type { Turn } from "./useFetteroVoice";

/** The live conversation, newest at the bottom, with the language Fettero hears as a badge. */
export function Transcript({ turns, language }: { turns: Turn[]; language: LanguageCode | null }) {
  const reduced = useReducedMotion();
  const end = useRef<HTMLLIElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end", behavior: reduced ? "auto" : "smooth" });
  }, [turns.length, reduced]);

  return (
    <section aria-labelledby="transcript-heading" className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3">
        <h2 id="transcript-heading" className="text-xl font-bold tracking-[-0.02em]">
          Samtale
        </h2>
        <div aria-live="polite">
          {language ? (
            <Badge tone="accent">
              <span className="sr-only">Språk:&nbsp;</span>
              <span>{languageLabel(language)}</span>
            </Badge>
          ) : (
            <Badge>Språk ukjent</Badge>
          )}
        </div>
      </div>

      {turns.length === 0 ? (
        <EmptyState
          className="mt-6"
          title="Ingen samtale ennå"
          body="Trykk Snakk med Fettero og spør om en vare, en rute eller en arbeidsoppgave. Snakk det språket du vil."
        />
      ) : (
        <ol aria-label="Samtalen så langt" className="mt-4 flex max-h-[44dvh] flex-col gap-3 overflow-y-auto pr-1">
          <AnimatePresence initial={false}>
            {turns.map((turn) => (
              <motion.li
                key={turn.id}
                variants={fadeRise(reduced)}
                initial="hidden"
                animate="visible"
                className="grid grid-cols-[5.5rem_1fr] gap-3 border-t border-line pt-3 first:border-t-0 first:pt-0"
              >
                <div className="flex flex-col items-start gap-1">
                  <span className={turn.role === "agent" ? "text-sm font-semibold text-accent-text" : "text-sm font-semibold text-muted"}>
                    {turn.role === "agent" ? "Fettero" : "Du"}
                  </span>
                  {turn.language && (
                    // Visual only; the badge above tells screen readers the language.
                    <span aria-hidden="true" className="font-mono text-xs text-muted uppercase tabular-nums">
                      {turn.language}
                    </span>
                  )}
                </div>
                <p className="text-base text-text">{turn.text}</p>
              </motion.li>
            ))}
          </AnimatePresence>
          <li ref={end} aria-hidden="true" className="h-0" />
        </ol>
      )}
    </section>
  );
}
