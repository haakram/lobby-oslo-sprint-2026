import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { RobotView } from "@/features/dashboard/selectors";
import { nightSafety } from "@/features/handover/safety";
import { parseRunLog } from "@/features/nightshift/runlog";
import type { WorkOrderView } from "@/features/maintenance/select";
import type { RequestView } from "@/features/requests/select";
import { type AlertData, MAX_ALERTS, selectAlerts } from "./alerts";

// The bell: only what needs a person, each with its one way in, Haster first, per role.
function data(overrides: Partial<AlertData> = {}): AlertData {
  return {
    role: "admin",
    requests: [],
    maintenance: [],
    outOfOrder: [],
    guests: { today: "2026-11-08", arrivals: [], departures: [], inHouse: [], booked: [], withNotes: [], roomsTonight: 0, bookedToday: [] },
    calls: { kind: "not-set-up" },
    lowStock: [],
    robot: null,
    ...overrides,
  };
}

function request(id: string, status: RequestView["status"], source: RequestView["source"] = "robot", room: string | null = "room-101"): RequestView {
  return { id, source, kind: "Utstyr", room, text: null, lang: "en", at: "03:10", handler: "Roboten", status, actionable: true, tonight: true };
}

function order(id: string, overrides: Partial<WorkOrderView> = {}): WorkOrderView {
  return { id, origin: "personale", type: "teknisk", text: "Ny dusjarmatur monteres i dag.", room: "room-107", place: null, priority: "middels", assignee: "Trond Eikeland", at: "16:40", reportedBy: "Beata", status: "tildelt", outOfOrder: false, robot: null, ...overrides };
}

const ROBOT: RobotView = { clock: "05:55:29", location: "elevator-1", floor: 1, battery: 13, hands: [], cart: [], ended: true, current: null, last: null, queue: [] };
const CALL = { id: "c1", startedAt: "2026-11-08T08:00:00Z", title: null, summary: null, callerName: "Asad Ullah", requestType: null, arrival: null, departure: null, guests: null, needsCallback: true };
const ARRIVAL = { id: "stay-1", name: "Lukas Brandt", room: null, arrival: "2026-11-08", departure: "2026-11-09", guests: 1, notes: [], source: "pms" as const, bookedToday: true };
const TOWELS = { store: "laundry", item: "Badehåndklær", count: 38, expected: 120, unit: "stk" };

/** The demo day: everything the bell can hold at once. */
function busy(role: AlertData["role"] = "admin"): AlertData {
  return data({
    role,
    requests: [request("r1", "feilet"), request("r2", "feilet", "robot", "room-323"), request("r3", "venter", "robot", null), request("r4", "fullfort"), request("m1", "venter", "stemme")],
    maintenance: [order("wo-m1", { outOfOrder: true })],
    outOfOrder: ["room-107"],
    guests: { ...data().guests, arrivals: [ARRIVAL] },
    calls: { kind: "ready", calls: [CALL] },
    lowStock: [TOWELS],
    robot: ROBOT,
  });
}

describe("selectAlerts (the bell)", () => {
  it("is empty when nothing needs a person", () => {
    expect(selectAlerts(data())).toEqual([]);
    // A robot that finished with a healthy battery and done requests are not alerts.
    expect(selectAlerts(data({ robot: { ...ROBOT, battery: 64 }, requests: [request("r1", "fullfort")] }))).toEqual([]);
  });

  it("names what the robot handed over as one Haster alert, counting only the robot's failed and open requests", () => {
    const [handover] = selectAlerts(busy());
    expect(handover).toMatchObject({
      id: "handover",
      level: 3,
      priority: "hoy",
      title: "Roboten ga 3 forespørsler videre",
      detail: "Gjester i rom 101 og 323 venter på en person.",
      action: { label: "Åpne Forespørsler", href: "/foresporsler" },
    });
  });

  it("puts Haster first, then the day's alerts, each with its one way in", () => {
    const alerts = selectAlerts(busy());
    expect(alerts.map((alert) => [alert.id, alert.priority])).toEqual([
      ["handover", "hoy"],
      ["callbacks", "obs"],
      ["no-room", "obs"],
      ["out-of-order", "obs"],
      ["stock", "obs"],
      ["battery", "obs"],
    ]);
    expect(alerts.find((alert) => alert.id === "callbacks")).toMatchObject({ title: "1 innringer venter på svar", detail: "Ring tilbake til Asad Ullah.", action: { href: "/resepsjon" } });
    expect(alerts.find((alert) => alert.id === "no-room")).toMatchObject({ title: "Lukas Brandt kommer i dag og har ikke rom ennå", action: { href: "/gjester" } });
    expect(alerts.find((alert) => alert.id === "out-of-order")).toMatchObject({
      title: "Rom 107 er stengt i dag",
      detail: "Ny dusjarmatur monteres i dag. Hos Trond Eikeland.",
      action: { label: "Åpne Vedlikehold", href: "/vedlikehold" },
    });
    expect(alerts.find((alert) => alert.id === "stock")).toMatchObject({ title: "Badehåndklær er under minimum", detail: "38 av 120 igjen i vaskeri.", action: { href: "/lager" } });
    // The robot docks itself: the morning needs to know it did not get there in time.
    expect(alerts.find((alert) => alert.id === "battery")).toMatchObject({ title: "Roboten rakk ikke å lade før 06:00", detail: "Batteriet står på 13 % etter natten.", action: { href: "/hotell" } });
    // More than the bell lists: the selector keeps them all, the bell names the rest.
    expect(alerts.length).toBeGreaterThan(MAX_ALERTS);
  });

  it("gives each role only what it can act on, and the receptionist the closed room through Rom", () => {
    expect(selectAlerts(busy("receptionist")).map((alert) => alert.id)).toEqual(["handover", "callbacks", "no-room", "out-of-order"]);
    expect(selectAlerts(busy("receptionist")).find((alert) => alert.id === "out-of-order")?.action).toEqual({ label: "Åpne Rom", href: "/rom" });
    expect(selectAlerts(busy("robot")).map((alert) => alert.id)).toEqual(["handover", "out-of-order", "stock", "battery"]);
  });

  it("raises a staff-reported high-priority order, but not one that is closed already or out of order", () => {
    const urgent = order("wo-9", { priority: "hoy", room: null, place: "front-desk", text: "Døren til resepsjonen går ikke i lås.", status: "ny", assignee: null });
    const [alert] = selectAlerts(data({ maintenance: [urgent, order("wo-8", { priority: "hoy", status: "lost" })] }));
    expect(alert).toMatchObject({ id: "urgent", priority: "hoy", title: "Haster: resepsjon", detail: "Døren til resepsjonen går ikke i lås." });
    expect(selectAlerts(data({ maintenance: [order("wo-8", { priority: "hoy", status: "lost" })] }))).toEqual([]);
  });

  it("puts an unsigned wet floor first, before every other Haster", () => {
    const wet = order("wo-12", { origin: "robot", type: "sol", text: "Vått gulv ved corridor-1c, uten skilt", room: null, place: "corridor-1c", priority: "hoy", status: "ny", assignee: null, at: "05:35", safety: true });
    const alerts = selectAlerts({ ...busy(), maintenance: [order("wo-m1", { outOfOrder: true }), wet] });
    expect(alerts[0]).toMatchObject({
      id: "wet-floor",
      priority: "hoy",
      title: "Vått gulv uten skilt i korridor 1C",
      detail: "Siden 05:35. Sett ut et varselskilt eller tørk opp før gjestene står opp.",
      action: { href: "/vedlikehold" },
    });
    expect(alerts[1].id).toBe("handover");
    // Once someone marks it Løst, it leaves the bell.
    expect(selectAlerts({ ...busy(), maintenance: [{ ...wet, status: "lost" }] }).some((alert) => alert.id === "wet-floor")).toBe(false);
  });

  it("never lists what the robot refused on good grounds or what the night manager called off", () => {
    const quiet = selectAlerts(data({ requests: [request("r1", "avvist"), request("r2", "avlyst")] }));
    expect(quiet).toEqual([]);
  });

  it("counts in its level, so a seen alert only comes back when there is more of it", () => {
    const two = selectAlerts(data({ requests: [request("r1", "feilet"), request("r2", "feilet")] }))[0];
    const one = selectAlerts(data({ requests: [request("r1", "feilet")] }))[0];
    expect([two.id, two.level]).toEqual(["handover", 2]);
    expect([one.id, one.level]).toEqual(["handover", 1]);
  });

  it("on the demo night: each unsigned wet floor is its own Haster with an owner and 06:30, then the stranger, before anything else", () => {
    const safety = nightSafety(parseRunLog(readFileSync(resolve(process.cwd(), "public/runs/demo.jsonl"), "utf8")).lines);
    const alerts = selectAlerts({ ...busy(), safety });
    expect(alerts.slice(0, 5).map((alert) => [alert.id, alert.priority])).toEqual([
      ["wet-floor:corridor-2b", "hoy"],
      ["wet-floor:corridor-3d", "hoy"],
      ["wet-floor:corridor-1c", "hoy"],
      ["stranger", "hoy"],
      ["handover", "hoy"],
    ]);
    expect(alerts[0]).toMatchObject({ title: "Vått gulv uten skilt i korridor 2B", detail: "Siden 23:51. Roboten skled der. Vaktmester / renhold, innen 06:30.", action: { href: "/vedlikehold" } });
    expect(alerts[1].detail).toBe("Siden 04:38. Skiltet ble flyttet til korridor 3C. Vaktmester / renhold, innen 06:30.");
    expect(alerts[3]).toMatchObject({
      level: 7,
      icon: "shield",
      title: "En ukjent person ba om å komme inn på 7 rom",
      detail: "01:17–05:11. Roboten sa nei hver gang. Sikkerhet / resepsjon: se på kamera og skriv en avviksmelding.",
      action: { label: "Åpne Overlevering", href: "/overlevering" },
    });
    // The robot manager can't open Overlevering: the stranger opens Natteskift for them.
    expect(selectAlerts({ ...busy("robot"), safety }).find((alert) => alert.id === "stranger")?.action.href).toBe("/natteskift");
    // A floor Vedlikehold marked Løst leaves the bell.
    const twoB = safety.wetFloors.find((floor) => floor.place === "corridor-2b")?.orderIds ?? [];
    const lost = twoB.map((id) => order(id, { origin: "robot", status: "lost", safety: true }));
    expect(selectAlerts({ ...busy(), maintenance: lost, safety }).some((alert) => alert.id === "wet-floor:corridor-2b")).toBe(false);
  });
});
