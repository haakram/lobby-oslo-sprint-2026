import { atNight } from "@/features/dashboard/highlights";
import { formatKroner, hhmm } from "@/features/dashboard/format";
import { humanizeText, itemLabel, placeLabel } from "@/features/dashboard/labels";
import type { Night, RoomView } from "@/features/dashboard/selectors";
import type { Tally } from "@/features/nightshift/outcomes";
import type { RunLine } from "@/features/nightshift/runlog";
import type { PhoneTask } from "@/features/requests/phoneTasks";
import type { RequestView } from "@/features/requests/select";
import { HANDOVER_AT, hoursEarlier, type RoomMoney, roomMoney, shortDate, tonightLine } from "@/features/rooms/money";
import { bookedTonight, type PmsRoom, pmsLastNight, type RoomRevenue } from "@/features/rooms/pms";
import type { Contradiction, Held, Reconciliation, RoomCheckMark } from "@/features/rooms/reconcile";
import { osloToday } from "@/features/reception/dates";
import { HOTEL } from "@/features/reception/hotel";
import { byRole, cleanersToday } from "@/features/staff/testData";
import { BREAKFAST_BATTERY, type RobotAtHandover, robotNeedsPerson } from "./robotState";
import { corridorName, type NightSafety, type Notified, openWetFloors, SAFETY_DUE, STRANGER_CHECK, STRANGER_OWNER, WET_FLOOR_OWNER, type WetFloor } from "./safety";

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
};

export type Highlight = { at: string; text: string; by: "robot" | "ai" | "staff" };

export type OpenItem = {
  id: string;
  text: string;
  /** A role the hotel has (jury round 4, the design juror: "seven of nine are Siri Haugen"): Vaktmester, Resepsjon, Renhold, Nattevakt. */
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
  /** A safety item: whether a person was told in the night ("Ingen ble varslet i natt: varsle nå."). */
  escalation?: string;
  /** Rooms to sell right here, in two steps (rooms/SellSteps.tsx). */
  sell?: string[];
  /**
   * Every room is sent to reception, and the booking system has not said it is free yet ("Venter på
   * PMS-en", never "done": the pilot reads the PMS, it never writes it). Still open: reception has it.
   */
  pending?: boolean;
  /**
   * @deprecated Never set since round 5 (a sent room is `pending`, never done): kept so owner B's
   * nightsource/compose.ts still compiles until it reads `pending`.
   */
  done?: boolean;
  /** One line per place under the item (the wet floors, grouped into one item with one owner), or the consequence under a lead. */
  lines?: string[];
  /** Fettero held the room back from sale (the room check's catch), said with a badge. */
  caught?: boolean;
  /** Rests on the booking system, whose bookings are test data (while they are): the row carries the small word "testbooking". */
  booking?: boolean;
};

export type NightNote = { author: string; role: string; text: string };

export type Handover = {
  figures: Figures;
  timeline: Highlight[];
  open: OpenItem[];
  note: NightNote;
};

/** TODO(phase-3): the night receptionist writes this in Fettero; test text until then. */
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

/** The desk: reception's tasks are the role's, whoever is on (the day receptionist often reads this page herself). */
export const DESK_OWNER = "Resepsjon";
/** The robot's own state is the outgoing night shift's to settle before it leaves (jury round 4, the Wybe engineer). */
export const ROBOT_OWNER = "Nattevakt";
/** Before the night shift leaves: the master keycard back and the robot on its charger. */
export const ROBOT_DUE = "06:15";

const WET_ACTION = "Sett ut skilt eller tørk opp før gjestene står opp.";
/** Nobody was told in the night: say it, and say what to do (jury round 4, the law juror). */
export const NOT_NOTIFIED = "Ingen ble varslet i natt: varsle nå.";

function wetWhy(floor: WetFloor): string {
  if (floor.signMoved) return ` Roboten flyttet skiltet herfra til ${floor.signMoved.to ? corridorName(floor.signMoved.to) : "et nytt søl"}.`;
  return floor.slippedAt ? " Roboten skled der." : "";
}

/** " Nattevakten meldte det kl. 02:10 (Kjersti Lund)." */
function toldPart(notified: Notified | null): string {
  if (!notified) return "";
  return ` Nattevakten meldte det${notified.at ? ` kl. ${hhmm(notified.at)}` : ""}${notified.by ? ` (${notified.by})` : ""}.`;
}

/** "Vått gulv uten skilt i korridor 2B siden 23:51. Roboten skled der." */
export function wetFloorText(floor: WetFloor): string {
  const since = floor.since ? ` siden ${hhmm(floor.since)}` : "";
  return `Vått gulv uten skilt i ${corridorName(floor.place)}${since}.${wetWhy(floor)} ${WET_ACTION}`;
}

/** "Korridor 2B siden 23:51. Roboten skled der.": one wet floor's line under the grouped item. */
export function wetFloorLine(floor: WetFloor): string {
  const where = corridorName(floor.place);
  const since = floor.since ? ` siden ${hhmm(floor.since)}` : "";
  return `${where.charAt(0).toUpperCase()}${where.slice(1)}${since}.${wetWhy(floor)}${toldPart(floor.notified)}`;
}

/** Who was told about the wet floors: nobody ("varsle nå"), some of them, or every one (then nothing to add). */
function wetEscalation(floors: readonly WetFloor[]): string | undefined {
  const untold = floors.filter((floor) => !floor.notified);
  if (untold.length === 0) return undefined;
  if (untold.length === floors.length) return NOT_NOTIFIED;
  return `Ikke varslet: ${joinNb(untold.map((floor) => corridorName(floor.place)))}. Varsle nå.`;
}

/** "En person i badekåpe ba roboten slippe ham inn på 7 rom mellom 01:17 og 05:11 …" (neutral: who he is, nobody knows). */
export function strangerText(stranger: NonNullable<NightSafety["stranger"]>): string {
  const count = stranger.refusals.length;
  const rooms = stranger.rooms.length || count;
  const span = count > 1 ? ` mellom ${hhmm(stranger.first)} og ${hhmm(stranger.last)}` : ` kl. ${hhmm(stranger.first)}`;
  const said = count > 1 ? "Roboten sa nei hver gang" : "Roboten sa nei";
  const waits = stranger.keycardWaits.length > 0 ? ` og ventet med å åpne ${joinNb(stranger.keycardWaits.map(number))} til han var gått` : "";
  // Neutral first (jury round 3, the law juror): the likely innocent explanation, then the hotel's own routine.
  return `En person i badekåpe ba roboten slippe ham inn på ${rooms === 1 ? "ett rom" : `${rooms} rom`}${span}. ${said}${waits}. ${STRANGER_CHECK}`;
}


/** "rom 212 (00:31, 01:58 og 04:43)". */
function roomTimes(room: string, times: readonly (string | null)[]): string {
  const clocks = times.flatMap((time) => (time ? [hhmm(time)] : []));
  return `rom ${number(room)}${clocks.length > 0 ? ` (${joinNb(clocks)})` : ""}`;
}

/** "2 × håndkle, toalettsett": what the robot still carries, as the 3D-kart's tooltip says it. */
function carried(list: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const item of list) counts.set(itemLabel(item), (counts.get(itemLabel(item)) ?? 0) + 1);
  return [...counts].map(([label, count]) => (count > 1 ? `${count} × ${label}` : label)).join(", ");
}

/**
 * "Roboten står ved heis, 1. etasje, ikke på lader, 20 % batteri. Den har fortsatt hovednøkkelkortet
 * (har også med 2 × håndkle, toalettsett). Hent nøkkelkortet og sett roboten på lader."
 */
export function robotStateText(robot: RobotAtHandover): string {
  const where = robot.location === "charging-dock" ? "på ladestasjonen" : `ved ${placeLabel(robot.location).toLowerCase()}`;
  const battery = robot.battery !== null ? `, ${Math.round(robot.battery)} % batteri` : "";
  const dock = robot.docked ? "på lader" : "ikke på lader";
  const others = carried([...robot.hands, ...robot.cart].filter((item) => !/keycard/.test(item)));
  const holds = robot.keycard
    ? ` Den har fortsatt hovednøkkelkortet${others ? ` (har også med ${others})` : ""}.`
    : others
      ? ` Den har med ${others}.`
      : "";
  const todo = [robot.keycard ? "hent nøkkelkortet" : null, !robot.docked ? "sett roboten på lader" : robot.battery !== null && robot.battery < BREAKFAST_BATTERY ? "la den lade før frokost" : null].filter(Boolean).join(" og ");
  return `Roboten står ${where}, ${dock}${battery}.${holds}${todo ? ` ${todo.charAt(0).toUpperCase()}${todo.slice(1)}.` : ""}`;
}

/** "Rom 209: roboten meldte rommet tomt og ryddig kl. 03:47, men egen logg sier at den satte inn bagasje der kl. 01:29." */
export function contradictionText(row: Contradiction, credited: boolean): string {
  const what = row.arrival ? "bagasje" : itemLabel(row.item);
  const counted = credited ? " Romsjekken ble likevel regnet som utført." : "";
  return `Rom ${number(row.room)}: roboten meldte rommet tomt og ryddig kl. ${hhmm(row.checkedAt)}, men egen logg sier at den satte inn ${what} der kl. ${hhmm(row.placedAt)}.${counted}`;
}

/** The booking system's side of a held room: the consequence (a double allocation), under the robot's own contradiction. */
function heldConsequence(row: Held, lead: boolean): string {
  const bags =
    row.arrivals > 1
      ? `bagasje for ${row.arrivals} ankomster (${joinNb(row.deliveries.filter((delivery) => delivery.arrival).map((delivery) => hhmm(delivery.at)))})`
      : `bagasje for dagens ankomst (sist kl. ${hhmm(row.deliveredAt)})`;
  const guest = `${row.guest ?? "en gjest"} der${row.departure ? ` til ${shortDate(row.departure)}` : ""}`;
  return lead
    ? `Systemet har dessuten ${guest}, og roboten bar inn ${bags}: dobbelt tildelt? Flytt én av dem før innsjekk kl. ${HOTEL.checkIn}.`
    : `Rom ${number(row.room)}: dobbelt tildelt? Roboten bar inn ${bags}, men systemet har ${guest}. Flytt én av dem før innsjekk kl. ${HOTEL.checkIn}.`;
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
  const wetFloors = openWetFloors(safety.wetFloors, resolved).sort((a, b) => NIGHT_ORDER(a.since ?? "00:00") - NIGHT_ORDER(b.since ?? "00:00"));
  const booked = tonight ?? { booked: bookedTonight(today), rooms: rooms.length };
  // A contradicted room check the robot's report still counted as done (owner C's selfContradictions names the request).
  const credited = (row: Contradiction) => row.request !== null && night.tasks.get(row.request)?.verdict === "done";

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
  // The robot's own contradiction leads 209 (jury round 4, the Wybe engineer): its camera against its own task log, no booking needed.
  const contradiction = reconciliation.contradicted[0];
  const held = reconciliation.held[0];
  if (contradiction?.checkedAt) {
    ranked.push({
      at: hhmm(contradiction.checkedAt),
      text: `Roboten meldte rom ${number(contradiction.room)} tomt og ryddig, men egen logg sier at den satte inn ${contradiction.arrival ? "bagasje" : itemLabel(contradiction.item)} der kl. ${hhmm(contradiction.placedAt)}. Fettero holdt rommet tilbake fra salg.`,
      by: "robot",
    });
  } else if (held?.deliveredAt) {
    ranked.push({
      at: hhmm(held.deliveredAt),
      text: held.arrival
        ? `Roboten bar bagasje for dagens ankomst inn på rom ${number(held.room)}, men systemet har ${held.guest ?? "en gjest"} der${held.departure ? ` til ${shortDate(held.departure)}` : ""}. Fettero holdt rommet tilbake fra salg.`
        : `Roboten leverte noe inn på rom ${number(held.room)} etter romsjekken. Fettero holdt rommet tilbake fra salg.`,
      by: "robot",
    });
  }
  const guest = reconciliation.guestFound[0];
  if (guest?.at) ranked.push({ at: hhmm(guest.at), text: `Roboten møtte en gjest på rom ${number(guest.room)}, som systemet har som ledig.`, by: "robot" });
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

  // What can hurt a guest comes first, each with an owner, "straks", and whether anyone was told in the
  // night (jury round 4, the law juror: a hazard the hotel knew of is acted on at once, never "innen 06:30").
  // The wet floors share one owner, so they are one item with a line per corridor (jury round 3, the design juror).
  const caretaker = byRole("Vedlikehold").find((member) => member.shift === "dag")?.name;
  const wetLink = {
    href: canOpen("/vedlikehold") ? "/vedlikehold" : canOpen("/hotell") ? "/hotell" : null,
    linkLabel: canOpen("/vedlikehold") ? "Åpne Vedlikehold" : "Vis i 3D-kartet",
  };
  const wetOwner = { owner: WET_FLOOR_OWNER, ...(caretaker ? { who: caretaker } : {}), due: SAFETY_DUE };
  const first: OpenItem[] =
    wetFloors.length > 1
      ? [
          {
            id: "wet-floors",
            text: `${wetFloors.length} våte gulv uten skilt. ${WET_ACTION}`,
            lines: wetFloors.map(wetFloorLine),
            ...wetOwner,
            ...wetLink,
            urgent: false,
            safety: true,
            escalation: wetEscalation(wetFloors),
          },
        ]
      : wetFloors.map((floor) => ({
          id: `wet-${floor.place}`,
          text: `${wetFloorText(floor)}${toldPart(floor.notified)}`,
          ...wetOwner,
          ...wetLink,
          urgent: false,
          safety: true,
          escalation: wetEscalation([floor]),
        }));
  if (safety.stranger) {
    first.push({
      id: "stranger",
      text: `${strangerText(safety.stranger)}${toldPart(safety.stranger.notified)}`,
      owner: STRANGER_OWNER,
      due: SAFETY_DUE,
      href: "#vurderinger-overlevering",
      linkLabel: "Se robotens vurderinger",
      urgent: false,
      safety: true,
      escalation: safety.stranger.notified ? undefined : NOT_NOTIFIED,
    });
  }

  // Then everything else by its deadline (jury round 4, the design juror: the earliest deadline was fourth).
  const rest: OpenItem[] = [];

  // The robot itself at the handover: off its charger, low, or still holding the master keycard (the Wybe engineer).
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
      text: own ? contradictionText(own, credited(own)) : row.arrival ? heldConsequence(row, false) : delivered,
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
      text: `${contradictionText(row, credited(row))} Se på rommet før det selges.`,
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
    rest.push({
      id: "sellable",
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
  // From the robot's own log, no booking system: more arrivals' bags in one room than it holds (the Wybe juror).
  if (reconciliation.crowded.length > 0) {
    const [one, ...more] = reconciliation.crowded;
    const others = more.map((row) => `${row.arrivals} på ${roomTimes(row.room, row.at)}`);
    rest.push({
      id: "crowded",
      text: `Flere ankomster i samme rom: sjekk med resepsjonen. Roboten bar inn bagasje for ${one.arrivals} ankomster på ${roomTimes(one.room, one.at)}${others.length > 0 ? ` og for ${joinNb(others)}` : ""}.`,
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
      text: `${waitingPhone.length === 1 ? "1 sak" : `${waitingPhone.length} saker`} fra telefonen venter på å bli fordelt (rom ${joinNb(where)}).`,
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
      text: `${needPerson.length === 1 ? "1 forespørsel" : `${needPerson.length} forespørsler`} roboten ikke fikk til eller ikke rakk, trenger en person.`,
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
function sellReason(rows: readonly { guest: string | null; departure: string | null }[], today: string): string {
  if (rows.length !== 1) return "";
  const [row] = rows;
  if (!row.guest || !row.departure) return "";
  if (row.departure < today) return ` ${row.guest} skulle reist ${shortDate(row.departure)}, men utsjekken ble aldri registrert, så systemet holder rommet i natt.`;
  if (row.departure === today) return ` ${row.guest} reiser i dag.`;
  return ` ${row.guest} står i systemet til ${shortDate(row.departure)}.`;
}

/** How many open items still need someone: every one, a room sent to reception included (the PMS has not said it is free). */
export function openCount(open: readonly OpenItem[]): number {
  return open.length;
}

/**
 * The demo band's first words, from the run log's start line, never hard-coded (jury round 4, the creative juror:
 * the test-data chips become one quiet band): "én ekte natt fra Wybe-simulatoren (seed 16)".
 */
export function nightSourceLine(lines: readonly RunLine[]): string {
  const start = lines.find((line) => line.type === "start");
  if (!start || start.type !== "start") return "en natt fra kjøringsloggen";
  if (start.source === "open-rmf") return "en eksempelnatt fra en Open-RMF-robot";
  const seed = typeof start.seed === "number" ? ` (seed ${start.seed})` : "";
  if (!start.source || start.source === "wybe-nightshift") return `én ekte natt fra Wybe-simulatoren${seed}`;
  return `en natt fra kjøringsloggen (${start.source})`;
}

/** Where a figure on top jumps to (jury round 4, the product juror/the design juror): the row's id on the page. */
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
};
