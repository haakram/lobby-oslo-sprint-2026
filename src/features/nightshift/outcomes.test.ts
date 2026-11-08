import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { foldNight, selectRooms } from "@/features/dashboard/selectors";
import { nightTotals } from "@/features/dashboard/highlights";
import { composeHandover } from "@/features/handover/select";
import { selectMaintenance } from "@/features/maintenance/select";
import { selectAlerts } from "@/features/notifications/alerts";
import { selectRequests } from "@/features/requests/select";
import { pmsLastNight, revenueLastNight } from "@/features/rooms/pms";
import { reconcileRooms, robotRoomChecks } from "@/features/rooms/reconcile";
import { buildTimeline } from "@/features/replay/timeline";
import { cancelledReason, classify, declinedReason, failedReason, nightOutcomes, outcomesAt, type RequestFacts, tally } from "./outcomes";
import { parseRunLog, type RunLine } from "./runlog";

const base: RequestFacts = { request: "R-001", started: true, ended: null, status: null, note: null, unverified: false, skipped: null };
const start: RunLine = { v: 1, type: "start", shift: "w2-0000000000000000000000000000000b", mode: "practice", seed: 5 };
const req = (id: string, kind = "amenity"): RunLine => ({ v: 1, type: "decision", kind: "request", data: { request: id, kind, text: `${id} text` } });
const startTask = (id: string): RunLine => ({ v: 1, type: "decision", kind: "task_start", data: { request: id, kind: "amenity" } });
const end: RunLine = { v: 1, type: "end", score: 10, requests_served: 1 };

describe("how one request ended", () => {
  it("counts a done only when the server credited it", () => {
    expect(classify({ ...base, ended: "done" }, true)).toMatchObject({ verdict: "done", reason: null });
    expect(classify({ ...base, ended: "done", unverified: true }, true)).toMatchObject({
      verdict: "unverified",
      reason: "Meldt ferdig, men dommeren (Wybe Night Shift-simulatoren) godkjente det ikke. Sjekk med gjesten.",
    });
  });

  it("tells a refusal on good grounds and a called-off request from a failure", () => {
    expect(classify({ ...base, ended: "failed", status: "declined", note: "No pillow order from 308 on record tonight; nothing was ordered." }, true).verdict).toBe("declined");
    // The old agent wrote no status: its note says it.
    expect(classify({ ...base, ended: "failed", status: "failed", note: "no order for phone-charger from 106 on record" }, true).verdict).toBe("declined");
    expect(classify({ ...base, ended: "failed", note: "towel out of stock", skipped: "Skip R-065, 108 checked out. Don't bother with it." }, true)).toMatchObject({
      verdict: "cancelled",
      reason: "Avlyst av nattsjefen: gjesten i rom 108 har sjekket ut.",
    });
    expect(classify({ ...base, ended: "failed", note: "toy not found after 8 scans" }, true)).toMatchObject({ verdict: "failed", reason: "Fant ikke leke etter 8 søk." });
  });

  it("says what never finished as open once the night is over, running before", () => {
    expect(classify(base, true).verdict).toBe("open");
    expect(classify({ ...base, started: false }, true).reason).toBe("Roboten rakk det ikke før skiftet tok slutt.");
    expect(classify(base, false).verdict).toBe("running");
  });

  it("puts the agent's reasons in a hotel's Norwegian, and never says 'score'", () => {
    expect(failedReason("towel out of stock")).toBe("Tomt for håndkle på lageret.");
    expect(failedReason("wallet not found after 7 scans")).toBe("Fant ikke lommebok etter 7 søk.");
    expect(failedReason("placed wallet-3 x1 in room-213 but the score did not rise")).toBe("Lommebok levert til rom 213, men ikke bekreftet. Sjekk at det kom til riktig gjest.");
    expect(failedReason("something odd happened with the tray")).toBe("Roboten fikk det ikke til.");
    expect(declinedReason("no order for phone-charger from 101 on record")).toBe("Roboten sjekket: ingen bestilling av mobillader fra rom 101.");
    expect(declinedReason("The pillow for 136 was already delivered under R-001; nothing more to bring.")).toBe("Pute til rom 136 var allerede levert (R-001).");
    expect(cancelledReason(null)).toBe("Avlyst av nattsjefen.");
  });
});

describe("the night's one tally", () => {
  it("reads report_unverified, the manager's skip in the inbox, and the final agent's request_skipped", () => {
    const lines: RunLine[] = [
      start,
      req("R-001"),
      startTask("R-001"),
      { v: 1, type: "decision", kind: "report_unverified", data: { request: "R-001", reply: "Noted." } },
      { v: 1, type: "decision", kind: "task_done", data: { request: "R-001", note: "wet-floor sign placed" } },
      req("R-002"),
      startTask("R-002"),
      { v: 1, type: "call", cmd: "inbox", ok: true, result: { messages: [{ from: "night manager", text: "Skip R-002, 108 checked out. Don't bother with it.", request: "R-002" }] } },
      { v: 1, type: "decision", kind: "task_failed", data: { request: "R-002", note: "towel out of stock" } },
      req("R-003"),
      { v: 1, type: "decision", kind: "request_skipped", data: { request: "R-003", text: "Skip R-003, 309 checked out." } },
      req("R-004"),
      startTask("R-004"),
      { v: 1, type: "decision", kind: "task_done", data: { request: "R-004" } },
      end,
    ];
    const { outcomes, tally: night } = nightOutcomes(lines);
    expect([...outcomes.values()].map((outcome) => outcome.verdict)).toEqual(["unverified", "cancelled", "cancelled", "done"]);
    expect(night).toMatchObject({ received: 4, done: 1, unverified: 1, cancelled: 2, reported: 2, total: 2, handedBack: 1 });
  });

  it("adds up: done + handed back + running is the total, and refused + called off make up the rest", () => {
    const night = tally([
      { request: "a", verdict: "done", reason: null, note: null },
      { request: "b", verdict: "declined", reason: null, note: null },
      { request: "c", verdict: "failed", reason: null, note: null },
      { request: "d", verdict: "open", reason: null, note: null },
    ]);
    expect(night.total).toBe(night.done + night.handedBack + night.running);
    expect(night.received).toBe(night.total + night.declined + night.cancelled);
  });
});

describe("one night, one set of numbers on every screen (the recorded demo night)", () => {
  const { lines } = parseRunLog(readFileSync(resolve(process.cwd(), "public/runs/demo.jsonl"), "utf8"));
  const truth = nightOutcomes(lines).tally;
  const night = foldNight(lines);
  const timeline = buildTimeline(lines);

  it("reads the same from the raw log and from the replay Natteskift scrubs", () => {
    expect(outcomesAt(timeline, timeline.events.length, timeline.duration).tally).toEqual(truth);
    expect(night.tally).toEqual(truth);
    // The server's own count of requests served is the credited "done".
    const served = lines.find((line): line is Extract<RunLine, { type: "end" }> => line.type === "end")?.requests_served;
    expect(truth.done).toBe(served);
  });

  it("gives Oversikt, Forespørsler, Overlevering and the bell the same robot figures", () => {
    const requests = selectRequests({ night, calls: null, statusOf: () => "ny", manual: [] });
    const robot = requests.filter((request) => request.source === "robot");
    // Forespørsler lists every request the robot was given, with its verdict as the status.
    expect(robot).toHaveLength(truth.received);
    expect(robot.filter((request) => request.status === "fullfort")).toHaveLength(truth.done);
    expect(robot.filter((request) => request.status === "avvist")).toHaveLength(truth.declined);
    expect(robot.filter((request) => request.status === "feilet" || request.status === "venter")).toHaveLength(truth.handedBack);

    // Oversikt's greeting and figure.
    expect(nightTotals({ night, requests: [] })).toEqual({ done: truth.done, total: truth.total, staffDone: 0 });

    // Overlevering 06:00.
    const rooms = selectRooms(night);
    const handover = composeHandover({
      night,
      rooms,
      reconciliation: reconcileRooms(robotRoomChecks(lines), pmsLastNight()),
      marks: {},
      requests,
      phone: [],
      revenue: revenueLastNight(rooms.length),
    });
    expect(handover.figures.robot).toEqual(truth);

    // The bell's Haster: only what the robot genuinely handed back.
    const maintenance = selectMaintenance({ orders: null, statusOf: () => "ny", assignee: null, manual: [] });
    const alerts = selectAlerts({
      role: "admin",
      requests,
      maintenance,
      outOfOrder: [],
      guests: { today: "2026-11-08", arrivals: [], departures: [], inHouse: [], booked: [], withNotes: [], roomsTonight: 0, bookedToday: [] },
      calls: { kind: "not-set-up" },
      lowStock: [],
      robot: null,
    });
    expect(alerts.find((alert) => alert.id === "handover")?.level ?? 0).toBe(truth.handedBack);
  });
});
