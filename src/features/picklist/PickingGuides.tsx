"use client";

import { useState } from "react";
import { cx } from "@/ui";
import { GUIDE_LANGUAGES, type GuideLanguage, guidesIn } from "./guides";

/**
 * Arbeidsguider: the four work guides as cards, with a language switch (Holio pain 9 without the
 * voice agent). The guide the screen is about (`lead`) comes first. The screen stays in bokmål; the
 * guide text is in the language chosen, marked with `lang` for screen readers.
 */
export function PickingGuides({ lead = "picking", className }: { lead?: "receiving" | "picking" | "packing" | "returns"; className?: string }) {
  const [language, setLanguage] = useState<GuideLanguage>("nb");
  const guides = guidesIn(language).sort((a, b) => Number(b.step === lead) - Number(a.step === lead));
  return (
    <section aria-labelledby="guider-heading" className={cx("rounded-lg border border-line bg-surface p-4 sm:p-5", className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h2 id="guider-heading" className="text-lg font-semibold tracking-[-0.01em]">
            Arbeidsguider
          </h2>
          <p className="text-sm text-muted">Fire korte guider for nye på lageret, på deres eget språk.</p>
        </div>
        <div role="group" aria-label="Språk" className="inline-flex flex-wrap gap-0.5 rounded-sm bg-sunken p-0.5">
          {GUIDE_LANGUAGES.map(({ code, label }) => (
            <button
              key={code}
              type="button"
              lang={code}
              aria-pressed={language === code}
              onClick={() => setLanguage(code)}
              className={cx(
                "min-h-10 rounded-sm px-3 text-sm font-semibold transition-colors duration-[120ms] ease-standard pointer-coarse:min-h-11",
                language === code ? "bg-surface text-text" : "text-muted hover:text-text",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <ul lang={language} className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {guides.map(({ step, guide }) => (
          <li key={step} className="rounded-md bg-sunken p-4">
            <h3 className="text-base font-semibold">{guide.title}</h3>
            <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5 text-sm">
              {guide.steps.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ol>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">Oversatt av teamet, ennå ikke sjekket av noen med språket som morsmål.</p>
    </section>
  );
}
