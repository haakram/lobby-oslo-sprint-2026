import { GUIDE_STEPS, GUIDES, type Guide, type GuideStep } from "@/features/voice/guides";

/**
 * The four work guides on screen, in the languages a warehouse temp in Norway reads (Holio pain 9,
 * jury round 3, the Holio juror): bokmål from the voice agent's own guides (src/features/voice/guides.ts,
 * one source), and the team's translations into Polish, Ukrainian and English, step for step.
 * TODO(phase-3): have each translation checked by a native speaker before a pilot.
 */

export const GUIDE_LANGUAGES = [
  { code: "nb", label: "Norsk" },
  { code: "pl", label: "Polski" },
  { code: "uk", label: "Українська" },
  { code: "en", label: "English" },
] as const;

export type GuideLanguage = (typeof GUIDE_LANGUAGES)[number]["code"];

const TRANSLATED: Readonly<Record<Exclude<GuideLanguage, "nb">, Readonly<Record<GuideStep, Guide>>>> = {
  pl: {
    receiving: {
      title: "Przyjęcie towaru",
      steps: [
        "Policz paczki i porównaj je z dokumentem dostawy.",
        "Sprawdź, czy nic nie jest uszkodzone, i zrób zdjęcie uszkodzeń.",
        "Zeskanuj albo rozpoznaj każdy towar w Øyne.",
        "Odłóż towar na półkę wskazaną na karcie.",
        "Potwierdź przyjęcie dostawy w systemie.",
      ],
    },
    picking: {
      title: "Kompletacja",
      steps: [
        "Otwórz listę kompletacyjną i naciśnij «Beste rute».",
        "Idź do kolejnych punktów w kolejności pokazanej na mapie.",
        "Sprawdź SKU na półce, zanim weźmiesz towar.",
        "Włóż towar do skrzynki i odhacz go.",
        "Od razu zgłoś, jeśli półka jest pusta.",
      ],
    },
    packing: {
      title: "Pakowanie",
      steps: [
        "Sprawdź, czy wszystkie towary z listy są w skrzynce.",
        "Ciężkie towary kładź na dole, a butelki stawiaj pionowo.",
        "Wypełnij puste miejsca, żeby nic się nie przesuwało.",
        "Zamknij skrzynkę i oznacz ją numerem pokoju lub zamówienia.",
      ],
    },
    returns: {
      title: "Zwroty",
      steps: [
        "Przyjmij towar i znajdź go w Øyne.",
        "Sprawdź, czy jest cały i nieotwarty.",
        "Cały towar wraca na swoją półkę.",
        "Uszkodzony towar trafia do skrzynki zwrotów w magazynie 2.",
      ],
    },
  },
  uk: {
    receiving: {
      title: "Приймання товару",
      steps: [
        "Порахуйте місця й звірте їх із накладною.",
        "Перевірте, чи немає пошкоджень, і сфотографуйте пошкоджене.",
        "Відскануйте або розпізнайте кожен товар в Øyne.",
        "Покладіть товар на полицю, вказану на картці.",
        "Підтвердьте приймання поставки в системі.",
      ],
    },
    picking: {
      title: "Комплектація",
      steps: [
        "Відкрийте список комплектації й натисніть «Beste rute».",
        "Проходьте зупинки в порядку, який показує карта.",
        "Перевірте SKU на полиці, перш ніж брати товар.",
        "Покладіть товар у ящик і позначте його.",
        "Одразу повідомте, якщо полиця порожня.",
      ],
    },
    packing: {
      title: "Пакування",
      steps: [
        "Перевірте, чи всі товари зі списку є в ящику.",
        "Важкі товари кладіть донизу, а пляшки ставте вертикально.",
        "Заповніть порожнечі, щоб нічого не рухалося.",
        "Закрийте ящик і позначте його номером кімнати або замовлення.",
      ],
    },
    returns: {
      title: "Повернення",
      steps: [
        "Прийміть товар і знайдіть його через Øyne.",
        "Перевірте, чи він цілий і нерозпакований.",
        "Цілий товар повертається на свою полицю.",
        "Пошкоджений товар кладіть у ящик для повернень на складі 2.",
      ],
    },
  },
  en: {
    receiving: {
      title: "Receiving",
      steps: [
        "Count the parcels and check them against the delivery note.",
        "Look for damage and take a photo of anything damaged.",
        "Scan or identify each item with Øyne.",
        "Put the item on the shelf shown on the card.",
        "Sign off the delivery in the system.",
      ],
    },
    picking: {
      title: "Picking",
      steps: [
        "Open the pick list and tap «Beste rute» (best route).",
        "Walk the stops in the order the map shows.",
        "Check the SKU on the shelf before you take the item.",
        "Put the item in the box and tick it off.",
        "Report it at once if a shelf is empty.",
      ],
    },
    packing: {
      title: "Packing",
      steps: [
        "Check that every item on the list is in the box.",
        "Put heavy items at the bottom and bottles upright.",
        "Fill empty space so nothing moves.",
        "Close the box and label it with the room or order.",
      ],
    },
    returns: {
      title: "Returns",
      steps: [
        "Take in the item and find it with Øyne.",
        "Check that it is undamaged and unopened.",
        "An undamaged item goes back on its shelf.",
        "A damaged item goes in the returns box in storeroom 2.",
      ],
    },
  },
};

/** The guides in `language`, in work order (receiving, picking, packing, returns). */
export function guidesIn(language: GuideLanguage): { step: GuideStep; guide: Guide }[] {
  const source = language === "nb" ? GUIDES : TRANSLATED[language];
  return GUIDE_STEPS.map((step) => ({ step, guide: source[step] }));
}
