import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseRunLog, parseRunValues } from "@/features/nightshift/runlog";
import { guestRooms, hotelMap } from "./hotelMap";
import { cleaningPresets, nightSeconds, roomStatusAt } from "./nightRooms";

const call = (clock: string) => ({ v: 1, type: "call", cmd: "status", ok: true, clock });
const status = (room: string, s: string, note?: string) => ({
  v: 1,
  type: "decision",
  kind: "room_status",
  data: { room, status: s, source: "knock", ...(note ? { note } : {}) },
});

const lines = (values: unknown[]) => parseRunValues(values).lines;

describe("nightSeconds", () => {
  it("puts clocks after midnight after the evening ones", () => {
    expect(nightSeconds("22:00:00")).toBe(22 * 3600);
    expect(nightSeconds("05:59:59")! > nightSeconds("23:59:59")!).toBe(true);
    expect(nightSeconds("06:00")).toBe(30 * 3600);
  });

  it("is null for a clock it can't read", () => {
    expect(nightSeconds(null)).toBeNull();
    expect(nightSeconds("25:00:00")).toBeNull();
    expect(nightSeconds("soon")).toBeNull();
  });
});

describe("roomStatusAt", () => {
  it("keeps each room's latest status and the clock it was reported at", () => {
    const rooms = roomStatusAt(
      lines([
        call("22:10:00"),
        status("room-201", "opptatt", "Ms Vik opens the door."),
        call("01:00:00"),
        status("room-201", "ma_vaskes"),
        status("room-104", "klar"),
      ]),
    );
    expect(rooms.get("room-201")).toEqual({ room: "room-201", status: "ma_vaskes", clock: "01:00:00", note: null });
    expect(rooms.get("room-104")?.status).toBe("klar");
  });

  it("stops at the cutoff, across midnight", () => {
    const night = lines([call("23:00:00"), status("room-201", "opptatt"), call("02:00:00"), status("room-201", "klar")]);
    expect(roomStatusAt(night, "01:00:00").get("room-201")?.status).toBe("opptatt");
    expect(roomStatusAt(night).get("room-201")?.status).toBe("klar");
  });

  it("skips statuses it does not know and decisions without a room", () => {
    const rooms = roomStatusAt(
      lines([call("22:00:00"), status("room-201", "vasket"), { v: 1, type: "decision", kind: "room_status", data: { status: "klar" } }]),
    );
    expect(rooms.size).toBe(0);
  });
});

describe("cleaningPresets", () => {
  it("groups rooms to clean and rooms with guests, in room-number order, leaving Ikke forstyrr out", () => {
    const rooms = roomStatusAt(
      lines([
        call("22:00:00"),
        status("room-319", "opptatt"),
        status("room-104", "opptatt"),
        status("room-212", "ma_vaskes"),
        status("room-208", "ikke_forstyrr"),
        status("room-103", "klar"),
        status("room-201", "ma_vaskes"),
      ]),
    );
    const { presets, doNotDisturb } = cleaningPresets(rooms);
    expect(presets.map((p) => [p.id, p.rooms])).toEqual([
      ["ma_vaskes", ["room-201", "room-212"]],
      ["opptatt", ["room-104", "room-319"]],
    ]);
    expect(doNotDisturb).toEqual(["room-208"]);
  });

  it("works on the demo night: every preset room is a guest room on the map, none of them Ikke forstyrr", () => {
    const text = readFileSync(resolve(process.cwd(), "src/features/nightshift/fixtures/sample.jsonl"), "utf8");
    const { presets, doNotDisturb } = cleaningPresets(roomStatusAt(parseRunLog(text).lines));
    const rooms = new Set(guestRooms(hotelMap()));
    const all = presets.flatMap((p) => p.rooms);
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((r) => rooms.has(r))).toBe(true);
    expect(all.some((r) => doNotDisturb.includes(r))).toBe(false);
  });
});
