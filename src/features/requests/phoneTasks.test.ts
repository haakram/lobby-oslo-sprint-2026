import { beforeEach, describe, expect, it } from "vitest";
import { demoCalls, osloIso } from "@/features/reception/demoCalls";
import type { BookingRecord, MessageRecord } from "@/features/reception/records";
import { assignPhoneTask, classifyRequest, PHONE_ASSIGNMENTS, phoneTaskFromCall, phoneTaskFromRecord, phoneTasks, roomInText, staffFor } from "./phoneTasks";
import { fromPhoneTask } from "./select";

const message = (id: string, text: string, topic: MessageRecord["topic"] = "other"): MessageRecord => ({
  kind: "message",
  id,
  createdAt: "2026-11-08T01:14:00.000Z",
  name: "Kari Nordmann",
  phone: "+47 900 00 123",
  topic,
  message: text,
  urgent: false,
});

describe("a phone call becomes a task", () => {
  it("finds the room a guest names, in Norwegian or English", () => {
    expect(roomInText("Rom 214 ønsker ekstra håndklær.")).toBe("room-214");
    expect(roomInText("Gjesten i rommet 322 vil ha en pute")).toBe("room-322");
    expect(roomInText("This is room 108, the shower is broken")).toBe("room-108");
    expect(roomInText("Ring tilbake om en booking i desember")).toBeNull();
  });

  it("tells what the robot can carry from what a person must fix", () => {
    expect(classifyRequest("Rom 214 ønsker to ekstra håndklær.")).toEqual({ kind: "Utstyr", robotCan: true });
    expect(classifyRequest("Frokost på rommet kl. 08")).toEqual({ kind: "Romservice", robotCan: true });
    expect(classifyRequest("Radiatoren på rom 104 virker ikke")).toEqual({ kind: "Teknisk", robotCan: false });
    expect(classifyRequest("Det er mye støy fra naborommet")).toEqual({ kind: "Støy", robotCan: false });
    expect(classifyRequest("Vekking kl. 06:30")).toEqual({ kind: "Beskjed", robotCan: false });
  });

  it("suggests the right person on today's shift: the technician for a fault, the floor's cleaner for things", () => {
    expect(staffFor("Teknisk", "room-104").name).toBe("Trond Eikeland");
    expect(staffFor("Utstyr", "room-214")).toEqual({ name: "Mariam Osei", first: "Mariam" });
    expect(staffFor("Beskjed", "room-330").name).toBe("Resepsjonen");
  });

  it("makes a task of a message that names a room, and leaves bookings and plain callbacks alone", () => {
    const task = phoneTaskFromRecord(message("m1", "Rom 214 ønsker to ekstra håndklær."));
    expect(task).toMatchObject({ id: "phone:m1", room: "room-214", kind: "Utstyr", suggested: "robot", origin: "record", demo: null });
    expect(phoneTaskFromRecord(message("m2", "Ring meg om prisen"))).toBeNull();
    expect(phoneTaskFromRecord(message("m3", "Rom 214 vil booke en natt til", "booking"))).toBeNull();
    const booking = { kind: "booking", id: "b1" } as BookingRecord;
    expect(phoneTaskFromRecord(booking)).toBeNull();
  });

  it("makes a task of a call-log note that asks for something in a room, not of a booking call", () => {
    const note = { id: "c9", startedAt: "2026-11-07T15:03:00.000Z", title: "Håndklær", summary: "Gjesten i rom 222 mangler håndklær.", callerName: "Kira", requestType: null, arrival: null, departure: null, guests: null, needsCallback: true };
    expect(phoneTaskFromCall(note)).toMatchObject({ id: "call:c9", room: "room-222", origin: "call-log", kind: "Utstyr" });
    expect(phoneTaskFromCall({ ...note, requestType: "booking" })).toBeNull();
    expect(phoneTaskFromCall({ ...note, summary: "Vil vite om parkering", title: null })).toBeNull();
  });

  it("lists live calls before the seeded ones, each once", () => {
    const seeded = demoCalls("2026-11-08");
    const tasks = phoneTasks([message("m1", "Room 205 needs a pillow"), seeded[0].record], seeded);
    expect(tasks.map((task) => task.id)).toEqual(["phone:m1", "phone:demo-call-1", "phone:demo-call-2", "phone:demo-call-3"]);
    expect(tasks[1]).toMatchObject({ origin: "record", at: "01:47" });
  });

  it("seeds three calls from this morning, in Oslo time", () => {
    expect(osloIso("2026-11-08", "01:47")).toBe("2026-11-08T00:47:00.000Z");
    expect(osloIso("2026-07-01", "01:47")).toBe("2026-06-30T23:47:00.000Z");
    const tasks = phoneTasks([], demoCalls("2026-11-08"));
    expect(tasks.map((task) => [task.room, task.kind, task.at])).toEqual([
      ["room-214", "Utstyr", "01:47"],
      ["room-104", "Teknisk", "02:14"],
      ["room-330", "Beskjed", "04:32"],
    ]);
  });
});

describe("the request a phone task shows as", () => {
  beforeEach(() => localStorage.clear());

  it("waits with a suggestion, says who has it once assigned, and who did it once done", () => {
    const [towels, , wakeUp] = phoneTasks([], demoCalls("2026-11-08"));
    expect(fromPhoneTask(towels, undefined)).toMatchObject({ source: "telefon", badge: "Telefon (AI)", status: "venter", handler: "Forslag: roboten", text: "Rom 214 ønsker to ekstra håndklær." });
    expect(fromPhoneTask(towels, { to: "robot", who: "Roboten", at: "06:01" }, "tildelt").handler).toBe("Roboten tar den");
    expect(fromPhoneTask(towels, { to: "staff", who: "Mariam Osei", at: "06:01" }, "lost").handler).toBe("Mariam Osei ordnet det");
    // The seeded wake-up call was settled in the night.
    expect(fromPhoneTask(wakeUp, undefined)).toMatchObject({ status: "fullfort", handler: "Kjersti Lund ordnet det 04:35" });
  });

  it("keeps who took it in this browser, and forgets it on Angre", () => {
    assignPhoneTask("phone:x", { to: "robot", who: "Roboten", at: "06:01" });
    expect(PHONE_ASSIGNMENTS.read()).toEqual({ "phone:x": { to: "robot", who: "Roboten", at: "06:01" } });
    assignPhoneTask("phone:x", null);
    expect(PHONE_ASSIGNMENTS.read()).toEqual({});
  });
});
