import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseRunLog } from "@/features/nightshift/runlog";
import { buildTimeline, clockToSim, snapshotAt } from "@/features/replay";
import { osloToday } from "@/features/reception/dates";
import { pmsLastNight } from "@/features/rooms/pms";
import { reconcileNight } from "@/features/rooms/reconcile";
import { CONFIRM_WORD, checkWord, HELD_WORD, heldOf, PENDING_WORD, pendingOf, roomWord, toConfirmOf, withHeldRooms } from "./held";

const lines = parseRunLog(readFileSync(resolve(process.cwd(), "public/runs/demo.jsonl"), "utf8")).lines;
const timeline = buildTimeline(lines);
// The same reconcile result Rom, Oversikt's rack and Overlevering read (useRoomCheck, with today).
const today = osloToday();
const check = reconcileNight(lines, pmsLastNight(today), today);
const held = check.held;
// Nothing released yet: every sellable row is still to confirm (money.toSell, the rack's "Bekreft først").
const toConfirm = check.sellable;

describe("the 3D-kart follows the room check (209 held back, never a green Klar)", () => {
  it("shows 209 at the end of the night as taken, in the rack's words, with every bag delivered", () => {
    const raw = snapshotAt(timeline, timeline.duration);
    expect(raw.rooms["room-209"].status).toBe("klar");
    const shown = withHeldRooms(raw, held)!;
    expect(shown.rooms["room-209"].status).toBe("opptatt");
    expect(roomWord(shown.rooms["room-209"])).toBe(HELD_WORD);
    expect(heldOf(shown.rooms["room-209"])).toMatchObject({ room: "room-209", deliveredAt: "05:16:33", arrival: true });
    // Without rooms to confirm, 213 is untouched (it is a sleeper, not held).
    expect(shown.rooms["room-213"].status).toBe("klar");
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

describe("the 3D-kart shows 213 as a sleeper (review round 4), never a green Klar before it is released", () => {
  it("213 is the room check's sleeper: due out yesterday, check-out never recorded, the robot found it empty at 04:24", () => {
    expect(toConfirm.map((row) => row.room)).toEqual(["room-213"]);
    expect(toConfirm[0]).toMatchObject({ guest: "Ola Nygård", at: "04:24:42" });
    expect(toConfirm[0].departure! < today).toBe(true);
    expect(check.dueOut.map((row) => row.room)).not.toContain("room-213");
  });

  it("at the end of the night 213 reads Bekreft først, taken, with its row; 209 stays Sjekk rommet", () => {
    const raw = snapshotAt(timeline, timeline.duration);
    expect(raw.rooms["room-213"].status).toBe("klar");
    const shown = withHeldRooms(raw, held, toConfirm)!;
    expect(shown.rooms["room-213"].status).toBe("opptatt");
    expect(roomWord(shown.rooms["room-213"])).toBe(CONFIRM_WORD);
    expect(checkWord(shown.rooms["room-213"])).toBe("Bekreft først");
    expect(toConfirmOf(shown.rooms["room-213"])).toMatchObject({ room: "room-213", guest: "Ola Nygård" });
    expect(heldOf(shown.rooms["room-213"])).toBeNull();
    expect(roomWord(shown.rooms["room-209"])).toBe(HELD_WORD);
    expect(toConfirmOf(shown.rooms["room-209"])).toBeNull();
    expect(raw.rooms["room-213"].status).toBe("klar"); // not mutated
  });

  it("never paints 213 Klar at any moment while it is still to confirm", () => {
    for (let t = 0; t <= timeline.duration; t += 60) {
      const shown = withHeldRooms(snapshotAt(timeline, t), held, toConfirm)!;
      expect(shown.rooms["room-213"].status, `at ${t}`).not.toBe("klar");
    }
  });

  it("is a green Klar again once reception has released it (no longer in money.toSell), as on the rack", () => {
    const raw = snapshotAt(timeline, timeline.duration);
    const released = withHeldRooms(raw, held, [])!;
    expect(released.rooms["room-213"].status).toBe("klar");
    expect(roomWord(released.rooms["room-213"])).toBe("Klar");
  });

  it("leaves a room alone that the night has not shown as klar, and never turns a held room into one to confirm", () => {
    const raw = snapshotAt(timeline, timeline.duration);
    const notKlar = Object.entries(raw.rooms).find(([, view]) => view.status !== "klar")![0];
    const fake = { ...toConfirm[0], room: notKlar };
    expect(withHeldRooms(raw, [], [fake])).toBe(raw);
    const both = withHeldRooms(raw, held, [{ ...toConfirm[0], room: "room-209" }])!;
    expect(roomWord(both.rooms["room-209"])).toBe(HELD_WORD);
  });
});

describe("the 3D-kart shows a room sent to reception as pending (round 5, owner A), never a green Klar", () => {
  it("213 sent to reception reads Venter på PMS-en, taken, until the booking system confirms it", () => {
    const raw = snapshotAt(timeline, timeline.duration);
    const shown = withHeldRooms(raw, held, [], toConfirm)!;
    expect(shown.rooms["room-213"].status).toBe("opptatt");
    expect(roomWord(shown.rooms["room-213"])).toBe(PENDING_WORD);
    expect(pendingOf(shown.rooms["room-213"])).toMatchObject({ room: "room-213" });
    expect(toConfirmOf(shown.rooms["room-213"])).toBeNull();
    expect(roomWord(shown.rooms["room-209"])).toBe(HELD_WORD);
    expect(raw.rooms["room-213"].status).toBe("klar"); // not mutated
  });
});
