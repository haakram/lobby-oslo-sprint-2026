// The 80 COCO classes EfficientDet-Lite0 detects, in bokmål, so every box has a name at once and for free.
const LABELS = {
  person: "Person",
  bicycle: "Sykkel",
  car: "Bil",
  motorcycle: "Motorsykkel",
  airplane: "Fly",
  bus: "Buss",
  train: "Tog",
  truck: "Lastebil",
  boat: "Båt",
  "traffic light": "Trafikklys",
  "fire hydrant": "Brannhydrant",
  "stop sign": "Stoppskilt",
  "parking meter": "Parkeringsautomat",
  bench: "Benk",
  bird: "Fugl",
  cat: "Katt",
  dog: "Hund",
  horse: "Hest",
  sheep: "Sau",
  cow: "Ku",
  elephant: "Elefant",
  bear: "Bjørn",
  zebra: "Sebra",
  giraffe: "Sjiraff",
  backpack: "Sekk",
  umbrella: "Paraply",
  handbag: "Veske",
  tie: "Slips",
  suitcase: "Koffert",
  frisbee: "Frisbee",
  skis: "Ski",
  snowboard: "Snøbrett",
  "sports ball": "Ball",
  kite: "Drage",
  "baseball bat": "Balltre",
  "baseball glove": "Baseballhanske",
  skateboard: "Skateboard",
  surfboard: "Surfebrett",
  "tennis racket": "Tennisracket",
  bottle: "Flaske",
  "wine glass": "Vinglass",
  cup: "Kopp",
  fork: "Gaffel",
  knife: "Kniv",
  spoon: "Skje",
  bowl: "Bolle",
  banana: "Banan",
  apple: "Eple",
  sandwich: "Smørbrød",
  orange: "Appelsin",
  broccoli: "Brokkoli",
  carrot: "Gulrot",
  "hot dog": "Pølse",
  pizza: "Pizza",
  donut: "Smultring",
  cake: "Kake",
  chair: "Stol",
  couch: "Sofa",
  "potted plant": "Plante",
  bed: "Seng",
  "dining table": "Bord",
  toilet: "Toalett",
  tv: "Skjerm",
  laptop: "Laptop",
  mouse: "Mus",
  remote: "Fjernkontroll",
  keyboard: "Tastatur",
  "cell phone": "Mobil",
  microwave: "Mikrobølgeovn",
  oven: "Stekeovn",
  toaster: "Brødrister",
  sink: "Vask",
  refrigerator: "Kjøleskap",
  book: "Bok",
  clock: "Klokke",
  vase: "Vase",
  scissors: "Saks",
  "teddy bear": "Bamse",
  "hair drier": "Hårføner",
  toothbrush: "Tannbørste",
} as const;

type CocoClass = keyof typeof LABELS;

export const COCO_CLASSES = Object.keys(LABELS) as CocoClass[];

/**
 * Classes worth a Claude call: things a store room or a hotel trolley might hold. People, furniture,
 * vehicles and animals keep their free label and are never sent. Nor are guests' belongings (jury round 2,
 * law): a phone held to an ear or a bag on a shoulder would send part of the person, and a luggage tag or a
 * book cover would be read out. None of them is in the catalogue.
 */
export const PRODUCT_CLASSES: readonly CocoClass[] = [
  "bottle",
  "cup",
  "wine glass",
  "bowl",
  "banana",
  "apple",
  "orange",
  "sandwich",
  "carrot",
  "broccoli",
  "hot dog",
  "pizza",
  "donut",
  "cake",
  "toothbrush",
  "scissors",
  "vase",
];

/** Guests' things: never sent, whether live or on a tap; the box keeps its free name. */
export const BELONGING_CLASSES: readonly CocoClass[] = [
  "cell phone",
  "handbag",
  "backpack",
  "suitcase",
  "book",
  "laptop",
  "keyboard",
  "mouse",
  "remote",
  "teddy bear",
  "umbrella",
  "tie",
];

const PRODUCT_SET = new Set<string>(PRODUCT_CLASSES);
const BELONGING_SET = new Set<string>(BELONGING_CLASSES);

/** The bokmål name of a detector class; "Gjenstand" for anything unknown. */
export function cocoLabel(name: string): string {
  return Object.hasOwn(LABELS, name) ? LABELS[name as CocoClass] : "Gjenstand";
}

export function isProductClass(name: string): boolean {
  return PRODUCT_SET.has(name);
}

export function isBelongingClass(name: string): boolean {
  return BELONGING_SET.has(name);
}
