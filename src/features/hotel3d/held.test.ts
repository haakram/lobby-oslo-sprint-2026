import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseRunLog } from "@/features/nightshift/runlog";
import { buildTimeline, clockToSim, snapshotAt } from "@/features/replay";
import { osloToday } from "@/features/reception/dates";
import { pmsLastNight } from "@/features/rooms/pms";
import { reconcileNight } from "@/features/rooms/reconcile";
import { HELD_WORD, heldOf, roomWord, withHeldRooms } from "./held";

const lines = parseRunLog(readFileSync(resolve(process.cwd(), "public/runs/demo.jsonl"), "utf8")).lines;
const timeline = buildTimeline(lines);
// The same reconcile result Rom, Oversikt's rack and Overlevering read (useRoomCheck).
const held = reconcileNight(lines, pmsLastNight(osloToday())).held;

describe("the 3D-kart follows the room check (209 held back, never a green Klar)", () => {
  it("shows 209 at the end of the night as taken, in the rack's words, with every bag delivered", () => {
    const raw = snapshotAt(timeline, timeline.duration);
    expect(raw.rooms["room-209"].status).toBe("klar");
    const shown = withHeldRooms(raw, held)!;
    expect(shown.rooms["room-209"].status).toBe("opptatt");
    expect(roomWord(shown.rooms["room-209"])).toBe(HELD_WORD);
    expect(heldOf(shown.rooms["room-209"])).toMatchObject({ room: "room-209", deliveredAt: "05:16:33", arrival: true });
    // 213 is the room to sell (after reception confirms), not held: it stays Klar; the rest are untouched.
    expect(shown.rooms["room-213"].status).toBe("klar");
    expect(roomWord(shown.rooms["room-213"])).toBe("Klar");
    expect(heldOf(shown.rooms["room-213"])).toBeNull();
    expect(raw.rooms["room-209"].status).toBe("klar"); // the replay's own snapshot is not mutated
  });

  it("never paints 209 Klar at any moment of the replay, and names only the bags delivered so far", () => {
    for (let t = 0; t <= timeline.duration; t += 60) {
      const shown = withHeldRooms(snapshotAt(timeline, t), held)!;
      expect(shown.rooms["room-209"].status, `at ${t}`).not.toBe("klar");
    }
    // Between the room check (03:47) and the second bag (04:35) only the 01:29 bag is in the room.
    const mid = withHeldRooms(snapshotAt(timeline, clockToSim("04:00:00")), held)!;
    expect(heldOf(mid.rooms["room-209"])).toMatchObject({ deliveredAt: "01:29:26" });
    expect(heldOf(mid.rooms["room-209"])?.deliveries).toHaveLength(1);
  });

  it("holds a room only from its first holding delivery, and leaves the snapshot alone when nothing is held", () => {
    const raw = snapshotAt(timeline, timeline.duration);
    expect(withHeldRooms(raw, [])).toBe(raw);
    expect(withHeldRooms(null, held)).toBeNull();
    const later = held.map((row) => ({ ...row, deliveries: row.deliveries.map((delivery) => ({ ...delivery, at: "05:59:00" })) }));
    const early = snapshotAt(timeline, clockToSim("05:00:00"));
    expect(withHeldRooms(early, later)).toBe(early);
  });
});
