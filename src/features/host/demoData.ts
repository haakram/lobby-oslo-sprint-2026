import { addDays, daysBetween, osloToday } from "@/features/reception/dates";

/**
 * TODO(phase-3): replace with the host's real channels: the Airbnb / Booking.com calendars and inbox
 * (iCal or a channel manager's API), the smart lock's events and the cleaner's app.
 *
 * Demo data for one Airbnb host with four short-let apartments in Oslo. Invented guests and staff,
 * never real people. Dates are relative to today and the steps of the day to the Oslo clock, so the
 * screen always shows a plausible day; the same `now` always gives the same day (no randomness).
 */

export type ApartmentId = "lokka" | "frogner" | "toyen" | "bjorvika";

export type Apartment = {
  id: ApartmentId;
  name: string;
  /** The Oslo neighbourhood. */
  area: string;
  layout: string;
  /** Price per night, NOK. */
  nightly: number;
  rating: number;
  reviews: number;
};

export const APARTMENTS: readonly Apartment[] = [
  { id: "lokka", name: "Grünerløkka-leiligheten", area: "Grünerløkka", layout: "2-roms · 4 gjester", nightly: 1290, rating: 4.93, reviews: 86 },
  { id: "frogner", name: "Loftet på Frogner", area: "Frogner", layout: "3-roms · 5 gjester", nightly: 1850, rating: 4.96, reviews: 52 },
  { id: "toyen", name: "Tøyen-studioet", area: "Tøyen", layout: "Studio · 2 gjester", nightly: 890, rating: 4.88, reviews: 117 },
  { id: "bjorvika", name: "Sjøutsikt i Bjørvika", area: "Bjørvika", layout: "2-roms · 4 gjester", nightly: 1690, rating: 4.95, reviews: 39 },
];

export type Lang = "nb" | "en" | "de" | "it" | "sv" | "fr" | "es" | "nl";

export const LANG_NAME: Record<Lang, string> = {
  nb: "norsk",
  en: "engelsk",
  de: "tysk",
  it: "italiensk",
  sv: "svensk",
  fr: "fransk",
  es: "spansk",
  nl: "nederlandsk",
};

export type Channel = "Airbnb" | "Booking.com" | "Direkte";

export type Stay = {
  id: string;
  apartment: ApartmentId;
  guest: string;
  guests: number;
  lang: Lang;
  /** Arrival and departure, YYYY-MM-DD. */
  from: string;
  to: string;
  channel: Channel;
  /** What the host is paid for the stay, NOK. */
  payout: number;
};

/** The people around the apartments (invented). */
export const CLEANER = "Amira Haddad";
const CLEANER_FIRST = "Amira";

// ---------------------------------------------------------------------------------------------------
// Bookings: a few fixed stays around today (the ones the day's story is about), then a deterministic
// fill backwards and forwards so the calendar and the month's figures have a believable rhythm.

type Anchor = { apartment: ApartmentId; guest: string; guests: number; lang: Lang; from: number; to: number; channel: Channel };

const ANCHORS: readonly Anchor[] = [
  { apartment: "lokka", guest: "Marco Bianchi", guests: 2, lang: "it", from: -3, to: 0, channel: "Airbnb" },
  { apartment: "lokka", guest: "Lukas Becker", guests: 2, lang: "de", from: 0, to: 3, channel: "Airbnb" },
  { apartment: "frogner", guest: "Sofia Marino", guests: 3, lang: "it", from: -2, to: 2, channel: "Airbnb" },
  { apartment: "frogner", guest: "Noah Williams", guests: 4, lang: "en", from: 2, to: 5, channel: "Booking.com" },
  { apartment: "toyen", guest: "Emma Johansson", guests: 1, lang: "sv", from: -2, to: 0, channel: "Airbnb" },
  { apartment: "toyen", guest: "Aiko Tanaka", guests: 2, lang: "en", from: 1, to: 4, channel: "Airbnb" },
  { apartment: "bjorvika", guest: "Pierre Laurent", guests: 2, lang: "fr", from: -4, to: -1, channel: "Airbnb" },
  { apartment: "bjorvika", guest: "Familien Aas", guests: 4, lang: "nb", from: 1, to: 5, channel: "Direkte" },
];

const POOL: ReadonlyArray<{ guest: string; guests: number; lang: Lang }> = [
  { guest: "Clara Jensen", guests: 2, lang: "en" },
  { guest: "Mateo García", guests: 2, lang: "es" },
  { guest: "Hanna Lindgren", guests: 1, lang: "sv" },
  { guest: "Jonas Weber", guests: 3, lang: "de" },
  { guest: "Thea Kristiansen", guests: 2, lang: "nb" },
  { guest: "Lucas Moreau", guests: 2, lang: "fr" },
  { guest: "Sanne de Vries", guests: 2, lang: "nl" },
  { guest: "Oliver Hughes", guests: 4, lang: "en" },
  { guest: "Giulia Romano", guests: 2, lang: "it" },
  { guest: "Erik Solheim", guests: 1, lang: "nb" },
  { guest: "Maya Cohen", guests: 3, lang: "en" },
  { guest: "Felix Braun", guests: 2, lang: "de" },
  { guest: "Lina Haug", guests: 2, lang: "nb" },
  { guest: "Arjun Mehta", guests: 3, lang: "en" },
  { guest: "Sophie Martin", guests: 2, lang: "fr" },
  { guest: "Nils Bergström", guests: 1, lang: "sv" },
  { guest: "Anna Kowalska", guests: 2, lang: "en" },
  { guest: "Tom Fischer", guests: 4, lang: "de" },
  { guest: "Inês Costa", guests: 2, lang: "es" },
  { guest: "Freya Nilsen", guests: 3, lang: "nb" },
];

const LENGTHS = [3, 2, 4, 2, 3, 5, 2, 3, 4, 2];
const GAPS = [0, 1, 0, 0, 0, 2, 0, 1, 0, 0];
const CHANNELS: readonly Channel[] = ["Airbnb", "Airbnb", "Booking.com", "Airbnb", "Direkte", "Airbnb"];

/** How far the fill reaches, in days from today: the whole month either side, whatever today is. */
const REACH = 45;

/** Every stay from about six weeks back to six weeks ahead, per apartment, ordered by arrival. */
export function staysAround(today: string): Stay[] {
  const all: Stay[] = [];
  APARTMENTS.forEach((apartment, a) => {
    const anchors = ANCHORS.filter((anchor) => anchor.apartment === apartment.id);
    const make = (seed: { guest: string; guests: number; lang: Lang; channel: Channel }, from: number, to: number) => ({
      id: `${apartment.id}-${from}`,
      apartment: apartment.id,
      guest: seed.guest,
      guests: seed.guests,
      lang: seed.lang,
      from: addDays(today, from),
      to: addDays(today, to),
      channel: seed.channel,
      payout: (to - from) * apartment.nightly,
    });
    const stays = anchors.map((anchor) => make(anchor, anchor.from, anchor.to));
    // Backwards from the first fixed stay.
    let end = Math.min(...anchors.map((anchor) => anchor.from));
    for (let i = 0; end > -REACH; i += 1) {
      end -= GAPS[(i + a * 3) % GAPS.length];
      const length = LENGTHS[(i + a * 2) % LENGTHS.length];
      const seed = POOL[(a * 5 + i + 10) % POOL.length];
      stays.push(make({ ...seed, channel: CHANNELS[(i + a) % CHANNELS.length] }, end - length, end));
      end -= length;
    }
    // Forwards from the last fixed stay.
    let start = Math.max(...anchors.map((anchor) => anchor.to));
    for (let i = 0; start < REACH; i += 1) {
      start += GAPS[(i + a * 5 + 2) % GAPS.length];
      const length = LENGTHS[(i + a * 3 + 1) % LENGTHS.length];
      // Each apartment starts on its own stretch of the pool, so nobody books two places at once.
      const seed = POOL[(a * 5 + i) % POOL.length];
      stays.push(make({ ...seed, channel: CHANNELS[(i + a + 2) % CHANNELS.length] }, start, start + length));
      start += length;
    }
    all.push(...stays.sort((x, y) => x.from.localeCompare(y.from)));
  });
  return all;
}

// ---------------------------------------------------------------------------------------------------
// Today's turnovers: check-out, the robot vacuum, the cleaner, the next guest. Minutes after midnight.

export type HandlerKind = "renholder" | "robot" | "automatikk";
export type StepState = "done" | "active" | "planned";

export type Step = {
  id: string;
  apartment: ApartmentId;
  title: string;
  /** The time the step is known by ("11:00" for check-out). */
  at: string;
  start: number;
  end: number;
  handler: { kind: HandlerKind; name: string };
  text: Record<StepState, string>;
};

const hm = (hours: number, minutes = 0) => hours * 60 + minutes;

export type Turnover = {
  apartment: ApartmentId;
  /** The check-out time promised, and when the departing guest actually left (the smart lock). */
  checkOutBy: number;
  checkedOutAt: number | null;
  cleaning: { start: number; end: number } | null;
  /** When the arriving guest let themselves in, or null if nobody arrives today. */
  checkedInAt: number | null;
  /** The check-in time promised to the arriving guest. */
  checkInFrom: number;
  /** Minutes after midnight, day offset: when the lockbox code went (or goes) to the next guest. */
  codeSent: { day: number; at: number };
};

const TURNOVERS: readonly Turnover[] = [
  { apartment: "lokka", checkOutBy: hm(11), checkedOutAt: hm(10, 42), cleaning: { start: hm(11, 30), end: hm(12, 58) }, checkedInAt: hm(15, 12), checkInFrom: hm(15), codeSent: { day: -1, at: hm(18) } },
  { apartment: "toyen", checkOutBy: hm(10), checkedOutAt: hm(9, 48), cleaning: { start: hm(13, 15), end: hm(14, 40) }, checkedInAt: null, checkInFrom: hm(15), codeSent: { day: 0, at: hm(18) } },
];

function stepsFor(turnover: Turnover, stays: Stay[], today: string): Step[] {
  const leaving = stays.find((stay) => stay.apartment === turnover.apartment && stay.to === today);
  const arriving = stays.find((stay) => stay.apartment === turnover.apartment && stay.from === today);
  const next = stays.find((stay) => stay.apartment === turnover.apartment && stay.from > today);
  const id = turnover.apartment;
  const steps: Step[] = [];
  if (leaving && turnover.checkedOutAt !== null) {
    const first = firstName(leaving.guest);
    steps.push({
      id: `${id}-ut`,
      apartment: id,
      title: "Utsjekk",
      at: clock(turnover.checkOutBy),
      start: turnover.checkedOutAt,
      end: turnover.checkedOutAt,
      handler: { kind: "automatikk", name: "Smartlåsen" },
      text: {
        planned: `${first} sjekker ut innen ${clock(turnover.checkOutBy)}. Påminnelse går ut 08:00.`,
        active: `${first} sjekker ut nå.`,
        done: `${first} sjekket ut ${clock(turnover.checkedOutAt)}. Smartlåsen låste døren.`,
      },
    });
  }
  if (id === "lokka" && turnover.checkedOutAt !== null) {
    const start = turnover.checkedOutAt + 23;
    steps.push({
      id: `${id}-robot`,
      apartment: id,
      title: "Støvsuging",
      at: clock(start),
      start,
      end: start + 25,
      handler: { kind: "robot", name: "Robotstøvsugeren" },
      text: {
        planned: "Starter av seg selv når døren er låst.",
        active: "Støvsuger nå. Startet av seg selv da døren ble låst.",
        done: `Ferdig ${clock(start + 25)}. Startet av seg selv da døren ble låst.`,
      },
    });
  }
  if (turnover.cleaning) {
    const { start, end } = turnover.cleaning;
    const extra = id === "toyen" ? " Kaffe og papir er fylt på." : " 14 bilder lastet opp.";
    steps.push({
      id: `${id}-vask`,
      apartment: id,
      title: "Rengjøring",
      at: clock(start),
      start,
      end,
      handler: { kind: "renholder", name: CLEANER },
      text: {
        planned: `${CLEANER_FIRST} kommer ${clock(start)}, ferdig ca. ${clock(roundUp(end))}.`,
        active: `${CLEANER_FIRST} vasker nå, ferdig ca. ${clock(roundUp(end))}.`,
        done: `${CLEANER_FIRST} var ferdig ${clock(end)}.${extra}`,
      },
    });
  }
  if (arriving && turnover.checkedInAt !== null) {
    const first = firstName(arriving.guest);
    steps.push({
      id: `${id}-inn`,
      apartment: id,
      title: "Innsjekk",
      at: clock(turnover.checkInFrom),
      start: turnover.checkedInAt,
      end: turnover.checkedInAt,
      handler: { kind: "automatikk", name: "Kode til nøkkelboksen" },
      text: {
        planned: `${arriving.guest}, ${arriving.guests} gjester. Koden ble sendt ${codeWord(turnover.codeSent)}.`,
        active: `${first} er på vei inn.`,
        done: `${first} sjekket inn ${clock(turnover.checkedInAt)}. Koden virket.`,
      },
    });
  } else if (!arriving && next) {
    const at = turnover.codeSent.at;
    steps.push({
      id: `${id}-kode`,
      apartment: id,
      title: "Kode til neste gjest",
      at: clock(at),
      start: at,
      end: at,
      handler: { kind: "automatikk", name: "Lobby" },
      text: {
        planned: `${next.guest} kommer ${dayWord(today, next.from)} ${clock(turnover.checkInFrom)}. Koden sendes ${clock(at)}.`,
        active: `Sender koden til ${firstName(next.guest)}.`,
        done: `Koden er sendt til ${firstName(next.guest)}, som kommer ${dayWord(today, next.from)} ${clock(turnover.checkInFrom)}.`,
      },
    });
  }
  return steps;
}

export function stepState(step: Step, minute: number): StepState {
  if (minute >= step.end) return "done";
  if (minute >= step.start) return "active";
  return "planned";
}

// ---------------------------------------------------------------------------------------------------
// The status of each apartment right now.

export type ApartmentStatus = "klar" | "gjest-inne" | "rengjores" | "ny-gjest";

export const STATUS_WORD: Record<ApartmentStatus, string> = {
  klar: "Klar",
  "gjest-inne": "Gjest inne",
  rengjores: "Rengjøres",
  "ny-gjest": "Ny gjest i dag",
};

export type Guard = { id: "rengjort" | "kode"; ok: boolean; pending: boolean; word: string };

export type ApartmentNow = {
  apartment: Apartment;
  status: ApartmentStatus;
  /** One line under the status: who is there, who comes next, who is cleaning. */
  line: string;
  /** For a guest arriving today: is it cleaned before they come, and did the lockbox code go out? */
  guards: Guard[];
};

/**
 * The two things that must hold before a guest arrives: the apartment is cleaned before check-in, and
 * the lockbox code has gone out. `ok: false` is the worst case for a host; it goes to the bell as an
 * action item, loudest first.
 */
export function guardsFor(turnover: Turnover, minute: number): Guard[] {
  const codeSent = turnover.codeSent.day < 0 || minute >= turnover.codeSent.at;
  const codeInTime = turnover.codeSent.day < 0 || turnover.codeSent.at <= turnover.checkInFrom;
  return [
    cleaningGuard(turnover.cleaning, turnover.checkInFrom, minute),
    {
      id: "kode",
      ok: codeInTime,
      pending: codeInTime && !codeSent,
      word: !codeInTime ? "Koden er ikke sendt" : codeSent ? `Kode sendt ${codeWord(turnover.codeSent)}` : `Kode sendes ${clock(turnover.codeSent.at)}`,
    },
  ];
}

function cleaningGuard(cleaning: Turnover["cleaning"], checkInFrom: number, minute: number): Guard {
  if (!cleaning || cleaning.end > checkInFrom) return { id: "rengjort", ok: false, pending: false, word: "Ikke rengjort før innsjekk" };
  if (minute >= cleaning.end) return { id: "rengjort", ok: true, pending: false, word: `Rengjort ${clock(cleaning.end)}` };
  return { id: "rengjort", ok: true, pending: true, word: minute >= cleaning.start ? "Rengjøres nå" : `Rengjøring ${clock(cleaning.start)}` };
}

function apartmentNow(apartment: Apartment, stays: Stay[], today: string, minute: number): ApartmentNow {
  const mine = stays.filter((stay) => stay.apartment === apartment.id);
  const staying = mine.find((stay) => stay.from < today && stay.to > today);
  const leaving = mine.find((stay) => stay.to === today);
  const arriving = mine.find((stay) => stay.from === today);
  const next = mine.find((stay) => stay.from > today);
  const turnover = TURNOVERS.find((entry) => entry.apartment === apartment.id);
  const checkedOut = !leaving || (turnover?.checkedOutAt != null && minute >= turnover.checkedOutAt);
  const cleaned = !turnover?.cleaning || minute >= turnover.cleaning.end;

  if (staying) {
    return { apartment, status: "gjest-inne", line: `${staying.guest} · reiser ${dayWord(today, staying.to)}`, guards: [] };
  }
  if (arriving && turnover) {
    const checkedIn = turnover.checkedInAt !== null && minute >= turnover.checkedInAt;
    if (checkedIn) return { apartment, status: "gjest-inne", line: `${arriving.guest} · reiser ${dayWord(today, arriving.to)}`, guards: [] };
    return {
      apartment,
      status: "ny-gjest",
      line: `${arriving.guest} kommer ${clock(turnover.checkInFrom)} · ${arriving.guests} gjester`,
      guards: guardsFor(turnover, minute),
    };
  }
  if (leaving && !checkedOut) {
    return { apartment, status: "gjest-inne", line: `${leaving.guest} · reiser i dag innen ${clock(turnover?.checkOutBy ?? hm(11))}`, guards: [] };
  }
  if (leaving && !cleaned && turnover?.cleaning) {
    const now = minute >= turnover.cleaning.start;
    return {
      apartment,
      status: "rengjores",
      line: now ? `${CLEANER_FIRST} vasker nå, ferdig ca. ${clock(roundUp(turnover.cleaning.end))}` : `${CLEANER_FIRST} kommer ${clock(turnover.cleaning.start)}`,
      guards: [],
    };
  }
  return {
    apartment,
    status: "klar",
    line: next ? `Neste gjest ${dayWord(today, next.from)} · ${next.guest}` : "Ingen bookinger de neste ukene",
    guards: [],
  };
}

// ---------------------------------------------------------------------------------------------------
// Guest messages: what came in, translated, and what was sent back (mostly by the auto-replies).

export type AutoTopic = "kode" | "wifi" | "utsjekk" | "takk" | "praktisk";

export const AUTO_TOPICS: ReadonlyArray<{ id: AutoTopic; name: string; when: string; perStay: number }> = [
  { id: "kode", name: "Kode til nøkkelboksen", when: "Kl. 18:00 dagen før innsjekk", perStay: 1 },
  { id: "wifi", name: "Wifi og husregler", when: "Ved innsjekk, og når gjesten spør", perStay: 1 },
  { id: "utsjekk", name: "Utsjekkpåminnelse", when: "Kl. 08:00 på utsjekkdagen", perStay: 1 },
  { id: "takk", name: "Takk og anmeldelse", when: "Etter utsjekk", perStay: 1 },
  { id: "praktisk", name: "Praktiske spørsmål", when: "Parkering, bagasje, barneseng: svar fra boligens egen info", perStay: 0.6 },
];

export type Reply =
  | { kind: "auto"; topic: AutoTopic; minutesAfter: number; text: string }
  | { kind: "waiting"; suggestion: string; accept: string; decline: string };

export type Thread = {
  id: string;
  apartment: ApartmentId;
  guest: string;
  lang: Lang;
  minutesAgo: number;
  /** As the guest wrote it. */
  original: string;
  /** In Norwegian (the same as `original` when the guest wrote Norwegian). */
  text: string;
  reply: Reply;
};

const THREADS: readonly Thread[] = [
  {
    id: "t-sofia-utsjekk",
    apartment: "frogner",
    guest: "Sofia Marino",
    lang: "it",
    minutesAgo: 24,
    original: "Ciao! Possiamo lasciare l'appartamento alle 13 martedì? Il nostro volo parte alle 17.",
    text: "Hei! Kan vi forlate leiligheten klokka 13 på tirsdag? Flyet vårt går 17.",
    reply: {
      kind: "waiting",
      suggestion: `Lobby foreslår å si ja: neste gjest kommer 16:00, og ${CLEANER_FIRST} rekker å vaske fra 13:15.`,
      accept: "Ja, det går fint å sjekke ut 13:00. God tur hjem!",
      decline: "Dessverre kommer neste gjest tidlig. Utsjekk er 11:00, men dere kan sette fra dere bagasjen i gangen til 13:00.",
    },
  },
  {
    id: "t-lukas-bagasje",
    apartment: "lokka",
    guest: "Lukas Becker",
    lang: "de",
    minutesAgo: 38,
    original: "Hallo! Wir landen um 14:10. Können wir die Koffer schon früher abstellen?",
    text: "Hei! Vi lander 14:10. Kan vi sette fra oss koffertene tidligere?",
    reply: { kind: "auto", topic: "praktisk", minutesAfter: 1, text: "Ja. Leiligheten er klar fra 13:00, og koden til nøkkelboksen virker fra da. Velkommen!" },
  },
  {
    id: "t-sofia-wifi",
    apartment: "frogner",
    guest: "Sofia Marino",
    lang: "it",
    minutesAgo: 112,
    original: "Qual è la password del wifi? Grazie!",
    text: "Hva er passordet til wifi? Takk!",
    reply: { kind: "auto", topic: "wifi", minutesAfter: 1, text: "Nettet heter «Loftet», passordet er fjordlys2026. Det står også på kortet ved kjøleskapet." },
  },
  {
    id: "t-emma-takk",
    apartment: "toyen",
    guest: "Emma Johansson",
    lang: "sv",
    minutesAgo: 186,
    original: "Tack för en jättefin vistelse! Nyckeln ligger i boxen.",
    text: "Takk for et kjempefint opphold! Nøkkelen ligger i boksen.",
    reply: { kind: "auto", topic: "takk", minutesAfter: 2, text: "Takk selv, Emma! God tur hjem. Vi blir glade for en anmeldelse når du har tid." },
  },
  {
    id: "t-aas-barneseng",
    apartment: "bjorvika",
    guest: "Familien Aas",
    lang: "nb",
    minutesAgo: 305,
    original: "Hei! Har dere barneseng? Vi kommer med en på ett år.",
    text: "Hei! Har dere barneseng? Vi kommer med en på ett år.",
    reply: { kind: "auto", topic: "praktisk", minutesAfter: 1, text: `Ja, barneseng og barnestol står i boden. ${CLEANER_FIRST} setter dem fram før dere kommer.` },
  },
  {
    id: "t-aiko-parkering",
    apartment: "toyen",
    guest: "Aiko Tanaka",
    lang: "en",
    minutesAgo: 540,
    original: "Hi! Is there somewhere to park near the studio?",
    text: "Hei! Er det et sted å parkere i nærheten av studioet?",
    reply: { kind: "auto", topic: "praktisk", minutesAfter: 1, text: "Ja, det er et parkeringshus tre minutter unna, rundt 250 kr per døgn. Veibeskrivelsen er sendt." },
  },
];

// ---------------------------------------------------------------------------------------------------
// What the automation did over the last day, beyond the replies.

type LogSeed = { day: number; at: number; apartment: ApartmentId | null; text: string; kind: HandlerKind };

const LOG: readonly LogSeed[] = [
  { day: -1, at: hm(18), apartment: "lokka", text: "Kode til nøkkelboksen sendt til Lukas Becker", kind: "automatikk" },
  { day: -1, at: hm(20, 15), apartment: null, text: `${CLEANER_FIRST} bekreftet to rengjøringer i morgen`, kind: "renholder" },
  { day: 0, at: hm(8), apartment: null, text: "Utsjekkpåminnelse sendt til Marco og Emma", kind: "automatikk" },
  { day: 0, at: hm(9, 48), apartment: "toyen", text: "Emma sjekket ut, smartlåsen låste døren", kind: "automatikk" },
  { day: 0, at: hm(10, 42), apartment: "lokka", text: "Marco sjekket ut, smartlåsen låste døren", kind: "automatikk" },
  { day: 0, at: hm(11, 5), apartment: "lokka", text: "Robotstøvsugeren startet av seg selv", kind: "robot" },
  { day: 0, at: hm(12, 58), apartment: "lokka", text: "Rengjøring ferdig, 14 bilder lastet opp", kind: "renholder" },
  { day: 0, at: hm(14, 40), apartment: "toyen", text: "Rengjøring ferdig, kaffe og papir fylt på", kind: "renholder" },
  { day: 0, at: hm(15, 12), apartment: "lokka", text: "Lukas sjekket inn med koden", kind: "automatikk" },
  { day: 0, at: hm(18), apartment: null, text: "Kode til nøkkelboksen sendt til Aiko og familien Aas", kind: "automatikk" },
];

export type LogEntry = { id: string; minutesAgo: number; apartment: ApartmentId | null; text: string; kind: HandlerKind };

// ---------------------------------------------------------------------------------------------------
// Supplies and maintenance.

export type Supply = { apartment: ApartmentId; item: string; count: number; par: number; unit: string };

const SUPPLY_ITEMS: ReadonlyArray<{ item: string; unit: string; par: number }> = [
  { item: "Håndklær", unit: "sett", par: 8 },
  { item: "Sengetøy", unit: "sett", par: 4 },
  { item: "Toalettpapir", unit: "ruller", par: 24 },
  { item: "Kaffe", unit: "kapsler", par: 40 },
  { item: "Såpe og sjampo", unit: "flasker", par: 4 },
];

/** What each apartment holds, counted by the cleaner at the last clean. Only the coffee at Løkka is low. */
const COUNTS: Record<ApartmentId, number[]> = {
  lokka: [8, 4, 20, 4, 3],
  frogner: [10, 5, 22, 34, 4],
  toyen: [6, 3, 16, 26, 3],
  bjorvika: [8, 4, 18, 36, 3],
};

export const LOW_SHARE = 0.25;

export function supplies(): Supply[] {
  return APARTMENTS.flatMap((apartment) =>
    SUPPLY_ITEMS.map((item, index) => ({ apartment: apartment.id, item: item.item, unit: item.unit, par: Math.round(item.par * (apartment.id === "toyen" ? 0.75 : apartment.id === "frogner" ? 1.25 : 1)), count: COUNTS[apartment.id][index] })),
  );
}

export function isLow(supply: Supply): boolean {
  return supply.count < supply.par * LOW_SHARE;
}

export type Maintenance = {
  id: string;
  apartment: ApartmentId;
  title: string;
  text: string;
  state: "planlagt" | "fullfort";
  /** Day offset from today, and the clock time when it happens or happened. */
  day: number;
  at: string;
};

// ---------------------------------------------------------------------------------------------------
// The day, put together.

export type DayStep = Step & { state: StepState };
export type DayTurnover = { apartment: Apartment; steps: DayStep[] };

export type MonthFigures = {
  /** The month's name, "november". */
  month: string;
  bookings: number;
  /** Booked nights / all nights of the month across the apartments, 0–1. */
  occupancy: number;
  /** Earned so far this month (nights before today), NOK. */
  earned: number;
  /** Booked for the whole month, NOK. */
  booked: number;
  nights: number;
  averageNightly: number;
  rating: number;
  reviews: number;
  hoursSaved: number;
  tasksDone: number;
  /** Stays this month up to today (arrived or still here): what the automation has worked on. */
  staysSoFar: number;
  perApartment: Array<{ apartment: Apartment; nights: number; occupancy: number; booked: number }>;
};

export type HostDay = {
  today: string;
  /** Minutes after midnight, Oslo. */
  minute: number;
  apartments: ApartmentNow[];
  turnovers: DayTurnover[];
  /** Arrivals over the next 14 days, today included. */
  arrivals: Stay[];
  /** All stays that touch the next 14 days, for the calendar. */
  calendar: Stay[];
  threads: Thread[];
  log: LogEntry[];
  month: MonthFigures;
  supplies: Supply[];
  maintenance: Maintenance[];
  /** Turnovers whose guard failed: cleaned or code not in time for check-in. Empty on a good day. */
  problems: Array<{ apartment: Apartment; guard: Guard }>;
};

/** Messages, codes, reminders, the cleaner's booking, the review: what a host does by hand per stay. */
const MINUTES_PER_STAY_SAVED = 75;
const TASKS_PER_STAY = 7;
const DAY_MS = 86_400_000;

function monthFigures(today: string, stays: Stay[]): MonthFigures {
  const first = `${today.slice(0, 8)}01`;
  const nextMonth = addDays(first, 32).slice(0, 8) + "01";
  const days = daysBetween(first, nextMonth);
  const perApartment = APARTMENTS.map((apartment) => {
    let nights = 0;
    for (const stay of stays) {
      if (stay.apartment !== apartment.id) continue;
      const from = stay.from > first ? stay.from : first;
      const to = stay.to < nextMonth ? stay.to : nextMonth;
      nights += Math.max(0, daysBetween(from, to));
    }
    return { apartment, nights, occupancy: nights / days, booked: nights * apartment.nightly };
  });
  let earned = 0;
  for (const stay of stays) {
    const apartment = APARTMENTS.find((entry) => entry.id === stay.apartment)!;
    const from = stay.from > first ? stay.from : first;
    const to = stay.to < today ? stay.to : today;
    earned += Math.max(0, daysBetween(from, to)) * apartment.nightly;
  }
  const nights = perApartment.reduce((sum, entry) => sum + entry.nights, 0);
  const booked = perApartment.reduce((sum, entry) => sum + entry.booked, 0);
  const touched = stays.filter((stay) => stay.to > first && stay.from <= today).length;
  const reviews = APARTMENTS.reduce((sum, apartment) => sum + apartment.reviews, 0);
  return {
    month: new Intl.DateTimeFormat("nb-NO", { month: "long", timeZone: "UTC" }).format(new Date(`${first}T12:00:00Z`)),
    bookings: stays.filter((stay) => stay.from >= first && stay.from < nextMonth).length,
    occupancy: nights / (days * APARTMENTS.length),
    earned,
    booked,
    nights,
    averageNightly: nights ? Math.round(booked / nights) : 0,
    rating: APARTMENTS.reduce((sum, apartment) => sum + apartment.rating * apartment.reviews, 0) / reviews,
    reviews,
    hoursSaved: Math.round((touched * MINUTES_PER_STAY_SAVED) / 60),
    tasksDone: touched * TASKS_PER_STAY,
    staysSoFar: touched,
    perApartment,
  };
}

/** The host's day at `now`: everything the screens show, from one place. */
export function hostDay(now: Date): HostDay {
  const today = osloToday(now);
  const minute = osloMinute(now);
  const stays = staysAround(today);
  const until = addDays(today, 14);
  const byId = new Map(APARTMENTS.map((apartment) => [apartment.id, apartment]));

  const turnovers = TURNOVERS.map((turnover) => ({
    apartment: byId.get(turnover.apartment)!,
    steps: stepsFor(turnover, stays, today).map((step) => ({ ...step, state: stepState(step, minute) })),
  }));

  const problems = TURNOVERS.flatMap((turnover) => {
    if (!stays.some((stay) => stay.apartment === turnover.apartment && stay.from === today)) return [];
    return guardsFor(turnover, minute)
      .filter((guard) => !guard.ok)
      .map((guard) => ({ apartment: byId.get(turnover.apartment)!, guard }));
  });

  const nowMs = now.getTime();
  const midnight = nowMs - minute * 60_000;
  const log: LogEntry[] = [
    ...LOG.map((entry, index) => ({
      id: `log-${index}`,
      minutesAgo: Math.round((nowMs - (midnight + entry.day * DAY_MS + entry.at * 60_000)) / 60_000),
      apartment: entry.apartment,
      text: entry.text,
      kind: entry.kind,
    })),
    ...THREADS.flatMap((thread) =>
      thread.reply.kind === "auto"
        ? [{ id: `log-${thread.id}`, minutesAgo: thread.minutesAgo - thread.reply.minutesAfter, apartment: thread.apartment, text: `Svarte ${inSentence(firstName(thread.guest))} om ${TOPIC_WORD[thread.reply.topic]}`, kind: "automatikk" as const }]
        : [],
    ),
  ]
    .filter((entry) => entry.minutesAgo >= 0 && entry.minutesAgo < 24 * 60)
    .sort((a, b) => a.minutesAgo - b.minutesAgo);

  const sofia = stays.find((stay) => stay.guest === "Sofia Marino")!;
  const aiko = stays.find((stay) => stay.guest === "Aiko Tanaka")!;
  const maintenance: Maintenance[] = [
    {
      id: "m-vaskemaskin",
      apartment: "toyen",
      title: "Service på vaskemaskinen",
      text: `Teknikeren kommer ${dayWord(today, aiko.to)} 10:30, rett etter at Aiko har sjekket ut.`,
      state: "planlagt",
      day: daysBetween(today, aiko.to),
      at: "10:30",
    },
    { id: "m-lyspaere", apartment: "frogner", title: "Lyspære i gangen", text: `${CLEANER_FIRST} byttet den ved forrige rengjøring.`, state: "fullfort", day: -2, at: "12:40" },
    { id: "m-roykvarsler", apartment: "bjorvika", title: "Røykvarsleren testet", text: "Testet og nytt batteri satt i. Neste test om ett år.", state: "fullfort", day: -5, at: "13:10" },
  ];

  return {
    today,
    minute,
    apartments: APARTMENTS.map((apartment) => apartmentNow(apartment, stays, today, minute)),
    turnovers: turnovers.filter((turnover) => turnover.steps.length > 0),
    arrivals: stays.filter((stay) => stay.from >= today && stay.from < until),
    calendar: stays.filter((stay) => stay.to > today && stay.from < until),
    threads: THREADS.map((thread) => ({ ...thread, text: thread.id === "t-sofia-utsjekk" ? `Hei! Kan vi forlate leiligheten klokka 13 på ${dayWord(today, sofia.to)}? Flyet vårt går 17.` : thread.text })),
    log,
    month: monthFigures(today, stays),
    supplies: supplies(),
    maintenance,
    problems,
  };
}

const TOPIC_WORD: Record<AutoTopic, string> = {
  kode: "koden",
  wifi: "wifi",
  utsjekk: "utsjekk",
  takk: "takk for oppholdet",
  praktisk: "et praktisk spørsmål",
};

// ---------------------------------------------------------------------------------------------------
// Small helpers the screens share.

export function osloMinute(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

export function clock(minute: number): string {
  const m = ((minute % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function roundUp(minute: number, step = 15): number {
  return Math.ceil(minute / step) * step;
}

function codeWord(sent: { day: number; at: number }): string {
  return `${sent.day < 0 ? "i går" : "i dag"} ${clock(sent.at)}`;
}

export function firstName(name: string): string {
  return name.startsWith("Familien ") ? name : (name.split(" ")[0] ?? name);
}

/** "Familien Aas" in the middle of a sentence is "familien Aas". */
export function inSentence(name: string): string {
  return name.startsWith("Familien ") ? `f${name.slice(1)}` : name;
}

const WEEKDAY = new Intl.DateTimeFormat("nb-NO", { weekday: "long", timeZone: "UTC" });
const SHORT_DATE = new Intl.DateTimeFormat("nb-NO", { day: "numeric", month: "short", timeZone: "UTC" });

/** "i dag", "i morgen", "tirsdag" within the week, else "17. nov.". */
export function dayWord(today: string, date: string): string {
  const diff = daysBetween(today, date);
  if (diff === 0) return "i dag";
  if (diff === 1) return "i morgen";
  if (diff === -1) return "i går";
  const at = new Date(`${date}T12:00:00Z`);
  if (diff > 1 && diff < 7) return WEEKDAY.format(at);
  return SHORT_DATE.format(at);
}

/** A message's time: "14:05" today, "i går 22:10" before that. */
export function agoClock(minutesAgo: number, minuteNow: number): string {
  const at = minuteNow - minutesAgo;
  if (at >= 0) return clock(at);
  return `i går ${clock(at)}`;
}

const KR = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 });
export function kr(amount: number): string {
  return KR.format(amount);
}

export function percent(share: number): string {
  return `${Math.round(share * 100)}\u00a0%`;
}

export function decimal(value: number, digits = 2): string {
  return value.toLocaleString("nb-NO", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
