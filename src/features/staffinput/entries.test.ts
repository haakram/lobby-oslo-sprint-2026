import { describe, expect, it } from "vitest";
import { parseRunValues } from "@/features/nightshift/runlog";
import { CLERK_SAMPLE, handoverDay, hazardLine, noteLine, NOTE_MAX, retractLine, roomLine, storedStaffLines } from "./entries";
import { entryText, readStaffLog, staffHazards, staffNotes, staffRooms } from "./read";

// 04:24 on Sunday 8 November in Oslo (CET, UTC+1).
const NIGHT = new Date("2026-11-08T03:24:00Z");
const who = (now: Date = NIGHT) => ({ by: "Kjersti Lund", now });

describe("the night clerk's entries", () => {
  it("are the robot's own run-log lines, with source staff, her name and the Oslo clock", () => {
    const lines = [
      roomLine("room-213", "klar", who()),
      hazardLine("wet", "corridor-2b", "  skilt satt ut ", who()),
      hazardLine("door", "stairwell-2", "", who()),
      hazardLine("person", "corridor-3a", "", who()),
      noteLine("Rolig natt.", who()),
    ];
    // Every one reads as run log v1 (the same parser as the robot's night).
    expect(parseRunValues(lines).lines).toHaveLength(5);
    expect(lines.map((line) => (line.type === "decision" ? line.kind : line.type))).toEqual(["room_status", "hazard", "security_event", "security_event", "note"]);
    expect(lines[0]).toMatchObject({ v: 1, t: Math.round(NIGHT.getTime() / 1000), type: "decision", data: { room: "room-213", status: "klar", source: "staff", by: "Kjersti Lund", at: "04:24:00", stamp: NIGHT.toISOString() } });
    expect(lines[1]).toMatchObject({ data: { place: "corridor-2b", hazard: "wet", since: "04:24:00", signed: false, note: "skilt satt ut" } });
    expect(lines[2]).toMatchObject({ data: { place: "stairwell-2", event: "door_open", room: null } });
    expect(lines[3]).toMatchObject({ data: { event: "unknown_person" } });
    expect(new Set(lines.map((line) => (line.type === "decision" ? line.data?.id : null))).size).toBe(5);
  });

  it("keeps a note short", () => {
    const line = noteLine("x".repeat(NOTE_MAX + 50), who());
    expect(line.type === "decision" && String(line.data?.text).length).toBe(NOTE_MAX);
  });

  it("belong to the next morning's handover from 21:00, today's before", () => {
    expect(handoverDay(new Date("2026-11-07T19:59:00Z"))).toBe("2026-11-07"); // 20:59 Oslo
    expect(handoverDay(new Date("2026-11-07T20:00:00Z"))).toBe("2026-11-08"); // 21:00 Oslo
    expect(handoverDay(new Date("2026-11-07T23:30:00Z"))).toBe("2026-11-08"); // 00:30 Oslo
    expect(handoverDay(new Date("2026-11-08T17:10:00Z"))).toBe("2026-11-08"); // 18:10 Oslo, on stage
  });

  it("are corrected by adding a line, never by deleting one: the latest word on a room wins", () => {
    const first = roomLine("room-213", "opptatt", who());
    const second = roomLine("room-213", "klar", who(new Date(NIGHT.getTime() + 60_000)));
    const wet = hazardLine("wet", "lobby", "", who());
    const undo = retractLine(String(wet.type === "decision" && wet.data?.id), who());
    const entries = readStaffLog([first, second, wet, undo]);
    expect(entries).toHaveLength(3);
    expect(entries.find((entry) => entry.kind === "hazard")?.retracted).toBe(true);
    expect(staffHazards(entries)).toHaveLength(0);
    expect(staffRooms(entries).get("room-213")?.status).toBe("klar");
  });

  it("drops stored values that are not the clerk's run-log lines", () => {
    const good = roomLine("room-210", "opptatt", who());
    const lines = storedStaffLines({ "2026-11-08": [good, { v: 1, type: "decision", kind: "room_status", data: { room: "room-1", status: "klar" } }, "rubbish", { v: 2 }] }, "2026-11-08");
    expect(lines).toEqual([good]);
    expect(storedStaffLines({}, "2026-11-08")).toEqual([]);
  });

  it("say what was logged in plain words", () => {
    const entries = readStaffLog([roomLine("room-213", "klar", who()), hazardLine("wet", "lobby", "Ved inngangen.", who()), hazardLine("door", "elevator-2", "", who()), noteLine("Rolig natt.", who())]);
    expect(entries.map(entryText)).toEqual(["Rom 213: tomt og ryddig", "Vått gulv i lobbyen: Ved inngangen.", "Dør ved heisen, 2. etasje", "Rolig natt."]);
  });

  it("include a sample night (test data) that follows the door lock: 213 checked empty, a guest in 210, a wet entrance, a note", () => {
    const entries = readStaffLog(CLERK_SAMPLE);
    expect(entries.every((entry) => entry.sample && entry.by === "Kjersti Lund")).toBe(true);
    expect([...staffRooms(entries)].map(([room, entry]) => [room, entry.status])).toEqual([
      ["room-210", "opptatt"],
      ["room-213", "klar"],
    ]);
    expect(staffHazards(entries).map((entry) => entry.place)).toEqual(["lobby"]);
    expect(staffNotes(entries)[0].text).toMatch(/^Rolig natt\./);
  });
});
