import { GUIDE_STEPS, GUIDES, type Guide, type GuideStep } from "@/features/voice/guides";

/**
 * The four work guides on screen, in the languages a warehouse temp in Norway reads (Holio pain 9,
 * domain review, round 3): bokmål from the voice agent's own guides (src/features/voice/guides.ts,
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
        "Zeskanuj kod kreskowy. Jeśli go brak, dotknij towaru w Øyne.",
        "Odłóż towar na półkę, którą karta pokazuje w polu «Plassering».",
        "Potwierdź przyjęcie dostawy w systemie magazynowym.",
      ],
    },
    picking: {
      title: "Kompletacja",
      steps: [
        "Otwórz Ruter i wybierz «Plukkliste»: mapa pokazuje najkrótszą trasę.",
        "Idź do kolejnych punktów w kolejności pokazanej na mapie.",
        "Sprawdź SKU na półce, zanim weźmiesz towar.",
        "Włóż towar do skrzynki i idź do następnego punktu.",
        "Od razu zgłoś, jeśli półka jest pusta.",
      ],
    },
    packing: {
      title: "Pakowanie",
      steps: [
        "Sprawdź, czy wszystkie towary z listy są w skrzynce.",
        "Ciężkie towary kładź na dole, a butelki stawiaj pionowo.",
        "Wypełnij puste miejsca, żeby nic się nie przesuwało.",
        "Zamknij skrzynkę i oznacz ją numerem zamówienia.",
      ],
    },
    returns: {
      title: "Zwroty",
      steps: [
        "Przyjmij towar i znajdź go w Øyne.",
        "Sprawdź, czy jest cały i nieotwarty.",
        "Cały towar wraca na swoją półkę; «Vis vei» na karcie pokazuje drogę.",
        "Uszkodzony towar trafia na półkę zwrotów.",
      ],
    },
  },
  uk: {
    receiving: {
      title: "Приймання товару",
      steps: [
        "Порахуйте місця й звірте їх із накладною.",
        "Перевірте, чи немає пошкоджень, і сфотографуйте пошкоджене.",
        "Відскануйте штрихкод. Якщо його немає, торкніться товару в Øyne.",
        "Покладіть товар на полицю, яку картка показує в полі «Plassering».",
        "Підтвердьте приймання поставки в складській системі.",
      ],
    },
    picking: {
      title: "Комплектація",
      steps: [
        "Відкрийте Ruter і виберіть «Plukkliste»: карта показує найкоротший маршрут.",
        "Проходьте зупинки в порядку, який показує карта.",
        "Перевірте SKU на полиці, перш ніж брати товар.",
        "Покладіть товар у ящик і йдіть до наступної зупинки.",
        "Одразу повідомте, якщо полиця порожня.",
      ],
    },
    packing: {
      title: "Пакування",
      steps: [
        "Перевірте, чи всі товари зі списку є в ящику.",
        "Важкі товари кладіть донизу, а пляшки ставте вертикально.",
        "Заповніть порожнечі, щоб нічого не рухалося.",
        "Закрийте ящик і позначте його номером замовлення.",
      ],
    },
    returns: {
      title: "Повернення",
      steps: [
        "Прийміть товар і знайдіть його через Øyne.",
        "Перевірте, чи він цілий і нерозпакований.",
        "Цілий товар повертається на свою полицю; «Vis vei» на картці показує дорогу.",
        "Пошкоджений товар кладіть на полицю повернень.",
      ],
    },
  },
  en: {
    receiving: {
      title: "Receiving",
      steps: [
        "Count the parcels and check them against the delivery note.",
        "Look for damage and take a photo of anything damaged.",
        "Scan the barcode. If there is none, tap the item in Øyne.",
        "Put the item on the shelf the card shows under «Plassering» (location).",
        "Sign off the delivery in the warehouse system.",
      ],
    },
    picking: {
      title: "Picking",
      steps: [
        "Open Ruter and choose «Plukkliste» (pick list): the map shows the shortest round.",
        "Walk the stops in the order the map shows.",
        "Check the SKU on the shelf before you take the item.",
        "Put the item in the box and walk to the next stop.",
        "Report it at once if a shelf is empty.",
      ],
    },
    packing: {
      title: "Packing",
      steps: [
        "Check that every item on the list is in the box.",
        "Put heavy items at the bottom and bottles upright.",
        "Fill empty space so nothing moves.",
        "Close the box and label it with the order number.",
      ],
    },
    returns: {
      title: "Returns",
      steps: [
        "Take in the item and find it with Øyne.",
        "Check that it is undamaged and unopened.",
        "An undamaged item goes back on its shelf; «Vis vei» (show the way) on the card shows the way.",
        "A damaged item goes on the returns shelf.",
      ],
    },
  },
};

/** The guides in `language`, in work order (receiving, picking, packing, returns). */
export function guidesIn(language: GuideLanguage): { step: GuideStep; guide: Guide }[] {
  const source = language === "nb" ? GUIDES : TRANSLATED[language];
  return GUIDE_STEPS.map((step) => ({ step, guide: source[step] }));
}

/**
 * The pick list's own words in the guide language (Holio pain 9 inside the flow, domain review, round
 * 5): the stop list, its buttons, the empty list and Angre. The rest of the screen (the route's figures
 * for the manager, the tabs, the product names from the catalogue) stays in bokmål.
 * TODO(phase-3): checked by a native speaker, as the guides.
 */
export type PicklistWords = {
  heading: string;
  start: string;
  floor: (floor: number) => string;
  fromStart: string;
  fromStop: (stop: number) => string;
  viaLift: string;
  viaStairs: string;
  backToStart: string;
  remove: string;
  removeLabel: (name: string) => string;
  addMore: string;
  empty: string;
  emptied: (count: number) => string;
  undo: string;
  undoLabel: string;
  emptyTitle: string;
  emptyBody: string;
  openEyes: string;
  seeList: string;
};

export const PICKLIST_WORDS: Readonly<Record<GuideLanguage, PicklistWords>> = {
  nb: {
    heading: "Plukkrekkefølge",
    start: "Start",
    floor: (floor) => `${floor}. etasje`,
    fromStart: "fra start",
    fromStop: (stop) => `fra stopp ${stop}`,
    viaLift: "via heis",
    viaStairs: "via trapp",
    backToStart: "Tilbake til start",
    remove: "Fjern",
    removeLabel: (name) => `Fjern ${name}`,
    addMore: "Legg til flere varer",
    empty: "Tøm plukklisten",
    emptied: (count) => (count === 1 ? "Plukklisten er tømt for 1 vare." : `Plukklisten er tømt for ${count} varer.`),
    undo: "Angre",
    undoLabel: "Angre: legg varene tilbake",
    emptyTitle: "Plukklisten er tom",
    emptyBody: "Legg til varer fra Øyne.",
    openEyes: "Åpne Øyne",
    seeList: "Se plukklisten",
  },
  pl: {
    heading: "Kolejność kompletacji",
    start: "Start",
    // "poziom", not "piętro": a Norwegian 1. etasje is the ground floor, a Polish 1. piętro is not.
    floor: (floor) => `poziom ${floor}`,
    fromStart: "od startu",
    fromStop: (stop) => `od punktu ${stop}`,
    viaLift: "windą",
    viaStairs: "schodami",
    backToStart: "Powrót do startu",
    remove: "Usuń",
    removeLabel: (name) => `Usuń ${name}`,
    addMore: "Dodaj więcej towarów",
    empty: "Wyczyść listę",
    emptied: (count) => `Lista wyczyszczona. Towary: ${count}.`,
    undo: "Cofnij",
    undoLabel: "Cofnij: przywróć towary",
    emptyTitle: "Lista kompletacji jest pusta",
    emptyBody: "Dodaj towary z Øyne.",
    openEyes: "Otwórz Øyne",
    seeList: "Zobacz listę kompletacji",
  },
  uk: {
    heading: "Порядок комплектації",
    start: "Старт",
    floor: (floor) => `поверх ${floor}`,
    fromStart: "від старту",
    fromStop: (stop) => `від зупинки ${stop}`,
    viaLift: "ліфтом",
    viaStairs: "сходами",
    backToStart: "Назад до старту",
    remove: "Видалити",
    removeLabel: (name) => `Видалити ${name}`,
    addMore: "Додати ще товари",
    empty: "Очистити список",
    emptied: (count) => `Список очищено. Товарів: ${count}.`,
    undo: "Скасувати",
    undoLabel: "Скасувати: повернути товари",
    emptyTitle: "Список комплектації порожній",
    emptyBody: "Додайте товари з Øyne.",
    openEyes: "Відкрити Øyne",
    seeList: "Переглянути список комплектації",
  },
  en: {
    heading: "Pick order",
    start: "Start",
    floor: (floor) => `floor ${floor}`,
    fromStart: "from start",
    fromStop: (stop) => `from stop ${stop}`,
    viaLift: "by lift",
    viaStairs: "by stairs",
    backToStart: "Back to start",
    remove: "Remove",
    removeLabel: (name) => `Remove ${name}`,
    addMore: "Add more items",
    empty: "Clear the pick list",
    emptied: (count) => (count === 1 ? "Pick list cleared: 1 item." : `Pick list cleared: ${count} items.`),
    undo: "Undo",
    undoLabel: "Undo: put the items back",
    emptyTitle: "The pick list is empty",
    emptyBody: "Add items from Øyne.",
    openEyes: "Open Øyne",
    seeList: "See the pick list",
  },
};

/** A stored value read back as a guide language; anything else is bokmål. */
export function guideLanguageOf(raw: unknown): GuideLanguage {
  return GUIDE_LANGUAGES.some(({ code }) => code === raw) ? (raw as GuideLanguage) : "nb";
}
