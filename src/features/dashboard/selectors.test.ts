import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseRunLog, type RunLine } from "@/features/nightshift/runlog";
import { humanizeText, itemLabel, placeLabel } from "./labels";
import {
  cleaningHref,
  countRooms,
  foldNight,
  HOTEL_ROOMS,
  nextOrderStatus,
  selectCleaning,
  withHeld,
  selectKpis,
  selectRobot,
  selectRoomNight,
  selectRooms,
  selectWorkOrders,
} from "./selectors";

// The demo night (seed 1) the app ships with: the agent's real practice shift, 22:00 to 06:00.
const DEMO = parseRunLog(readFileSync(resolve(process.cwd(), "src/features/nightshift/fixtures/sample.jsonl"), "utf8")).lines;

function indexOf(predicate: (line: RunLine) => boolean): number {
  const index = DEMO.findIndex(predicate);
  if (index < 0) throw new Error("line not in the demo night");
  return index;
}

const decision = (kind: string, request: string) => (line: RunLine) =>
  line.type === "decision" && line.kind === kind && line.data?.request === request;

describe("the hotel map", () => {
  it("has 36 rooms on floors 1 to 3, sorted by floor and number", () => {
    expect(HOTEL_ROOMS).toHaveLength(36);
    expect(HOTEL_ROOMS[0]).toEqual({ id: "room-101", number: "101", floor: 1 });
    expect(HOTEL_ROOMS.at(-1)).toEqual({ id: "room-324", number: "324", floor: 3 });
    expect(HOTEL_ROOMS.filter((room) => room.floor === 2)).toHaveLength(14);
  });
});

describe("the 06:00 handover on the demo night", () => {
  const night = foldNight(DEMO);

  it("gives every room the last status the robot logged, and 'ukjent' where it never looked", () => {
    const rooms = selectRooms(night);
    const byId = new Map(rooms.map((room) => [room.id, room]));
    expect(byId.get("room-103")?.status).toBe("klar");
    expect(byId.get("room-208")?.status).toBe("ikke_forstyrr");
    expect(byId.get("room-319")?.status).toBe("opptatt");
    expect(byId.get("room-105")?.status).toBe("ukjent");
    expect(countRooms(rooms)).toMatchObject({ klar: 5, ma_vaskes: 0, opptatt: 14, ikke_forstyrr: 1, ukjent: 16 });
  });

  it("marks a room with an open work order as avvik until staff mark it Løst", () => {
    const rooms = selectRooms(night);
    expect(rooms.find((room) => room.id === "room-319")?.openOrders).toBe(2);
    expect(countRooms(rooms).avvik).toBe(12);

    const orders319 = night.workOrders.filter((order) => order.room === "room-319").map((order) => order.id);
    const after = selectRooms(night, new Set(orders319));
    expect(after.find((room) => room.id === "room-319")?.openOrders).toBe(0);
    expect(countRooms(after).avvik).toBe(11);
  });

  it("lists the 26 work orders newest first, with the sim time and how the robot's task went", () => {
    const orders = selectWorkOrders(night);
    expect(orders).toHaveLength(26);
    expect(orders[0]).toMatchObject({ type: "sol", place: "corridor-1b", room: null, request: "R-067", robot: "failed" });
    expect(orders[1]).toMatchObject({ type: "sol", place: "corridor-1a", request: null, robot: null });
    expect(orders.at(-1)).toMatchObject({ type: "sol", place: "corridor-3a", text: "Vått gulv ved corridor-3a" });
    const noise = orders.find((order) => order.request === "R-025");
    expect(noise).toMatchObject({ type: "stoy", room: "room-201", robot: "done" });
    expect(noise?.at).toMatch(/^\d\d:\d\d:\d\d$/);
    const complaint = orders.find((order) => order.request === "R-018");
    expect(complaint).toMatchObject({ type: "gjesteklage", robot: "failed" });
  });

  it("sums the KPIs the way the server scored the shift", () => {
    expect(selectKpis(night)).toMatchObject({
      roomsReady: 5,
      roomsTotal: 36,
      ordersOpen: 26,
      tasksDone: 46,
      // 21 task_failed lines and one task the shift ended on; 16 of them were refusals on good grounds
      // (no order on record, a Do-Not-Disturb sign, a duplicate), so 6 go to a person.
      tasksFailed: 6,
      score: 1513,
    });
    expect(night.tally).toMatchObject({ received: 68, done: 46, reported: 46, declined: 16, failed: 5, open: 1, handedBack: 6, total: 52 });
    const first = selectWorkOrders(night)[0].id;
    expect(selectKpis(night, new Set([first])).ordersOpen).toBe(25);
  });

  it("shows the robot where the shift ended, with nothing running and nothing queued", () => {
    const robot = selectRobot(night);
    expect(robot).toMatchObject({ clock: "06:00:00", location: "elevator-1", floor: 1, ended: true, current: null });
    expect(robot.queue).toEqual([]);
    expect(robot.last?.request).toMatch(/^R-\d{3}$/);
    expect(robot.battery).toBeGreaterThan(0);
    expect(robot.hands).toEqual(["towel", "wallet"]);
  });

  it("tells one room's night in order: knocks, tasks and faults", () => {
    const entries = selectRoomNight(night, "room-319");
    expect(entries[0]).toMatchObject({ kind: "task", task: { request: "R-001", outcome: "done" } });
    expect(entries[1]).toMatchObject({ kind: "status", status: "opptatt", source: "knock" });
    expect(entries.filter((entry) => entry.kind === "work_order")).toHaveLength(2);
    expect(selectRoomNight(night, "room-105")).toEqual([]);
  });

  it("attaches a named-guest task to the room the clerk named", () => {
    const entries = selectRoomNight(night, "room-211");
    expect(entries.some((entry) => entry.kind === "task" && entry.task.request === "R-024")).toBe(true);
  });
});

describe("earlier in the night", () => {
  it("knows only what the robot had seen by then", () => {
    const night = foldNight(DEMO, indexOf(decision("task_failed", "R-003")) + 1);
    const rooms = new Map(selectRooms(night).map((room) => [room.id, room]));
    expect(rooms.get("room-208")?.status).toBe("ikke_forstyrr");
    expect(rooms.get("room-103")?.status).toBe("ukjent");
    // R-003 met a Do-Not-Disturb sign and left the guest alone: refused on good grounds, not a failure.
    expect(selectKpis(night)).toMatchObject({ tasksDone: 2, tasksFailed: 0, ordersOpen: 0 });
    expect(night.outcomes.get("R-003")).toMatchObject({ verdict: "declined", reason: "Ikke forstyrr-skilt på rom 208: roboten forstyrret ikke." });
  });

  it("shows the task in progress and the requests waiting behind it", () => {
    // R-019 arrived, then R-020 arrived and started before R-019 did.
    const night = foldNight(DEMO, indexOf(decision("task_start", "R-020")) + 1);
    const robot = selectRobot(night);
    expect(robot.ended).toBe(false);
    expect(robot.current).toMatchObject({ request: "R-020", kind: "message", room: "room-211", outcome: "running" });
    expect(robot.current?.text).toContain("211");
    expect(robot.queue.map((request) => request.request)).toEqual(["R-019"]);
    expect(robot.last?.request).toBe("R-018");
  });

  it("is empty before the first line", () => {
    const night = foldNight(DEMO, 0);
    expect(countRooms(selectRooms(night)).ukjent).toBe(36);
    expect(selectWorkOrders(night)).toEqual([]);
    expect(selectRobot(night)).toMatchObject({ clock: null, current: null, last: null, queue: [] });
  });
});

describe("cleaning", () => {
  const lines: RunLine[] = [
    { v: 1, type: "call", cmd: "status", ok: true, clock: "23:10:00" },
    { v: 1, type: "decision", kind: "room_status", data: { room: "room-214", status: "ma_vaskes", source: "room_check" } },
    { v: 1, type: "decision", kind: "room_status", data: { room: "room-201", status: "ma_vaskes", source: "room_check" } },
    { v: 1, type: "decision", kind: "room_status", data: { room: "room-202", status: "skitten", source: "room_check" } },
  ];

  it("sends the cleaners to the rooms in Må vaskes, in map order, through Ruter's query string", () => {
    const rooms = selectRooms(foldNight(lines));
    const cleaning = selectCleaning(rooms);
    expect(cleaning).toEqual(["room-201", "room-214"]);
    expect(cleaningHref(cleaning)).toBe("/ruter?rom=room-201,room-214");
    // An unknown status word is not trusted: room-202 stays unchecked.
    expect(rooms.find((room) => room.id === "room-202")?.status).toBe("ukjent");
  });
});

describe("work order status and labels", () => {
  it("goes Ny → Tildelt → Løst and stays Løst", () => {
    expect(nextOrderStatus("ny")).toBe("tildelt");
    expect(nextOrderStatus("tildelt")).toBe("lost");
    expect(nextOrderStatus("lost")).toBe("lost");
  });

  it("says places and items in Norwegian", () => {
    expect(placeLabel("room-201")).toBe("Rom 201");
    expect(placeLabel("corridor-2a")).toBe("Korridor 2A");
    expect(placeLabel("elevator-1")).toBe("Heis, 1. etasje");
    expect(placeLabel("kitchen-pass")).toBe("Kjøkkenluke");
    expect(itemLabel("tray-208")).toBe("brett til 208");
    expect(itemLabel("toy-2")).toBe("leke");
    expect(itemLabel("phone-charger")).toBe("mobillader");
  });
});

describe("humanizeText", () => {
  it("replaces map ids in the agent's texts with words", () => {
    expect(humanizeText("Vått gulv ved corridor-3a")).toBe("Vått gulv ved korridor 3A");
    expect(humanizeText("ikke forstyrr-skilt på room-208")).toBe("ikke forstyrr-skilt på rom 208");
    expect(humanizeText("Gjesteklage fra rom 319")).toBe("Gjesteklage fra rom 319");
  });
});

describe("withHeld: the rack says what the room check says", () => {
  it("shows a room held back (an arriving guest's bags inside) as taken, never Klar, and leaves the rest", () => {
    const night = foldNight(parseRunLog(readFileSync(resolve(process.cwd(), "public/runs/demo.jsonl"), "utf8")).lines);
    const rooms = selectRooms(night);
    expect(rooms.find((room) => room.id === "room-209")?.status).toBe("klar");
    const rack = withHeld(rooms, ["room-209"]);
    expect(rack.find((room) => room.id === "room-209")).toMatchObject({ status: "opptatt", held: true });
    expect(rack.find((room) => room.id === "room-213")?.status).toBe("klar");
    expect(countRooms(rack).klar).toBe(countRooms(rooms).klar - 1);
    expect(withHeld(rooms, [])).toBe(rooms);
  });

  it("shows a room still to confirm (213, the system holds it) as not ready, so the legend counts the same Klare til salg as the figure", () => {
    const night = foldNight(parseRunLog(readFileSync(resolve(process.cwd(), "public/runs/demo.jsonl"), "utf8")).lines);
    const rooms = selectRooms(night);
    const rack = withHeld(rooms, ["room-209"], ["room-213"]);
    expect(rack.find((room) => room.id === "room-213")).toMatchObject({ status: "opptatt", toConfirm: true });
    expect(countRooms(rack).klar).toBe(countRooms(rooms).klar - 2);
    // Sent to reception (round 5): pending, neutral, never a green Klar until the booking system confirms it.
    const sent = withHeld(rooms, ["room-209"], [], ["room-213"]).find((room) => room.id === "room-213");
    expect(sent).toMatchObject({ status: "opptatt", pending: true });
    expect(sent?.toConfirm).toBeUndefined();
    // Confirmed free in the booking system (neither to confirm nor pending): a green Klar again.
    expect(withHeld(rooms, ["room-209"], [], []).find((room) => room.id === "room-213")?.status).toBe("klar");
  });
});
