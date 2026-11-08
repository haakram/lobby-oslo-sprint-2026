import { describe, expect, it } from "vitest";
import { BASE_HOTEL, hotelForRun } from "@/features/hotel";
import type { MessageRecord } from "@/features/reception/records";
import { phoneTaskFromRecord } from "./phoneTasks";
import { hotelRoomsOf, requestLane, selectRequests } from "./select";

const message = (id: string, text: string): MessageRecord => ({
  kind: "message",
  id,
  createdAt: "2026-11-08T04:40:00.000Z",
  name: "Kari Nordmann",
  phone: "+47 900 00 123",
  topic: "other",
  message: text,
  urgent: false,
});

describe("Forespørsler's lanes and unknown rooms (review round 3)", () => {
  it("knows tonight's rooms only from a night that has ended", () => {
    const map = hotelForRun([{ v: 1, type: "start", shift: "w2-0000000000000000000000000000000c", mode: "practice", seed: 1, t: 1 }] as never);
    expect(hotelRoomsOf(BASE_HOTEL, true)).toBeNull();
    expect(hotelRoomsOf(map, false)).toBeNull();
    const rooms = hotelRoomsOf(map, true);
    expect(rooms?.has("room-214")).toBe(true);
    expect(rooms?.has("room-222")).toBe(false);
  });

  it("makes a call for a room the hotel doesn't have a reception row in the phone's lane, not a phone task", () => {
    const known = phoneTaskFromRecord(message("a", "Rom 214 ønsker to ekstra håndklær."))!;
    const unknown = phoneTaskFromRecord(message("b", "Gjesten i rom 222 mangler håndklær."))!;
    const rows = selectRequests({ night: null, calls: null, statusOf: () => "ny", manual: [], phone: [known, unknown], hotelRooms: new Set(["room-214"]) });
    const row222 = rows.find((row) => row.id === unknown.id)!;
    // No `phone`: Overlevering's "Gjest venter" item and the robot's Send roboten read phone tasks only.
    expect(row222).toMatchObject({ kind: "Ukjent rom", room: null, unknownRoom: "222", source: "telefon", status: "venter" });
    expect(row222.phone).toBeUndefined();
    expect(row222.call).toBe(unknown);
    expect(requestLane(row222)).toBe("phone");
    // The guest waiting in a real room comes first in the phone's lane.
    expect(rows.map((row) => row.id)).toEqual([known.id, unknown.id]);
    // Without tonight's rooms nothing is judged.
    expect(selectRequests({ night: null, calls: null, statusOf: () => "ny", manual: [], phone: [unknown] })[0].phone).toBe(unknown);
  });

  it("orders the lanes: the robot's hand-backs, the phone, the rest waiting, then under way, done, refused, called off", () => {
    const phone = phoneTaskFromRecord(message("c", "Rom 214 ønsker en pute."))!;
    const rows = selectRequests({
      night: null,
      calls: null,
      statusOf: () => "ny",
      manual: [
        { id: "m1", source: "personale", kind: "Utstyr", room: "room-203", text: "Ekstra dyne.", at: "05:59", handler: "Kjersti Lund", status: "venter" },
        { id: "m2", source: "personale", kind: "Utstyr", room: "room-204", text: "Te.", at: "05:58", handler: "Kjersti Lund", status: "fullfort" },
      ],
      phone: [phone],
    });
    expect(rows.map(requestLane)).toEqual(["phone", "venter", "fullfort"]);
  });
});
