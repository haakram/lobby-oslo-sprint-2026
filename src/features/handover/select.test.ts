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
import { robotAtHandover } from "./robotState";
import { nightSafety } from "./safety";
import { composeHandover, DESK_OWNER, nightSourceLine, NOT_NOTIFIED, openCount, ROBOT_DUE, SAFETY_DUE, STRANGER_OWNER, WET_FLOOR_OWNER } from "./select";

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
    expect(open[0]).toMatchObject({ text: "2 saker fra telefonen venter på å bli fordelt (rom 134 og 214).", urgent: true, href: "/foresporsler" });
    expect(open[2]).toMatchObject({ sell: ["room-311"], pending: false, booking: true });
    // The robot's hand-backs open Forespørsler on the robot's requests, so the first one is row 1.
    expect(open[3].href).toBe("/foresporsler?filter=robot");
    // What the room check buys is time, and the kroner are real only if tonight sells out (jury round 4, the founder juror).
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
    expect(sale?.done).toBeUndefined();
    expect(sale?.text).toMatch(/^Rom 311 er sendt til resepsjonen for utsjekk i PMS-en: ca\. [\d\s\u00a0]+ kr hvis natten blir utsolgt \(31 av 36 booket i kveld\)\.$/);
    // Still open: reception has the check-out to do in the PMS.
    expect(openCount(open)).toBe(open.length);
    expect(open.find((item) => item.id === "guest-room-210")).toMatchObject({ text: "Rom 210: en gjest uten booking. Sjekk registreringen (oppgave laget).", href: "/foresporsler" });
  });

  it("names the night on the demo band from the log's start line, never a hard-coded night", () => {
    expect(nightSourceLine(TEST_NIGHT)).toBe("én ekte natt fra Wybe-simulatoren (seed 1)");
    expect(nightSourceLine([{ v: 1, type: "start", shift: "w2-00000000", mode: "sample", source: "open-rmf" }])).toBe("en eksempelnatt fra en Open-RMF-robot");
    expect(nightSourceLine([])).toBe("en natt fra kjøringsloggen");
  });
});

describe("Overlevering on the demo night: safety first, the catch, the sleeper", () => {
  it("opens with the unsigned wet floors (one item, a line per corridor, longest first) and the stranger: straks, a real role, and who was told", () => {
    const { open, figures } = handover({}, demo());
    expect(open.slice(0, 2).map((item) => [item.id, item.owner, item.due, item.safety])).toEqual([
      ["wet-floors", WET_FLOOR_OWNER, SAFETY_DUE, true],
      ["stranger", STRANGER_OWNER, SAFETY_DUE, true],
    ]);
    // A known hazard is acted on at once, never "innen 06:30" beside "siden 23:51" (jury round 4, the law juror).
    expect([SAFETY_DUE, WET_FLOOR_OWNER, STRANGER_OWNER]).toEqual(["straks", "Vaktmester", "Resepsjon"]);
    expect(open[0].who).toBe("Trond Eikeland");
    // Nobody was told in the night (the log has no staff entry for these places): say it, and say what to do.
    expect(open[0].escalation).toBe(NOT_NOTIFIED);
    expect(open[1].escalation).toBe(NOT_NOTIFIED);
    expect(open[0].text).toBe("3 våte gulv uten skilt. Sett ut skilt eller tørk opp før gjestene står opp.");
    expect(open[0].lines).toEqual([
      "Korridor 2B siden 23:51. Roboten skled der.",
      "Korridor 3D siden 04:38. Roboten flyttet skiltet herfra til korridor 3C.",
      "Korridor 1C siden 05:52.",
    ]);
    // Neutral first: the likely innocent explanation, then the hotel's routine (the doors are on the card).
    expect(open[1].text).toBe(
      "En person i badekåpe ba roboten slippe ham inn på 7 rom mellom 01:17 og 05:11. Roboten sa nei hver gang og ventet med å åpne 209 og 304 til han var gått. Sjekk først om en gjest var låst ute (ring rommene, se nøkkelkortloggen). Ved tvil: avvik etter hotellets rutine.",
    );
    expect(open[1].href).toBe("#vurderinger-overlevering");
    expect(figures.safety).toEqual({ wetFloors: 3, stranger: true });
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
    // Owners are the hotel's roles, not one name for nine items (jury round 4, the design juror).
    expect(open.filter((item) => item.owner === "Siri Haugen" || item.who === "Siri Haugen")).toEqual([]);
    const robot = open.find((item) => item.id === "robot-state");
    expect(robot).toMatchObject({ who: "Kjersti Lund", dueWord: "før", href: "/hotell" });
    expect(robot?.text).toBe(
      "Roboten står ved heis, 1. etasje, ikke på lader, 20 % batteri. Den har fortsatt hovednøkkelkortet (har også med 2 × håndkle, toalettsett). Hent nøkkelkortet og sett roboten på lader.",
    );
    // 209: the robot's own contradiction leads (no team-written booking needed); the double allocation is the consequence.
    expect(open.find((item) => item.id === "held-room-209")).toMatchObject({
      text: "Rom 209: roboten meldte rommet tomt og ryddig kl. 03:47, men egen logg sier at den satte inn bagasje der kl. 01:29. Romsjekken ble likevel regnet som utført.",
      lines: ["Systemet har dessuten Hiroshi Sato der til 9.11, og roboten bar inn bagasje for 3 ankomster (01:29, 04:35 og 05:16): dobbelt tildelt? Flytt én av dem før innsjekk kl. 15:00."],
      caught: true,
      booking: true,
    });
    expect(open.find((item) => item.id === "sellable")?.text).toMatch(
      /^Rom 213 kan selges fra kl\. 06:00, 5 timer før renholdet ellers finner det etter utsjekk kl\. 11:00: ca\. [\d\s\u00a0]+ kr hvis natten blir utsolgt \(31 av 36 booket i kveld\)\. Ola Nygård skulle reist 7\.11, men utsjekken ble aldri registrert, så systemet holder rommet i natt\. Roboten fant det tomt og ryddig kl\. 04:24\.$/,
    );
    // From the robot's own log, no booking system: not labelled as test data.
    const crowded = open.find((item) => item.id === "crowded");
    expect(crowded?.text).toBe("Flere ankomster i samme rom: sjekk med resepsjonen. Roboten bar inn bagasje for 3 ankomster på rom 212 (00:31, 01:58 og 04:43) og for 2 på rom 304 (00:50 og 04:17).");
    expect(crowded?.booking).toBeUndefined();
    expect(figures.money.held.map((row) => row.room)).toEqual(["room-209"]);
    expect(figures.money.caught).toEqual(["room-209"]);
    expect(figures.tonight).toEqual({ booked: 31, rooms: 36 });
  });

  it("says who was told when the night staff wrote a hazard down (a staff entry for the place), and which floors nobody was told about", () => {
    const told: RunLine = { v: 1, type: "decision", kind: "hazard", data: { place: "corridor-2b", hazard: "wet", source: "staff", by: "Kjersti Lund", at: "23:58:00" } };
    const { open } = handover({}, [...demo().slice(0, -1), told, ...demo().slice(-1)]);
    const wet = open.find((item) => item.id === "wet-floors");
    expect(wet?.lines?.[0]).toBe("Korridor 2B siden 23:51. Roboten skled der. Nattevakten meldte det kl. 23:58 (Kjersti Lund).");
    expect(wet?.escalation).toBe("Ikke varslet: korridor 3D og korridor 1C. Varsle nå.");
    // A staff entry is never mistaken for one more robot work order.
    expect(open.filter((item) => item.safety)).toHaveLength(2);
  });

  it("leaves the robot out when it ends the night docked with no key, and when there was no robot", () => {
    const docked = { at: "05:59:00", location: "charging-dock", battery: 80, docked: true, hands: [], cart: [], keycard: false };
    expect(handover({}, demo(), { robot: docked }).open.some((item) => item.id === "robot-state")).toBe(false);
    expect(handover({}, demo(), { robot: null }).open.some((item) => item.id === "robot-state")).toBe(false);
    expect(handover({}, demo(), { robot: { ...docked, keycard: true, hands: ["keycard"] } }).open.find((item) => item.id === "robot-state")?.text).toBe(
      "Roboten står på ladestasjonen, på lader, 80 % batteri. Den har fortsatt hovednøkkelkortet. Hent nøkkelkortet.",
    );
  });

  it("drops a wet floor once Vedlikehold marks it Løst, and leaves out a link the reader can't open", () => {
    const safety = nightSafety(demo());
    const twoB = new Set(safety.wetFloors.find((floor) => floor.place === "corridor-2b")?.orderIds);
    const { open } = handover({}, demo(), { resolved: (id) => twoB.has(id), canOpen: (route) => route !== "/vedlikehold" && route !== "/hotell" && route !== "/gjester" });
    const wet = open.find((item) => item.id === "wet-floors");
    expect(wet?.text).toMatch(/^2 våte gulv uten skilt\./);
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
      text: "Vått gulv uten skilt i korridor 2B siden 23:51. Roboten skled der. Sett ut skilt eller tørk opp før gjestene står opp.",
      escalation: NOT_NOTIFIED,
    });
  });
});
