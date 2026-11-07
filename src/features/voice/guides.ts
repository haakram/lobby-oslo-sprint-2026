// Four short work guides for a new worker. The agent explains them out loud in the worker's own
// language; the screen shows them in bokmål. Test data, made up for the demo.

export const GUIDE_STEPS = ["receiving", "picking", "packing", "returns"] as const;

export type GuideStep = (typeof GUIDE_STEPS)[number];

export type Guide = { title: string; steps: readonly string[] };

export const GUIDES: Readonly<Record<GuideStep, Guide>> = Object.freeze({
  receiving: {
    title: "Varemottak",
    steps: [
      "Tell kolliene og sjekk dem mot følgeseddelen.",
      "Se etter skade, og ta bilde av det som er skadet.",
      "Skann eller identifiser hver vare med Øyne.",
      "Sett varen på hyllen som står på kortet.",
      "Kvitter ut leveransen i systemet.",
    ],
  },
  picking: {
    title: "Plukking",
    steps: [
      "Åpne plukklisten og trykk Beste rute.",
      "Gå stoppene i rekkefølgen kartet viser.",
      "Sjekk SKU på hyllen før du tar varen.",
      "Legg varen i kassen og hak den av.",
      "Meld fra med en gang hvis en hylle er tom.",
    ],
  },
  packing: {
    title: "Pakking",
    steps: [
      "Sjekk at alle varene på listen er i kassen.",
      "Legg tunge varer nederst og flasker stående.",
      "Fyll tomrom så ingenting flytter seg.",
      "Lukk kassen og merk den med rom eller ordre.",
    ],
  },
  returns: {
    title: "Retur",
    steps: [
      "Ta imot varen og finn den med Øyne.",
      "Sjekk at den er hel og uåpnet.",
      "Hel vare går tilbake på sin hylle.",
      "Skadet vare går i returkassen på lager 2.",
    ],
  },
});
