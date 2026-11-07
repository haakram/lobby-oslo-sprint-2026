import { describe, expect, it } from "vitest";
import { bestTour, floorRuns, listOrderMetres, savings, tourLegs } from "./tour";
import type { RouteMatrix } from "./types";

// Five stop nodes (S start, A B D on floor 1, C on floor 2) plus a lift.
// A→B is a one-way aisle (12 m) while B→A goes round (20 m), so the best order is unique.
function leg(metres: number, path: string[], seconds = metres) {
  return { metres, seconds, path };
}

const FIXTURE: RouteMatrix = {
  map: "fixture",
  start: "S",
  nodes: {
    S: { floor: 1, kind: "service", x: 0, z: 0 },
    A: { floor: 1, kind: "shelf", x: 10, z: 0 },
    B: { floor: 1, kind: "shelf", x: 20, z: 0 },
    D: { floor: 1, kind: "shelf", x: 0, z: 7 },
    L1: { floor: 1, kind: "elevator", x: 30, z: 0 },
    L2: { floor: 2, kind: "elevator", x: 30, z: 0 },
    C: { floor: 2, kind: "shelf", x: 20, z: 0 },
  },
  legs: {
    "S|A": leg(10, ["S", "A"]),
    "A|S": leg(10, ["A", "S"]),
    "S|B": leg(25, ["S", "B"]),
    "B|S": leg(25, ["B", "S"]),
    "S|C": leg(18, ["S", "L1", "L2", "C"], 78),
    "C|S": leg(18, ["C", "L2", "L1", "S"], 78),
    "A|B": leg(12, ["A", "B"]),
    "B|A": leg(20, ["B", "A"]),
    "A|C": leg(30, ["A", "L1", "L2", "C"], 90),
    "C|A": leg(30, ["C", "L2", "L1", "A"], 90),
    "B|C": leg(9, ["B", "L1", "L2", "C"], 69),
    "C|B": leg(9, ["C", "L2", "L1", "B"], 69),
    "S|D": leg(7, ["S", "D"]),
    "D|S": leg(7, ["D", "S"]),
    // No legs between D and A, B or C: the map has no way there.
  },
};

describe("bestTour", () => {
  it("picks the order with the fewest metres (hand-computed: S A B C S = 10+12+9+18 = 49)", () => {
    const tour = bestTour(FIXTURE, ["C", "A", "B"]);
    expect(tour).toEqual({
      order: ["A", "B", "C"],
      metres: 49,
      seconds: 10 + 12 + 69 + 78,
      path: ["S", "A", "B", "L1", "L2", "C", "L2", "L1", "S"],
    });
  });

  it("stays at the start when there are no stops", () => {
    expect(bestTour(FIXTURE, [])).toEqual({ order: [], metres: 0, seconds: 0, path: ["S"] });
  });

  it("goes there and back for one stop", () => {
    expect(bestTour(FIXTURE, ["A"])).toEqual({ order: ["A"], metres: 20, seconds: 20, path: ["S", "A", "S"] });
  });

  it("collapses duplicate stops", () => {
    const tour = bestTour(FIXTURE, ["A", "B", "A", "C", "B"]);
    expect(tour).toMatchObject({ order: ["A", "B", "C"], metres: 49 });
  });

  it("ignores a stop that is the start itself", () => {
    expect(bestTour(FIXTURE, ["S", "A"])).toMatchObject({ order: ["A"], metres: 20 });
  });

  it("reports the first missing pair instead of throwing", () => {
    expect(bestTour(FIXTURE, ["A", "D"])).toEqual({ error: "no-route", from: "A", to: "D" });
  });

  it("reports a stop the map does not know", () => {
    expect(bestTour(FIXTURE, ["Z"])).toEqual({ error: "no-route", from: "S", to: "Z" });
  });

  describe("above seven stops (nearest neighbour + 2-opt)", () => {
    // Stops on one straight aisle, S at 0. The best tour on a line is out to one end and back
    // past S to the other: 2 × (farthest right) + 2 × (farthest left).
    function aisle(positions: Record<string, number>): RouteMatrix {
      const at: Record<string, number> = { S: 0, ...positions };
      const ids = Object.keys(at);
      return {
        map: "aisle",
        start: "S",
        nodes: Object.fromEntries(ids.map((id) => [id, { floor: 1, kind: "shelf", x: at[id], z: 0 }])),
        legs: Object.fromEntries(
          ids.flatMap((a) =>
            ids.filter((b) => b !== a).map((b) => [`${a}|${b}`, leg(Math.abs(at[a] - at[b]), [a, b])]),
          ),
        ),
      };
    }

    it("visits every stop once on a one-sided aisle (9 stops, 2 × 90 m)", () => {
      const ids = Array.from({ length: 9 }, (_, i) => `P${i + 1}`);
      const line = aisle(Object.fromEntries(ids.map((id, i) => [id, (i + 1) * 10])));
      const tour = bestTour(line, ["P5", "P1", "P9", "P3", "P7", "P2", "P8", "P4", "P6"]);
      if ("error" in tour) throw new Error("expected a tour");
      expect([...tour.order].sort()).toEqual([...ids].sort());
      expect(tour.metres).toBe(180);
      expect(listOrderMetres(line, tour.order)).toBe(tour.metres);
    });

    it("2-opt removes the zigzag nearest neighbour leaves on a two-sided aisle", () => {
      // Nearest neighbour: 0→2→−4→−12→10→13→14→15→16→0 = 60 m. Best: 2 × 16 + 2 × 12 = 56 m.
      const line = aisle({ a: 2, b: -4, c: 10, d: -12, e: 13, f: 14, g: 15, h: 16 });
      const tour = bestTour(line, ["c", "d", "a", "h", "b", "f", "e", "g"]);
      if ("error" in tour) throw new Error("expected a tour");
      expect(tour.order).toHaveLength(8);
      expect(tour.metres).toBe(56);
    });
  });
});

describe("listOrderMetres", () => {
  it("walks the stops in list order from the start and back", () => {
    // S C A B S = 18 + 30 + 12 + 25
    expect(listOrderMetres(FIXTURE, ["C", "A", "B"])).toBe(85);
  });

  it("is 0 for no stops", () => {
    expect(listOrderMetres(FIXTURE, [])).toBe(0);
  });

  it("throws when the list order needs a leg the map lacks", () => {
    expect(() => listOrderMetres(FIXTURE, ["A", "D"])).toThrow(/A\|D/);
  });
});

describe("savings", () => {
  it("is the difference and its whole-number share of the naive walk", () => {
    expect(savings(62, 100)).toEqual({ metres: 38, percent: 38 });
  });

  it("is zero when there is nothing to walk", () => {
    expect(savings(0, 0)).toEqual({ metres: 0, percent: 0 });
  });

  it("rounds the percent", () => {
    expect(savings(144, 204)).toEqual({ metres: 60, percent: 29 });
  });

  it("never reports a negative saving", () => {
    expect(savings(120, 100)).toEqual({ metres: 0, percent: 0 });
  });
});

describe("tourLegs", () => {
  it("splits a tour into legs from the start, between stops and back", () => {
    const legs = tourLegs(FIXTURE, ["A", "C"]);
    expect(legs.map((l) => [l.from, l.to, l.metres])).toEqual([
      ["S", "A", 10],
      ["A", "C", 30],
      ["C", "S", 18],
    ]);
    expect(legs[1].path).toEqual(["A", "L1", "L2", "C"]);
  });
});

describe("floorRuns", () => {
  it("cuts a path where it changes floor", () => {
    expect(floorRuns(FIXTURE, ["S", "A", "B", "L1", "L2", "C", "L2", "L1", "S"])).toEqual([
      { floor: 1, nodes: ["S", "A", "B", "L1"] },
      { floor: 2, nodes: ["L2", "C", "L2"] },
      { floor: 1, nodes: ["L1", "S"] },
    ]);
  });

  it("is empty for an empty path", () => {
    expect(floorRuns(FIXTURE, [])).toEqual([]);
  });
});
