// Four short work guides for a new worker. The agent explains them out loud in the worker's own
// language; the screen shows them in bokmål. Test data, made up for the demo. A control a step names
// («Plukkliste», «Plassering», «Vis vei») is one that exists on the screen (jury round 4, the Holio juror).

export const GUIDE_STEPS = ["receiving", "picking", "packing", "returns"] as const;

export type GuideStep = (typeof GUIDE_STEPS)[number];

export type Guide = { title: string; steps: readonly string[] };

export const GUIDES: Readonly<Record<GuideStep, Guide>> = Object.freeze({
  receiving: {
    title: "Varemottak",
    steps: [
      "Tell kolliene og sjekk dem mot følgeseddelen.",
      "Se etter skade, og ta bilde av det som er skadet.",
      "Skann strekkoden. Mangler den, trykk på varen i Øyne.",
      "Sett varen på hyllen kortet viser under «Plassering».",
      "Kvitter ut leveransen i lagersystemet.",
    ],
  },
  picking: {
    title: "Plukking",
    steps: [
      "Åpne Ruter og velg «Plukkliste»: kartet viser den korteste runden.",
      "Gå stoppene i rekkefølgen kartet viser.",
      "Sjekk SKU på hyllen før du tar varen.",
      "Legg varen i kassen og gå til neste stopp.",
      "Meld fra med en gang hvis en hylle er tom.",
    ],
  },
  packing: {
    title: "Pakking",
    steps: [
      "Sjekk at alle varene på listen er i kassen.",
      "Legg tunge varer nederst og flasker stående.",
      "Fyll tomrom så ingenting flytter seg.",
      "Lukk kassen og merk den med ordrenummeret.",
    ],
  },
  returns: {
    title: "Retur",
    steps: [
      "Ta imot varen og finn den med Øyne.",
      "Sjekk at den er hel og uåpnet.",
      "Hel vare går tilbake på sin hylle; «Vis vei» på kortet viser veien.",
      "Skadet vare går på returhylla.",
    ],
  },
});
