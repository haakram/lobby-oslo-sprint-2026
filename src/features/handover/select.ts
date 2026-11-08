import { atNight } from "@/features/dashboard/highlights";
import { formatKroner, hhmm } from "@/features/dashboard/format";
import { humanizeText, placeLabel } from "@/features/dashboard/labels";
import type { Night, RoomView } from "@/features/dashboard/selectors";
import type { Tally } from "@/features/nightshift/outcomes";
import type { PhoneTask } from "@/features/requests/phoneTasks";
import type { RequestView } from "@/features/requests/select";
import { type RoomRevenue, sellableValue } from "@/features/rooms/pms";
import type { Reconciliation, RoomCheckMark } from "@/features/rooms/reconcile";
import { byRole, cleanersToday } from "@/features/staff/testData";

/**
 * Overlevering 06:00: the night on one page for the morning manager, composed from what the other
 * screens already know (the robot's run log, the AI receptionist's calls, the booking system, the
 * requests). Pure: the screen passes everything in, the same input always gives the same page.
 */

export type Figures = {
  roomsReady: number;
  roomsTotal: number;
  /** Ready rooms the booking system had as occupied (the robot's room check found them empty). */
  sellable: number;
  /** What those rooms are worth today, NOK: sellable × last night's average rate, to the hundred. */
  sellableValue: number;
  /** The robot's night: the one tally every screen counts with (src/features/nightshift/outcomes.ts). */
  robot: Tally;
  /** Requests the night staff finished themselves (staff and in-room voice, 22:00–06:00), and the calls the AI receptionist took. */
  staffDone: number;
  calls: number;
  /** Guest matters the robot settled: noise, lost things found, spills made safe. */
  guestIssues: { noise: number; lost: number; spill: number };
  revenue: RoomRevenue;
};

export type Highlight = { at: string; text: string; by: "robot" | "ai" | "staff" };

export type OpenItem = {
  id: string;
  text: string;
  owner: string;
  /** Due, wall clock HH:MM. */
  due: string;
  href: string;
  linkLabel: string;
  /** A guest is waiting on it: said with a word as well as the colour. */
  urgent: boolean;
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

export function composeHandover({
  night,
  rooms,
  reconciliation,
  marks,
  requests,
  phone,
  revenue,
}: {
  night: Night;
  rooms: readonly RoomView[];
  reconciliation: Reconciliation;
  /** Today's room-check marks (released for sale, task for reception). */
  marks: Readonly<Record<string, RoomCheckMark>>;
  requests: readonly RequestView[];
  phone: readonly PhoneTask[];
  revenue: RoomRevenue;
}): Handover {
  const tasks = [...night.tasks.values()];
  const doneOf = (kind: string) => tasks.filter((task) => task.kind === kind && task.verdict === "done").length;
  const staffDone = requests.filter(
    (request) => (request.source === "personale" || request.source === "stemme") && request.status === "fullfort" && atNight(request.at),
  ).length;
  const value = sellableValue(reconciliation.sellable.length, revenue);

  const figures: Figures = {
    roomsReady: rooms.filter((room) => room.status === "klar" && !room.closed).length,
    roomsTotal: rooms.length,
    sellable: reconciliation.sellable.length,
    sellableValue: value,
    robot: night.tally,
    staffDone,
    calls: phone.length,
    guestIssues: { noise: doneOf("noise"), lost: doneOf("lost_item"), spill: doneOf("spill") },
    revenue,
  };

  // What happened: a few lines, most telling first, then shown in the night's order.
  const ranked: Highlight[] = [];
  const end = night.clock && night.ended ? night.clock : null;
  if (end) ranked.push({ at: hhmm(end), text: `Roboten avsluttet natten med ${night.tally.done} av ${night.tally.total} oppdrag fullført. Wybe-serveren godkjente ${night.tally.done} av ${night.tally.reported} ferdigmeldinger.`, by: "robot" });
  const sellable = [...reconciliation.sellable].sort((a, b) => NIGHT_ORDER(a.at ?? "00:00") - NIGHT_ORDER(b.at ?? "00:00"));
  if (sellable[0]?.at) {
    const many = sellable.length > 1;
    ranked.push({
      at: hhmm(sellable[0].at),
      text: `Roboten fant ${joinNb(sellable.map((row) => `rom ${number(row.room)}`))} ${many ? "tomme og ryddige" : "tomt og ryddig"}, men systemet sa opptatt. ${many ? "De" : "Det"} kan selges i dag, ca. ${formatKroner(value)} kr.`,
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

  // What is still open: few, each with someone who has it and a time.
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
  const unreleased = reconciliation.sellable.filter((row) => marks[row.room]?.action !== "released");
  if (unreleased.length > 0) {
    open.push({
      id: "sellable",
      text: `Merk ${joinNb(unreleased.map((row) => `rom ${number(row.room)}`))} som ledig for salg (ca. ${formatKroner(sellableValue(unreleased.length, revenue))} kr). Roboten fant ${unreleased.length === 1 ? "det tomt og ryddig" : "dem tomme og ryddige"}.`,
      owner: desk,
      due: "09:00",
      href: "/rom",
      linkLabel: "Åpne Rom",
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

  return { figures, timeline, open, note: NIGHT_NOTE };
}

// ---------------------------------------------------------------------------------------------
// Kvitter mottatt: who took the handover, and when, per day.

export type Signoff = { name: string; at: string };
