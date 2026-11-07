import { describe, expect, it } from "vitest";
import { planCleaning, minutesText } from "./cleaningPlan";
import { hotelMap } from "./hotelMap";
import { shortestRoute } from "./hotelRouter";

const map = hotelMap();
const metres = (a: string, b: string, cart: boolean) => shortestRoute(map, a, b, { cart })!.metres;

describe("planCleaning", () => {
  it("is null with no rooms", () => {
    expect(planCleaning(map, { start: "laundry", rooms: [], cart: true })).toBeNull();
  });

  it("measures the saving against the rooms in the order given", () => {
    // Floor 3, floor 1, floor 2, floor 3 again: the list order rides the elevator back and forth.
    const rooms = ["room-319", "room-104", "room-201", "room-317"];
    const plan = planCleaning(map, { start: "laundry", rooms, cart: true });
    if (!plan || "error" in plan) throw new Error("expected a plan");

    const walk = ["laundry", ...rooms, "laundry"];
    const given = walk.slice(1).reduce((sum, to, i) => sum + metres(walk[i], to, true), 0);
    expect(plan.givenMetres).toBeCloseTo(given, 5);
    expect(plan.tour.metres).toBeLessThan(given);
    expect(plan.saved.metres).toBe(Math.round(given - plan.tour.metres));
    expect(plan.saved.percent).toBe(Math.round((plan.saved.metres / given) * 100));
    expect(plan.legs).toHaveLength(rooms.length + 1);
    expect(new Set(plan.tour.order)).toEqual(new Set(rooms));
  });

  it("counts the elevator rides on the best round and never takes the stairs with the cart", () => {
    const plan = planCleaning(map, { start: "laundry", rooms: ["room-201", "room-319"], cart: true });
    if (!plan || "error" in plan) throw new Error("expected a plan");
    // Up to 2, on to 3, down to 1.
    expect(plan.elevatorRides).toBe(3);
    expect(plan.tour.path.some((id) => id.startsWith("stairwell-"))).toBe(false);
  });

  it("saves nothing when the list is already the best order", () => {
    const plan = planCleaning(map, { start: "laundry", rooms: ["room-104"], cart: false });
    if (!plan || "error" in plan) throw new Error("expected a plan");
    expect(plan.saved).toEqual({ metres: 0, percent: 0 });
    expect(plan.elevatorRides).toBe(0);
  });

  it("reports a room the map has no way to", () => {
    const island = { nodes: { ...map.nodes, "room-999": { floor: 1, kind: "room", x: 0, z: 0 } }, edges: map.edges };
    expect(planCleaning(island, { start: "laundry", rooms: ["room-999"], cart: false })).toEqual({
      error: "no-route",
      from: "laundry",
      to: "room-999",
    });
  });
});

describe("minutesText", () => {
  it("rounds to whole minutes, at least one", () => {
    expect(minutesText(20)).toBe("ca. 1 min");
    expect(minutesText(551)).toBe("ca. 9 min");
  });
});
