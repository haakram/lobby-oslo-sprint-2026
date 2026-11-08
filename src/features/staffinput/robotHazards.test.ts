import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { nightSafety } from "@/features/handover/safety";
import { parseRunLog } from "@/features/nightshift/runlog";
import { acknowledgeLine } from "./entries";
import { readStaffLog, staffAcks } from "./read";
import { hazardWait, NIGHT_END, robotHazardKey, robotHazardsOf, waitMinutes, waitText } from "./robotHazards";

const DEMO = parseRunLog(readFileSync(resolve(process.cwd(), "public/runs/demo.jsonl"), "utf8")).lines;

describe("the robot's hazards for the night clerk", () => {
  it("are the handover's own, at the robot's clock, oldest first: three bare wet floors and the person at the doors", () => {
    const hazards = robotHazardsOf(nightSafety(DEMO));
    expect(hazards.map((hazard) => [hazard.at, hazard.title])).toEqual([
      ["23:51:33", "Vått gulv i korridor 2B"],
      ["01:17:02", "En person i badekåpe ba roboten slippe ham inn på 7 rom"],
      ["04:38:18", "Vått gulv i korridor 3D"],
      ["05:52:59", "Vått gulv i korridor 1C"],
    ]);
    expect(hazards.map((hazard) => hazard.detail)).toEqual([
      "Roboten skled der. Ingen skilt.",
      "Roboten sa nei hver gang, sist kl. 05:11. Sjekk først om en gjest er låst ute.",
      "Roboten flyttet skiltet herfra til korridor 3C. Ingen skilt nå.",
      "Roboten fant det. Ingen skilt.",
    ]);
  });

  it("carry keys the handover can compute from its own items (WetFloor.since, StrangerIncident.first)", () => {
    const safety = nightSafety(DEMO);
    const keys = robotHazardsOf(safety).map((hazard) => hazard.key);
    for (const floor of safety.wetFloors) expect(keys).toContain(robotHazardKey({ hazard: "wet", place: floor.place, since: floor.since }));
    expect(keys).toContain(robotHazardKey({ hazard: "person", since: safety.stranger?.first ?? null }));
    expect(robotHazardKey({ hazard: "wet", place: "corridor-2b", since: "23:51:33" })).toBe("wet:corridor-2b:23:51:33");
    expect(robotHazardsOf(null)).toEqual([]);
  });

  it("time how long each waited for a person: to her Kvitter in the night, else to 06:00", () => {
    const [slip, person] = robotHazardsOf(nightSafety(DEMO));
    // Nobody acknowledged it on the demo night.
    expect(hazardWait(slip.at, null)).toEqual({ minutes: 369, acknowledged: false, inNight: false });
    expect(waitText(369)).toBe("6 t 9 min");
    expect(waitText(hazardWait(person.at, undefined).minutes ?? 0)).toBe("4 t 43 min");
    // Acknowledged at 23:53: two minutes.
    const ack = staffAcks(readStaffLog([acknowledgeLine(slip, { by: "Kjersti Lund", now: new Date("2026-11-07T22:53:00Z") })])).get(slip.key);
    expect(hazardWait(slip.at, ack)).toEqual({ minutes: 2, acknowledged: true, inNight: true });
    // Typed by day on a demo: acknowledged, but the night still waited until 06:00.
    expect(hazardWait(slip.at, { at: "14:10:00" })).toEqual({ minutes: 369, acknowledged: true, inNight: false });
    expect(NIGHT_END).toBe("06:00:00");
  });

  it("say a wait in the desk's words, on the clocks a reader sees", () => {
    expect(waitMinutes("23:51:59", "23:53:00")).toBe(2);
    expect(waitMinutes("05:52:59", NIGHT_END)).toBe(8);
    expect([waitText(0), waitText(8), waitText(60), waitText(82)]).toEqual(["under 1 min", "8 min", "1 t", "1 t 22 min"]);
  });
});
