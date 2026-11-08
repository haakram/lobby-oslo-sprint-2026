import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { foldNight, selectRooms } from "@/features/dashboard/selectors";
import { parseRunLog, type RunLine } from "@/features/nightshift/runlog";
import { demoCalls } from "@/features/reception/demoCalls";
import { phoneTasks } from "@/features/requests/phoneTasks";
import { selectRequests } from "@/features/requests/select";
import { pmsLastNight, revenueLastNight } from "@/features/rooms/pms";
import { reconcileNight, type RoomCheckMark } from "@/features/rooms/reconcile";
import { TEST_NIGHT } from "@/features/rooms/testNight";
import { doorLockLines } from "@/features/doorlock/feed";
import { hotelForRun } from "@/features/hotel/mapFromRun";
import { composeWithoutRobot } from "@/features/nightsource/compose";
import { acknowledgeLine, CLERK_SAMPLE } from "@/features/staffinput/entries";
import { robotHazardKey } from "@/features/staffinput/robotHazards";
import { robotAtHandover } from "./robotState";
import { nightSafety } from "./safety";
import {
  composeHandover,
  DESK_OWNER,
  nightSourceLine,
  notifyTarget,
  type OpenItem,
  openCount,
  ROBOT_DUE,
  SAFETY_DUE,
  safetyCount,
  STRANGER_OWNER,
  untoldCount,
  WET_FLOOR_OWNER,
  withExtraItems,
} from "./select";

const TODAY = "2026-11-08";

function handover(marks: Record<string, RoomCheckMark> = {}, lines: readonly RunLine[] = TEST_NIGHT, options: Partial<Parameters<typeof composeHandover>[0]> = {}) {
  const night = foldNight(lines);
  const rooms = selectRooms(night);
  const phone = phoneTasks([], demoCalls(TODAY));
  const requests = selectRequests({ night, calls: null, statusOf: () => "ny", phone, manual: [] });
  const pms = pmsLastNight(TODAY);
  return composeHandover({
    night,
    rooms,
    reconciliation: reconcileNight(lines, pms, TODAY),
    marks,
    requests,
    phone,
    revenue: revenueLastNight(rooms.length, pms),
    today: TODAY,
    pms,
    safety: nightSafety(lines),
    robot: robotAtHandover(lines),
    ...options,
  });
}

const demo = () => parseRunLog(readFileSync(resolve(process.cwd(), "public/runs/demo.jsonl"), "utf8")).lines;

describe("Overlevering 06:00, composed from the night", () => {
  it("counts the night's good news: the money, requests done, guest matters settled, revenue", () => {
    const { figures } = handover();
    // 301 is ready on the base hotel's map, but booked and checked at 22:40: not ready to sell.
    expect(figures.roomsReady).toBe(0);
    expect(figures.money.toSell.map((row) => row.room)).toEqual(["room-311"]);
    // 1 room the system thought occupied × last night's average rate, to the hundred.
    expect(figures.money.toSellValue).toBe(Math.round(figures.revenue.adr / 100) * 100);
    // The robot did the noise run and failed the towels: one tally, the one every screen counts with.
    expect(figures.robot).toMatchObject({ done: 1, total: 2, reported: 1, failed: 1, handedBack: 1 });
    expect(figures.staffDone).toBe(0);
    expect(figures.calls).toBe(3);
    expect(figures.guestIssues).toEqual({ noise: 1, lost: 0, spill: 0 });
    expect(figures.revenue.roomsSold).toBe(31);
    expect(figures.safety).toEqual({ wetFloors: 0, stranger: false });
    // A guest in a room the system has free is a certain cost: one night at last night's rate, never "if sold out".
    expect(figures.unbilled).toEqual({ rooms: ["room-210"], value: Math.round(figures.revenue.adr / 100) * 100 });
  });

  it("tells the night in a few lines, in the night's order (22:00 before 03:00)", () => {
    const { timeline } = handover();
    expect(timeline.map((line) => line.at)).toEqual(["22:50", "01:47", "02:14", "03:14", "03:15", "04:35", "05:58"]);
    expect(timeline[0].text).toBe("Støyklage nær rom 302: roboten ba rom 302 dempe seg.");
    expect(timeline.find((line) => line.at === "03:14")?.text).toMatch(/^Roboten fant rom 311 tomt og ryddig, men systemet holder det opptatt\. Det kan selges etter bekreftelse, ca\. [\d\s\u00a0]+ kr hvis natten blir utsolgt\.$/);
    // The referee is behind "Slik vet vi det", not in the manager's timeline.
    expect(timeline.at(-1)?.text).toBe("Roboten avsluttet natten med 1 av 2 oppdrag fullført.");
  });

  it("lists what is open, each with a role for an owner and a time, soonest first, with the room to sell right in the list", () => {
    const { open } = handover();
    // The test night's robot ends on its charger with no key: nothing about it needs a person.
    expect(open.map((item) => [item.id, item.owner, item.due])).toEqual([
      ["phone", DESK_OWNER, "07:00"],
      ["guest-room-210", DESK_OWNER, "08:00"],
      ["sellable", DESK_OWNER, "09:00"],
      ["robot", DESK_OWNER, "10:00"],
    ]);
    expect(open[0]).toMatchObject({ text: "2 samtaler venter på å bli fordelt: rom 134 og 214.", urgent: true, href: "/foresporsler" });
    expect(open[2]).toMatchObject({ sell: ["room-311"], pending: false, booking: true });
    // The room in use with no booking: its sources as chips, its kroner certain; the free room said as time.
    expect(open[1]).toMatchObject({ lead: "Rom 210: i bruk uten booking. Sjekk registreringen før rommet selges igjen.", evidenceRoom: "room-210", kroner: expect.any(Number) });
    expect(open[2].lead).toBe("Rom 311: funnet ledig 5 timer tidligere. Silje Mørk står i systemet til 9.11.");
    // The robot's hand-backs open Forespørsler on the robot's requests, so the first one is row 1.
    expect(open[3].href).toBe("/foresporsler?filter=robot");
    // What the room check buys is time, and the kroner are real only if tonight sells out (round 4, founders review).
    expect(open[2].text).toMatch(
      /^Rom 311 kan selges fra kl\. 06:00, 5 timer før renholdet ellers finner det etter utsjekk kl\. 11:00: ca\. [\d\s\u00a0]+ kr hvis natten blir utsolgt \(31 av 36 booket i kveld\)\. Silje Mørk står i systemet til 9\.11\. Roboten fant det tomt og ryddig kl\. 03:14\.$/,
    );
    expect(open.map((item) => item.text).join(" ")).not.toMatch(/ellers ville stått usolgt|ellers usolgt/);
  });

  it("keeps a room sent to reception in place, pending the booking system (never done), and says when reception already has the guest task", () => {
    const { open } = handover({
      "room-311": { action: "released", at: "06:02", by: "Ana Pereira", confirmed: { at: "06:01", by: "Ana Pereira", receptionist: "Hanne Vold", checks: ["folio", "bagasje", "kort"] } },
      "room-210": { action: "task", at: "06:03", by: "Ana Pereira" },
    });
    const sale = open.find((item) => item.id === "sellable");
    expect(sale).toMatchObject({ pending: true, sell: ["room-311"], owner: DESK_OWNER, due: "09:00" });
    expect(sale?.text).toMatch(/^Rom 311 er sendt til resepsjonen for utsjekk i PMS-en: ca\. [\d\s\u00a0]+ kr hvis natten blir utsolgt \(31 av 36 booket i kveld\)\.$/);
    expect(sale?.lead).toBe("Rom 311: funnet ledig 5 timer tidligere, sendt til resepsjonen.");
    // Still open: reception has the check-out to do in the PMS.
    expect(openCount(open)).toBe(open.length);
    expect(open.find((item) => item.id === "guest-room-210")).toMatchObject({ text: "Rom 210: en gjest uten booking. Sjekk registreringen (oppgave laget).", href: "/foresporsler" });
  });

  it("names the night on the demo band from the log's start line, never a hard-coded night (the seed only when asked)", () => {
    expect(nightSourceLine(TEST_NIGHT)).toBe("én ekte natt fra robotens simulator");
    expect(nightSourceLine(TEST_NIGHT, true)).toBe("én ekte natt fra Wybe-simulatoren (seed 1)");
    expect(nightSourceLine([{ v: 1, type: "start", shift: "w2-00000000", mode: "sample", source: "open-rmf" }])).toBe("en eksempelnatt fra en Open-RMF-robot");
    expect(nightSourceLine([])).toBe("en natt fra kjøringsloggen");
  });
});

describe("Overlevering on the demo night: safety first, the catch, the sleeper", () => {
  it("opens with the unsigned wet floors (one row, a line and a sak per corridor, longest first) and the stranger: straks, a real role, and how long each waited for a person", () => {
    const { open, figures } = handover({}, demo());
    expect(open.slice(0, 2).map((item) => [item.id, item.owner, item.due, item.safety])).toEqual([
      ["wet-floors", WET_FLOOR_OWNER, SAFETY_DUE, true],
      ["stranger", STRANGER_OWNER, SAFETY_DUE, true],
    ]);
    // A known hazard is acted on at once, never "innen 06:30" beside "siden 23:51" (round 4, legal review).
    expect([SAFETY_DUE, WET_FLOOR_OWNER, STRANGER_OWNER]).toEqual(["straks", "Vaktmester", "Resepsjon"]);
    expect(open[0].who).toBe("Trond Eikeland");
    expect(open[0].text).toBe("3 våte gulv uten skilt: sett ut skilt eller tørk opp.");
    // Each hazard says how long it waited for a person: to 06:00, nobody was told (round 6, domain review).
    expect(open[0].lines).toEqual([
      "Korridor 2B siden 23:51 · roboten skled · 6 t 9 min uten at noen ble varslet",
      "Korridor 3D siden 04:38 · skiltet flyttet til 3C · 1 t 22 min uten at noen ble varslet",
      "Korridor 1C siden 05:52 · 8 min uten at noen ble varslet",
    ]);
    expect(open[0]).toMatchObject({ count: 3, untold: 3 });
    // Neutral first: the likely innocent explanation, then the hotel's routine (the doors are on the card).
    expect(open[1].text).toBe("En person i badekåpe ba roboten slippe ham inn på 7 rom, 01:17–05:11. Roboten sa nei. Sjekk først om en gjest var låst ute; ved tvil, avvik etter rutinen.");
    expect(open[1].lines).toEqual(["4 t 43 min uten at noen ble varslet"]);
    expect(open[1]).toMatchObject({ untold: 1, href: "#vurderinger-overlevering" });
    expect(figures.safety).toEqual({ wetFloors: 3, stranger: true });
    // One count for the safety figure, Åpent nå and the receipt: each wet floor is a sak.
    expect(safetyCount(open)).toBe(4);
    expect(openCount(open)).toBe(open.length + 2);
    // The sign-off warns while a hazard nobody was told about has no Varsle on this page either.
    expect(untoldCount(open, () => false)).toBe(4);
    expect(untoldCount(open, (id) => id === "wet-floors")).toBe(1);
    // Varsle names the person on in the role, or the desk.
    expect(notifyTarget(open[0])).toBe("Trond Eikeland");
    expect(notifyTarget(open[1])).toBe("resepsjonen");
  });

  it("then the rest by deadline: the robot itself (undocked, the master keycard), the desk's items, the sleeper, 209 led by the robot's own contradiction, the crowded rooms", () => {
    const { open, figures } = handover({}, demo());
    expect(open.slice(2).map((item) => [item.id, item.owner, item.due])).toEqual([
      ["robot-state", "Nattevakt", ROBOT_DUE],
      ["phone", DESK_OWNER, "07:00"],
      ["guest-room-210", DESK_OWNER, "08:00"],
      ["sellable", DESK_OWNER, "09:00"],
      ["robot", DESK_OWNER, "10:00"],
      ["held-room-209", DESK_OWNER, "12:00"],
      ["crowded", DESK_OWNER, "12:00"],
    ]);
    // Owners are the hotel's roles, not one name for nine items (round 4, design review).
    expect(open.filter((item) => item.owner === "Siri Haugen" || item.who === "Siri Haugen")).toEqual([]);
    const robot = open.find((item) => item.id === "robot-state");
    expect(robot).toMatchObject({ who: "Kjersti Lund", dueWord: "før", href: "/hotell" });
    expect(robot?.text).toBe("Roboten står ved heis, 1. etasje med hovednøkkelkortet, ikke på lader, 20 % batteri. Hent kortet og sett den på lader.");
    // 209: what the log shows, drawn on two points, and reception decides (never "dobbelt tildelt?", round 6, domain review).
    expect(open.find((item) => item.id === "held-room-209")).toMatchObject({
      text: "Rom 209: bagasje levert i et rom roboten senere meldte tomt.",
      points: [
        { at: "01:29", label: "bagasje inn" },
        { at: "03:47", label: "meldt tomt" },
      ],
      lines: ["Systemet har Hiroshi Sato der til 9.11. Resepsjonen avgjør."],
      caught: true,
      booking: true,
    });
    expect(open.map((item) => `${item.text} ${item.lines?.join(" ") ?? ""}`).join(" ")).not.toMatch(/dobbelt tildelt/);
    expect(open.find((item) => item.id === "sellable")?.text).toMatch(
      /^Rom 213 kan selges fra kl\. 06:00, 5 timer før renholdet ellers finner det etter utsjekk kl\. 11:00: ca\. [\d\s\u00a0]+ kr hvis natten blir utsolgt \(31 av 36 booket i kveld\)\. Ola Nygård skulle reist 7\.11, men utsjekken ble aldri registrert, så systemet holder rommet i natt\. Roboten fant det tomt og ryddig kl\. 04:24\.$/,
    );
    // From the robot's own log, no booking system: not labelled as test data.
    const crowded = open.find((item) => item.id === "crowded");
    expect(crowded?.text).toBe("Rom 212 og 304: bagasje for flere ankomster (3 og 2) i natt. Resepsjonen avgjør.");
    expect(crowded?.booking).toBeUndefined();
    expect(figures.money.held.map((row) => row.room)).toEqual(["room-209"]);
    expect(figures.money.caught).toEqual(["room-209"]);
    expect(figures.tonight).toEqual({ booked: 31, rooms: 36 });
  });

  it("adds the night clerk's own floors and doors to the robot's (never drops them), and reads her entries at the robot's places as who was told", () => {
    const staff = (id: string, kind: string, data: Record<string, unknown>): RunLine => ({ v: 1, type: "decision", kind, data: { id, ...data, source: "staff", by: "Kjersti Lund" } });
    const clerk: RunLine[] = [
      staff("c1", "hazard", { place: "corridor-1c", hazard: "wet", since: "05:55:00", at: "05:55:00", signed: false }),
      staff("c2", "hazard", { place: "lobby", hazard: "wet", since: "02:15:00", at: "02:15:00", signed: true, signedAt: "02:16:00" }),
      staff("c3", "security_event", { place: "corridor-2c", event: "unknown_person", at: "01:30:00" }),
      staff("c4", "security_event", { place: "stairwell-2", event: "door_open", at: "02:40:00" }),
    ];
    const safety = nightSafety(demo(), clerk);
    // The lobby is one more floor (round 6, product review: Med robot dropped it); 1C stays the robot's, with her as who knew.
    expect(safety.wetFloors.map((floor) => floor.place).sort()).toEqual(["corridor-1c", "corridor-2b", "corridor-3d", "lobby"]);
    expect(safety.wetFloors.find((floor) => floor.place === "corridor-1c")).toMatchObject({ source: "robot", notified: { at: "05:55:00", by: "Kjersti Lund", how: "entry" } });
    expect(safety.wetFloors.find((floor) => floor.place === "lobby")).toMatchObject({ source: "staff", orderIds: [], signed: true, sign: "skilt satt ut 02:16" });
    expect(safety.stranger).toMatchObject({ notified: { at: "01:30:00", by: "Kjersti Lund" } });
    expect(safety.stranger?.refusals).toHaveLength(7);
    // Her door has no robot item: it is one more safety row; her person is who knew about the robot's stranger.
    expect(safety.staff?.map((entry) => [entry.hazard, entry.place])).toEqual([["door", "stairwell-2"]]);
    const { open } = handover({}, demo(), { safety });
    const wet = open.find((item) => item.id === "wet-floors");
    expect(wet?.text).toBe("4 våte gulv, 3 uten skilt: sett ut skilt eller tørk opp.");
    expect(wet?.lines).toContain("Lobbyen · meldt 02:15 av Kjersti Lund · skilt satt ut 02:16");
    expect(wet?.lines).toContain("Korridor 1C siden 05:52 · Kjersti Lund meldte det kl. 05:55, etter 3 min");
    expect(wet).toMatchObject({ count: 4, untold: 2 });
    expect(open.find((item) => item.id === "stranger")).toMatchObject({ untold: 0, lines: ["Kjersti Lund meldte det kl. 01:30, etter 13 min"] });
    expect(open.find((item) => item.id === "staff-c4")).toMatchObject({ safety: true, owner: STRANGER_OWNER, text: "Dør i trappen, 2. etasje, meldt av Kjersti Lund kl. 02:40. Sjekk at den er lukket og låst." });
    // A floor she reported has no work order, so nothing on Vedlikehold closes it by accident.
    const resolvedAll = handover({}, demo(), { safety, resolved: () => true }).open.find((item) => item.id.startsWith("wet-"));
    expect(resolvedAll?.lines).toEqual(["Lobbyen · meldt 02:15 av Kjersti Lund · skilt satt ut 02:16"]);
  });

  it("reads her Kvitter on the robot's own report (/natt's Fra roboten) as who knew, and the wait to it", () => {
    const twoB = nightSafety(demo()).wetFloors.find((floor) => floor.place === "corridor-2b");
    const ack = acknowledgeLine(
      { key: robotHazardKey({ hazard: "wet", place: "corridor-2b", since: twoB?.since ?? null }), hazard: "wet", place: "corridor-2b", at: twoB?.since ?? null },
      { by: "Kjersti Lund", now: new Date("2026-11-07T22:53:10Z"), id: "a1" },
    );
    const safety = nightSafety(demo(), [ack]);
    expect(safety.wetFloors.find((floor) => floor.place === "corridor-2b")).toMatchObject({ notified: { at: "23:53:10", by: "Kjersti Lund", how: "ack" }, waited: { minutes: 2, acknowledged: true } });
    const { open } = handover({}, demo(), { safety });
    expect(open.find((item) => item.id === "wet-floors")?.lines?.[0]).toBe("Korridor 2B siden 23:51 · roboten skled · Kjersti Lund kvitterte kl. 23:53, etter 2 min");
    expect(open.find((item) => item.id === "wet-floors")?.untold).toBe(2);
  });

  it("shows every item of the robot-free page on the robot night too: Med robot adds, it never replaces", () => {
    const night = foldNight(demo());
    const rooms = selectRooms(night, new Set(), hotelForRun(demo()));
    const phone = phoneTasks([], demoCalls(TODAY));
    const requests = selectRequests({ night, calls: null, statusOf: () => "ny", phone, manual: [] });
    const without = composeWithoutRobot({ staff: CLERK_SAMPLE, doorLock: doorLockLines(), rooms, marks: {}, requests, phone, today: TODAY });
    const withRobot = handover({}, demo(), { safety: nightSafety(demo(), CLERK_SAMPLE) }).open;
    const ids = new Set(withRobot.map((item) => item.id));
    const wetLines = withRobot.find((item) => item.id === "wet-floors")?.lines ?? [];
    expect(without.handover.open.length).toBeGreaterThan(2);
    for (const item of without.handover.open) {
      // Her wet floor is one more line in the robot night's wet floors (same place); every other row by its id.
      if (item.id.startsWith("staff-") && item.text.startsWith("Vått gulv")) expect(wetLines).toContain("Lobbyen · meldt 02:15 av Kjersti Lund · skilt satt ut 02:16");
      else expect(ids, item.id).toContain(item.id);
    }
  });

  it("leaves the robot out when it ends the night docked with no key, and when there was no robot", () => {
    const docked = { at: "05:59:00", location: "charging-dock", battery: 80, docked: true, hands: [], cart: [], keycard: false };
    expect(handover({}, demo(), { robot: docked }).open.some((item) => item.id === "robot-state")).toBe(false);
    expect(handover({}, demo(), { robot: null }).open.some((item) => item.id === "robot-state")).toBe(false);
    expect(handover({}, demo(), { robot: { ...docked, keycard: true, hands: ["keycard"] } }).open.find((item) => item.id === "robot-state")?.text).toBe(
      "Roboten står på ladestasjonen med hovednøkkelkortet, på lader, 80 % batteri. Hent kortet.",
    );
  });

  it("drops a wet floor once Vedlikehold marks it Løst, and leaves out a link the reader can't open", () => {
    const safety = nightSafety(demo());
    const twoB = new Set(safety.wetFloors.find((floor) => floor.place === "corridor-2b")?.orderIds);
    const { open } = handover({}, demo(), { resolved: (id) => twoB.has(id), canOpen: (route) => route !== "/vedlikehold" && route !== "/hotell" && route !== "/gjester" });
    const wet = open.find((item) => item.id === "wet-floors");
    expect(wet?.text).toMatch(/^2 våte gulv uten skilt:/);
    expect(wet?.lines?.some((line) => line.startsWith("Korridor 2B"))).toBe(false);
    expect(wet?.href).toBeNull();
    expect(open.find((item) => item.id === "held-room-209")?.href).toBeNull();
  });

  it("keeps one wet floor as its own item, in a sentence", () => {
    const safety = nightSafety(demo());
    const others = new Set(safety.wetFloors.filter((floor) => floor.place !== "corridor-2b").flatMap((floor) => floor.orderIds));
    const { open } = handover({}, demo(), { resolved: (id) => others.has(id) });
    expect(open[0]).toMatchObject({
      id: "wet-corridor-2b",
      text: "Vått gulv uten skilt i korridor 2B: sett ut skilt eller tørk opp.",
      lines: ["Korridor 2B siden 23:51 · roboten skled · 6 t 9 min uten at noen ble varslet"],
      count: 1,
      untold: 1,
    });
  });

  it("places another source's rows (Øyne's avvik) by deadline after the safety rows", () => {
    const { open } = handover({}, demo());
    const eyes: OpenItem = { id: "eyes-e1", text: "Ukjent vare.", owner: "Renhold", due: "10:00", href: null, linkLabel: "", urgent: false };
    const ids = withExtraItems(open, [eyes]).map((item) => item.id);
    expect(ids.slice(0, 2)).toEqual(["wet-floors", "stranger"]);
    expect(ids.indexOf("eyes-e1")).toBe(ids.indexOf("robot") + 1);
    expect(withExtraItems(withExtraItems(open, [eyes]), [eyes]).filter((item) => item.id === "eyes-e1")).toHaveLength(1);
  });
});

