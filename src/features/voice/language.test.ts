import { describe, expect, it } from "vitest";
import { detectLanguage, languageLabel } from "./language";

describe("detectLanguage", () => {
  it.each([
    ["Gdzie mam odłożyć mydło?", "pl"],
    ["Де лежить шампунь?", "uk"],
    ["Где лежит шампунь?", "ru"],
    ["Hvor skal såpa stå?", "no"],
    ["Hvor ligger tannkremen, og hvor mange skal jeg plukke?", "no"],
    ["Where does the soap go?", "en"],
    ["Wo kommt die Seife hin? Über dem Regal?", "de"],
    ["¿Dónde va el jabón?", "es"],
    ["Kur dėti muilą?", "lt"],
    ["أين أضع الصابون؟", "ar"],
    ["Var ska tvålen stå?", "sv"],
  ])("guesses %s as %s", (text, code) => {
    expect(detectLanguage(text)).toBe(code);
  });

  it("returns null when there is too little to go on", () => {
    expect(detectLanguage("")).toBeNull();
    expect(detectLanguage("FT-1001")).toBeNull();
    expect(detectLanguage("ok")).toBeNull();
  });
});

describe("languageLabel", () => {
  it("names a language in bokmål", () => {
    expect(languageLabel("pl")).toBe("Polsk");
    expect(languageLabel("no")).toBe("Norsk");
    expect(languageLabel("en")).toBe("Engelsk");
  });
});
