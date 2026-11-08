import { clockToSim, ROOM_STATUS_LABEL, type RoomView, type Snapshot } from "@/features/replay";
import type { Held, Sellable } from "@/features/rooms/reconcile";

/**
 * The 3D-kart says what the room check says (src/features/rooms/reconcile.ts, the same result Rom,
 * Oversikt's rack and Overlevering read through `useRoomCheck`): a room the robot found empty and tidy
 * but carried an arriving guest's bags into (209 on the demo night, booked to tomorrow: a double
 * allocation) is taken, "Holdt tilbake", never a green "Klar" (jury round 3).
 *
 * The map is a replay, so a room is held from the moment of its first holding delivery: before the bags
 * go in, the night had not shown it yet. The row a room carries lists only the deliveries made so far.
 *
 * A sleeper (213 on the demo night: the guest was due out 7.11, the check-out never recorded, so the
 * booking system still holds the room tonight) is not a green "Klar" either until reception has
 * confirmed and released it: taken, "Bekreft først", as the rack says it (`withHeld`'s `toConfirm`,
 * read from the same `money.toSell`), from the moment the robot's room check found it empty (jury round 4).
 */

/** A room on the map, with the room check's hold (or its sleeper row, still to confirm) when it has one. */
export type MapRoomView = RoomView & { held?: Held; toConfirm?: Sellable; pending?: Sellable };

export const HELD_WORD = "Holdt tilbake";
/** The rack's word for a room the system still holds that the robot found empty: confirm, then sell. */
export const CONFIRM_WORD = "Bekreft først";
/** Sent to reception, the booking system not yet confirming it (round 5, owner A): neutral, never a green Klar. */
export const PENDING_WORD = "Venter på PMS-en";

/**
 * The snapshot with every held room that reads "klar" at its moment shown as taken (status opptatt,
 * `held`), and every room still to confirm (`toConfirm`, the room check's sellable rows not yet released)
 * shown as taken with its row, never a green Klar.
 */
export function withHeldRooms(
  snapshot: Snapshot | null,
  held: readonly Held[],
  toConfirm: readonly Sellable[] = [],
  pending: readonly Sellable[] = [],
): Snapshot | null {
  if (!snapshot || (held.length === 0 && toConfirm.length === 0 && pending.length === 0)) return snapshot;
  let rooms: Record<string, MapRoomView> | null = null;
  for (const row of held) {
    const view = snapshot.rooms[row.room];
    if (!view || view.status !== "klar") continue;
    const sofar = row.deliveries.filter((delivery) => !delivery.at || clockToSim(delivery.at) <= snapshot.t);
    if (sofar.length === 0) continue;
    rooms ??= { ...snapshot.rooms };
    rooms[row.room] = {
      ...view,
      status: "opptatt",
      held: { ...row, deliveries: sofar, deliveredAt: sofar.at(-1)?.at ?? null, arrival: sofar.some((delivery) => delivery.arrival) },
    };
  }
  for (const row of toConfirm) {
    const view = (rooms ?? snapshot.rooms)[row.room] as MapRoomView | undefined;
    // A room the robot has not yet found empty is not shown as one; a held room keeps its hold.
    if (!view || view.status !== "klar" || view.held) continue;
    rooms ??= { ...snapshot.rooms };
    rooms[row.room] = { ...view, status: "opptatt", toConfirm: row };
  }
  for (const row of pending) {
    const view = (rooms ?? snapshot.rooms)[row.room] as MapRoomView | undefined;
    if (!view || view.status !== "klar" || view.held || view.toConfirm) continue;
    rooms ??= { ...snapshot.rooms };
    rooms[row.room] = { ...view, status: "opptatt", pending: row };
  }
  return rooms ? { ...snapshot, rooms } : snapshot;
}

/** The room's hold on the map, if the room check holds it at this moment. */
export function heldOf(view: RoomView | undefined): Held | null {
  return (view as MapRoomView | undefined)?.held ?? null;
}

/** The room's sleeper row, if the system still holds it and the robot found it empty (not yet released). */
export function toConfirmOf(view: RoomView | undefined): Sellable | null {
  return (view as MapRoomView | undefined)?.toConfirm ?? null;
}

/** The room's row once sent to reception, while the booking system has not confirmed it free. */
export function pendingOf(view: RoomView | undefined): Sellable | null {
  return (view as MapRoomView | undefined)?.pending ?? null;
}

/** The room check's own word for the room ("Holdt tilbake", "Bekreft først", "Venter på PMS-en"), or null when it has none. */
export function checkWord(view: RoomView | undefined): string | null {
  return heldOf(view) ? HELD_WORD : toConfirmOf(view) ? CONFIRM_WORD : pendingOf(view) ? PENDING_WORD : null;
}

/** The room's state in words, as the rack says it: "Holdt tilbake", "Bekreft først", else its status. */
export function roomWord(view: RoomView | undefined): string {
  return checkWord(view) ?? ROOM_STATUS_LABEL[view?.status ?? "ukjent"];
}

