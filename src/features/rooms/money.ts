import { formatKroner } from "@/features/dashboard/format";
import type { RoomView } from "@/features/dashboard/selectors";
import { type PmsRoom, type RoomRevenue, sellableValue } from "./pms";
import type { Held, Reconciliation, RoomCheckMark, Sellable } from "./reconcile";

/**
 * The room check's money, read the same way on Oversikt, Rom and Overlevering (jury round 2: three
 * screens showed three figures, and the headline stayed at "2 rom … ca. 2 900 kr" after a release).
 * Pure: the screens pass the reconciliation, today's marks and the booking system in, so a release
 * recomputes every screen that reads it.
 *
 * - **To sell**: rooms the system has as occupied that the robot found empty and tidy after 01:00, not
 *   released yet. Selling takes two steps: reception confirms the guest has left, then the room is
 *   marked free to sell.
 * - **Released**: marked free to sell today.
 * - **Held**: the robot delivered into the room tonight (bags for an arrival), so it is never offered.
 * - **Ready to sell**: the one "Klare til salg" figure: a room the robot found ready (klar, not closed)
 *   that the booking system has free, plus the rooms released today. A booked room is not ready to
 *   sell until a person released it.
 *
 * The kroner are gross room revenue: rooms × last night's average rate (ADR), to the hundred, so
 * "ca. 1 500 kr". It is money only on a night the hotel would otherwise sell out.
 */

export type RoomMoney = {
  toSell: Sellable[];
  /** Rooms among toSell that reception has confirmed (step 1 done, step 2 open). */
  confirmed: string[];
  released: Sellable[];
  held: Held[];
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
  const releasedRooms = new Set(released.map((row) => row.room));
  const heldRooms = new Set(reconciliation.held.map((row) => row.room));
  const readyToSell = rooms
    ? rooms.filter((room) => room.status === "klar" && !room.closed && !heldRooms.has(room.id) && (!pms.has(room.id) || releasedRooms.has(room.id))).length
    : null;
  return {
    toSell,
    confirmed: toSell.filter((row) => marks[row.room]?.action === "confirmed").map((row) => row.room),
    released,
    held: reconciliation.held,
    toSellValue: sellableValue(toSell.length, revenue),
    releasedValue: sellableValue(released.length, revenue),
    adr: revenue.adr,
    readyToSell,
    roomsTotal: rooms?.length ?? 0,
  };
}

const kr = (value: number) => `ca. ${formatKroner(value)} kr`;
const heldPart = (money: RoomMoney) => (money.held.length > 0 ? ` · ${money.held.length} holdt tilbake` : "");

/**
 * The one money line: "1 rom kan selges etter bekreftelse · ca. 1 500 kr · 1 holdt tilbake", then
 * "1 rom frigitt for salg i dag · ca. 1 500 kr" once every room is released. Null when the room check
 * found nothing to sell or hold.
 */
export function moneyHeadline(money: RoomMoney): string | null {
  if (money.toSell.length > 0) return `${money.toSell.length} rom kan selges etter bekreftelse · ${kr(money.toSellValue)}${heldPart(money)}`;
  if (money.released.length > 0) return `${money.released.length} rom frigitt for salg i dag · ${kr(money.releasedValue)}${heldPart(money)}`;
  if (money.held.length > 0) return `Ingen rom å selge i dag · ${money.held.length} holdt tilbake`;
  return null;
}

/** "Frigitt i dag: 1 rom · ca. 1 500 kr": the running count a release moves (the pilot's number). */
export function releasedLine(money: RoomMoney): string {
  return money.released.length > 0 ? `Frigitt i dag: ${money.released.length} rom · ${kr(money.releasedValue)}` : "Frigitt i dag: ingen ennå";
}

/** "Brutto romsinntekt: 1 × snittprisen i natt, 1 467 kr (testdata)": how the kroner are made. */
export function moneyMethod(money: RoomMoney): string {
  const rooms = money.toSell.length > 0 ? money.toSell.length : money.released.length;
  return `Brutto romsinntekt: ${rooms} × snittprisen i natt, ${formatKroner(money.adr)} kr (testdata). Ekstra inntekt bare en natt hotellet ellers ville vært utsolgt.`;
}

/** "8.11" from "2026-11-08": a date the way a front desk writes it. */
export function shortDate(day: string | null): string {
  if (!day) return "";
  const [, month, date] = day.split("-").map(Number);
  return `${date}.${month}`;
}
