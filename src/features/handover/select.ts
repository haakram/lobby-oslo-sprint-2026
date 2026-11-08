import { atNight } from "@/features/dashboard/highlights";
import { formatKroner, hhmm } from "@/features/dashboard/format";
import { humanizeText, itemLabel, placeLabel } from "@/features/dashboard/labels";
import type { Night, RoomView } from "@/features/dashboard/selectors";
import type { Tally } from "@/features/nightshift/outcomes";
import type { RunLine } from "@/features/nightshift/runlog";
import type { PhoneTask } from "@/features/requests/phoneTasks";
import type { RequestView } from "@/features/requests/select";
import { HANDOVER_AT, hoursEarlier, type RoomMoney, roomMoney, shortDate, tonightLine } from "@/features/rooms/money";
import { bookedTonight, type PmsRoom, pmsLastNight, type RoomRevenue, sellableValue } from "@/features/rooms/pms";
import { type Contradiction, type Held, OWN_CONFLICT, type Reconciliation, type RoomCheckMark } from "@/features/rooms/reconcile";
import { osloToday } from "@/features/reception/dates";
import { HOTEL } from "@/features/reception/hotel";
import { byRole, cleanersToday } from "@/features/staff/testData";
import { inNightHours, placePhrase } from "@/features/staffinput/read";
import { waitText } from "@/features/staffinput/robotHazards";
import { BREAKFAST_BATTERY, type RobotAtHandover, robotNeedsPerson } from "./robotState";
import { type NightSafety, type Notified, openWetFloors, SAFETY_DUE, STRANGER_OWNER, type StaffSafety, type Waited, WET_FLOOR_OWNER, type WetFloor } from "./safety";

/**
 * Overlevering 06:00: the night on one page for the morning manager, composed from what the other
 * screens already know (the robot's run log, the AI receptionist's calls, the booking system, the
 * requests). Pure: the screen passes everything in, the same input always gives the same page.
 */

export type Figures = {
  /** Klare til salg: ready, free in the booking system (the one figure Rom and Oversikt show). */
  roomsReady: number;
  roomsTotal: number;
  /** The room check's money: to sell after confirmation, sent to reception (pending the PMS), held back (rooms/money.ts). */
  money: RoomMoney;
  /** Tonight's bookings in the (test) booking system: the kroner are extra only if tonight sells out. */
  tonight: { booked: number; rooms: number };
  /** The robot's night: the one tally every screen counts with (src/features/nightshift/outcomes.ts). */
  robot: Tally;
  /** Requests the night staff finished themselves (staff and in-room voice, 22:00–06:00), and the calls the AI receptionist took. */
  staffDone: number;
  calls: number;
  /** Guest matters the robot settled: noise, lost things found, spills made safe. */
  guestIssues: { noise: number; lost: number; spill: number };
  revenue: RoomRevenue;
  /** What can hurt a guest and has no owner yet: unsigned wet floors, the stranger. */
  safety: { wetFloors: number; stranger: boolean };
  /**
   * A room in use with no booking (round 6, product review: the certain cost leads the money): a night
   * nobody bills, and a room the booking system may sell again today. Last night's average rate per room.
   */
  unbilled: { rooms: string[]; value: number };
};

export type Highlight = { at: string; text: string; by: "robot" | "ai" | "staff" };

export type OpenItem = {
  id: string;
  text: string;
  /** A role the hotel has (round 4, design review: "seven of nine are Siri Haugen"): Vaktmester, Resepsjon, Renhold, Nattevakt. */
  owner: string;
  /** Who in that role is on, from the shift plan, when it is someone other than the desk reading the page. */
  who?: string;
  /** Due, wall clock HH:MM, or "straks" (a safety item: now, not at a time). */
  due: string;
  /** "innen 09:00" (by) or "før 06:15" (before the night shift leaves). */
  dueWord?: "innen" | "før";
  /** Null when the reader's role can't open the screen it belongs to. */
  href: string | null;
  linkLabel: string;
  /** A guest is waiting on it: said with a word as well as the colour. */
  urgent: boolean;
  /** Can hurt a guest (a wet floor, a stranger at the doors): first on the page, said with a word. */
  safety?: boolean;
  /** A safety item: how many of its hazards nobody was told about in the night (the sign-off warns while one is). */
  untold?: number;
  /** How many saker the row holds (the wet floors are one row, one line and one sak each). Default 1. */
  count?: number;
  /**
   * The row's one line when it shows its facts as marks (source chips, a timeline, the kroner) instead
   * of prose (round 6, design review: show the evidence, don't write it). `text` keeps the whole
   * sentence for print and for other composers (the robot-free page appends its evidence to it).
   */
  lead?: string;
  /** The room whose sources (the door lock, the night clerk, the robot) the row shows as chips. */
  evidenceRoom?: string;
  /** The robot's own contradiction as two points: "01:29 bagasje inn", then "03:47 meldt tomt". */
  points?: { at: string; label: string }[];
  /** Kroner on the row, when they are certain (a night nobody bills). */
  kroner?: number;
  /** Rooms to sell right here, in two steps (rooms/SellSteps.tsx). */
  sell?: string[];
  /**
   * Every room is sent to reception, and the booking system has not said it is free yet ("Venter på
   * PMS-en", never "done": the pilot reads the PMS, it never writes it). Still open: reception has it.
   */
  pending?: boolean;
  /** One line per place under the item (the wet floors, grouped into one item with one owner), or the consequence under a lead. */
  lines?: string[];
  /** Fettero held the room back from sale (the room check's catch), said with a badge. */
  caught?: boolean;
  /** Rests on the booking system, whose bookings are test data (while they are): the row carries the small word "testbooking". */
  booking?: boolean;
  /**
   * The hazards a safety row covers, and whether a person knew of each in the night (round 7: *Varsle*
   * is kept per hazard, `wet:lobby`, so it carries across *Med robot* / *Uten robot*, where the grouped
   * wet floors and the night clerk's lobby floor are different rows).
   */
  hazards?: { key: string; notified: boolean }[];
  /** The heading the row sits under with its neighbours (round 7: "Bookingsystemet og dørlåsen er uenige · 2 rom"). */
  group?: string;
};

export type NightNote = { author: string; role: string; text: string };

export type Handover = {
  figures: Figures;
  timeline: Highlight[];
  open: OpenItem[];
  note: NightNote;
};

/** The fallback when the night clerk wrote no note in Nattevaktens logg (owner B's /natt, `clerkNoteOf`): test text. */
export const NIGHT_NOTE: NightNote = {
  author: "Kjersti Lund",
  role: "Nattevakt",
  text: "Rolig natt. Roboten tok det meste av runden selv. Det var støy fra rom 210 to ganger, rundt 23:20 og 04:10, og rommet står ikke i systemet. Radiatoren på 134 bør sees på tidlig; familien fikk et ekstra pledd.",
};

const NIGHT_ORDER = (clock: string) => {
  const hour = Number(clock.slice(0, 2));
  return (hour < 12 ? hour + 24 : hour) * 60 + Number(clock.slice(3, 5));
};

const number = (room: string) => room.replace(/^room-/, "");

function joinNb(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} og ${items.at(-1)}`;
}

export const MAX_HIGHLIGHTS = 7;

export { SAFETY_DUE, STRANGER_CHECK, STRANGER_OWNER, WET_FLOOR_OWNER } from "./safety";

/** One hazard, the same on every page that shows it: "wet:lobby" · "door:corridor-3c" · "stranger" (the robot's refusals). */
export function hazardKey(kind: "wet" | "door" | "person" | "stranger", place = ""): string {
  return kind === "stranger" ? "stranger" : `${kind}:${place}`;
}

/** The desk: reception's tasks are the role's, whoever is on (the day receptionist often reads this page herself). */
export const DESK_OWNER = "Resepsjon";
/** The robot's own state is the outgoing night shift's to settle before it leaves (round 4, domain review). */
export const ROBOT_OWNER = "Nattevakt";
/** Before the night shift leaves: the master keycard back and the robot on its charger. */
export const ROBOT_DUE = "06:15";

/** What to do about a wet floor, after a colon on the row (round 6, design review: a third fewer words on the page). */
const WET_TODO = "sett ut skilt eller tørk opp";
/** The row's short form of STRANGER_CHECK (the bell keeps the whole routine). */
const STRANGER_TODO = "Sjekk først om en gjest var låst ute; ved tvil, avvik etter rutinen.";

/** "3C" from "corridor-3c"; any other place as it reads inside a sentence. */
function shortPlace(place: string): string {
  return placePhrase(place).replace(/^(i|på|ved) /, "").replace(/^korridor /, "");
}

/** "Korridor 2B" · "Lobbyen" · "Heisen, 1. etasje": a place at the start of a line. */
function placeStart(place: string): string {
  const phrase = placePhrase(place).replace(/^(i|på|ved) /, "");
  return `${phrase.charAt(0).toUpperCase()}${phrase.slice(1)}`;
}

/**
 * Who knew in the night, or how long it waited for nobody (round 6, domain review): "Kjersti Lund
 * kvitterte kl. 23:53, etter 2 min" · "6 t 9 min uten at noen ble varslet". A clock typed by day (a demo)
 * is said without a clock.
 */
export function waitedLine(notified: Notified | null, waited: Waited | null): string | null {
  if (notified) {
    const who = notified.by ?? "Nattevakten";
    const verb = notified.how === "ack" ? "kvitterte" : "meldte det";
    const when = inNightHours(notified.at) ? ` kl. ${hhmm(notified.at)}` : "";
    const after = when && waited?.minutes !== null && waited?.minutes !== undefined ? `, etter ${waitText(waited.minutes)}` : "";
    return `${who} ${verb}${when}${after}`;
  }
  return waited?.minutes !== null && waited?.minutes !== undefined ? `${waitText(waited.minutes)} uten at noen ble varslet` : "Ingen ble varslet i natt";
}

/**
 * One wet floor's line under the grouped item, a scan line: "Korridor 2B siden 23:51 · roboten skled der
 * · 6 t 9 min uten at noen ble varslet" · "Lobbyen · meldt av Kjersti Lund kl. 02:15 · skilt satt ut 02:16".
 */
export function wetFloorLine(floor: WetFloor): string {
  if (floor.source === "staff") {
    const by = floor.reported?.by ?? "nattevakten";
    const when = inNightHours(floor.reported?.at) ? ` ${hhmm(floor.reported.at)}` : "";
    return [`${placeStart(floor.place)} · meldt${when} av ${by}`, floor.sign].filter(Boolean).join(" · ");
  }
  const since = floor.since ? ` siden ${hhmm(floor.since)}` : "";
  const why = floor.signMoved ? `skiltet flyttet til ${floor.signMoved.to ? shortPlace(floor.signMoved.to) : "et nytt søl"}` : floor.slippedAt ? "roboten skled" : null;
  return [`${placeStart(floor.place)}${since}`, why, floor.signed ? floor.sign : null, waitedLine(floor.notified, floor.waited)].filter(Boolean).join(" · ");
}

/** "Vått gulv uten skilt i korridor 2B: sett ut skilt …" · "4 våte gulv, 3 uten skilt: sett ut skilt …": the wet floors' row. */
export function wetFloorText(floors: readonly WetFloor[]): string {
  const unsigned = floors.filter((floor) => !floor.signed).length;
  if (floors.length === 1) return `Vått gulv${unsigned ? " uten skilt" : ""} ${placePhrase(floors[0].place)}: ${WET_TODO}.`;
  const signs = unsigned === floors.length ? " uten skilt" : unsigned > 0 ? `, ${unsigned} uten skilt` : ", alle med skilt";
  return `${floors.length} våte gulv${signs}: ${WET_TODO}.`;
}

/** "En person i badekåpe ba roboten slippe ham inn på 7 rom mellom 01:17 og 05:11 …" (neutral: who he is, nobody knows). */
export function strangerText(stranger: NonNullable<NightSafety["stranger"]>): string {
  const count = stranger.refusals.length;
  const rooms = stranger.rooms.length || count;
  const span = count > 1 ? `, ${hhmm(stranger.first)}–${hhmm(stranger.last)}` : ` kl. ${hhmm(stranger.first)}`;
  // Neutral first (round 3, legal review): the likely innocent explanation, then the hotel's own routine. The doors are on the card.
  return `En person i badekåpe ba roboten slippe ham inn på ${rooms === 1 ? "ett rom" : `${rooms} rom`}${span}. Roboten sa nei. ${STRANGER_TODO}`;
}

/** A door or a person the night clerk logged that the robot's log has no item for, in the robot-free page's words (the bell says it so too). */
export function staffSafetyText(entry: StaffSafety): string {
  const when = inNightHours(entry.at) ? ` kl. ${hhmm(entry.at)}` : "";
  const note = entry.note ? ` ${entry.note.replace(/[.!]?$/, ".")}` : "";
  if (entry.hazard === "door") return `Dør ${placePhrase(entry.place)}, meldt av ${entry.by}${when}.${note} Sjekk at den er lukket og låst.`;
  return `En person ${placePhrase(entry.place)}, meldt av ${entry.by}${when}.${note} Sjekk først om en gjest var låst ute. Ved tvil: avvik etter hotellets rutine.`;
}

/** "2 × håndkle, toalettsett": what the robot still carries, as the 3D-kart's tooltip says it. */
function carried(list: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const item of list) counts.set(itemLabel(item), (counts.get(itemLabel(item)) ?? 0) + 1);
  return [...counts].map(([label, count]) => (count > 1 ? `${count} × ${label}` : label)).join(", ");
}

/**
 * "Roboten står ved heis, 1. etasje med hovednøkkelkortet, ikke på lader, 20 % batteri. Hent kortet og
 * sett den på lader." (What else it carries is on 3D-kart.)
 */
export function robotStateText(robot: RobotAtHandover): string {
  const where = robot.location === "charging-dock" ? "på ladestasjonen" : `ved ${placeLabel(robot.location).toLowerCase()}`;
  const battery = robot.battery !== null ? `, ${Math.round(robot.battery)} % batteri` : "";
  const dock = robot.docked ? "på lader" : "ikke på lader";
  const others = robot.keycard ? "" : carried([...robot.hands, ...robot.cart]);
  const state = robot.keycard ? `Roboten står ${where} med hovednøkkelkortet, ${dock}${battery}.` : `Roboten står ${where}, ${dock}${battery}.${others ? ` Den har med ${others}.` : ""}`;
  const todo = [robot.keycard ? "hent kortet" : null, !robot.docked ? "sett den på lader" : robot.battery !== null && robot.battery < BREAKFAST_BATTERY ? "la den lade før frokost" : null].filter(Boolean).join(" og ");
  return `${state}${todo ? ` ${todo.charAt(0).toUpperCase()}${todo.slice(1)}.` : ""}`;
}

/**
 * "Rom 209: robotens minne og øyne er uenige." Said as what the log shows (round 6, domain
 * review: "dobbelt tildelt?" read the simulator's habit of stacking bag requests on one room as a booking
 * signal; round 7: not "holdt tilbake fra salg", a guest is booked there); the two clocks are the row's points.
 */
export function contradictionText(row: Contradiction): string {
  // What to do is the row's badge ("Sjekk rommet"), not a second sentence.
  return `Rom ${number(row.room)}: ${OWN_CONFLICT.charAt(0).toLowerCase()}${OWN_CONFLICT.slice(1)}.`;
}

/** The two points of the robot's own contradiction: what went in, then "meldt tomt". */
export function contradictionPoints(row: Contradiction): { at: string; label: string }[] {
  return [
    { at: hhmm(row.placedAt), label: row.arrival ? "bagasje inn" : `${itemLabel(row.item)} inn` },
    { at: hhmm(row.checkedAt), label: "meldt tomt" },
  ];
}

/** The booking system's side of a held room, and reception decides (never "dobbelt tildelt?"). */
function heldConsequence(row: Held, lead: boolean): string {
  const guest = `${row.guest ?? "en gjest"} der${row.departure ? ` til ${shortDate(row.departure)}` : ""}`;
  return lead
    ? `Systemet har ${guest}. Resepsjonen avgjør.`
    : `Rom ${number(row.room)}: roboten bar inn bagasje kl. ${hhmm(row.deliveredAt)}, etter romsjekken, og systemet har ${guest}. Resepsjonen avgjør før innsjekk kl. ${HOTEL.checkIn}.`;
}

/** The wet floors nobody marked Løst, in the night's order (22:00 first): the safety row's lines, and the bell's alerts. */
export function openWetFloorsInOrder(wetFloors: readonly WetFloor[], resolved: (orderId: string) => boolean): WetFloor[] {
  return openWetFloors(wetFloors, resolved).sort((a, b) => NIGHT_ORDER(a.since ?? "00:00") - NIGHT_ORDER(b.since ?? "00:00"));
}

export function composeHandover({
  night,
  rooms,
  reconciliation,
  marks,
  requests,
  phone,
  revenue,
  today = osloToday(),
  pms = pmsLastNight(today),
  safety = { wetFloors: [], stranger: null },
  robot = null,
  tonight,
  note = NIGHT_NOTE,
  resolved = () => false,
  canOpen = () => true,
}: {
  night: Night;
  rooms: readonly RoomView[];
  reconciliation: Reconciliation;
  /** Today's room-check marks (confirmed, sent to reception, task for reception). */
  marks: Readonly<Record<string, RoomCheckMark>>;
  requests: readonly RequestView[];
  phone: readonly PhoneTask[];
  revenue: RoomRevenue;
  /** Today (YYYY-MM-DD, Oslo): a booking that ends today is a guest due out. */
  today?: string;
  /** The booking system last night (which rooms were booked), for the one Klare til salg figure. */
  pms?: ReadonlyMap<string, PmsRoom>;
  /** What can hurt a guest, from the run log (safety.ts). */
  safety?: NightSafety;
  /** The robot itself at 06:00 (robotState.ts): an item when it is off its charger or still holds a key. */
  robot?: RobotAtHandover | null;
  /** Tonight's bookings; by default from the (test) booking system and the hotel's rooms. */
  tonight?: { booked: number; rooms: number };
  /** The night shift's own note (the night clerk's entry, when one was made). */
  note?: NightNote;
  /** A work order staff marked Løst on Vedlikehold. */
  resolved?: (orderId: string) => boolean;
  /** Whether the reader's role may open a screen: a link to a screen they can't open is left out. */
  canOpen?: (route: string) => boolean;
}): Handover {
  const tasks = [...night.tasks.values()];
  const doneOf = (kind: string) => tasks.filter((task) => task.kind === kind && task.verdict === "done").length;
  const staffDone = requests.filter(
    (request) => (request.source === "personale" || request.source === "stemme") && request.status === "fullfort" && atNight(request.at),
  ).length;
  const money = roomMoney({ reconciliation, marks, revenue, rooms, pms });
  const wetFloors = openWetFloorsInOrder(safety.wetFloors, resolved);
  const booked = tonight ?? { booked: bookedTonight(today), rooms: rooms.length };
  const unbilledRooms = reconciliation.guestFound.map((row) => row.room);

  const figures: Figures = {
    roomsReady: money.readyToSell ?? 0,
    roomsTotal: rooms.length,
    money,
    tonight: booked,
    robot: night.tally,
    staffDone,
    calls: phone.length,
    guestIssues: { noise: doneOf("noise"), lost: doneOf("lost_item"), spill: doneOf("spill") },
    revenue,
    safety: { wetFloors: wetFloors.length, stranger: safety.stranger !== null },
    unbilled: { rooms: unbilledRooms, value: sellableValue(unbilledRooms.length, revenue) },
  };

  // What happened: a few lines, most telling first, then shown in the night's order.
  const ranked: Highlight[] = [];
  const end = night.clock && night.ended ? night.clock : null;
  if (end) ranked.push({ at: hhmm(end), text: `Roboten avsluttet natten med ${night.tally.done} av ${night.tally.total} oppdrag fullført.`, by: "robot" });
  const sellable = [...reconciliation.sellable].sort((a, b) => NIGHT_ORDER(a.at ?? "00:00") - NIGHT_ORDER(b.at ?? "00:00"));
  if (sellable[0]?.at) {
    const many = sellable.length > 1;
    ranked.push({
      at: hhmm(sellable[0].at),
      text: `Roboten fant ${joinNb(sellable.map((row) => `rom ${number(row.room)}`))} ${many ? "tomme og ryddige" : "tomt og ryddig"}, men systemet holder ${many ? "dem" : "det"} opptatt. ${many ? "De" : "Det"} kan selges etter bekreftelse, ca. ${formatKroner(money.toSellValue + money.releasedValue)} kr hvis natten blir utsolgt.`,
      by: "robot",
    });
  }
  // The robot's own contradiction leads 209 (round 4, domain review): its camera against its own task log, no booking needed.
  const contradiction = reconciliation.contradicted[0];
  const held = reconciliation.held[0];
  if (contradiction?.checkedAt) {
    ranked.push({
      at: hhmm(contradiction.checkedAt),
      text: `Roboten meldte rom ${number(contradiction.room)} tomt og ryddig, men egen logg sier at den satte inn ${contradiction.arrival ? "bagasje" : itemLabel(contradiction.item)} der kl. ${hhmm(contradiction.placedAt)}. ${OWN_CONFLICT}: Fettero ba resepsjonen sjekke rommet.`,
      by: "robot",
    });
  } else if (held?.deliveredAt) {
    ranked.push({
      at: hhmm(held.deliveredAt),
      text: held.arrival
        ? `Roboten bar bagasje for dagens ankomst inn på rom ${number(held.room)}, men systemet har ${held.guest ?? "en gjest"} der${held.departure ? ` til ${shortDate(held.departure)}` : ""}. Fettero ba resepsjonen sjekke rommet.`
        : `Roboten leverte noe inn på rom ${number(held.room)} etter romsjekken. Fettero ba resepsjonen sjekke rommet.`,
      by: "robot",
    });
  }
  const guest = reconciliation.guestFound[0];
  if (guest?.at) ranked.push({ at: hhmm(guest.at), text: `Roboten møtte en gjest på rom ${number(guest.room)}, som systemet har som ledig.`, by: "robot" });
  // The night clerk's own floors stand in the night beside the robot's (round 6: added, never dropped).
  for (const floor of safety.wetFloors.filter((entry) => entry.source === "staff" && inNightHours(entry.reported?.at))) {
    const sign = floor.sign ? `, ${floor.sign}` : "";
    ranked.push({ at: hhmm(floor.reported?.at ?? null), text: `${floor.reported?.by ?? "Nattevakten"} meldte vått gulv ${placePhrase(floor.place)}${sign}.`, by: "staff" });
  }
  const calls = [...phone].sort((a, b) => NIGHT_ORDER(a.at || "00:00") - NIGHT_ORDER(b.at || "00:00"));
  if (calls[0]) ranked.push({ at: calls[0].at, text: `AI-resepsjonisten tok en samtale og la den i Forespørsler: ${calls[0].record.message}`, by: "ai" });
  const noise = night.workOrders.find((order) => order.type === "stoy");
  if (noise?.at) ranked.push({ at: hhmm(noise.at), text: `${humanizeText(noise.text).replace(/: ba /, ": roboten ba ")}.`, by: "robot" });
  const spill = night.workOrders.find((order) => order.type === "sol" && /varselskilt/.test(order.text));
  if (spill?.at) ranked.push({ at: hhmm(spill.at), text: `${humanizeText(spill.text)}.`, by: "robot" });
  if (calls[1]) ranked.push({ at: calls[1].at, text: `AI-resepsjonisten tok en samtale: ${calls[1].record.message}`, by: "ai" });
  const handled = calls.find((call) => call.demo?.handled);
  if (handled?.demo?.handled) ranked.push({ at: handled.demo.handled.at, text: `${handled.demo.handled.who} ordnet det AI-resepsjonisten tok imot: ${handled.record.message}`, by: "staff" });
  const timeline = ranked
    .filter((line) => line.at && line.at !== "--:--")
    .slice(0, MAX_HIGHLIGHTS)
    .sort((a, b) => NIGHT_ORDER(a.at) - NIGHT_ORDER(b.at));

  // What can hurt a guest comes first, each with an owner, "straks", and how long it waited for a person
  // (round 4, legal review: a hazard the hotel knew of is acted on at once; round 6, domain review: the
  // wait is the number). The wet floors share one owner, so they are one row with a line and a sak each.
  const caretaker = byRole("Vedlikehold").find((member) => member.shift === "dag")?.name;
  const wetLink = {
    href: canOpen("/vedlikehold") ? "/vedlikehold" : canOpen("/hotell") ? "/hotell" : null,
    linkLabel: canOpen("/vedlikehold") ? "Åpne Vedlikehold" : "Vis i 3D-kartet",
  };
  const first: OpenItem[] = [];
  if (wetFloors.length > 0) {
    first.push({
      id: wetFloors.length > 1 ? "wet-floors" : `wet-${wetFloors[0].place}`,
      text: wetFloorText(wetFloors),
      lines: wetFloors.map(wetFloorLine),
      owner: WET_FLOOR_OWNER,
      ...(caretaker ? { who: caretaker } : {}),
      due: SAFETY_DUE,
      ...wetLink,
      urgent: false,
      safety: true,
      count: wetFloors.length,
      untold: wetFloors.filter((floor) => !floor.notified).length,
      hazards: wetFloors.map((floor) => ({ key: hazardKey("wet", floor.place), notified: Boolean(floor.notified) })),
    });
  }
  if (safety.stranger) {
    const told = waitedLine(safety.stranger.notified, safety.stranger.waited);
    first.push({
      id: "stranger",
      text: strangerText(safety.stranger),
      ...(told ? { lines: [told] } : {}),
      owner: STRANGER_OWNER,
      due: SAFETY_DUE,
      href: "#vurderinger-overlevering",
      linkLabel: "Se robotens vurderinger",
      urgent: false,
      safety: true,
      untold: safety.stranger.notified ? 0 : 1,
      hazards: [{ key: hazardKey("stranger"), notified: Boolean(safety.stranger.notified) }],
    });
  }
  // The night clerk's own doors and persons: the same rows the robot-free page shows (same ids).
  for (const entry of safety.staff ?? []) {
    first.push({
      id: `staff-${entry.id}`,
      text: staffSafetyText(entry),
      owner: STRANGER_OWNER,
      due: SAFETY_DUE,
      href: canOpen("/natt") ? "/natt" : null,
      linkLabel: "Åpne nattevaktens logg",
      urgent: false,
      safety: true,
      untold: 0,
      hazards: [{ key: hazardKey(entry.hazard, entry.place), notified: true }],
    });
  }

  // Then everything else by its deadline (round 4, design review: the earliest deadline was fourth).
  const rest: OpenItem[] = [];

  // The robot itself at the handover: off its charger, low, or still holding the master keycard (domain review).
  if (robot && robotNeedsPerson(robot)) {
    const nightWatch = byRole("Nattevakt").find((member) => member.shift === "natt" && member.name !== "Roboten")?.name;
    rest.push({
      id: "robot-state",
      text: robotStateText(robot),
      owner: ROBOT_OWNER,
      ...(nightWatch ? { who: nightWatch } : {}),
      due: ROBOT_DUE,
      dueWord: "før",
      href: canOpen("/hotell") ? "/hotell" : canOpen("/natteskift") ? "/natteskift" : null,
      linkLabel: canOpen("/hotell") ? "Vis i 3D-kartet" : "Åpne Natteskift",
      urgent: false,
    });
  }

  // The room check: the catch led by the robot's own contradiction, the money, rooms with more than one arrival.
  const contradicted = new Map(reconciliation.contradicted.map((row) => [row.room, row]));
  for (const row of reconciliation.held) {
    const own = contradicted.get(row.room) ?? row.contradiction;
    const delivered = `Rom ${number(row.room)}: roboten leverte noe inn etter romsjekken kl. ${hhmm(row.deliveredAt)}, så rommet er i bruk. Sjekk bookingen før det selges.`;
    rest.push({
      id: `held-${row.room}`,
      text: own ? contradictionText(own) : row.arrival ? heldConsequence(row, false) : delivered,
      ...(own ? { points: contradictionPoints(own) } : {}),
      ...(own && row.arrival ? { lines: [heldConsequence(row, true)] } : {}),
      owner: DESK_OWNER,
      due: "12:00",
      href: canOpen("/gjester") ? "/gjester" : null,
      linkLabel: "Åpne Gjester",
      urgent: false,
      caught: true,
      booking: true,
    });
  }
  // A room check the robot's own log contradicts on a room the system has as free: never offered either.
  const heldRooms = new Set(reconciliation.held.map((row) => row.room));
  for (const row of reconciliation.contradicted.filter((entry) => !heldRooms.has(entry.room))) {
    rest.push({
      id: `held-${row.room}`,
      text: `${contradictionText(row)} Se på rommet før det selges.`,
      points: contradictionPoints(row),
      owner: DESK_OWNER,
      due: "12:00",
      href: canOpen("/rom") ? "/rom" : null,
      linkLabel: "Åpne Rom",
      urgent: false,
      caught: true,
    });
  }
  // Sold here in two steps; the row stays once every room is sent, pending the booking system (never "done").
  if (reconciliation.sellable.length > 0) {
    const toSell = money.toSell;
    const hours = hoursEarlier();
    const condition = `hvis natten blir utsolgt (${tonightLine(booked.booked, booked.rooms)})`;
    const rows = toSell.length > 0 ? toSell : money.released;
    const found = `${joinNb(rows.map((row) => `Rom ${number(row.room)}`))}: funnet ledig${rows.length > 1 ? "e" : ""} ${hours} ${hours === 1 ? "time" : "timer"} tidligere`;
    rest.push({
      id: "sellable",
      // What the room check buys is time (round 6, product review: the kroner lead on 210, a certain cost).
      lead: toSell.length > 0 ? `${found}.${sellReason(toSell, today, true)}` : `${found}, sendt til resepsjonen.`,
      text:
        toSell.length > 0
          ? `${joinNb(toSell.map((row) => `Rom ${number(row.room)}`))} kan selges fra kl. ${HANDOVER_AT}, ${hours} timer før renholdet ellers finner ${toSell.length === 1 ? "det" : "dem"} etter utsjekk kl. ${HOTEL.checkOut}: ca. ${formatKroner(money.toSellValue)} kr ${condition}.${sellReason(toSell, today)} Roboten fant ${toSell.length === 1 ? `det tomt og ryddig kl. ${hhmm(toSell[0].at)}` : "dem tomme og ryddige"}.`
          : `${joinNb(money.released.map((row) => `Rom ${number(row.room)}`))} er sendt til resepsjonen for utsjekk i PMS-en: ca. ${formatKroner(money.releasedValue)} kr ${condition}.`,
      owner: DESK_OWNER,
      due: "09:00",
      href: "/rom",
      linkLabel: "Åpne Rom",
      urgent: false,
      sell: reconciliation.sellable.map((row) => row.room),
      pending: toSell.length === 0,
      booking: true,
    });
  }
  // From the robot's own log, no booking system: more arrivals' bags in one room than it holds (domain review).
  if (reconciliation.crowded.length > 0) {
    // The robot's log, said as it is; reception decides (round 6, domain review: partly how the simulator stacks bag requests).
    const crowded = reconciliation.crowded;
    const which = crowded.length === 1 ? `Rom ${number(crowded[0].room)}: bagasje for ${crowded[0].arrivals} ankomster` : `Rom ${joinNb(crowded.map((row) => number(row.room)))}: bagasje for flere ankomster (${joinNb(crowded.map((row) => String(row.arrivals)))})`;
    rest.push({
      id: "crowded",
      text: `${which} i natt. Resepsjonen avgjør.`,
      owner: DESK_OWNER,
      due: "12:00",
      href: canOpen("/rom") ? "/rom" : null,
      linkLabel: "Åpne Rom",
      urgent: false,
    });
  }
  const waitingPhone = requests.filter((request) => request.phone && request.status === "venter");
  if (waitingPhone.length > 0) {
    const where = [...new Set(waitingPhone.map((request) => number(request.room ?? "")))];
    rest.push({
      id: "phone",
      // "samtaler", never "saker": a sak is a row on this page, and the page counts its rows.
      text: `${waitingPhone.length === 1 ? "1 samtale" : `${waitingPhone.length} samtaler`} venter på å bli fordelt: rom ${joinNb(where)}.`,
      owner: DESK_OWNER,
      due: "07:00",
      href: "/foresporsler",
      linkLabel: "Åpne Forespørsler",
      urgent: true,
    });
  }
  for (const row of reconciliation.guestFound) {
    const tasked = marks[row.room]?.action === "task";
    rest.push({
      id: `guest-${row.room}`,
      text: `${placeLabel(row.room)}: en gjest uten booking. Sjekk registreringen${tasked ? " (oppgave laget)" : ""}.`,
      // A certain cost, not "if tonight sells out" (round 6, product review): neutral, a walk-in or a room move nobody recorded.
      lead: `${placeLabel(row.room)}: i bruk uten booking. Sjekk registreringen før rommet selges igjen${tasked ? " (oppgave laget)" : ""}.`,
      kroner: sellableValue(1, revenue),
      evidenceRoom: row.room,
      owner: DESK_OWNER,
      due: "08:00",
      href: tasked ? "/foresporsler" : "/rom",
      linkLabel: tasked ? "Åpne Forespørsler" : "Åpne Rom",
      urgent: false,
    });
  }
  // Only what the robot handed back: a refusal on good grounds or a request the night manager called off needs nobody.
  const needPerson = requests.filter((request) => !request.phone && request.source === "robot" && !request.badge && (request.status === "venter" || request.status === "feilet"));
  if (needPerson.length > 0) {
    rest.push({
      id: "robot",
      text: `${needPerson.length === 1 ? "1 forespørsel" : `${needPerson.length} forespørsler`} roboten ikke fikk til, trenger en person.`,
      owner: DESK_OWNER,
      due: "10:00",
      // Opens on the robot's requests, so the first hand-back is row 1 (owner B's ?filter=robot).
      href: "/foresporsler?filter=robot",
      linkLabel: "Åpne Forespørsler",
      urgent: false,
    });
  }
  const dirty = rooms.filter((room) => room.status === "ma_vaskes");
  if (dirty.length > 0) {
    const cleaners = cleanersToday().map((member) => member.name.split(" ")[0]);
    rest.push({
      id: "clean",
      text: dirty.length === 1 ? `Rom ${dirty[0].number} må vaskes før innsjekk kl. ${HOTEL.checkIn}.` : `${dirty.length} rom må vaskes før innsjekk kl. ${HOTEL.checkIn}: ${joinNb(dirty.map((room) => room.number))}.`,
      owner: "Renhold",
      ...(cleaners.length ? { who: joinNb(cleaners) } : {}),
      due: "14:00",
      href: "/rom",
      linkLabel: "Åpne Rom",
      urgent: false,
    });
  }
  // Morning deadlines (06:15 … 14:00), soonest first; stable, so items due together keep the order above (the catch before the crowded rooms).
  rest.sort((a, b) => a.due.localeCompare(b.due));

  return { figures, timeline, open: [...first, ...rest], note };
}

/**
 * " Ola Nygård skulle reist 7.11, men utsjekken ble aldri registrert, så systemet holder rommet i natt."
 * for one room; a stay-over's end otherwise.
 */
function sellReason(rows: readonly { guest: string | null; departure: string | null }[], today: string, short = false): string {
  if (rows.length !== 1) return "";
  const [row] = rows;
  if (!row.guest || !row.departure) return "";
  if (row.departure < today) return ` ${row.guest} skulle reist ${shortDate(row.departure)}, men utsjekken ble aldri registrert${short ? "" : ", så systemet holder rommet i natt"}.`;
  if (row.departure === today) return ` ${row.guest} reiser i dag.`;
  return ` ${row.guest} står i systemet til ${shortDate(row.departure)}.`;
}

/**
 * How many saker are open: every row, a room sent to reception included (the PMS has not said it is
 * free), and each wet floor in the grouped row (round 6, design review: the safety figure, *Åpent nå*
 * and the receipt count the same things).
 */
export function openCount(open: readonly OpenItem[]): number {
  return open.reduce((sum, item) => sum + (item.count ?? 1), 0);
}

/** *Åpent nå*'s two numbers: every sak, and the safety saker (straks) among them. */
export type HandoverSummary = { total: number; straks: number };

/**
 * "Overlevering 06:00: 5 straks av 13 åpne": the one "needs you" line (round 7, design review: the bell
 * badge, *Åpent nå* and the safety figure read as three counts). The bell's badge is the straks, its sheet
 * and Oversikt's greeting say this line, the page heads *Åpent nå* with the same two numbers.
 */
export function handoverLine({ total, straks }: HandoverSummary): string {
  return `Overlevering 06:00: ${straks} straks av ${total} ${total === 1 ? "åpen" : "åpne"}`;
}

/** The saker that can hurt a guest: the safety figure's number. */
export function safetyCount(open: readonly OpenItem[]): number {
  return openCount(open.filter((item) => item.safety));
}

/**
 * Safety saker nobody was told about, in the night or on this page (`told`: the hazards a *Varsle* tap
 * recorded, round 7: per hazard, so a tap under *Med robot* counts under *Uten robot* too).
 */
export function untoldCount(open: readonly OpenItem[], told: (key: string) => boolean): number {
  return open
    .filter((item) => item.safety)
    .reduce((sum, item) => sum + (item.hazards ? item.hazards.filter((hazard) => !hazard.notified && !told(hazard.key)).length : told(item.id) ? 0 : (item.untold ?? 0)), 0);
}

/** The keys a row's *Varsle* records: its hazards, or the row itself when it names none. */
export function hazardsOf(item: Pick<OpenItem, "id" | "hazards">): string[] {
  return item.hazards?.map((hazard) => hazard.key) ?? [item.id];
}

/** "Bookingsystemet og dørlåsen er uenige · 2 rom": the pitch line, on the page as a heading (round 7). */
export function lockGroupHeading(rooms: number): string {
  return `Bookingsystemet og dørlåsen er uenige · ${rooms} rom`;
}

/** The rooms a row is about: the room its chips are for, the rooms it sells, or the room a lock flag names. */
function rowRooms(item: OpenItem): string[] {
  const flagged = /^(?:lock|early|guest)-(room-[\w-]+)$/.exec(item.id)?.[1];
  return [...new Set([item.evidenceRoom, ...(item.sell ?? []), flagged].filter((room): room is string => Boolean(room)))];
}

/**
 * *Åpent nå* in one order on both nights (round 7, design review): the safety rows first, then every
 * other row by its deadline, with the rows about rooms where the booking system and the door lock
 * disagree (`disagree`, doorlock/feed.ts `doorLockFlags`) together under one heading, where the earliest
 * of them falls. Pure; the robot-free composer's room checks are no longer pinned above the 07:00 calls.
 */
export function groupLockDisagreements(open: readonly OpenItem[], disagree: ReadonlySet<string>): OpenItem[] {
  const safety = open.filter((item) => item.safety);
  const rest = open.filter((item) => !item.safety).sort((a, b) => a.due.localeCompare(b.due));
  const inGroup = rest.filter((item) => rowRooms(item).some((room) => disagree.has(room)));
  if (inGroup.length === 0) return [...safety, ...rest];
  const rooms = new Set(inGroup.flatMap((item) => rowRooms(item).filter((room) => disagree.has(room))));
  const heading = lockGroupHeading(rooms.size);
  const before = rest.indexOf(inGroup[0]);
  const others = rest.filter((item) => !inGroup.includes(item));
  return [...safety, ...others.slice(0, before), ...inGroup.map((item) => ({ ...item, group: heading })), ...others.slice(before)];
}

/** The caretaker on the day shift, whom the wet floors' *Varsle* tells. */
const CARETAKER = byRole("Vedlikehold").find((member) => member.shift === "dag")?.name ?? null;

/** Whom a safety row's *Varsle* names: the person on in its role, or the desk ("Trond Eikeland" · "resepsjonen"). */
export function notifyTarget(item: Pick<OpenItem, "owner" | "who">): string {
  if (item.who) return item.who;
  if (item.owner === WET_FLOOR_OWNER) return CARETAKER ?? "vaktmesteren";
  if (item.owner === STRANGER_OWNER || item.owner === DESK_OWNER) return "resepsjonen";
  return item.owner.toLowerCase();
}

/**
 * Rows from another source (Øyne's *Ingen av disse*, eyes/deviations.ts) placed by their deadline after
 * the safety rows, whichever night the page shows (the composers sort their own rows the same way).
 */
export function withExtraItems(open: readonly OpenItem[], extra: readonly OpenItem[]): OpenItem[] {
  const list = [...open];
  for (const item of extra) {
    if (list.some((entry) => entry.id === item.id)) continue;
    const at = list.findIndex((entry) => !entry.safety && entry.due !== SAFETY_DUE && entry.due.localeCompare(item.due) > 0);
    if (at === -1) list.push(item);
    else list.splice(at, 0, item);
  }
  return list;
}

/**
 * The demo band's first words, from the run log's start line, never hard-coded (round 4, design review:
 * the test-data chips become one quiet band): "én ekte natt fra Wybe-simulatoren (seed 16)".
 */
export function nightSourceLine(lines: readonly RunLine[], withSeed = false): string {
  const start = lines.find((line) => line.type === "start");
  if (!start || start.type !== "start") return "en natt fra kjøringsloggen";
  if (start.source === "open-rmf") return "en eksempelnatt fra en Open-RMF-robot";
  const seed = typeof start.seed === "number" ? ` (seed ${start.seed})` : "";
  // The seed is for the robot screens, not the manager's band (round 6, design review).
  if (!start.source || start.source === "wybe-nightshift") return withSeed ? `én ekte natt fra Wybe-simulatoren${seed}` : "én ekte natt fra robotens simulator";
  return `en natt fra kjøringsloggen (${start.source})`;
}

/** Where a figure on top jumps to (round 4, product and design review): the row's id on the page. */
export function itemAnchor(id: string): string {
  return `sak-${id}`;
}

// ---------------------------------------------------------------------------------------------
// Kvitter mottatt: who took the handover, and when, per day.

export type Signoff = {
  name: string;
  /** Wall clock HH:MM (older sign-offs); new ones carry `stamp` and show "nå" / "for 3 min siden". */
  at: string;
  /** ISO time of the sign-off (src/ui/stamp.ts). */
  stamp?: string;
  /** How many items were open when it was signed: what the morning took over. */
  open?: number;
  /** Safety saker nobody had been told about when it was signed (round 6: the receipt says what was not done). */
  untold?: number;
  /** A withdrawal line (*Angre kvitteringen*, round 7: appended, never deleted): `name` is who took it back. */
  withdrawn?: boolean;
};
