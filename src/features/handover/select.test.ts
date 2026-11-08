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
import { nightSafety } from "./safety";
import { composeHandover, openCount, SAFETY_DUE, STRANGER_OWNER, WET_FLOOR_OWNER } from "./select";

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
    reconciliation: reconcileNight(lines, pms),
    marks,
    requests,
    phone,
    revenue: revenueLastNight(rooms.length, pms),
    today: TODAY,
    pms,
    safety: nightSafety(lines),
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
    expect(timeline.find((line) => line.at === "03:14")?.text).toMatch(/^Roboten fant rom 311 tomt og ryddig, men systemet sa opptatt\. Det kan selges etter bekreftelse, ca\. [\d\s\u00a0]+ kr\.$/);
    expect(timeline.at(-1)?.text).toBe("Roboten avsluttet natten med 1 av 2 oppdrag fullført. Dommeren i Wybe Night Shift-simulatoren godkjente 1 av 1 ferdigmeldinger.");
  });

  it("lists what is open, each with an owner and a time, soonest first, with the room to sell right in the list", () => {
    const { open } = handover();
    expect(open.map((item) => [item.id, item.owner, item.due])).toEqual([
      ["phone", "Siri Haugen", "07:00"],
      ["guest-room-210", "Siri Haugen", "08:00"],
      ["sellable", "Siri Haugen", "09:00"],
      ["robot", "Siri Haugen", "10:00"],
    ]);
    expect(open[0]).toMatchObject({ text: "2 saker fra telefonen venter på å bli fordelt (rom 134 og 214).", urgent: true, href: "/foresporsler" });
    expect(open[2]).toMatchObject({ sell: ["room-311"], done: false });
    // The robot's hand-backs open Forespørsler on the robot's requests, so the first one is row 1.
    expect(open[3].href).toBe("/foresporsler?filter=robot");
    expect(open[2].text).toMatch(/^Rom 311 kan selges etter bekreftelse \(ca\. [\d\s\u00a0]+ kr\)\. Roboten fant det tomt og ryddig kl\. 03:14\. Silje Mørk står i systemet til 9\.11\.$/);
  });

  it("keeps a released room in place as done (its result and Angre stay put), and says when reception already has the guest task", () => {
    const { open } = handover({
      "room-311": { action: "released", at: "06:02", by: "Ana Pereira" },
      "room-210": { action: "task", at: "06:03", by: "Ana Pereira" },
    });
    const sale = open.find((item) => item.id === "sellable");
    expect(sale).toMatchObject({ done: true, sell: ["room-311"] });
    expect(sale?.text).toMatch(/^Rom 311 er lagt ut for salg i dag \(ca\. [\d\s\u00a0]+ kr\)\.$/);
    expect(openCount(open)).toBe(open.length - 1);
    expect(open.find((item) => item.id === "guest-room-210")).toMatchObject({ text: "Rom 210: en gjest uten booking. Sjekk registreringen (oppgave laget).", href: "/foresporsler" });
  });
});

describe("Overlevering on the demo night: safety first, the catch, the sleeper", () => {
  it("opens with each unsigned wet floor (longest first) and the stranger, each with an owner and 06:30", () => {
    const { open, figures } = handover({}, demo());
    expect(open.slice(0, 4).map((item) => [item.id, item.owner, item.due, item.safety])).toEqual([
      ["wet-corridor-2b", WET_FLOOR_OWNER, SAFETY_DUE, true],
      ["wet-corridor-3d", WET_FLOOR_OWNER, SAFETY_DUE, true],
      ["wet-corridor-1c", WET_FLOOR_OWNER, SAFETY_DUE, true],
      ["stranger", STRANGER_OWNER, SAFETY_DUE, true],
    ]);
    expect(open[0].text).toBe("Vått gulv uten skilt i korridor 2B siden 23:51. Roboten skled der. Sett ut skilt eller tørk opp før gjestene står opp.");
    expect(open[1].text).toBe("Vått gulv uten skilt i korridor 3D siden 04:38. Roboten flyttet skiltet herfra til korridor 3C. Sett ut skilt eller tørk opp før gjestene står opp.");
    expect(open[3].text).toBe(
      "En person i badekåpe ba roboten slippe ham inn på 7 rom mellom 01:17 og 05:11 (308, 209, 203, 202, 304, 137 og 205). Roboten sa nei hver gang og ventet med å åpne 209 og 304 til han var gått. Ingen har sjekket hvem han er: se på kamera og skriv en avviksmelding.",
    );
    expect(open[3].href).toBe("#vurderinger-overlevering");
    expect(figures.safety).toEqual({ wetFloors: 3, stranger: true });
  });

  it("sells 213 (due out, never checked out) and holds 209 as a double allocation the robot caught", () => {
    const { open, figures } = handover({}, demo());
    expect(open.find((item) => item.id === "sellable")?.sell).toEqual(["room-213"]);
    expect(open.find((item) => item.id === "sellable")?.text).toMatch(/Ola Nygård skulle reise i dag og har ikke sjekket ut\.$/);
    expect(open.find((item) => item.id === "held-room-209")?.text).toBe(
      "Rom 209: dobbelt tildelt? Roboten bar inn bagasje for dagens ankomst (sist kl. 05:16), men systemet har Hiroshi Sato der til 9.11. Flytt én av dem før innsjekk kl. 15:00.",
    );
    expect(figures.money.held.map((row) => row.room)).toEqual(["room-209"]);
  });

  it("drops a wet floor once Vedlikehold marks it Løst, and leaves out a link the reader can't open", () => {
    const safety = nightSafety(demo());
    const twoB = new Set(safety.wetFloors.find((floor) => floor.place === "corridor-2b")?.orderIds);
    const { open } = handover({}, demo(), { resolved: (id) => twoB.has(id), canOpen: (route) => route !== "/vedlikehold" && route !== "/hotell" && route !== "/gjester" });
    expect(open.map((item) => item.id)).not.toContain("wet-corridor-2b");
    expect(open.find((item) => item.id === "wet-corridor-1c")?.href).toBeNull();
    expect(open.find((item) => item.id === "held-room-209")?.href).toBeNull();
  });
});
