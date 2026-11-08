import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { formatKroner } from "@/features/dashboard/format";
import { parseRunLog } from "@/features/nightshift/runlog";
import { selectGuestDay, stays, stayStatus } from "@/features/guests/testData";
import { hoursEarlier, moneyHeadline, moneyMethod, releasedLine, roomMoney, shortDate } from "./money";
import { bookedTonight, pmsLastNight, revenueLastNight, sellableValue } from "./pms";
import { reconcileNight, type RoomCheckMark } from "./reconcile";

const TODAY = "2026-11-08";
const lines = parseRunLog(readFileSync(resolve(process.cwd(), "public/runs/demo.jsonl"), "utf8")).lines;
const pms = pmsLastNight(TODAY);
const revenue = revenueLastNight(36, pms);
const reconciliation = reconcileNight(lines, pms);
const ONE = formatKroner(sellableValue(1, revenue));
const stamp = { at: "06:02", by: "Siri Haugen" };
// The rooms the robot saw ready on the demo night (314 free in the system; 209 and 213 booked), the rest not ready.
const rooms = ["room-314", "room-209", "room-213", "room-135", "room-201"].map((id) => ({ id, status: id === "room-135" ? ("ma_vaskes" as const) : id === "room-201" ? ("opptatt" as const) : ("klar" as const) }));

const money = (marks: Record<string, RoomCheckMark> = {}) => roomMoney({ reconciliation, marks, revenue, rooms, pms });

describe("the room check's money: one reading for Oversikt, Rom and Overlevering", () => {
  it("on the demo night: 213 can be sold after confirmation (worth its kroner only if tonight sells out), 209 is held, and only 314 is ready to sell now", () => {
    const night = money();
    expect(moneyHeadline(night)).toBe(`1 rom kan selges etter bekreftelse · ca. ${ONE} kr hvis utsolgt · 1 holdt tilbake`);
    expect(releasedLine(night)).toBe("Sendt til resepsjonen i dag: ingen ennå");
    expect(night.readyToSell).toBe(1);
    expect(night.roomsTotal).toBe(5);
    // 209 is caught twice over (held, and its room check contradicts the robot's own log), counted once.
    expect(night.caught).toEqual(["room-209"]);
  });

  it("a confirmation alone sells nothing; sent to reception the room waits for the booking system: never sold, never Klar before the PMS says so", () => {
    const confirmed = money({ "room-213": { action: "confirmed", ...stamp, receptionist: "Hanne Vold", checks: ["folio", "bagasje", "kort"] } });
    expect(confirmed.confirmed).toEqual(["room-213"]);
    expect(moneyHeadline(confirmed)).toBe(`1 rom kan selges etter bekreftelse · ca. ${ONE} kr hvis utsolgt · 1 holdt tilbake`);
    expect(confirmed.readyToSell).toBe(1);

    const sent = money({ "room-213": { action: "released", ...stamp, confirmed: { ...stamp, receptionist: "Hanne Vold", checks: ["folio", "bagasje", "kort"] } } });
    expect(sent.released.map((row) => row.room)).toEqual(["room-213"]);
    expect(moneyHeadline(sent)).toBe("1 rom sendt til resepsjonen · venter på PMS-en · 1 holdt tilbake");
    expect(moneyHeadline(sent)).not.toMatch(/frigitt|solgt/);
    expect(releasedLine(sent)).toBe("Sendt til resepsjonen i dag: 1 rom · venter på PMS-en");
    // The booking system still holds 213: not ready to sell until it shows the room free.
    expect(sent.readyToSell).toBe(1);
  });

  it("a room check the robot's own log contradicts is never ready to sell, booked or not", () => {
    const own = { room: "room-314", request: "R-900", checkedAt: "03:00:00", placedAt: "01:00:00", item: "towel", arrival: false };
    const contradicted = roomMoney({ reconciliation: { ...reconciliation, contradicted: [...reconciliation.contradicted, own] }, marks: {}, revenue, rooms, pms });
    expect(contradicted.readyToSell).toBe(0);
    expect(contradicted.caught).toEqual(["room-209", "room-314"]);
    expect(moneyHeadline(contradicted)).toMatch(/· 2 holdt tilbake$/);
  });

  it("a held room never counts as ready to sell, and a closed room neither", () => {
    const closed = roomMoney({ reconciliation, marks: {}, revenue, rooms: rooms.map((room) => (room.id === "room-314" ? { ...room, closed: true } : room)), pms });
    expect(closed.readyToSell).toBe(0);
    expect(roomMoney({ reconciliation, marks: {}, revenue, rooms: null, pms }).readyToSell).toBeNull();
  });

  it("213 is a real sleeper: due out yesterday, the check-out never recorded, so the system still holds it tonight", () => {
    const ola = stays(TODAY).find((stay) => stay.room === "room-213");
    expect(ola).toMatchObject({ name: "Ola Nygård", departure: "2026-11-07", checkoutMissing: true });
    expect(stayStatus(ola!, TODAY)).toBe("in-house");
    expect(ola!.notes[0]).toBe("Skulle reist 7.11, utsjekk ikke registrert");
    // In the system last night and tonight (31 of 36 sold stands), and not one of today's departures.
    expect(pms.get("room-213")).toMatchObject({ guest: "Ola Nygård", departure: "2026-11-07" });
    expect(revenue.roomsSold).toBe(31);
    expect(selectGuestDay(TODAY).departures.some((stay) => stay.room === "room-213")).toBe(false);
    expect(selectGuestDay(TODAY).inHouse.some((stay) => stay.room === "room-213")).toBe(true);
    // The method says what the room check buys (time: from 06:00, not after the 11:00 check-out) and when the kroner are extra.
    expect(hoursEarlier()).toBe(5);
    expect(bookedTonight(TODAY)).toBe(31);
    expect(moneyMethod(money(), { booked: bookedTonight(TODAY), rooms: 36 })).toMatch(
      /^Brutto romsinntekt: 1 × snittprisen i natt, .+ kr \(testdata\)\. Systemet holder rommet til resepsjonen registrerer at gjesten har reist\. Uten romsjekken finner renholdet det etter utsjekk kl\. 11:00; med den kan det selges fra kl\. 06:00, 5 timer tidligere\. Det er ekstra inntekt bare hvis natten blir utsolgt: 31 av 36 booket i kveld \(testdata\)\. Til sammenligning solgte hotellene i Oslo 72 % av rommene i 2025, til snittpris 1 631 kr \(SSB, tabell 14169\)\.$/,
    );
    // Never the counterfactual the product cannot prove (round 4, founders review).
    expect(moneyMethod(money())).not.toMatch(/usolgt i natt|ellers/);
  });

  it("says nothing when there is nothing to sell or hold, and writes dates the way a desk does", () => {
    expect(moneyHeadline(roomMoney({ reconciliation: { ...reconciliation, sellable: [], held: [], contradicted: [] }, marks: {}, revenue, rooms, pms }))).toBeNull();
    expect(moneyHeadline(roomMoney({ reconciliation: { ...reconciliation, sellable: [] }, marks: {}, revenue, rooms, pms }))).toBe("Ingen rom å selge i dag · 1 holdt tilbake");
    expect(shortDate("2026-11-09")).toBe("9.11");
    expect(shortDate(null)).toBe("");
  });
});
