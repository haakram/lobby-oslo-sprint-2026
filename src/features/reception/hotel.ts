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

export const HOTEL = {
  name: "Hotell Nattskift",
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
  ],
} as const satisfies {
  name: "Hotell Nattskift";
  city: "Oslo";
  address: string;
  checkIn: "15:00";
  checkOut: "11:00";
  facts: readonly string[];
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
