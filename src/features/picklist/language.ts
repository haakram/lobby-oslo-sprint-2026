"use client";

import { createLocalStore } from "@/features/modules/localStore";
import { type GuideLanguage, guideLanguageOf, PICKLIST_WORDS, type PicklistWords } from "./guides";

/**
 * The guide language, kept on this device (Holio pain 9: a temp on a shared handheld chose Polski once
 * and should not choose it again on every visit). The work guides and the pick list's own words read
 * it. Bokmål on the server and before the browser's copy arrives.
 */
export const GUIDE_LANGUAGE = createLocalStore<GuideLanguage>("lobby:guide-sprak", guideLanguageOf, "nb");

export function useGuideLanguage(): [GuideLanguage, (language: GuideLanguage) => void] {
  return [GUIDE_LANGUAGE.use(), GUIDE_LANGUAGE.set];
}

/** The pick list's words in the chosen language, and the language for the `lang` attribute. */
export function usePicklistWords(): { language: GuideLanguage; words: PicklistWords } {
  const language = GUIDE_LANGUAGE.use();
  return { language, words: PICKLIST_WORDS[language] };
}
