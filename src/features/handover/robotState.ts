import type { RunLine } from "@/features/nightshift/runlog";

/**
 * The robot itself at the handover (round 4, domain review: "at 06:00 the robot is not docked and still
 * holds the master keycard; for a hotel, key custody at shift change is the first thing on the list").
 * Read from the run log's last word on the robot: its place (a move's `at`, a status's or state line's
 * `location`), battery, what it holds and what is on its cart, and whether it is on its charger (a
 * status reply's `docked`, else standing at the charging dock). Pure; nothing named for the demo night.
 */

export type RobotAtHandover = {
  /** Shift clock of the last reading, HH:MM:SS. */
  at: string | null;
  /** A place id on the map (elevator-1, corridor-3a, charging-dock). */
  location: string | null;
  /** Per cent, or null when the log never said. */
  battery: number | null;
  docked: boolean;
  hands: string[];
  cart: string[];
  /** It still holds a keycard that opens guests' doors (in its hands or on its cart). */
  keycard: boolean;
};

const DOCK = "charging-dock";
const KEYCARD = /^(?:master-)?keycard(?:-|$)/;

function rec(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function items(value: unknown): string[] | null {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : null;
}

/** The robot's state at the end of the log, or null when the log never says where the robot is (no robot that night). */
export function robotAtHandover(lines: readonly RunLine[]): RobotAtHandover | null {
  let at: string | null = null;
  let location: string | null = null;
  let battery: number | null = null;
  let docked: boolean | null = null;
  let hands: string[] = [];
  let cart: string[] = [];
  let seen = false;

  for (const line of lines) {
    if (line.type === "state") {
      seen = true;
      if (line.clock) at = line.clock;
      if (line.location) {
        if (line.location !== location) docked = null;
        location = line.location;
      }
      if (typeof line.battery === "number") battery = line.battery;
      hands = items(line.hands) ?? hands;
      cart = items(line.cart) ?? cart;
      continue;
    }
    if (line.type !== "call" || !line.ok) continue;
    const result = rec(line.result);
    if (line.cmd === "move") {
      // A move ends where the server says, or (the shift ended mid-move) in its outcome.
      const to = typeof result?.at === "string" ? result.at : typeof rec(result?.outcome)?.at === "string" ? (rec(result?.outcome)?.at as string) : null;
      if (to) {
        seen = true;
        if (line.clock) at = line.clock;
        if (to !== location) docked = null;
        location = to;
      }
    }
    if (line.cmd === "status" && result) {
      seen = true;
      if (line.clock) at = line.clock;
      if (typeof result.location === "string") location = result.location;
      if (typeof result.battery === "number") battery = result.battery;
      if (typeof result.docked === "boolean") docked = result.docked;
      hands = items(result.hands) ?? hands;
      cart = items(result.cart) ?? cart;
    }
    // A `dock` call is a timed charge the robot wakes from, not a place: only a status says "docked".
  }
  if (!seen) return null;
  return {
    at,
    location,
    battery,
    docked: docked ?? location === DOCK,
    hands,
    cart,
    keycard: [...hands, ...cart].some((item) => KEYCARD.test(item)),
  };
}

/** Below this the robot will not make the breakfast peak (the agent's own forced-charge target is 40 %). */
export const BREAKFAST_BATTERY = 40;

/** Something about the robot needs a person at 06:00: off its charger, low, or still holding a door key. */
export function robotNeedsPerson(robot: RobotAtHandover | null): boolean {
  if (!robot) return false;
  return !robot.docked || robot.keycard || (robot.battery !== null && robot.battery < BREAKFAST_BATTERY);
}
