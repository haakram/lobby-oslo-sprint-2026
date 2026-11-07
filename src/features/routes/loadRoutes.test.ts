import { describe, expect, it } from "vitest";
import { PRODUCTS } from "@/features/catalog/products";
import stub from "./data/hotel.routes.json";
import { loadRoutes, parseRouteMatrix } from "./loadRoutes";

const CONNECTORS = new Set(["elevator", "stairwell"]);

function valid() {
  return {
    map: "t",
    start: "a",
    nodes: { a: { floor: 1, kind: "service", x: 0, z: 0 }, b: { floor: 1, kind: "shelf", x: 4, z: 0 } },
    legs: {
      "a|b": { metres: 4, seconds: 4, path: ["a", "b"] },
      "b|a": { metres: 4, seconds: 4, path: ["b", "a"] },
    },
  };
}

describe("parseRouteMatrix", () => {
  it("accepts a well-formed matrix", () => {
    expect(parseRouteMatrix(valid())).toMatchObject({ ok: true });
  });

  it("rejects a start that is not a node", () => {
    expect(parseRouteMatrix({ ...valid(), start: "x" })).toMatchObject({ ok: false });
  });

  it("rejects a path through an unknown node", () => {
    const m = valid();
    m.legs["a|b"].path = ["a", "ghost", "b"];
    expect(parseRouteMatrix(m)).toMatchObject({ ok: false });
  });

  it("rejects a path that does not start and end where its key says", () => {
    const m = valid();
    m.legs["a|b"].path = ["b", "a"];
    expect(parseRouteMatrix(m)).toMatchObject({ ok: false });
  });

  it("rejects negative metres", () => {
    const m = valid();
    m.legs["a|b"].metres = -1;
    expect(parseRouteMatrix(m)).toMatchObject({ ok: false });
  });

  it("rejects something that is not a matrix at all", () => {
    expect(parseRouteMatrix("nope")).toMatchObject({ ok: false });
  });
});

describe("the stub map", () => {
  const result = loadRoutes();
  if (!result.ok) throw new Error(result.error);
  const m = result.matrix;
  const places = [m.start, ...new Set(PRODUCTS.map((p) => p.location))];

  it("starts at the packing area", () => {
    expect(m.start).toBe("pack");
    expect(stub.start).toBe("pack");
  });

  it("knows every shelf a product points at", () => {
    for (const p of PRODUCTS) expect(m.nodes[p.location], p.sku).toBeDefined();
  });

  it("has a leg for every pair of places, both ways", () => {
    for (const a of places) for (const b of places) if (a !== b) expect(m.legs[`${a}|${b}`], `${a}|${b}`).toBeDefined();
  });

  it("crosses floors only through a lift or the stairs", () => {
    for (const [key, leg] of Object.entries(m.legs)) {
      leg.path.slice(1).forEach((id, i) => {
        const prev = m.nodes[leg.path[i]];
        const here = m.nodes[id];
        if (prev.floor !== here.floor) {
          expect(CONNECTORS.has(prev.kind) && CONNECTORS.has(here.kind), key).toBe(true);
        }
      });
    }
  });

  it("uses both the lift and the stairs somewhere", () => {
    const kinds = new Set(Object.values(m.legs).flatMap((l) => l.path.map((id) => m.nodes[id].kind)));
    expect(kinds).toContain("elevator");
    expect(kinds).toContain("stairwell");
  });
});
