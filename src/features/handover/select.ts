import { atNight } from "@/features/dashboard/highlights";
import { formatKroner, hhmm } from "@/features/dashboard/format";
import { humanizeText, placeLabel } from "@/features/dashboard/labels";
import type { Night, RoomView } from "@/features/dashboard/selectors";
import type { Tally } from "@/features/nightshift/outcomes";
import type { PhoneTask } from "@/features/requests/phoneTasks";
import type { RequestView } from "@/features/requests/select";
import { type RoomMoney, roomMoney, shortDate } from "@/features/rooms/money";
import { type PmsRoom, pmsLastNight, type RoomRevenue } from "@/features/rooms/pms";
import type { Reconciliation, RoomCheckMark } from "@/features/rooms/reconcile";
import { osloToday } from "@/features/reception/dates";
import { byRole, cleanersToday } from "@/features/staff/testData";
import { corridorName, type NightSafety, openWetFloors, SAFETY_DUE, STRANGER_OWNER, WET_FLOOR_OWNER, type WetFloor } from "./safety";

/**
 * Overlevering 06:00: the night on one page for the morning manager, composed from what the other
 * screens already know (the robot's run log, the AI receptionist's calls, the booking system, the
 * requests). Pure: the screen passes everything in, the same input always gives the same page.
 */

export type Figures = {
  /** Klare til salg: ready, free in the booking system or released today (the one figure Rom and Oversikt show). */
  roomsReady: number;
  roomsTotal: number;
  /** The room check's money: to sell after confirmation, released today, held back (rooms/money.ts). */
  money: RoomMoney;
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
  owner: string;
  /** Due, wall clock HH:MM. */
  due: string;
  /** Null when the reader's role can't open the screen it belongs to. */
  href: string | null;
  linkLabel: string;
  /** A guest is waiting on it: said with a word as well as the colour. */
  urgent: boolean;
  /** Can hurt a guest (a wet floor, a stranger at the doors): first on the page, said with a word. */
  safety?: boolean;
  /** Rooms to sell right here, in two steps (rooms/SellSteps.tsx). */
  sell?: string[];
  /** Done today but kept in place, so its result (and Angre) stays where it was taken: not counted as open. */
  done?: boolean;
};

export type NightNote = { author: string; role: string; text: string };

export type Handover = {
  figures: Figures;
  timeline: Highlight[];
  open: OpenItem[];
  note: NightNote;
};

/** TODO(phase-3): the night receptionist writes this in Lobby; test text until then. */
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

export { SAFETY_DUE, STRANGER_OWNER, WET_FLOOR_OWNER } from "./safety";

/** "Vått gulv uten skilt i korridor 2B siden 23:51. Roboten skled der." */
export function wetFloorText(floor: WetFloor): string {
  const where = corridorName(floor.place);
  const since = floor.since ? ` siden ${hhmm(floor.since)}` : "";
  const why = floor.signMoved
    ? ` Roboten flyttet skiltet herfra til ${floor.signMoved.to ? corridorName(floor.signMoved.to) : "et nytt søl"}.`
    : floor.slippedAt
      ? " Roboten skled der."
      : "";
  return `Vått gulv uten skilt i ${where}${since}.${why} Sett ut skilt eller tørk opp før gjestene står opp.`;
}

/** "En person i badekåpe ba roboten slippe ham inn på 7 rom mellom 01:17 og 05:11 …" (neutral: who he is, nobody knows). */
export function strangerText(stranger: NonNullable<NightSafety["stranger"]>): string {
  const count = stranger.refusals.length;
  const rooms = stranger.rooms.length || count;
  const doors = stranger.rooms.length > 0 ? ` (${joinNb(stranger.rooms)})` : "";
  const span = count > 1 ? ` mellom ${hhmm(stranger.first)} og ${hhmm(stranger.last)}` : ` kl. ${hhmm(stranger.first)}`;
  const said = count > 1 ? "Roboten sa nei hver gang" : "Roboten sa nei";
  const waits = stranger.keycardWaits.length > 0 ? ` og ventet med å åpne ${joinNb(stranger.keycardWaits.map(number))} til han var gått` : "";
  return `En person i badekåpe ba roboten slippe ham inn på ${rooms === 1 ? "ett rom" : `${rooms} rom`}${span}${doors}. ${said}${waits}. Ingen har sjekket hvem han er: se på kamera og skriv en avviksmelding.`;
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
  resolved = () => false,
  canOpen = () => true,
}: {
  night: Night;
  rooms: readonly RoomView[];
  reconciliation: Reconciliation;
  /** Today's room-check marks (confirmed, released for sale, task for reception). */
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

  const figures: Figures = {
    roomsReady: money.readyToSell ?? 0,
    roomsTotal: rooms.length,
    money,
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
  if (end) ranked.push({ at: hhmm(end), text: `Roboten avsluttet natten med ${night.tally.done} av ${night.tally.total} oppdrag fullført. Dommeren i Wybe-simulatoren godkjente ${night.tally.done} av ${night.tally.reported} ferdigmeldinger.`, by: "robot" });
  const sellable = [...reconciliation.sellable].sort((a, b) => NIGHT_ORDER(a.at ?? "00:00") - NIGHT_ORDER(b.at ?? "00:00"));
  if (sellable[0]?.at) {
    const many = sellable.length > 1;
    ranked.push({
      at: hhmm(sellable[0].at),
      text: `Roboten fant ${joinNb(sellable.map((row) => `rom ${number(row.room)}`))} ${many ? "tomme og ryddige" : "tomt og ryddig"}, men systemet sa opptatt. ${many ? "De" : "Det"} kan selges etter bekreftelse, ca. ${formatKroner(money.toSellValue + money.releasedValue)} kr.`,
      by: "robot",
    });
  }
  const held = reconciliation.held[0];
  if (held?.deliveredAt) {
    ranked.push({
      at: hhmm(held.deliveredAt),
      text: held.arrival
        ? `Roboten bar bagasje for dagens ankomst inn på rom ${number(held.room)}, men systemet har ${held.guest ?? "en gjest"} der${held.departure ? ` til ${shortDate(held.departure)}` : ""}. Rommet ble holdt tilbake fra salg.`
        : `Roboten leverte noe inn på rom ${number(held.room)} etter romsjekken. Rommet ble holdt tilbake fra salg.`,
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

  // What can hurt a guest comes first, each with an owner and a time (jury round 2: the page that says
  // "every item has an owner" left out the wet floors and the stranger), longest-standing first.
  const first: OpenItem[] = wetFloors.map((floor) => ({
    id: `wet-${floor.place}`,
    text: wetFloorText(floor),
    owner: WET_FLOOR_OWNER,
    due: SAFETY_DUE,
    href: canOpen("/vedlikehold") ? "/vedlikehold" : canOpen("/hotell") ? "/hotell" : null,
    linkLabel: canOpen("/vedlikehold") ? "Åpne Vedlikehold" : "Vis i 3D-kartet",
    urgent: false,
    safety: true,
  }));
  if (safety.stranger) {
    first.push({
      id: "stranger",
      text: strangerText(safety.stranger),
      owner: STRANGER_OWNER,
      due: SAFETY_DUE,
      href: "#vurderinger-overlevering",
      linkLabel: "Se robotens vurderinger",
      urgent: false,
      safety: true,
    });
  }

  // The rest: few, each with someone who has it and a time.
  const desk = byRole("Resepsjon").find((member) => member.shift === "dag")?.name ?? "Resepsjonen";
  const cleaners = cleanersToday().map((member) => member.name.split(" ")[0]);
  const open: OpenItem[] = [];
  const waitingPhone = requests.filter((request) => request.phone && request.status === "venter");
  if (waitingPhone.length > 0) {
    const where = [...new Set(waitingPhone.map((request) => number(request.room ?? "")))];
    open.push({
      id: "phone",
      text: `${waitingPhone.length === 1 ? "1 sak" : `${waitingPhone.length} saker`} fra telefonen venter på å bli fordelt (rom ${joinNb(where)}).`,
      owner: desk,
      due: "07:00",
      href: "/foresporsler",
      linkLabel: "Åpne Forespørsler",
      urgent: true,
    });
  }
  for (const row of reconciliation.guestFound) {
    const tasked = marks[row.room]?.action === "task";
    open.push({
      id: `guest-${row.room}`,
      text: `${placeLabel(row.room)}: en gjest uten booking. Sjekk registreringen${tasked ? " (oppgave laget)" : ""}.`,
      owner: desk,
      due: "08:00",
      href: tasked ? "/foresporsler" : "/rom",
      linkLabel: tasked ? "Åpne Forespørsler" : "Åpne Rom",
      urgent: false,
    });
  }
  // Sold right here in two steps; the row stays once every room is released, so its result and Angre stay put.
  if (reconciliation.sellable.length > 0) {
    const toSell = money.toSell;
    open.push({
      id: "sellable",
      text:
        toSell.length > 0
          ? `${joinNb(toSell.map((row) => `Rom ${number(row.room)}`))} kan selges etter bekreftelse (ca. ${formatKroner(money.toSellValue)} kr). Roboten fant ${toSell.length === 1 ? `det tomt og ryddig kl. ${hhmm(toSell[0].at)}` : "dem tomme og ryddige"}${sellReason(toSell, today)}.`
          : `${joinNb(money.released.map((row) => `Rom ${number(row.room)}`))} er lagt ut for salg i dag (ca. ${formatKroner(money.releasedValue)} kr).`,
      owner: desk,
      due: "09:00",
      href: "/rom",
      linkLabel: "Åpne Rom",
      urgent: false,
      sell: reconciliation.sellable.map((row) => row.room),
      done: toSell.length === 0,
    });
  }
  for (const row of reconciliation.held) {
    open.push({
      id: `held-${row.room}`,
      text: row.arrival
        ? `Rom ${number(row.room)}: dobbelt tildelt? Roboten bar inn bagasje for dagens ankomst (sist kl. ${hhmm(row.deliveredAt)}), men systemet har ${row.guest ?? "en gjest"} der${row.departure ? ` til ${shortDate(row.departure)}` : ""}. Flytt én av dem før innsjekk kl. 15:00.`
        : `Rom ${number(row.room)}: roboten leverte noe inn etter romsjekken kl. ${hhmm(row.deliveredAt)}, så rommet er i bruk. Sjekk bookingen før det selges.`,
      owner: desk,
      due: "12:00",
      href: canOpen("/gjester") ? "/gjester" : null,
      linkLabel: "Åpne Gjester",
      urgent: false,
    });
  }
  // Only what the robot handed back: a refusal on good grounds or a request the night manager called off needs nobody.
  const needPerson = requests.filter((request) => !request.phone && request.source === "robot" && !request.badge && (request.status === "venter" || request.status === "feilet"));
  if (needPerson.length > 0) {
    open.push({
      id: "robot",
      text: `${needPerson.length === 1 ? "1 forespørsel" : `${needPerson.length} forespørsler`} roboten ikke fikk til eller ikke rakk, trenger en person.`,
      owner: desk,
      due: "10:00",
      href: "/foresporsler",
      linkLabel: "Åpne Forespørsler",
      urgent: false,
    });
  }
  const dirty = rooms.filter((room) => room.status === "ma_vaskes");
  if (dirty.length > 0) {
    open.push({
      id: "clean",
      text: dirty.length === 1 ? `Rom ${dirty[0].number} må vaskes før innsjekk kl. 15:00.` : `${dirty.length} rom må vaskes før innsjekk kl. 15:00: ${joinNb(dirty.map((room) => room.number))}.`,
      owner: cleaners.length ? `Renhold: ${joinNb(cleaners)}` : "Renhold",
      due: "14:00",
      href: "/rom",
      linkLabel: "Åpne Rom",
      urgent: false,
    });
  }
  open.sort((a, b) => a.due.localeCompare(b.due));

  return { figures, timeline, open: [...first, ...open], note: NIGHT_NOTE };
}

/** ". Ola Nygård skulle reise i dag og har ikke sjekket ut" for one room; the booking's end otherwise. */
function sellReason(rows: readonly { guest: string | null; departure: string | null }[], today: string): string {
  if (rows.length !== 1) return "";
  const [row] = rows;
  if (!row.guest || !row.departure) return "";
  return row.departure <= today ? `. ${row.guest} skulle reise i dag og har ikke sjekket ut` : `. ${row.guest} står i systemet til ${shortDate(row.departure)}`;
}

/** How many open items still need someone (a sale done today stays in the list, but is not open). */
export function openCount(open: readonly OpenItem[]): number {
  return open.filter((item) => !item.done).length;
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
