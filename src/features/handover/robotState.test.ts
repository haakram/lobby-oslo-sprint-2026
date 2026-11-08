import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseRunLog, type RunLine } from "@/features/nightshift/runlog";
import { TEST_NIGHT } from "@/features/rooms/testNight";
import { robotAtHandover, robotNeedsPerson } from "./robotState";

const demo = () => parseRunLog(readFileSync(resolve(process.cwd(), "public/runs/demo.jsonl"), "utf8")).lines;

describe("the robot itself at the 06:00 handover, from its run log", () => {
  it("on the demo night: at the lift, off its charger at 20 %, still holding the master keycard and the cart", () => {
    const robot = robotAtHandover(demo());
    expect(robot).toEqual({
      at: "05:59:37",
      location: "elevator-1",
      battery: 19.8,
      docked: false,
      hands: ["keycard", "towel"],
      cart: ["towel", "toiletry-kit"],
      keycard: true,
    });
    expect(robotNeedsPerson(robot)).toBe(true);
  });

  it("a robot that ends on its dock with no key and a full battery needs nobody", () => {
    const robot = robotAtHandover(TEST_NIGHT);
    expect(robot).toMatchObject({ location: "charging-dock", docked: true, keycard: false });
    expect(robotNeedsPerson(robot)).toBe(false);
    const status: RunLine = { v: 1, type: "call", cmd: "status", args: {}, ok: true, clock: "05:59:00", result: { location: "charging-dock", battery: 90, hands: [], cart: [], docked: true } };
    expect(robotNeedsPerson(robotAtHandover([...TEST_NIGHT, status]))).toBe(false);
  });

  it("a status says docked; moving away afterwards undoes it; a low battery on the dock still needs a person before breakfast", () => {
    const status = (docked: boolean, battery: number): RunLine => ({ v: 1, type: "call", cmd: "status", args: {}, ok: true, clock: "05:50:00", result: { location: "charging-dock", battery, hands: [], cart: [], docked } });
    const move: RunLine = { v: 1, type: "call", cmd: "move", args: { to: "lobby" }, ok: true, clock: "05:55:00", result: { at: "lobby" } };
    expect(robotAtHandover([status(true, 90), move])).toMatchObject({ location: "lobby", docked: false });
    expect(robotNeedsPerson(robotAtHandover([status(true, 25)]))).toBe(true);
  });

  it("says nothing when the log never places a robot (the night without a robot)", () => {
    expect(robotAtHandover([])).toBeNull();
    expect(robotAtHandover([{ v: 1, type: "decision", kind: "note", data: { source: "staff", text: "Rolig natt." } }])).toBeNull();
    expect(robotNeedsPerson(null)).toBe(false);
  });
});
