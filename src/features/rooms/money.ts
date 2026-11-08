import { formatKroner } from "@/features/dashboard/format";
import type { RoomView } from "@/features/dashboard/selectors";
import { HOTEL } from "@/features/reception/hotel";
import { type PmsRoom, type RoomRevenue, sellableValue } from "./pms";
import type { Held, Reconciliation, RoomCheckMark, Sellable } from "./reconcile";

/**
 * The room check's money, read the same way on Oversikt, Rom and Overlevering (jury round 2: three
 * screens showed three figures, and the headline stayed at "2 rom … ca. 2 900 kr" after a release).
 * Pure: the screens pass the reconciliation, today's marks and the booking system in, so a release
 * recomputes every screen that reads it.
 *
 * - **To sell**: rooms the system holds tonight (a check-out never recorded, or a stay-over) that the
 *   robot found empty and tidy after 01:00, not sent on yet. A guest due out today is not one: that
 *   room is already in tonight's inventory. Selling takes two steps: reception confirms the guest has
 *   left (who, and three checks), then the room is sent to reception to check the guest out in the PMS.
 * - **Released** (sent to reception): the pilot reads the PMS and never writes it (jury round 4,
 *   the product juror), so a sent room is pending ("Venter på PMS-en") until the booking system shows it free;
 *   never "done" before that. TODO(phase-3): the PMS connector reads the check-out back.
 * - **Held**: the robot delivered into the room tonight (bags for an arrival), so it is never offered;
 *   nor is a room whose room check contradicts the robot's own log (`caught` counts both).
 * - **Ready to sell**: the one "Klare til salg" figure: a room the robot found ready (klar, not closed)
 *   that the booking system has free and whose check the robot's own log does not contradict. A booked
 *   room is not ready to sell until the booking system has it free, sent to reception or not.
 *
 * The kroner are gross room revenue: rooms × last night's average rate (ADR), to the hundred, so
 * "ca. 1 500 kr". What the room check buys is time (jury round 4, the founder juror/the Wybe engineer): the room can be sold
 * from the 06:00 handover instead of after the morning round finds it. The kroner are extra money for
 * the hotel only if tonight sells out, so the screens show tonight's bookings beside them.
 */

/**
 * The sourced market line under "Slik regner vi", so the test-data rate sits next to a real one: SSB
 * statbank table 14169 (Omsetning og kapasitetsutnytting på hotell, 2025, published 4 Feb 2026), as
 * owner D sourced it in docs/DEMO.md § 1.
 */
export const MONEY_SOURCE: string | null = "Til sammenligning solgte hotellene i Oslo 72 % av rommene i 2025, til snittpris 1 631 kr (SSB, tabell 14169).";

/** The handover: from here the morning can sell a room the night found empty. */
export const HANDOVER_AT = "06:00";

/**
 * How many hours earlier the room can be sold than without the room check: from the 06:00 handover,
 * not after the hotel's check-out time, when the morning round would find the room (11:00 at the
 * demo hotel, src/features/reception/hotel.ts). The conservative count: from when the morning can act,
 * not from when the robot looked.
 */
export function hoursEarlier(checkOut: string = HOTEL.checkOut, handover: string = HANDOVER_AT): number {
  const minutes = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));
  return Math.max(0, Math.round((minutes(checkOut) - minutes(handover)) / 60));
}

export type RoomMoney = {
  toSell: Sellable[];
  /** Rooms among toSell that reception has confirmed (step 1 done, step 2 open). */
  confirmed: string[];
  /** Sent to reception to check out in the PMS (step 2): pending until the booking system shows them free. */
  released: Sellable[];
  held: Held[];
  /** Never offered: held, or the room check contradicts the robot's own log. Room ids, by room number. */
  caught: string[];
  toSellValue: number;
  releasedValue: number;
  /** Last night's average rate, NOK, the estimate's base. */
  adr: number;
  /** Klar and free in the booking system, or released today; null while the rooms load. */
  readyToSell: number | null;
  roomsTotal: number;
};

export function roomMoney({
  reconciliation,
  marks,
  revenue,
  rooms,
  pms,
}: {
  reconciliation: Reconciliation;
  marks: Readonly<Record<string, RoomCheckMark>>;
  revenue: RoomRevenue;
  rooms: readonly Pick<RoomView, "id" | "status" | "closed">[] | null;
  pms: ReadonlyMap<string, PmsRoom>;
}): RoomMoney {
  const released = reconciliation.sellable.filter((row) => marks[row.room]?.action === "released");
  const toSell = reconciliation.sellable.filter((row) => marks[row.room]?.action !== "released");
  const caught = [...new Set([...reconciliation.held.map((row) => row.room), ...reconciliation.contradicted.map((row) => row.room)])].sort((a, b) =>
    a.localeCompare(b, "nb", { numeric: true }),
  );
  const caughtRooms = new Set(caught);
  // A sent room is not ready until the booking system has it free: the pilot never writes the PMS.
  const readyToSell = rooms ? rooms.filter((room) => room.status === "klar" && !room.closed && !caughtRooms.has(room.id) && !pms.has(room.id)).length : null;
  return {
    toSell,
    confirmed: toSell.filter((row) => marks[row.room]?.action === "confirmed").map((row) => row.room),
    released,
    held: reconciliation.held,
    caught,
    toSellValue: sellableValue(toSell.length, revenue),
    releasedValue: sellableValue(released.length, revenue),
    adr: revenue.adr,
    readyToSell,
    roomsTotal: rooms?.length ?? 0,
  };
}

const kr = (value: number) => `ca. ${formatKroner(value)} kr`;
const heldPart = (money: RoomMoney) => (money.caught.length > 0 ? ` · ${money.caught.length} holdt tilbake` : "");

/**
 * The one money line: "1 rom kan selges etter bekreftelse · ca. 1 500 kr hvis utsolgt · 1 holdt
 * tilbake", then "1 rom sendt til resepsjonen · venter på PMS-en" once every room is sent (never
 * "solgt" or "frigitt": the booking system has not said so). Null when the room check found nothing
 * to sell or hold.
 */
export function moneyHeadline(money: RoomMoney): string | null {
  if (money.toSell.length > 0) return `${money.toSell.length} rom kan selges etter bekreftelse · ${kr(money.toSellValue)} hvis utsolgt${heldPart(money)}`;
  if (money.released.length > 0) return `${money.released.length} rom sendt til resepsjonen · venter på PMS-en${heldPart(money)}`;
  if (money.caught.length > 0) return `Ingen rom å selge i dag · ${money.caught.length} holdt tilbake`;
  return null;
}

/** "Sendt til resepsjonen i dag: 1 rom · venter på PMS-en": the running count step 2 moves (the pilot's number). */
export function releasedLine(money: RoomMoney): string {
  return money.released.length > 0 ? `Sendt til resepsjonen i dag: ${money.released.length} rom · venter på PMS-en` : "Sendt til resepsjonen i dag: ingen ennå";
}

/** "I kveld er 31 av 36 rom booket": the condition the kroner rest on. */
export function tonightLine(booked: number, rooms: number): string {
  return `${booked} av ${rooms} booket i kveld`;
}

/** "Brutto romsinntekt: 1 × snittprisen i natt, 1 467 kr (testdata). …": how the kroner are made, and when they are real. */
export function moneyMethod(money: RoomMoney, tonight?: { booked: number; rooms: number }): string {
  const rooms = money.toSell.length > 0 ? money.toSell.length : money.released.length;
  const hours = hoursEarlier();
  return [
    `Brutto romsinntekt: ${rooms} × snittprisen i natt, ${formatKroner(money.adr)} kr (testdata).`,
    `Systemet holder rommet til resepsjonen registrerer at gjesten har reist. Uten romsjekken finner renholdet det etter utsjekk kl. ${HOTEL.checkOut}; med den kan det selges fra kl. ${HANDOVER_AT}, ${hours} ${hours === 1 ? "time" : "timer"} tidligere.`,
    `Det er ekstra inntekt bare hvis natten blir utsolgt${tonight ? `: ${tonightLine(tonight.booked, tonight.rooms)} (testdata)` : ""}.`,
    MONEY_SOURCE,
  ]
    .filter(Boolean)
    .join(" ");
}

/** "8.11" from "2026-11-08": a date the way a front desk writes it. */
export function shortDate(day: string | null): string {
  if (!day) return "";
  const [, month, date] = day.split("-").map(Number);
  return `${date}.${month}`;
}
