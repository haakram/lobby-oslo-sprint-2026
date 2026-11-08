import { robotJudgement, type StrangerRefusal } from "@/features/nightshift/judgement";
import type { RunLine } from "@/features/nightshift/runlog";
import { placeLabel } from "@/features/dashboard/labels";
import { readStaffLog, signPhrase, staffAcks, type StaffHazard, staffHazards } from "@/features/staffinput/read";
import { type HazardWait, hazardWait, robotHazardKey } from "@/features/staffinput/robotHazards";

/**
 * What can hurt a guest, read from the robot's run log, for the top of Overlevering's *Åpent nå* and
 * the bell (round 2: the handover promised "every item has an owner" and left out the unsigned
 * wet floors and the stranger). Pure; derived from the log, nothing named for the demo night.
 *
 * - **Wet floors without a sign at the end**: a `work_order` "Vått gulv ved …" (no request, no sign)
 *   with no wet-floor sign placed at that place after it, or whose sign the robot later moved to a
 *   newer spill (`sign_moved`: the old place is bare again). The same rule as Vedlikehold and the bell
 *   (maintenance/select.ts `unsignedWetFloors`), with the times a person needs: wet since when, the
 *   robot slipped there (`wet_floor` with `slipped`), the sign moved away at what time and to where.
 * - **The stranger**: the robot's refusals to let a person in (`robotJudgement`, the same count as the
 *   judgement card), one incident with its first and last time and the doors.
 * - **Who was told** (round 4, legal review): a hazard the hotel knew about is the hotel's to act on at
 *   once, so each item says whether a person was told in the night (a staff entry for the same place, or
 *   the night clerk's *Kvitter* on the robot's hazard on /natt: `acknowledged` under `robotHazardKey`)
 *   and how long it waited for one (round 6, domain review: "6 t 9 min uten at noen ble varslet").
 * - **The night clerk's own entries are added, never dropped** (round 6, product review: *Med robot*
 *   replaced her 02:15 lobby floor): a wet floor she logged where the robot reported none is one more
 *   floor (`source: "staff"`, with her answer to "Skilt satt ut?"); a door she logged, or a person when
 *   the robot refused nobody, is one more item (`staff`). Where both reported the same place, it is one
 *   floor: the robot's, with her entry as who was told.
 */

/** Who owns what can hurt a guest (round 3; round 4: real roles, not one name for everything). */
export const WET_FLOOR_OWNER = "Vaktmester";
export const STRANGER_OWNER = "Resepsjon";
/**
 * A known hazard is acted on at once (round 4, legal review: "siden 23:51 … innen 06:30" read as a
 * scheduled six-and-a-half-hour delay): the deadline is "straks", with who was told beside it.
 */
export const SAFETY_DUE = "straks";

/** What to do about the stranger, in the neutral words Overlevering and the bell share (round 3, legal review; round 4, design review). */
export const STRANGER_CHECK = "Sjekk først om en gjest var låst ute (ring rommene, se nøkkelkortloggen). Ved tvil: avvik etter hotellets rutine.";

/**
 * A person knew about it in the night: when (HH:MM:SS), who, and how: her *Kvitter* on the robot's report
 * on /natt (`ack`), or her own entry for the same place (`entry`).
 */
export type Notified = { at: string | null; by: string | null; how?: "ack" | "entry" };

/** How long a hazard waited for a person: to the first one who knew in the night, else to 06:00 (staffinput/robotHazards.ts). */
export type Waited = HazardWait;

export type WetFloor = {
  /** "corridor-2b". */
  place: string;
  /** The run log's work orders behind it (`wo-<line>`, the ids Vedlikehold marks Løst). */
  orderIds: string[];
  /** Wet and without a sign since, HH:MM:SS: the first report, or when its sign was moved away. */
  since: string | null;
  /** When the robot slipped there, if it did. */
  slippedAt: string | null;
  /** The sign that stood here was moved to a newer spill: when, and to where. */
  signMoved: { at: string | null; to: string | null } | null;
  /** The night staff knew in the night (her entry for this place, or her Kvitter on the robot's report), or null: nobody was told. */
  notified: Notified | null;
  /** Who reported it: the robot (a work order), or the night staff alone (no work order; `reported` says who). */
  source: "robot" | "staff";
  /** The night staff's report when she logged it herself: who, and when. */
  reported: Notified | null;
  /** A sign is out, by the night staff's word ("Skilt satt ut?": yes, or a sign put out later). */
  signed: boolean;
  /** Her answer in the handover's words: "skilt satt ut 02:16" · "uten skilt siden 02:15"; null when she logged nothing here. */
  sign: string | null;
  /** The robot's report: how long it waited for a person. Null for a floor the night staff reported herself. */
  waited: Waited | null;
};

/** What the night clerk logged that the robot did not: a door, or a person when the robot refused nobody. */
export type StaffSafety = { id: string; hazard: "door" | "person"; place: string; at: string | null; by: string; note: string | null };

export type StrangerIncident = {
  refusals: StrangerRefusal[];
  /** HH:MM:SS of the first and the last refusal. */
  first: string;
  last: string;
  /** The rooms he asked to be let into, in order, each once. */
  rooms: string[];
  /** Rooms the robot waited to open until he was gone. */
  keycardWaits: string[];
  /** The night staff knew in the night (her "unknown person" entry, or her Kvitter on the robot's report), or null: nobody was told. */
  notified: Notified | null;
  /** From the first refusal to the first person who knew, else to 06:00. */
  waited: Waited;
};

export type NightSafety = {
  wetFloors: WetFloor[];
  stranger: StrangerIncident | null;
  /** The night clerk's own doors and persons the robot's log has no item for (none without her log). */
  staff?: StaffSafety[];
};

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

type Sign = { place: string; request: string | null; index: number; moved: { at: string | null; for: string | null } | null };

/** An entry the night staff made (the night clerk's log writes the robot's line kinds with `source: "staff"`). */
function fromStaff(line: RunLine): boolean {
  if (line.type !== "decision") return false;
  const data = (line.data ?? {}) as Record<string, unknown>;
  return data.source === "staff" || (line as { source?: unknown }).source === "staff";
}

const told = (entry: { at: string | null; by: string }, how: "ack" | "entry"): Notified => ({ at: entry.at, by: entry.by, how });

/**
 * `staff` is the night clerk's own log (/natt, `source: "staff"` lines), read with her screen's own
 * reader (staffinput/read.ts: corrections applied, a sign put out later marks its floor signed). Staff
 * lines inside `lines` are read the same way. Without any, the result is the robot's alone (the bell,
 * Oversikt and Vedlikehold read it so).
 */
export function nightSafety(lines: readonly RunLine[], staff: readonly RunLine[] = []): NightSafety {
  const wet: { id: string; place: string; at: string | null; index: number }[] = [];
  const signs: Sign[] = [];
  const slips = new Map<string, string | null>();
  let clock: string | null = null;
  const entries = readStaffLog([...staff, ...lines.filter(fromStaff)]);
  const hazards = staffHazards(entries);
  const acks = staffAcks(entries);
  const wetByPlace = new Map<string, StaffHazard>();
  for (const hazard of hazards) if (hazard.hazard === "wet" && !wetByPlace.has(hazard.place)) wetByPlace.set(hazard.place, hazard);
  const persons = hazards.filter((hazard) => hazard.hazard === "person");

  lines.forEach((line, index) => {
    if ((line.type === "call" || line.type === "state") && line.clock) clock = line.clock;
    if (line.type !== "decision" || fromStaff(line)) return;
    const data = (line.data ?? {}) as Record<string, unknown>;
    if (line.kind === "work_order" && data.type === "sol") {
      const place = str(data.place);
      const text = str(data.text) ?? "";
      if (!place) return;
      if (/varselskilt/i.test(text)) signs.push({ place, request: str(data.request), index, moved: null });
      else if (!data.request) wet.push({ id: `wo-${index}`, place, at: clock, index });
    }
    if (line.kind === "sign_moved") {
      const old = str(data.old_request);
      const sign = signs.find((entry) => entry.request !== null && entry.request === old);
      if (sign) sign.moved = { at: clock, for: str(data.request) };
    }
    if (line.kind === "wet_floor" && data.slipped === true && Array.isArray(data.edge)) {
      const to = str(data.edge.at(-1));
      if (to && !slips.has(to)) slips.set(to, clock);
    }
  });

  const byPlace = new Map<string, WetFloor>();
  for (const order of wet) {
    const later = signs.filter((sign) => sign.place === order.place && sign.index > order.index);
    if (later.some((sign) => !sign.moved)) continue;
    const moved = later.find((sign) => sign.moved);
    const to = moved?.moved?.for ? (signs.find((sign) => sign.request === moved.moved?.for)?.place ?? null) : null;
    const known = byPlace.get(order.place);
    if (known) {
      known.orderIds.push(order.id);
      continue;
    }
    const since = moved?.moved?.at ?? order.at;
    const clerk = wetByPlace.get(order.place);
    // Who knew first in the night: her Kvitter on this very report on /natt, else her own entry for the place.
    const ack = acks.get(robotHazardKey({ hazard: "wet", place: order.place, since }));
    const notified = ack ? told(ack, "ack") : clerk ? told(clerk, "entry") : null;
    byPlace.set(order.place, {
      place: order.place,
      orderIds: [order.id],
      since,
      slippedAt: slips.get(order.place) ?? null,
      signMoved: moved?.moved ? { at: moved.moved.at, to } : null,
      notified,
      source: "robot",
      reported: null,
      signed: clerk?.signed === true,
      sign: clerk ? signPhrase(clerk) : null,
      waited: hazardWait(since, notified),
    });
  }
  // Her own wet floors where the robot reported none: added, never dropped (round 6, product review).
  for (const [place, clerk] of wetByPlace) {
    if (byPlace.has(place)) continue;
    byPlace.set(place, {
      place,
      orderIds: [],
      since: clerk.since ?? clerk.at,
      slippedAt: null,
      signMoved: null,
      notified: told(clerk, "entry"),
      source: "staff",
      reported: told(clerk, "entry"),
      signed: clerk.signed === true,
      sign: signPhrase(clerk),
      waited: null,
    });
  }

  const { strangers } = robotJudgement(lines);
  const refusals = strangers.refusals;
  let stranger: StrangerIncident | null = null;
  if (refusals.length > 0) {
    const first = refusals[0].clock;
    const ack = acks.get(robotHazardKey({ hazard: "person", since: first }));
    const notified = ack ? told(ack, "ack") : persons[0] ? told(persons[0], "entry") : null;
    stranger = {
      refusals,
      first,
      last: refusals.at(-1)?.clock ?? first,
      rooms: strangers.rooms,
      keycardWaits: strangers.keycardWaits,
      notified,
      waited: hazardWait(first, notified),
    };
  }
  // Her doors always, her persons when the robot refused nobody (otherwise she is who knew about him).
  const extra: StaffSafety[] = hazards
    .filter((hazard) => hazard.hazard === "door" || (hazard.hazard === "person" && !stranger))
    .map((hazard) => ({ id: hazard.id, hazard: hazard.hazard as "door" | "person", place: hazard.place, at: hazard.at, by: hazard.by, note: hazard.note }));

  return { wetFloors: [...byPlace.values()], stranger, ...(extra.length > 0 ? { staff: extra } : {}) };
}

/**
 * The wet floors nobody has marked Løst on Vedlikehold (a place is open while any of its orders is). A
 * floor the night staff reported herself has no work order, so it stays open.
 */
export function openWetFloors(wetFloors: readonly WetFloor[], resolved: (orderId: string) => boolean): WetFloor[] {
  return wetFloors.filter((floor) => floor.orderIds.length === 0 || floor.orderIds.some((id) => !resolved(id)));
}

/** "korridor 2B" from "corridor-2b": how the corridor signs read, inside a sentence. */
export function corridorName(place: string): string {
  const label = placeLabel(place);
  return label.charAt(0).toLowerCase() + label.slice(1);
}
