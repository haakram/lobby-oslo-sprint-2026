import { robotJudgement, type StrangerRefusal } from "@/features/nightshift/judgement";
import type { RunLine } from "@/features/nightshift/runlog";
import { placeLabel } from "@/features/dashboard/labels";

/**
 * What can hurt a guest, read from the robot's run log, for the top of Overlevering's *Åpent nå* and
 * the bell (jury round 2: the handover promised "every item has an owner" and left out the unsigned
 * wet floors and the stranger). Pure; derived from the log, nothing named for the demo night.
 *
 * - **Wet floors without a sign at the end**: a `work_order` "Vått gulv ved …" (no request, no sign)
 *   with no wet-floor sign placed at that place after it, or whose sign the robot later moved to a
 *   newer spill (`sign_moved`: the old place is bare again). The same rule as Vedlikehold and the bell
 *   (maintenance/select.ts `unsignedWetFloors`), with the times a person needs: wet since when, the
 *   robot slipped there (`wet_floor` with `slipped`), the sign moved away at what time and to where.
 * - **The stranger**: the robot's refusals to let a person in (`robotJudgement`, the same count as the
 *   judgement card), one incident with its first and last time and the doors.
 */

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
};

export type StrangerIncident = {
  refusals: StrangerRefusal[];
  /** HH:MM:SS of the first and the last refusal. */
  first: string;
  last: string;
  /** The rooms he asked to be let into, in order, each once. */
  rooms: string[];
  /** Rooms the robot waited to open until he was gone. */
  keycardWaits: string[];
};

export type NightSafety = { wetFloors: WetFloor[]; stranger: StrangerIncident | null };

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

type Sign = { place: string; request: string | null; index: number; moved: { at: string | null; for: string | null } | null };

export function nightSafety(lines: readonly RunLine[]): NightSafety {
  const wet: { id: string; place: string; at: string | null; index: number }[] = [];
  const signs: Sign[] = [];
  const slips = new Map<string, string | null>();
  let clock: string | null = null;

  lines.forEach((line, index) => {
    if ((line.type === "call" || line.type === "state") && line.clock) clock = line.clock;
    if (line.type !== "decision") return;
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
    byPlace.set(order.place, {
      place: order.place,
      orderIds: [order.id],
      since: moved?.moved?.at ?? order.at,
      slippedAt: slips.get(order.place) ?? null,
      signMoved: moved?.moved ? { at: moved.moved.at, to } : null,
    });
  }

  const { strangers } = robotJudgement(lines);
  const refusals = strangers.refusals;
  const stranger: StrangerIncident | null =
    refusals.length > 0
      ? { refusals, first: refusals[0].clock, last: refusals.at(-1)?.clock ?? refusals[0].clock, rooms: strangers.rooms, keycardWaits: strangers.keycardWaits }
      : null;

  return { wetFloors: [...byPlace.values()], stranger };
}

/** The wet floors nobody has marked Løst on Vedlikehold (a place is open while any of its orders is). */
export function openWetFloors(wetFloors: readonly WetFloor[], resolved: (orderId: string) => boolean): WetFloor[] {
  return wetFloors.filter((floor) => floor.orderIds.some((id) => !resolved(id)));
}

/** "korridor 2B" from "corridor-2b": how the corridor signs read, inside a sentence. */
export function corridorName(place: string): string {
  const label = placeLabel(place);
  return label.charAt(0).toLowerCase() + label.slice(1);
}
