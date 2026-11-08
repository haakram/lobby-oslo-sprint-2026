export type RoomTypeId = "enkeltrom" | "dobbeltrom" | "familierom" | "suite";

export const ROOM_TYPE_IDS: readonly [RoomTypeId, ...RoomTypeId[]] = [
  "enkeltrom",
  "dobbeltrom",
  "familierom",
  "suite",
];

export type RoomType = {
  id: RoomTypeId;
  name: string;
  englishName: string;
  maxGuests: number;
  rooms: number;
  /** Price per night on the booking sites, NOK. */
  otaPrice: number;
  description: string;
};

export const ROOM_TYPES: readonly RoomType[] = [
  {
    id: "enkeltrom",
    name: "Enkeltrom",
    englishName: "Single room",
    maxGuests: 1,
    rooms: 10,
    otaPrice: 1290,
    description: "Rolig rom med enkeltseng, skrivebord og eget bad.",
  },
  {
    id: "dobbeltrom",
    name: "Dobbeltrom",
    englishName: "Double room",
    maxGuests: 2,
    rooms: 20,
    otaPrice: 1690,
    description: "Rom med dobbeltseng, sittegruppe og eget bad.",
  },
  {
    id: "familierom",
    name: "Familierom",
    englishName: "Family room",
    maxGuests: 4,
    rooms: 6,
    otaPrice: 2390,
    description: "Stort rom med dobbeltseng og køyeseng, plass til fire.",
  },
  {
    id: "suite",
    name: "Suite",
    englishName: "Suite",
    maxGuests: 2,
    rooms: 2,
    otaPrice: 3490,
    description: "Suite med eget stuerom, badekar og utsikt over byen.",
  },
];

/** The AI receptionist's name: she says it, and that she is a virtual (AI) assistant. */
export const RECEPTIONIST_NAME = "Maria";

export const HOTEL = {
  name: "Lobby",
  city: "Oslo",
  address: "Nattergalveien 12, 0150 Oslo",
  checkIn: "15:00",
  checkOut: "11:00",
  facts: [
    "Frokost serveres 06:30–10:30 og koster 245 kr per person.",
    "Parkering koster 250 kr per natt.",
    "Kjæledyr er tillatt i noen rom for 150 kr per natt.",
    "Gratis Wi-Fi i hele hotellet.",
    "Resepsjonen er betjent 07:00–23:00.",
    "Flytoget går fra Oslo S til flyplassen på under 25 minutter, og det er fem minutters gange til stasjonen.",
    "Treningsrommet i kjelleren er åpent hele døgnet for gjester.",
    "Inngangen er trinnfri, og heisen går til alle etasjer. To dobbeltrom er tilrettelagt for rullestol, med bred dør og dusj uten terskel.",
    "Førerhunder og andre assistansehunder er alltid velkomne, uten tillegg.",
  ],
  privacy: {
    controller: "Lobby Hotell AS",
    email: "personvern@lobby.example",
    retentionDays: 30,
    // Bokføringsloven § 13: an invoice or receipt for a stay is kept for 5 years after the financial year.
    accountingYears: 5,
    processor: "ElevenLabs",
  },
} as const satisfies {
  name: "Lobby";
  city: "Oslo";
  address: string;
  checkIn: "15:00";
  checkOut: "11:00";
  facts: readonly string[];
  /** Who answers for the callers' personal data, where to ask, and how long call records are kept. */
  privacy: { controller: string; email: string; retentionDays: number; accountingYears: number; processor: string };
};

export const DIRECT_DISCOUNT = 0.1;
export const BREAKFAST_PRICE = 245;

export function directPrice(room: RoomType): number {
  return Math.round(room.otaPrice * (1 - DIRECT_DISCOUNT));
}

const ALIASES: Record<string, RoomTypeId> = {
  enkel: "enkeltrom",
  single: "enkeltrom",
  dobbel: "dobbeltrom",
  double: "dobbeltrom",
  familie: "familierom",
  family: "familierom",
  suite: "suite",
};

function fold(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function findRoomType(input: string): RoomType | undefined {
  const key = fold(input);
  if (!key) return undefined;
  return ROOM_TYPES.find(
    (r) =>
      r.id === key ||
      fold(r.name) === key ||
      fold(r.englishName) === key ||
      ALIASES[key] === r.id,
  );
}

/**
 * Haggling. The receptionist may go down in fixed steps from the direct price, never further: what a
 * caller claims another site charges never sets the price (they could say anything). Step 0 is the
 * direct price; step 1 adds a perk; step 2 takes 5 % off; step 3, the last offer, 10 % off.
 */
export const DISCOUNT_STEPS = [0, 0, 0.05, 0.1] as const;
export const LAST_DISCOUNT_STEP = DISCOUNT_STEPS.length - 1;
/** The largest discount off the direct price the hotel allows. */
export const MAX_EXTRA_DISCOUNT = DISCOUNT_STEPS[LAST_DISCOUNT_STEP];

/** Free extras the receptionist may add from step 1. */
export const PERKS = {
  late_checkout: "Sen utsjekk kl. 13:00",
  free_parking: "Gratis parkering",
} as const;
export type Perk = keyof typeof PERKS;
export const PERK_IDS = Object.keys(PERKS) as Perk[];

/** The price per night at a discount step: never below the hotel's floor. */
export function offerPrice(room: RoomType, step: number): number {
  const index = Math.min(Math.max(Math.trunc(step), 0), LAST_DISCOUNT_STEP);
  return Math.round(directPrice(room) * (1 - DISCOUNT_STEPS[index]));
}

/** The lowest price per night the hotel will ever take for a room. */
export function floorPrice(room: RoomType): number {
  return offerPrice(room, LAST_DISCOUNT_STEP);
}
