import { describe, expect, it } from "vitest";
import { parseRunValues } from "@/features/nightshift/runlog";
import { acknowledgeLine, appendStaffLine, CLERK_SAMPLE, handoverDay, hazardLine, noteLine, NOTE_MAX, pruneStaffLog, retractLine, roomLine, signPlacedLine, storedStaffLines } from "./entries";
import { entryText, inNightHours, readStaffLog, signPhrase, staffAcks, staffHazards, staffNotes, staffRooms } from "./read";
import { hasExpiredDays, keepRecentDays, RETENTION_DAYS } from "./retention";

// 04:24 on Sunday 8 November in Oslo (CET, UTC+1).
const NIGHT = new Date("2026-11-08T03:24:00Z");
const who = (now: Date = NIGHT) => ({ by: "Kjersti Lund", now });

describe("the night clerk's entries", () => {
  it("are the robot's own run-log lines, with source staff, her name and the Oslo clock", () => {
    const lines = [
      roomLine("room-213", "klar", who()),
      hazardLine("wet", "corridor-2b", "  ved heisen ", who()),
      hazardLine("door", "stairwell-2", "", who()),
      hazardLine("person", "corridor-3a", "", who()),
      noteLine("Rolig natt.", who()),
    ];
    // Every one reads as run log v1 (the same parser as the robot's night).
    expect(parseRunValues(lines).lines).toHaveLength(5);
    expect(lines.map((line) => (line.type === "decision" ? line.kind : line.type))).toEqual(["room_status", "hazard", "security_event", "security_event", "note"]);
    expect(lines[0]).toMatchObject({ v: 1, t: Math.round(NIGHT.getTime() / 1000), type: "decision", data: { room: "room-213", status: "klar", source: "staff", by: "Kjersti Lund", at: "04:24:00", stamp: NIGHT.toISOString() } });
    expect(lines[1]).toMatchObject({ data: { place: "corridor-2b", hazard: "wet", since: "04:24:00", signed: false, signedAt: null, note: "ved heisen" } });
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

  it("record whether a sign is out on a wet floor: yes at the report's clock, no as uten skilt siden, a sign put out later by adding a line", () => {
    const signed = hazardLine("wet", "lobby", "", who(), true);
    expect(signed).toMatchObject({ data: { signed: true, signedAt: "04:24:00", since: "04:24:00" } });
    const bare = hazardLine("wet", "corridor-2b", "", who(), false);
    const door = hazardLine("door", "stairwell-2", "", who(), true);
    // A door or a person has no sign to put out.
    expect(door.type === "decision" && door.data).not.toHaveProperty("signed");
    let entries = readStaffLog([signed, bare, door]);
    let hazards = staffHazards(entries);
    expect(hazards.map((hazard) => [hazard.place, hazard.signed, hazard.signedAt, signPhrase(hazard)])).toEqual([
      ["lobby", true, "04:24:00", "skilt satt ut 04:24"],
      ["corridor-2b", false, null, "uten skilt siden 04:24"],
      ["stairwell-2", null, null, null],
    ]);
    const bareId = String(bare.type === "decision" && bare.data?.id);
    const later = signPlacedLine(bareId, who(new Date(NIGHT.getTime() + 12 * 60_000))); // 04:36
    entries = readStaffLog([signed, bare, door, later]);
    hazards = staffHazards(entries);
    expect(signPhrase(hazards[1])).toBe("skilt satt ut 04:36");
    expect(entryText(entries[3])).toBe("Skilt satt ut i korridor 2B");
    // Angre on the sign: the floor is bare again.
    const undo = retractLine(String(later.type === "decision" && later.data?.id), who());
    expect(signPhrase(staffHazards(readStaffLog([signed, bare, door, later, undo]))[1])).toBe("uten skilt siden 04:24");
  });

  it("says a wet floor typed by day (on a demo) without a clock", () => {
    const day = new Date("2026-11-08T13:10:00Z"); // 14:10 Oslo
    const [signed, bare] = staffHazards(readStaffLog([hazardLine("wet", "lobby", "", who(day), true), hazardLine("wet", "corridor-2b", "", who(day))]));
    expect([signPhrase(signed), signPhrase(bare)]).toEqual(["skilt satt ut", "uten skilt"]);
    expect([inNightHours("23:51:33"), inNightHours("06:59:00"), inNightHours("07:00:00"), inNightHours("14:10:00"), inNightHours(null)]).toEqual([true, true, false, false, false]);
  });

  it("record a robot hazard she saw: who and when, under the hazard's key; Angre takes it back by adding a line", () => {
    const hazard = { key: "wet:corridor-2b:23:51:33", hazard: "wet" as const, place: "corridor-2b", at: "23:51:33" };
    const ack = acknowledgeLine(hazard, who(new Date("2026-11-07T22:53:00Z"))); // 23:53 Oslo
    expect(ack).toMatchObject({ type: "decision", kind: "acknowledged", data: { target: hazard.key, hazard: "wet", place: "corridor-2b", robotAt: "23:51:33", source: "staff", by: "Kjersti Lund", at: "23:53:00" } });
    const entries = readStaffLog([ack]);
    expect(staffAcks(entries).get(hazard.key)).toMatchObject({ by: "Kjersti Lund", at: "23:53:00", robotAt: "23:51:33" });
    expect(entryText(entries[0])).toBe("Kvitterte robotens melding: vått gulv i korridor 2B");
    // Never one of her hazards or rooms.
    expect(staffHazards(entries)).toEqual([]);
    const undo = retractLine(String(ack.type === "decision" && ack.data?.id), who());
    expect(staffAcks(readStaffLog([ack, undo])).size).toBe(0);
  });

  it("include a sample night (test data) that follows the door lock: 213 checked empty, a guest in 210, a wet entrance, a note", () => {
    const entries = readStaffLog(CLERK_SAMPLE);
    expect(entries.every((entry) => entry.sample && entry.by === "Kjersti Lund")).toBe(true);
    expect([...staffRooms(entries)].map(([room, entry]) => [room, entry.status])).toEqual([
      ["room-210", "opptatt"],
      ["room-213", "klar"],
    ]);
    expect(staffHazards(entries).map((entry) => entry.place)).toEqual(["lobby"]);
    // The sign went out a minute after she found it.
    expect(signPhrase(staffHazards(entries)[0])).toBe("skilt satt ut 02:16");
    // No robot hazard is acknowledged in the sample: the robot night keeps its own record.
    expect(staffAcks(entries).size).toBe(0);
    expect(staffNotes(entries)[0].text).toMatch(/^Rolig natt\./);
  });
});

describe("retention on this device", () => {
  it("keeps 30 days of handover days and drops older days and anything that is not a day", () => {
    expect(RETENTION_DAYS).toBe(30);
    const log = { "2026-10-08": [1], "2026-10-09": [2], "2026-11-08": [3], "2026-11-09": [4], junk: [5] };
    expect(keepRecentDays(log, "2026-11-08")).toEqual({ "2026-10-09": [2], "2026-11-08": [3], "2026-11-09": [4] });
    expect(hasExpiredDays(log, "2026-11-08")).toBe(true);
    expect(hasExpiredDays({ "2026-11-08": [] }, "2026-11-08")).toBe(false);
  });

  it("prunes the night clerk's log on load and on every write", () => {
    localStorage.clear();
    const old = roomLine("room-213", "klar", who(new Date("2026-09-01T02:00:00Z")));
    localStorage.setItem("lobby:nattevakt-logg", JSON.stringify({ "2026-09-01": [old], "2026-11-08": [old] }));
    pruneStaffLog(NIGHT);
    expect(Object.keys(JSON.parse(localStorage.getItem("lobby:nattevakt-logg") ?? "{}"))).toEqual(["2026-11-08"]);
    // No screen holds the store, so a write reads the browser's copy first: the old day goes with it.
    localStorage.setItem("lobby:nattevakt-logg", JSON.stringify({ "2026-09-01": [old] }));
    appendStaffLine("2026-11-08", roomLine("room-210", "opptatt", who()));
    expect(Object.keys(JSON.parse(localStorage.getItem("lobby:nattevakt-logg") ?? "{}"))).toEqual(["2026-11-08"]);
    localStorage.clear();
  });
});
