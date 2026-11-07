import type { RunLine } from "@/features/nightshift/runlog";
import { byRoomNumber } from "./hotelMap";

// What the robot found out about each room during the night, from run log v1's room_status
// decisions (docs/ARCHITECTURE.md § 4.3), and the room groups a cleaner starts from at 06:00.

export const ROOM_STATUSES = ["klar", "opptatt", "ikke_forstyrr", "ma_vaskes"] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];

export const STATUS_LABEL: Record<RoomStatus, string> = {
  klar: "Klar",
  opptatt: "Opptatt",
  ikke_forstyrr: "Ikke forstyrr",
  ma_vaskes: "Må vaskes",
};

export type RoomReport = { room: string; status: RoomStatus; clock: string | null; note: string | null };

const CLOCK = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Seconds into the night shift for a sim clock: the shift runs 22:00 → 06:00, so a clock before
 * noon belongs to the next day. Null for a clock we can't read.
 */
export function nightSeconds(clock: string | null | undefined): number | null {
  const match = clock ? CLOCK.exec(clock) : null;
  if (!match) return null;
  const [h, m, s] = [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
  if (h > 23 || m > 59 || s > 59) return null;
  return (h < 12 ? h + 24 : h) * 3600 + m * 60 + s;
}

const isStatus = (value: unknown): value is RoomStatus => ROOM_STATUSES.includes(value as RoomStatus);

/**
 * Each room's latest status at `cutoff` (default 06:00, the handover). A decision line carries no
 * clock, so it takes the clock of the last call or state line before it.
 */
export function roomStatusAt(lines: readonly RunLine[], cutoff = "06:00:00"): Map<string, RoomReport> {
  const limit = nightSeconds(cutoff) ?? Number.POSITIVE_INFINITY;
  const rooms = new Map<string, RoomReport>();
  let clock: string | null = null;
  for (const line of lines) {
    if ((line.type === "call" || line.type === "state") && line.clock) clock = line.clock;
    if (line.type !== "decision" || line.kind !== "room_status" || !line.data) continue;
    const at = nightSeconds(clock);
    if (at !== null && at > limit) break;
    const { room, status, note } = line.data;
    if (typeof room !== "string" || !isStatus(status)) continue;
    rooms.set(room, { room, status, clock, note: typeof note === "string" ? note : null });
  }
  return rooms;
}

export type PresetId = "ma_vaskes" | "opptatt";

export type RoomPreset = { id: PresetId; label: string; hint: string; rooms: string[] };

/**
 * The room groups to start a cleaning round from: rooms marked "Må vaskes", and rooms with guests
 * (daily cleaning). Rooms with "Ikke forstyrr" are in neither, and listed apart so the screen can say so.
 */
export function cleaningPresets(statuses: ReadonlyMap<string, RoomReport>): {
  presets: RoomPreset[];
  doNotDisturb: string[];
} {
  const withStatus = (status: RoomStatus) =>
    [...statuses.values()].filter((r) => r.status === status).map((r) => r.room).sort(byRoomNumber);
  return {
    presets: [
      { id: "ma_vaskes", label: "Må vaskes", hint: "Rom roboten fant urene i natt", rooms: withStatus("ma_vaskes") },
      { id: "opptatt", label: "Opptatt i natt", hint: "Rom med gjester: daglig renhold", rooms: withStatus("opptatt") },
    ],
    doNotDisturb: withStatus("ikke_forstyrr"),
  };
}
