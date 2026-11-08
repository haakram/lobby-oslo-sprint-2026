import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseRunLog } from "@/features/nightshift/runlog";
import { HOTEL_NODES, HOTEL_ROOMS, placeName, roomNumber } from "./hotel";
import { buildTimeline, clockToSim, robotPoseAt, simToClock, snapshotAt, taskTitle } from "./timeline";

const SAMPLE = readFileSync(resolve(process.cwd(), "src/features/nightshift/fixtures/sample.jsonl"), "utf8");
const { lines } = parseRunLog(SAMPLE);
const timeline = buildTimeline(lines);

describe("sim clock", () => {
  it("counts seconds since 22:00 and wraps past midnight", () => {
    expect(clockToSim("22:00:00")).toBe(0);
    expect(clockToSim("23:31:07")).toBe(5467);
    expect(clockToSim("00:18:49")).toBe(2 * 3600 + 18 * 60 + 49);
    expect(clockToSim("06:00:00")).toBe(8 * 3600);
    expect(simToClock(5467)).toBe("23:31:07");
    expect(simToClock(8 * 3600, false)).toBe("06:00");
  });
});

describe("buildTimeline on the demo night", () => {
  it("reads the shift header and the end", () => {
    expect(timeline.shift).toMatch(/^w2-/);
    expect(timeline.seed).toBe(1);
    expect(timeline.live).toBe(false);
    expect(timeline.finalScore).toBeGreaterThan(0);
    expect(timeline.duration).toBe(8 * 3600);
  });

  it("builds one move per change of place, all on the map, in time order", () => {
    expect(timeline.moves.length).toBeGreaterThan(100);
    let previous = 0;
    for (const move of timeline.moves) {
      expect(HOTEL_NODES[move.from]).toBeDefined();
      expect(HOTEL_NODES[move.to]).toBeDefined();
      expect(move.from).not.toBe(move.to);
      expect(move.t0).toBeLessThanOrEqual(move.t1);
      expect(move.t0).toBeGreaterThanOrEqual(previous);
      previous = move.t0;
    }
  });

  it("starts at the dock and walks to the lobby in the first seconds", () => {
    expect(timeline.startNode).toBe("charging-dock");
    const first = timeline.moves[0];
    expect(first).toMatchObject({ from: "charging-dock", to: "lobby", t1: 8 });
    expect(first.t0).toBe(0);
  });

  it("rides the elevator as a move between elevator nodes on different floors", () => {
    const ride = timeline.moves.find((move) => move.from === "elevator-1" && move.to === "elevator-3");
    expect(ride).toBeDefined();
    expect(ride!.t1 - ride!.t0).toBeGreaterThan(0);
  });

  it("pairs every task_start with its request text and an outcome", () => {
    expect(timeline.tasks.length).toBe(68);
    const first = timeline.tasks[0];
    expect(first).toMatchObject({ id: "R-001", kind: "amenity", room: "room-319", item: "phone-charger", outcome: "done" });
    expect(first.text).toContain("phone charger");
    expect(timeline.tasks.filter((task) => task.outcome === "done").length).toBe(46);
    expect(timeline.tasks.filter((task) => task.outcome === "failed").length).toBe(22);
    expect(timeline.tasks.every((task) => task.end !== null)).toBe(true);
  });

  it("collects room statuses and work orders", () => {
    const statuses = timeline.roomChanges.filter((change) => change.status !== "avvik");
    expect(statuses.length).toBe(48);
    expect(statuses[0]).toMatchObject({ room: "room-319", status: "opptatt" });
    expect(timeline.workOrders.length).toBe(26);
    expect(timeline.workOrders[0].text).toMatch(/Vått gulv/);
  });

  it("describes the night in Norwegian, newest-last", () => {
    const done = timeline.events.find((event) => event.kind === "task_done");
    expect(done).toMatchObject({ label: "Fullført", tone: "success", request: "R-001" });
    expect(done!.text).toBe("Lader levert til rom 319 (+23 p)");
    const placed = timeline.events.find((event) => event.kind === "call:place" && event.text.startsWith("skilt"));
    expect(placed!.text).toMatch(/^skilt for vått gulv ved korridor /);
    const refused = timeline.events.find((event) => event.kind === "task_failed" && /Ikke forstyrr/.test(event.text));
    expect(refused).toMatchObject({ label: "Avstått", tone: "neutral", text: "Ikke forstyrr-skilt på rom 208; banket ikke på" });
    // A claim checked and declined is a right call: "Avvist", in Norwegian, never red.
    const declined = timeline.events.find((event) => event.kind === "task_failed" && event.label === "Avvist");
    expect(declined).toMatchObject({ tone: "neutral", text: "Ingen bestilling av vannflaske fra rom 319 i natt; ingenting å levere" });
    const knock = timeline.events.find((event) => event.kind === "call:knock");
    expect(knock!.text).toMatch(/^Rom 319 · /);
    let previous = 0;
    for (const event of timeline.events) {
      expect(event.t).toBeGreaterThanOrEqual(previous);
      previous = event.t;
    }
  });
});

describe("snapshotAt", () => {
  it("marks a room with an open work order as avvik over its own status, never as a status of its own", () => {
    const order = timeline.workOrders.find((o) => o.room && timeline.map.nodes[o.room]);
    if (!order?.room) throw new Error("expected a work order on a room");
    const before = snapshotAt(timeline, Math.max(0, order.t - 1)).rooms[order.room];
    const after = snapshotAt(timeline, order.t).rooms[order.room];
    expect(before.avvik).toBe(false);
    expect(after.avvik).toBe(true);
    expect(after.status).not.toBe("avvik");
    expect(timeline.roomChanges.some((change) => change.status === "avvik")).toBe(false);
  });

  it("names the refused stranger as a manager's event, in Norwegian", () => {
    const demo = buildTimeline(parseRunLog(readFileSync(resolve(process.cwd(), "public/runs/demo.jsonl"), "utf8")).lines);
    const refused = demo.events.filter((event) => event.kind === "stranger_refused");
    expect(refused).toHaveLength(7);
    expect(refused[0]).toMatchObject({ label: "Sa nei", tone: "success", clock: "01:17:02" });
    expect(refused[0].text).toBe("Åpnet ikke rom 308 for en ukjent person: ga ikke fra seg nøkkelkort og fulgte ikke etter");
    const plea = demo.events.find((event) => event.kind === "person");
    expect(plea?.text).toBe("En mann i badekåpe stoppet roboten og ba om å bli sluppet inn i rom 308");
  });

  it("at 22:00 the robot is docked, nothing checked, score 0", () => {
    const snap = snapshotAt(timeline, 0);
    expect(snap.clock).toBe("22:00:00");
    expect(snap.score).toBe(0);
    expect(snap.robot.node).toBe("charging-dock");
    expect(snap.robot.floor).toBe(1);
    expect(snap.robot.task).toBeNull();
    expect(Object.keys(snap.rooms).length).toBe(HOTEL_ROOMS.length);
    expect(snap.rooms["room-319"].status).toBe("ukjent");
    expect(snap.workOrders).toEqual([]);
    expect(snap.finished).toBe(false);
  });

  it("mid-way through R-001 the robot is on floor 3 carrying the charger, with the task labelled", () => {
    const snap = snapshotAt(timeline, clockToSim("22:05:20"));
    expect(snap.robot.floor).toBe(3);
    expect(snap.robot.node).toBe("corridor-3c");
    expect(snap.robot.carrying).toContain("phone-charger");
    expect(snap.robot.cart).toBe(true);
    expect(snap.robot.task?.id).toBe("R-001");
    expect(snap.robot.task?.title).toBe("R-001 · Lader til 319");
    expect(snap.robot.attention).toBe("room-319");
    expect(snap.rooms["room-319"].status).toBe("ukjent");
  });

  it("after the knock, room 319 is opptatt and the charger has been placed", () => {
    const snap = snapshotAt(timeline, clockToSim("22:05:45"));
    expect(snap.rooms["room-319"]).toMatchObject({ status: "opptatt" });
    expect(snap.robot.carrying).not.toContain("phone-charger");
    expect(snap.recent[0].kind).toBe("task_done");
    expect(snap.recent[1].kind).toBe("call:report");
  });

  it("interpolates a walk between two nodes", () => {
    const pose = robotPoseAt(timeline, 4, { from: "", to: "", progress: 0, node: "", floor: 0, moving: false });
    expect(pose).toMatchObject({ from: "charging-dock", to: "lobby", moving: true });
    expect(pose.progress).toBeCloseTo(0.5);
  });

  it("at the end of the night shows the final score, both counts, every work order", () => {
    const snap = snapshotAt(timeline, timeline.duration);
    expect(snap.finished).toBe(true);
    expect(snap.score).toBe(timeline.finalScore);
    expect(snap.tasksDone).toBe(46);
    expect(snap.tasksFailed).toBe(22);
    expect(snap.workOrders.length).toBe(26);
    expect(snap.eventCount).toBe(timeline.events.length);
    expect(snap.recent.length).toBe(12);
    expect(snap.robot.task).toBeNull();
  });
});

describe("names", () => {
  it("speaks the hotel's Norwegian", () => {
    expect(placeName("room-214")).toBe("Rom 214");
    expect(placeName("corridor-3a")).toBe("Korridor 3a");
    expect(placeName("kitchen-pass")).toBe("Kjøkkenluke");
    expect(roomNumber("room-214")).toBe("214");
    expect(taskTitle("R-021", "tray", "room-214", "tray-214")).toBe("R-021 · Romservice til 214");
    expect(taskTitle("R-002", "lost_item", "room-317", "glasses")).toBe("R-002 · Gjenglemt til 317");
  });
});
