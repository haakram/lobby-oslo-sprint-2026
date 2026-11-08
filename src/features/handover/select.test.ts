import { describe, expect, it } from "vitest";
import { foldNight, selectRooms } from "@/features/dashboard/selectors";
import { demoCalls } from "@/features/reception/demoCalls";
import { phoneTasks } from "@/features/requests/phoneTasks";
import { selectRequests } from "@/features/requests/select";
import { pmsLastNight, revenueLastNight } from "@/features/rooms/pms";
import { reconcileRooms, robotRoomChecks, type RoomCheckMark } from "@/features/rooms/reconcile";
import { TEST_NIGHT } from "@/features/rooms/testNight";
import { composeHandover } from "./select";

function handover(marks: Record<string, RoomCheckMark> = {}) {
  const night = foldNight(TEST_NIGHT);
  const rooms = selectRooms(night);
  const phone = phoneTasks([], demoCalls("2026-11-08"));
  const requests = selectRequests({ night, calls: null, statusOf: () => "ny", phone, manual: [] });
  return composeHandover({ night, rooms, reconciliation: reconcileRooms(robotRoomChecks(TEST_NIGHT), pmsLastNight()), marks, requests, phone, revenue: revenueLastNight(rooms.length) });
}

describe("Overlevering 06:00, composed from the night", () => {
  it("counts the night's good news: rooms ready, requests done, guest matters settled, revenue", () => {
    const { figures } = handover();
    // 321 is ready on the base hotel's map (the short test night has no map of its own; 331 is not on it).
    expect(figures.roomsReady).toBe(1);
    expect(figures.sellable).toBe(1);
    // The robot did the noise run; the night receptionist settled the seeded wake-up call.
    expect(figures.done).toEqual({ robot: 1, staff: 1, calls: 3 });
    expect(figures.guestIssues).toEqual({ noise: 1, lost: 0, spill: 0 });
    expect(figures.revenue.roomsSold).toBe(28);
  });

  it("tells the night in a few lines, in the night's order (22:00 before 03:00)", () => {
    const { timeline } = handover();
    expect(timeline.map((line) => line.at)).toEqual(["22:50", "01:47", "02:14", "03:14", "03:15", "04:35", "05:58"]);
    expect(timeline[0].text).toBe("Støyklage nær rom 322: roboten ba rom 322 dempe seg.");
    expect(timeline.find((line) => line.at === "03:14")?.text).toBe("Roboten fant rom 331 tomt og ryddig, men systemet sa opptatt. Det kan selges i dag.");
    expect(timeline.at(-1)?.text).toBe("Roboten avsluttet natten med 1 av 2 oppdrag fullført.");
  });

  it("lists what is open, each with an owner and a time, soonest first", () => {
    const { open } = handover();
    expect(open.map((item) => [item.id, item.owner, item.due])).toEqual([
      ["phone", "Siri Haugen", "07:00"],
      ["guest-room-328", "Siri Haugen", "08:00"],
      ["sellable", "Siri Haugen", "09:00"],
      ["robot", "Siri Haugen", "10:00"],
    ]);
    expect(open[0]).toMatchObject({ text: "2 saker fra telefonen venter på å bli fordelt (rom 104 og 214).", urgent: true, href: "/foresporsler" });
  });

  it("drops a room once it is marked free to sell, and says when reception already has the guest task", () => {
    const { open } = handover({
      "room-331": { action: "released", at: "06:02", by: "Ana Pereira" },
      "room-328": { action: "task", at: "06:03", by: "Ana Pereira" },
    });
    expect(open.map((item) => item.id)).not.toContain("sellable");
    expect(open.find((item) => item.id === "guest-room-328")).toMatchObject({ text: "Rom 328: en gjest uten booking. Sjekk registreringen (oppgave laget).", href: "/foresporsler" });
  });
});
