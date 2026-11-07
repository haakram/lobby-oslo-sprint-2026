// A small offline guess at which language a spoken line is in, for the transcript badge.
// The ElevenLabs agent detects the language itself (the `language_detection` system tool) but
// does not report it to the browser, so the screen makes its own guess from the transcript.
// It is a label, nothing depends on it: when unsure it returns null and the badge stays as it was.

export type LanguageCode = "no" | "sv" | "da" | "en" | "pl" | "uk" | "ru" | "de" | "es" | "lt" | "ar";

const LABELS: Record<LanguageCode, string> = {
  no: "Norsk",
  sv: "Svensk",
  da: "Dansk",
  en: "Engelsk",
  pl: "Polsk",
  uk: "Ukrainsk",
  ru: "Russisk",
  de: "Tysk",
  es: "Spansk",
  lt: "Litauisk",
  ar: "Arabisk",
};

export function languageLabel(code: LanguageCode): string {
  return LABELS[code];
}

// Letters only one of the candidate languages uses, checked in this order
// (Lithuanian shares ą and ę with Polish, so its own letters go first).
const LETTERS: [RegExp, LanguageCode][] = [
  [/[ėįųūčšž]/, "lt"],
  [/[ñ¿¡]/, "es"],
  [/[łśźżćńąę]/, "pl"],
  [/[ß]/, "de"],
];

const UKRAINIAN = ["де", "що", "як", "це", "мені", "чи", "лежить", "покажи", "куди"];
const RUSSIAN = ["где", "что", "как", "это", "мне", "ли", "лежит", "покажи", "куда"];

// Short, frequent words: a line scores one point per word it shares with a language.
const WORDS: Record<Exclude<LanguageCode, "uk" | "ru" | "ar">, readonly string[]> = {
  no: ["hvor", "skal", "jeg", "ikke", "er", "det", "og", "på", "hva", "hvordan", "ligger", "står", "mange", "kan", "du", "vise", "meg"],
  sv: ["var", "ska", "jag", "inte", "är", "det", "och", "på", "vad", "hur", "ligger", "står", "många", "kan", "du", "visa", "mig"],
  da: ["hvor", "skal", "jeg", "ikke", "er", "det", "og", "på", "hvad", "hvordan", "ligger", "står", "mange", "kan", "du", "vise", "mig"],
  en: ["where", "what", "how", "the", "is", "does", "do", "i", "you", "go", "can", "show", "me", "to", "and", "it", "this"],
  pl: ["gdzie", "jak", "co", "mam", "jest", "nie", "się", "to", "czy", "mi", "pokaż"],
  de: ["wo", "wie", "was", "ist", "die", "der", "das", "und", "ich", "nicht", "kommt", "hin"],
  es: ["dónde", "donde", "qué", "como", "cómo", "el", "la", "es", "va", "y", "no", "mi"],
  lt: ["kur", "kaip", "kas", "yra", "ne", "ir", "man"],
};

export function detectLanguage(text: string): LanguageCode | null {
  const lower = text.toLowerCase();
  const letters = lower.match(/\p{L}/gu)?.length ?? 0;
  if (letters < 3) return null;

  if (/\p{Script=Arabic}/u.test(lower)) return "ar";
  if (/\p{Script=Cyrillic}/u.test(lower)) {
    if (/[іїєґ]/.test(lower)) return "uk";
    const cyrillic = lower.match(/\p{L}+/gu) ?? [];
    const uk = cyrillic.filter((word) => UKRAINIAN.includes(word)).length;
    const ru = cyrillic.filter((word) => RUSSIAN.includes(word)).length;
    return uk > ru ? "uk" : "ru";
  }

  for (const [pattern, code] of LETTERS) if (pattern.test(lower)) return code;

  const words = lower.match(/\p{L}+/gu) ?? [];
  let best: LanguageCode | null = null;
  let bestScore = 0;
  for (const [code, list] of Object.entries(WORDS) as [LanguageCode, readonly string[]][]) {
    const score = words.filter((word) => list.includes(word)).length;
    if (score > bestScore) {
      best = code;
      bestScore = score;
    }
  }
  if (!best) return null;

  // The Scandinavian three share most short words; the letters settle it.
  if (best === "no" || best === "da" || best === "sv") {
    if (/[äö]/.test(lower)) return "sv";
    if (/[æø]/.test(lower) || best === "da") return /\bhvad\b|\bmig\b/.test(lower) ? "da" : "no";
    if (best === "sv") return "sv";
    return "no";
  }
  // ü/ö/ä outside Scandinavia lean German.
  if (best === "en" && /[äöü]/.test(lower)) return "de";
  return best;
}
