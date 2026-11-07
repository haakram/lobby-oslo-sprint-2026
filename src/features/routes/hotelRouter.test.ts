import { describe, expect, it } from "vitest";
import parity from "./fixtures/router_parity.json";
import { BASE_HOTEL } from "@/features/hotel";
import { hotelMatrix, shortestRoute } from "./hotelRouter";
import { bestTour } from "./tour";

const map = BASE_HOTEL;

type ParityRoute = { from: string; to: string; cart: boolean; seconds: number; path: string[] };

describe("shortestRoute, against Track A's router", () => {
  it(`matches agent.routing on all ${(parity as ParityRoute[]).length} recorded routes (seconds and path)`, () => {
    const mismatches = (parity as ParityRoute[]).flatMap((expected) => {
      const route = shortestRoute(map, expected.from, expected.to, { cart: expected.cart });
      const same = route && Math.abs(route.seconds - expected.seconds) < 1e-3 && route.path.join() === expected.path.join();
      return same ? [] : [`${expected.from} → ${expected.to}${expected.cart ? " (vogn)" : ""}`];
    });
    expect(mismatches).toEqual([]);
  });
});

describe("shortestRoute", () => {
  it("never takes the stairs with the cart", () => {
    const route = shortestRoute(map, "laundry", "room-319", { cart: true })!;
    expect(route.path.some((id) => id.startsWith("stairwell-"))).toBe(false);
    expect(route.path).toContain("elevator-3");
  });

  it("counts floor metres only: an elevator ride adds none", () => {
    // laundry → corridor-1b 5, → corridor-1a 13, → lobby 9, → elevator-1 6, ride, → corridor-2a 4, → room-201 4.
    const route = shortestRoute(map, "laundry", "room-201", { cart: true })!;
    expect(route.path).toEqual(["laundry", "corridor-1b", "corridor-1a", "lobby", "elevator-1", "elevator-2", "corridor-2a", "room-201"]);
    expect(route.metres).toBe(41);
  });

  it("never walks through a guest room", () => {
    for (const r of parity as ParityRoute[]) {
      const route = shortestRoute(map, r.from, r.to, { cart: r.cart })!;
      expect(route.path.slice(1, -1).some((id) => map.nodes[id].kind === "room")).toBe(false);
    }
  });

  it("returns null for a node the map does not have", () => {
    expect(shortestRoute(map, "laundry", "room-999")).toBeNull();
  });

  it("returns null when the map has no way there", () => {
    const island = { nodes: { ...map.nodes, "room-999": { id: "room-999", floor: 1, kind: "room" as const, x: 0, z: 0 } }, edges: map.edges };
    expect(shortestRoute(island, "laundry", "room-999")).toBeNull();
  });
});

describe("hotelMatrix", () => {
  it("feeds the tour engine: every ordered pair, starting at the start", () => {
    const m = hotelMatrix(map, "laundry", ["room-201", "room-104", "room-201"]);
    expect(m.start).toBe("laundry");
    expect(Object.keys(m.legs).sort()).toEqual(
      ["laundry|room-201", "laundry|room-104", "room-201|laundry", "room-201|room-104", "room-104|laundry", "room-104|room-201"].sort(),
    );
    const tour = bestTour(m, ["room-201", "room-104"]);
    expect("error" in tour).toBe(false);
  });

  it("leaves out a pair with no route, so the tour engine reports it", () => {
    const island = { nodes: { ...map.nodes, "room-999": { id: "room-999", floor: 1, kind: "room" as const, x: 0, z: 0 } }, edges: map.edges };
    const m = hotelMatrix(island, "laundry", ["room-999"]);
    expect(bestTour(m, ["room-999"])).toEqual({ error: "no-route", from: "laundry", to: "room-999" });
  });
});
