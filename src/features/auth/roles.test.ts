import { describe, expect, it } from "vitest";
import { canAccess, ROUTES_BY_ROLE } from "./roles";

// TODO(auth): the real matrix test comes with hamad/uiauth; this pins the stub the shell builds on.
describe("canAccess (stub)", () => {
  it("lets every role open its own routes and nothing else", () => {
    const all = ["/", "/hotell", "/ruter", "/natteskift", "/oyne", "/stemme", "/resepsjon"];
    for (const role of ["admin", "receptionist", "robot"] as const) {
      for (const route of all) {
        expect(canAccess(role, route)).toBe(ROUTES_BY_ROLE[role].includes(route));
      }
    }
  });

  it("treats sub-paths like their screen and never lets / match everything", () => {
    expect(canAccess("receptionist", "/resepsjon/logg")).toBe(true);
    expect(canAccess("receptionist", "/hotell")).toBe(false);
    expect(canAccess("robot", "/resepsjon")).toBe(false);
  });
});
