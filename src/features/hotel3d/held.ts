import { clockToSim, ROOM_STATUS_LABEL, type RoomView, type Snapshot } from "@/features/replay";
import type { Held } from "@/features/rooms/reconcile";

/**
 * The 3D-kart says what the room check says (src/features/rooms/reconcile.ts, the same result Rom,
 * Oversikt's rack and Overlevering read through `useRoomCheck`): a room the robot found empty and tidy
 * but carried an arriving guest's bags into (209 on the demo night, booked to tomorrow: a double
 * allocation) is taken, "Holdt tilbake", never a green "Klar" (jury round 3).
 *
 * The map is a replay, so a room is held from the moment of its first holding delivery: before the bags
 * go in, the night had not shown it yet. The row a room carries lists only the deliveries made so far.
 */

/** A room on the map, with the room check's hold when it has one. */
export type MapRoomView = RoomView & { held?: Held };

export const HELD_WORD = "Holdt tilbake";

/** The snapshot with every held room that reads "klar" at its moment shown as taken (status opptatt, `held`). */
export function withHeldRooms(snapshot: Snapshot | null, held: readonly Held[]): Snapshot | null {
  if (!snapshot || held.length === 0) return snapshot;
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
  return rooms ? { ...snapshot, rooms } : snapshot;
}

/** The room's hold on the map, if the room check holds it at this moment. */
export function heldOf(view: RoomView | undefined): Held | null {
  return (view as MapRoomView | undefined)?.held ?? null;
}

/** The room's state in words, as the rack says it: "Holdt tilbake" for a held room, else its status. */
export function roomWord(view: RoomView | undefined): string {
  return heldOf(view) ? HELD_WORD : ROOM_STATUS_LABEL[view?.status ?? "ukjent"];
}
