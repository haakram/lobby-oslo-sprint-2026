import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { foldNight, selectRooms } from "@/features/dashboard/selectors";
import { doorLockLines } from "@/features/doorlock/feed";
import { SAFETY_DUE, STRANGER_OWNER, WET_FLOOR_OWNER } from "@/features/handover/safety";
import { DESK_OWNER } from "@/features/handover/select";
import { hotelForRun } from "@/features/hotel/mapFromRun";
import { parseRunLog, type RunLine } from "@/features/nightshift/runlog";
import { demoCalls } from "@/features/reception/demoCalls";
import { phoneTasks } from "@/features/requests/phoneTasks";
import { selectRequests } from "@/features/requests/select";
import type { RoomCheckMark } from "@/features/rooms/reconcile";
import { CLERK_SAMPLE, hazardLine, retractLine, roomLine } from "@/features/staffinput/entries";
import { clerkNoteOf, composeWithoutRobot } from "./compose";

const TODAY = "2026-11-08";
const robotNight = parseRunLog(readFileSync(resolve(process.cwd(), "public/runs/demo.jsonl"), "utf8")).lines;
const night = foldNight(robotNight);
// Tonight's rooms as Overlevering has them (with the robot's statuses, which the robot-free page drops).
const rooms = selectRooms(night, new Set(), hotelForRun(robotNight));
const phone = phoneTasks([], demoCalls(TODAY));
// The night's requests, the robot's among them: the robot-free page must leave those out.
const requests = selectRequests({ night, calls: null, statusOf: () => "ny", phone, manual: [] });

function withoutRobot(staff: readonly RunLine[] = CLERK_SAMPLE, marks: Record<string, RoomCheckMark> = {}) {
  return composeWithoutRobot({ staff, doorLock: doorLockLines(), rooms, marks, requests, phone, today: TODAY });
}

const texts = (result: ReturnType<typeof withoutRobot>) => [
  ...result.handover.open.map((item) => item.text),
  ...result.handover.timeline.map((line) => line.text),
  result.handover.note.text,
];

describe("Overlevering without a robot", () => {
  it("has no robot line at all: every figure the robot would give is zero, no text names it", () => {
    const result = withoutRobot();
    expect(result.handover.figures.robot).toMatchObject({ done: 0, total: 0 });
    for (const text of texts(result)) expect(text).not.toMatch(/robot/i);
    expect(result.handover.timeline.every((line) => line.by !== "robot")).toBe(true);
    // The robot's hand-backs are not the night clerk's work.
    expect(result.handover.open.some((item) => item.id === "robot")).toBe(false);
  });

  it("catches 213 from the door lock and the night clerk's look: bekreftet, two sources outside a robot", () => {
    const result = withoutRobot();
    expect(result.handover.figures.money.toSell.map((row) => row.room)).toEqual(["room-213"]);
    const sale = result.handover.open.find((item) => item.id === "sellable");
    expect(sale?.sell).toEqual(["room-213"]);
    expect(sale?.text).toMatch(/^Rom 213 kan selges fra kl. 06:00/);
    expect(sale?.text).toContain("hvis natten blir utsolgt");
    expect(sale?.text).toContain("Ola Nygård skulle reist 7.11, men utsjekken ble aldri registrert");
    expect(sale?.text).toContain("Dørlåsen: ingen kort i energibryteren siden 22:10. Kjersti Lund så rommet tomt og ryddig kl. 04:24.");
    expect(sale?.text).toMatch(/Bekreftet av to kilder\.$/);
    expect(result.evidence.get("room-213")).toMatchObject({ verdict: "confirmed", word: "bekreftet" });
  });

  it("puts the clerk's safety items first, each with an owner and the safety deadline", () => {
    const { handover, safety } = withoutRobot();
    expect(handover.open[0]).toMatchObject({ safety: true, owner: WET_FLOOR_OWNER, due: SAFETY_DUE, href: "/natt" });
    expect(handover.open[0].text).toBe("Vått gulv i lobbyen, meldt av Kjersti Lund kl. 02:15. Ved inngangen, etter regnet. Sett ut skilt eller tørk opp før gjestene står opp.");
    expect(handover.figures.safety).toEqual({ wetFloors: 1, stranger: false });
    expect(safety).toEqual({ count: 1, detail: "1 vått gulv, meldt av nattevakten" });
  });

  it("names a guest the booking system doesn't have, from the lock's card and the clerk's knock", () => {
    const guest = withoutRobot().handover.open.find((item) => item.id === "guest-room-210");
    expect(guest?.text).toContain("Rom 210: en gjest uten booking");
    expect(guest?.text).toContain("Dørlåsen: kort i energibryteren siden 23:05. Kjersti Lund så gjest eller bagasje i rommet kl. 23:24. Bekreftet av to kilder.");
  });

  it("uses the clerk's note and her entries for what happened, in the night's order, beside the AI receptionist's calls", () => {
    const { handover, sources } = withoutRobot();
    expect(handover.note).toMatchObject({ author: "Kjersti Lund", role: "Nattevakt" });
    expect(handover.note.text).toMatch(/^Rolig natt\. Støy fra rom 210/);
    const staff = handover.timeline.filter((line) => line.by === "staff" && line.text.startsWith("Kjersti Lund "));
    expect(staff.map((line) => [line.at, line.text])).toEqual([
      ["23:24", "Kjersti Lund så gjest eller bagasje på rom 210."],
      ["02:15", "Kjersti Lund meldte vått gulv i lobbyen: Ved inngangen, etter regnet."],
      ["04:24", "Kjersti Lund så rom 213 tomt og ryddig."],
      ["04:35", "Kjersti Lund ordnet det AI-resepsjonisten tok imot: Rom 310 ber om vekking kl. 06:30."],
    ]);
    expect(handover.timeline.some((line) => line.by === "ai")).toBe(true);
    expect(sources).toEqual({ staffEntries: 4, samples: 4, clerk: "Kjersti Lund", doorLockRooms: 36, doorLockFlags: 2 });
  });

  it("never sells on the door lock alone: a flagged room nobody looked at is a room to check, ikke bekreftet", () => {
    const check = CLERK_SAMPLE.find((line) => line.type === "decision" && line.data?.room === "room-213")!;
    const result = withoutRobot([...CLERK_SAMPLE, retractLine(String(check.type === "decision" && check.data?.id), { by: "Kjersti Lund", now: new Date("2026-11-08T04:30:00Z") })]);
    expect(result.handover.figures.money.toSell).toEqual([]);
    expect(result.handover.open.some((item) => item.id === "sellable")).toBe(false);
    const flag = result.handover.open.find((item) => item.id === "lock-room-213");
    expect(flag?.text).toContain("Rom 213: ingen kort i energibryteren siden 22:10. Ola Nygård skulle reist 7.11");
    expect(flag).toMatchObject({ owner: DESK_OWNER, booking: true });
    expect(flag?.text).toContain("Ingen har sett i rommet: sjekk det før det selges.");
    expect(flag?.text).toMatch(/Dørlåsen: ingen kort i energibryteren siden 22:10\. Ikke bekreftet\.$/);
    expect(result.evidence.get("room-213")?.verdict).toBe("unconfirmed");
  });

  it("does not take an early look as proof: a booked room found empty before 01:00 is checked again", () => {
    const early = roomLine("room-204", "klar", { by: "Kjersti Lund", now: new Date("2026-11-07T22:10:00Z") }); // 23:10 Oslo
    const item = withoutRobot([...CLERK_SAMPLE, early]).handover.open.find((entry) => entry.id === "early-room-204");
    expect(item?.text).toBe("Rom 204: Kjersti Lund kl. 23:10 fant det tomt. Systemet har Yuki Tanaka der til 10.11. For tidlig til å vite at gjesten har reist: sjekk igjen etter kl. 01:00.");
  });

  it("follows the same marks as the robot night: sent to reception in one view, in the other too", () => {
    const released: RoomCheckMark = { action: "released", at: "06:01", by: "Siri Haugen", confirmed: { at: "05:58", by: "Hanne Vold" } };
    const result = withoutRobot(CLERK_SAMPLE, { "room-213": released });
    expect(result.handover.figures.money.released.map((row) => row.room)).toEqual(["room-213"]);
    // Sent to reception: pending the booking system, never "done" (and no robot sentence to replace).
    const sale = result.handover.open.find((item) => item.id === "sellable");
    expect(sale?.pending).toBe(true);
    expect(sale?.text).not.toMatch(/robot/i);
  });

  it("says a door and a person the clerk logged as safety items, neutrally, and counts them", () => {
    const at = new Date("2026-11-08T01:40:00Z"); // 02:40 Oslo
    const staff = [...CLERK_SAMPLE, hazardLine("door", "stairwell-2", "", { by: "Kjersti Lund", now: at }), hazardLine("person", "corridor-3a", "I badekåpe.", { by: "Kjersti Lund", now: at })];
    const { handover, safety } = withoutRobot(staff);
    const items = handover.open.filter((item) => item.safety);
    expect(items.map((item) => item.owner)).toEqual([WET_FLOOR_OWNER, STRANGER_OWNER, STRANGER_OWNER]);
    expect(items[1].text).toBe("Dør i trappen, 2. etasje, meldt av Kjersti Lund kl. 02:40. Sjekk at den er lukket og låst.");
    expect(items[2].text).toBe("En person i korridor 3A, meldt av Kjersti Lund kl. 02:40. I badekåpe. Sjekk først om en gjest var låst ute. Ved tvil: avvik etter hotellets rutine.");
    expect(safety).toEqual({ count: 3, detail: "1 vått gulv · 1 dør · 1 person, meldt av nattevakten" });
    expect(handover.figures.safety).toEqual({ wetFloors: 1, stranger: true });
  });

  it("says an entry typed outside the night (on a demo, by day) without a clock", () => {
    const day = hazardLine("wet", "corridor-2b", "", { by: "Siri Haugen", now: new Date("2026-11-08T17:10:00Z") }); // 18:10 Oslo
    const item = withoutRobot([...CLERK_SAMPLE, day]).handover.open.find((entry) => entry.text.startsWith("Vått gulv i korridor 2B"));
    expect(item?.text).toBe("Vått gulv i korridor 2B, meldt av Siri Haugen. Sett ut skilt eller tørk opp før gjestene står opp.");
  });

  it("still makes a page when the clerk logged nothing: the door lock's flags and the calls, and an honest note", () => {
    const { handover, sources } = withoutRobot([]);
    expect(handover.note.text).toBe("Ingen notat fra nattevakten i natt.");
    expect(handover.open.map((item) => item.id)).toContain("lock-room-213");
    expect(handover.open.some((item) => item.safety)).toBe(false);
    expect(sources.staffEntries).toBe(0);
  });

  it("gives the robot night the clerk's own note when she wrote one", () => {
    expect(clerkNoteOf(CLERK_SAMPLE)?.text).toMatch(/^Rolig natt\./);
    expect(clerkNoteOf(CLERK_SAMPLE.filter((line) => line.type === "decision" && line.kind !== "note"))).toBeNull();
  });
});
