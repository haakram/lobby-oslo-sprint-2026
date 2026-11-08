import { formatKroner, hhmm } from "@/features/dashboard/format";
import { foldNight, type RoomView } from "@/features/dashboard/selectors";
import { type DoorSignal, doorLockFlags, doorLockSignals, doorSignalText } from "@/features/doorlock/feed";
import { SAFETY_DUE, STRANGER_OWNER, WET_FLOOR_OWNER } from "@/features/handover/safety";
import { composeHandover, DESK_OWNER, type Handover, type Highlight, MAX_HIGHLIGHTS, type NightNote, type OpenItem } from "@/features/handover/select";
import { EVIDENCE_WORDS, type EvidenceSignal, type EvidenceVerdict, evidenceVerdict } from "@/features/nightshift/conduct";
import type { RunLine } from "@/features/nightshift/runlog";
import type { PhoneTask } from "@/features/requests/phoneTasks";
import type { RequestView } from "@/features/requests/select";
import { shortDate } from "@/features/rooms/money";
import { type PmsRoom, pmsLastNight, revenueLastNight } from "@/features/rooms/pms";
import { type Reconciliation, type RoomCheck, type RoomCheckMark, reconcileRooms } from "@/features/rooms/reconcile";
import {
  entryText,
  inNightHours,
  placePhrase,
  readStaffLog,
  signPhrase,
  type StaffEntry,
  type StaffHazard,
  type StaffRoom,
  staffHazards,
  staffNotes,
  staffRooms,
  statusWord,
} from "@/features/staffinput/read";

/**
 * "Uten robot" (jury round 5, the founder juror/the product juror/the marketing juror): the same Overlevering, built from the sources a hotel
 * without a robot has tonight: the booking system (test data), the door lock's one signal per room
 * (doorlock/feed.ts, test data) and the night clerk's own entries (staffinput/). No robot line goes in:
 * the night is folded from nothing, so every figure the robot would give is zero and every line on the
 * page names the person or the signal it came from.
 *
 * It runs the handover's own composer (`composeHandover`) on those inputs, so the order, owners and
 * deadlines are the robot night's, then writes the room lines with their evidence (the evidence rule in
 * nightshift/conduct.ts: "bekreftet" needs two signals, one from outside the robot; the door lock and the
 * clerk are both outside) and puts the clerk's safety items first. Pure: same input, same page.
 */

export type RoomEvidence = {
  room: string;
  /** What each source said about the room, one sentence each ("Dørlåsen: ingen kort i energibryteren siden kl. 18:00."). */
  lines: string[];
  verdict: EvidenceVerdict;
  /** "bekreftet" · "ikke bekreftet". */
  word: string;
};

export type WithoutRobot = {
  handover: Handover;
  reconciliation: Reconciliation;
  /** Per room the page names: what it rests on. */
  evidence: Map<string, RoomEvidence>;
  /** The safety figure: every item the clerk logged (wet floors, doors, people), and its one line. */
  safety: { count: number; detail: string };
  sources: {
    /** The clerk's entries in force (corrections applied), and how many of them are the sample night. */
    staffEntries: number;
    samples: number;
    clerk: string | null;
    /** Rooms the door lock reported, and how many disagree with the booking system. */
    doorLockRooms: number;
    doorLockFlags: number;
  };
};

/** The night clerk's own hours: an entry outside them (typed by day, on a demo) is said without a clock. */
const inNight = inNightHours;

const NIGHT_ORDER = (clock: string) => {
  const hour = Number(clock.slice(0, 2));
  return (hour < 12 ? hour + 24 : hour) * 60 + Number(clock.slice(3, 5));
};

const number = (room: string) => room.replace(/^room-/, "");

function joinNb(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} og ${items.at(-1)}`;
}

/** "Kjersti Lund kl. 04:24" in the night, "Kjersti Lund" otherwise. */
function byWhen(entry: { by: string; at: string | null }): string {
  return inNight(entry.at) ? `${entry.by} kl. ${hhmm(entry.at)}` : entry.by;
}

function roomEvidence(room: string, door: DoorSignal | undefined, staff: StaffRoom | undefined): RoomEvidence {
  const signals: EvidenceSignal[] = [];
  const lines: string[] = [];
  if (door) {
    signals.push({ signal: "door_lock", origin: "building", detail: doorSignalText(door) });
    lines.push(`Dørlåsen: ${doorSignalText(door)}.`);
  }
  if (staff) {
    signals.push({ signal: "staff_check", origin: "staff", detail: statusWord(staff.status), at: staff.at });
    lines.push(`${staff.by} så ${SAW[staff.status]}${inNight(staff.at) ? ` kl. ${hhmm(staff.at)}` : ""}.`);
  }
  const { verdict } = evidenceVerdict(signals);
  return { room, lines, verdict, word: EVIDENCE_WORDS[verdict] };
}

/** What the clerk saw, after "Kjersti Lund så …". */
const SAW: Record<StaffRoom["status"], string> = { klar: "rommet tomt og ryddig", opptatt: "gjest eller bagasje i rommet", ma_vaskes: "at rommet trenger vask" };

/** "Dørlåsen: ingen kort … siden kl. 18:00. Kjersti Lund så rommet tomt og ryddig kl. 04:24. Bekreftet av to kilder." */
function evidenceSentence(evidence: RoomEvidence): string {
  const word = evidence.word.charAt(0).toUpperCase() + evidence.word.slice(1);
  return `${evidence.lines.join(" ")} ${word}${evidence.verdict === "confirmed" ? " av to kilder" : ""}.`;
}

function guestReason(row: { guest: string | null; departure: string | null }, today: string): string {
  if (!row.guest || !row.departure) return "Systemet holder rommet i natt.";
  if (row.departure < today) return `${row.guest} skulle reist ${shortDate(row.departure)}, men utsjekken ble aldri registrert, så systemet holder rommet i natt.`;
  return `Systemet har ${row.guest} der til ${shortDate(row.departure)}.`;
}

const WET_ACTION = "Sett ut skilt eller tørk opp før gjestene står opp.";
/** A sign is out already: what is left is drying it. */
const WET_ACTION_SIGNED = "Tørk opp før gjestene står opp.";
/** The robot night's last sentence on the sale ("Roboten fant det tomt og ryddig kl. 04:24."). */
const ROBOT_SENTENCE = /\s*Roboten fant\b.*$/s;

function hazardItem(hazard: StaffHazard, canOpen: (route: string) => boolean): OpenItem {
  const told = `meldt av ${byWhen(hazard)}`;
  const note = hazard.note ? ` ${hazard.note.replace(/[.!]?$/, ".")}` : "";
  const link = { href: canOpen("/natt") ? "/natt" : null, linkLabel: "Åpne nattevaktens logg" };
  if (hazard.hazard === "wet") {
    // "skilt satt ut 02:16" or "uten skilt siden 02:15": the clerk's answer to "Skilt satt ut?" (round 6, legal review).
    const sign = signPhrase(hazard);
    return {
      id: `staff-${hazard.id}`,
      text: `Vått gulv ${placePhrase(hazard.place)}, ${told}${sign ? `, ${sign}` : ""}.${note} ${hazard.signed ? WET_ACTION_SIGNED : WET_ACTION}`,
      owner: WET_FLOOR_OWNER,
      due: SAFETY_DUE,
      ...link,
      urgent: false,
      safety: true,
    };
  }
  if (hazard.hazard === "door") {
    return { id: `staff-${hazard.id}`, text: `Dør ${placePhrase(hazard.place)}, ${told}.${note} Sjekk at den er lukket og låst.`, owner: STRANGER_OWNER, due: SAFETY_DUE, ...link, urgent: false, safety: true };
  }
  // Neutral, as the robot night's stranger (jury round 3, the law juror): who it was, nobody knows yet.
  return {
    id: `staff-${hazard.id}`,
    text: `En person ${placePhrase(hazard.place)}, ${told}.${note} Sjekk først om en gjest var låst ute. Ved tvil: avvik etter hotellets rutine.`,
    owner: STRANGER_OWNER,
    due: SAFETY_DUE,
    ...link,
    urgent: false,
    safety: true,
  };
}

/** "Kjersti Lund så rom 213 tomt og ryddig." · "Kjersti Lund meldte vått gulv i lobbyen: Ved inngangen." · "Kjersti Lund satte ut skilt i lobbyen." */
function timelineText(entry: StaffEntry): string {
  if (entry.kind === "sign") return `${entry.by} satte ut skilt${entry.place ? ` ${placePhrase(entry.place)}` : ""}.`;
  if (entry.kind === "room") {
    const room = `rom ${number(entry.room)}`;
    if (entry.status === "klar") return `${entry.by} så ${room} tomt og ryddig.`;
    if (entry.status === "opptatt") return `${entry.by} så gjest eller bagasje på ${room}.`;
    return `${entry.by} meldte at ${room} trenger vask.`;
  }
  const text = entryText(entry);
  const said = entry.kind === "note" ? text : `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
  return `${entry.by} meldte ${said}${/[.!?]$/.test(said) ? "" : "."}`;
}

function clerkNote(entries: readonly StaffEntry[]): NightNote {
  const notes = staffNotes(entries);
  const clerk = notes.at(-1)?.by ?? entries.at(-1)?.by ?? "Nattevakten";
  if (notes.length === 0) return { author: clerk, role: "Nattevakt", text: "Ingen notat fra nattevakten i natt." };
  return { author: clerk, role: "Nattevakt", text: notes.map((note) => note.text).join(" ") };
}

/**
 * The night clerk's own note for the robot night too (Med robot): her notes on this device and the sample
 * night, or null when she wrote none (the page keeps its own text then).
 */
export function clerkNoteOf(staff: readonly RunLine[]): NightNote | null {
  const entries = readStaffLog(staff);
  return staffNotes(entries).length > 0 ? clerkNote(entries) : null;
}

export function composeWithoutRobot({
  staff,
  doorLock,
  rooms,
  marks,
  requests,
  phone,
  today,
  pms = pmsLastNight(today),
  canOpen = () => true,
}: {
  /** The night clerk's run-log lines (entries.ts), the sample night included when it is on. */
  staff: readonly RunLine[];
  /** The door lock's run-log lines (doorlock/feed.ts). */
  doorLock: readonly RunLine[];
  /** Tonight's rooms (their robot statuses are dropped; the clerk's are used). */
  rooms: readonly RoomView[];
  marks: Readonly<Record<string, RoomCheckMark>>;
  /** The night's requests; the robot's own are left out. */
  requests: readonly RequestView[];
  phone: readonly PhoneTask[];
  today: string;
  pms?: ReadonlyMap<string, PmsRoom>;
  canOpen?: (route: string) => boolean;
}): WithoutRobot {
  // A robot hazard she acknowledged belongs to the robot night; with no robot, it is not one of her entries.
  const entries = readStaffLog(staff).filter((entry) => entry.kind !== "ack");
  const clerkRooms = staffRooms(entries);
  const hazards = staffHazards(entries).sort((a, b) => NIGHT_ORDER(a.at ?? "22:00") - NIGHT_ORDER(b.at ?? "22:00"));
  const signals = doorLockSignals(doorLock);
  const flags = doorLockFlags(signals, pms);

  // The room check from people and the building: the clerk's look inside is a room check; a guest card in
  // the energy slot says the room is in use. A booked room with no card and nobody's look is a flag below.
  const checks = new Map<string, RoomCheck>();
  for (const signal of signals.values()) {
    if (signal.signal === "card_in") checks.set(signal.room, { room: signal.room, status: "opptatt", source: "lock", at: signal.since, note: null });
  }
  for (const entry of clerkRooms.values()) {
    checks.set(entry.room, { room: entry.room, status: entry.status, source: entry.status === "klar" ? "room_check" : "staff", at: entry.at, note: null });
  }
  const reconciliation = reconcileRooms(checks, pms, new Map(), today);

  const shownRooms: RoomView[] = rooms.map((room) => {
    const seen = clerkRooms.get(room.id);
    return { ...room, status: seen?.status ?? "ukjent", source: seen ? "staff" : null, statusAt: seen?.at ?? null, openOrders: 0, held: false, toConfirm: false };
  });
  const revenue = revenueLastNight(rooms.length || 36, pms);

  const base = composeHandover({
    night: foldNight([]),
    rooms: shownRooms,
    reconciliation,
    marks,
    requests: requests.filter((request) => request.source !== "robot"),
    phone,
    revenue,
    today,
    pms,
    safety: { wetFloors: [], stranger: null },
    note: clerkNote(entries),
    canOpen,
  });

  const evidence = new Map<string, RoomEvidence>();
  const evidenceOf = (room: string) => {
    const known = evidence.get(room);
    if (known) return known;
    const made = roomEvidence(room, signals.get(room), clerkRooms.get(room));
    evidence.set(room, made);
    return made;
  };

  // The sale keeps the handover's money words; the robot's sentence gives way to the evidence it rests on.
  const open = base.open.map((item): OpenItem => {
    if (item.id === "sellable" && !item.pending) {
      const toSell = base.figures.money.toSell;
      const proof = toSell.map((row) => evidenceSentence(evidenceOf(row.room))).join(" ");
      if (ROBOT_SENTENCE.test(item.text)) return { ...item, text: item.text.replace(ROBOT_SENTENCE, ` ${proof}`) };
      if (!/robot/i.test(item.text)) return { ...item, text: `${item.text} ${proof}` };
      const rooms = joinNb(toSell.map((row) => `Rom ${number(row.room)}`));
      const reasons = toSell.length === 1 ? ` ${guestReason(toSell[0], today)}` : "";
      return { ...item, text: `${rooms} kan selges etter bekreftelse: ca. ${formatKroner(base.figures.money.toSellValue)} kr hvis natten blir utsolgt.${reasons} ${proof}` };
    }
    const guest = /^guest-(room-\d+)$/.exec(item.id);
    if (guest) return { ...item, text: `${item.text} ${evidenceSentence(evidenceOf(guest[1]))}` };
    return item;
  });

  // What the door lock flagged that nobody looked at, and looks taken too early to prove a room empty.
  const lookLink = { href: canOpen("/natt") ? "/natt" : null, linkLabel: "Åpne nattevaktens logg" };
  const roomItems: OpenItem[] = [];
  for (const flag of flags) {
    if (flag.kind !== "empty" || clerkRooms.has(flag.room)) continue;
    roomItems.push({
      id: `lock-${flag.room}`,
      // The lock's word once, in the evidence at the end (round 6: a third fewer words on the page).
      text: `Rom ${number(flag.room)}: ${guestReason(flag, today)} Ingen har sett i rommet: sjekk det før det selges. ${evidenceSentence(evidenceOf(flag.room))}`,
      owner: DESK_OWNER,
      due: "09:00",
      ...lookLink,
      urgent: false,
      booking: true,
    });
  }
  for (const row of reconciliation.tooEarly) {
    const entry = clerkRooms.get(row.room);
    roomItems.push({
      id: `early-${row.room}`,
      text: `Rom ${number(row.room)}: ${entry ? byWhen(entry) : "nattevakten"} fant det tomt. ${guestReason(row, today)} For tidlig til å vite at gjesten har reist: sjekk igjen etter kl. 01:00.`,
      owner: DESK_OWNER,
      due: "09:00",
      ...lookLink,
      urgent: false,
      booking: true,
    });
  }

  const isRoomCheck = (item: OpenItem) => item.id === "sellable" || item.id.startsWith("held-") || item.id === "crowded";
  const safetyItems = hazards.map((hazard) => hazardItem(hazard, canOpen));

  // What happened: the clerk's entries and the calls; nothing from a robot.
  const clerkLines: Highlight[] = entries
    .filter((entry) => !entry.retracted && entry.kind !== "note" && entry.at)
    .map((entry) => ({ at: hhmm(entry.at as string), text: timelineText(entry), by: "staff" as const }));
  const timeline = [...clerkLines, ...base.timeline.filter((line) => line.by !== "robot")]
    .slice(0, MAX_HIGHLIGHTS)
    .sort((a, b) => NIGHT_ORDER(a.at) - NIGHT_ORDER(b.at));

  const wet = hazards.filter((hazard) => hazard.hazard === "wet").length;
  const doors = hazards.filter((hazard) => hazard.hazard === "door").length;
  const people = hazards.filter((hazard) => hazard.hazard === "person").length;
  const detailParts = [wet ? `${wet} ${wet === 1 ? "vått gulv" : "våte gulv"}` : null, doors ? `${doors} ${doors === 1 ? "dør" : "dører"}` : null, people ? `${people} ${people === 1 ? "person" : "personer"}` : null].filter(Boolean);
  const active = entries.filter((entry) => !entry.retracted);

  return {
    handover: {
      figures: { ...base.figures, safety: { wetFloors: wet, stranger: people > 0 } },
      timeline,
      open: [...safetyItems, ...open.filter(isRoomCheck), ...roomItems, ...open.filter((item) => !isRoomCheck(item))],
      note: base.note,
    },
    reconciliation,
    evidence,
    safety: { count: hazards.length, detail: detailParts.length > 0 ? `${detailParts.join(" · ")}, meldt av nattevakten` : "Nattevakten meldte ingenting som kan skade en gjest" },
    sources: {
      staffEntries: active.length,
      samples: active.filter((entry) => entry.sample).length,
      clerk: active.at(-1)?.by ?? null,
      doorLockRooms: signals.size,
      doorLockFlags: flags.length,
    },
  };
}
