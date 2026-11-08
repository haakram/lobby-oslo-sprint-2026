import { describe, expect, it } from "vitest";
import type { OrderView } from "@/features/dashboard/selectors";
import { priorityOf, selectMaintenance, unsignedWetFloors } from "./select";

function robot(id: string, overrides: Partial<OrderView>): OrderView {
  return { id, type: "sol", text: "Vått gulv ved corridor-2b", room: null, place: "corridor-2b", request: null, at: "23:51:33", robot: null, verdict: null, ...overrides };
}

// Newest first, as the night gives them: 2B was found wet and never signed; 3A was signed after.
const ORDERS: OrderView[] = [
  robot("wo-5", { type: "gjesteklage", text: "Gjesteklage fra rom 203: bestilt mobillader kom aldri", room: "room-203", place: null, request: "R-031", robot: "failed", verdict: "declined", at: "03:10:00" }),
  robot("wo-4", { text: "Søl ved corridor-3a: varselskilt satt ut", place: "corridor-3a", request: "R-024", robot: "done", verdict: "done", at: "01:47:39" }),
  robot("wo-3", { text: "Vått gulv ved corridor-3a", place: "corridor-3a", at: "01:34:16" }),
  robot("wo-2", { type: "stoy", text: "Støyklage nær rom 208: ba rom 210 dempe seg", room: "room-210", place: "corridor-2c", request: "R-007", robot: "done", verdict: "done", at: "23:20:09" }),
  robot("wo-1", {}),
];

describe("Vedlikehold: safety first, and no 'never came' complaint the robot found no order for", () => {
  it("finds the wet floors nobody has signed yet", () => {
    expect([...unsignedWetFloors(ORDERS)]).toEqual(["wo-1"]);
  });

  it("puts an unsigned wet floor at the top as Høy, and a refused complaint down as Lav", () => {
    const orders = selectMaintenance({ orders: ORDERS, statusOf: () => "ny", assignee: null, manual: [] });
    expect(orders[0]).toMatchObject({ id: "wo-1", priority: "hoy", safety: true, text: "Vått gulv ved corridor-2b, uten skilt" });
    const refused = orders.find((order) => order.id === "wo-5");
    expect(refused).toMatchObject({ priority: "lav", text: "Gjesteklage fra rom 203: bestilt mobillader kom aldri. Roboten sjekket: ingen bestilling registrert" });
    expect(orders.filter((order) => order.priority === "hoy").map((order) => order.id)).toEqual(["wo-1"]);
  });

  it("keeps a complaint high while the robot's own task for it is genuinely handed back", () => {
    expect(priorityOf(robot("x", { type: "gjesteklage", verdict: "failed", request: "R-9" }))).toBe("hoy");
    expect(priorityOf(robot("x", { type: "gjesteklage", verdict: "cancelled", request: "R-9" }))).toBe("lav");
    expect(priorityOf(robot("x", { text: "Søl ved corridor-3a: varselskilt satt ut", request: "R-1", verdict: "done" }))).toBe("middels");
  });
});
