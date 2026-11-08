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
 * Classes the small in-browser model names reliably. Anything else (a pillow it calls "vase",
 * "potted plant" or "teddy bear") shows as "Ukjent" until Claude has looked at it.
 */
export const TRUSTED_CLASSES: readonly CocoClass[] = [
  "person",
  "bottle",
  "cup",
  "wine glass",
  "bowl",
  "banana",
  "apple",
  "orange",
  "book",
  "cell phone",
  "laptop",
  "keyboard",
  "mouse",
  "remote",
  "scissors",
  "toothbrush",
  "backpack",
  "handbag",
  "suitcase",
  "chair",
];

const TRUSTED_SET = new Set<string>(TRUSTED_CLASSES);

/** Below this score even a trusted class is shown as "Ukjent". */
export const MIN_LABEL_SCORE = 0.6;

export const UNKNOWN_LABEL = "Ukjent";

/** The bokmål name of a detector class; "Gjenstand" for anything unknown. */
export function cocoLabel(name: string): string {
  return Object.hasOwn(LABELS, name) ? LABELS[name as CocoClass] : "Gjenstand";
}

/**
 * Whether the detector's own class name is worth showing for this box before Claude has answered.
 * A person always is: people are never sent, and the model rarely calls a thing a person.
 */
export function isTrustedLabel(name: string, score: number): boolean {
  if (name === "person") return true;
  return TRUSTED_SET.has(name) && score >= MIN_LABEL_SCORE;
}

/** The free label for a box: its class name when the detector is sure, else "Ukjent". */
export function liveLabel(name: string, score: number): string {
  return isTrustedLabel(name, score) ? cocoLabel(name) : UNKNOWN_LABEL;
}

/** People are never sent to Claude: their box keeps the free "Person" label. Everything else may be. */
export function isSentToClaude(name: string): boolean {
  return name !== "person";
}
