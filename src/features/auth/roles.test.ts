// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PAGES, ROLES, ROUTES_BY_ROLE, canAccess, isRole, roleLabel, type Role } from "./roles";

// Every page and API the app has today, and who may open it (auth brief, "Roles and access").
const MATRIX: Record<string, Record<Role, boolean>> = {
  "/": { admin: true, receptionist: true, robot: true },
  "/rom": { admin: true, receptionist: true, robot: true },
  "/gjester": { admin: true, receptionist: true, robot: false },
  "/foresporsler": { admin: true, receptionist: true, robot: true },
  "/vedlikehold": { admin: true, receptionist: false, robot: true },
  "/lager": { admin: true, receptionist: false, robot: true },
  "/ansatte": { admin: true, receptionist: true, robot: false },
  "/hotell": { admin: true, receptionist: false, robot: true },
  "/natteskift": { admin: true, receptionist: false, robot: true },
  "/oyne": { admin: true, receptionist: false, robot: true },
  "/stemme": { admin: true, receptionist: false, robot: true },
  "/ruter": { admin: true, receptionist: true, robot: true },
  "/resepsjon": { admin: true, receptionist: true, robot: false },
  "/api/reception/calls": { admin: true, receptionist: true, robot: false },
  "/api/reception/token": { admin: true, receptionist: true, robot: false },
  "/api/identify": { admin: true, receptionist: false, robot: true },
  "/api/scene": { admin: true, receptionist: false, robot: true },
  "/api/voice/token": { admin: true, receptionist: false, robot: true },
  "/api/auth/session": { admin: true, receptionist: true, robot: true },
  "/api/auth/view": { admin: true, receptionist: true, robot: true },
  "/runs/demo.jsonl": { admin: true, receptionist: true, robot: true },
  "/login/ingen-tilgang": { admin: true, receptionist: true, robot: true },
  "/mediapipe/vision_wasm_internal.wasm": { admin: true, receptionist: false, robot: true },
  "/models/efficientdet_lite0.tflite": { admin: true, receptionist: false, robot: true },
  "/something-new": { admin: true, receptionist: false, robot: false },
};

describe("canAccess", () => {
  for (const [path, byRole] of Object.entries(MATRIX)) {
    for (const role of ROLES) {
      it(`${role} ${byRole[role] ? "may" : "may not"} open ${path}`, () => {
        expect(canAccess(role, path)).toBe(byRole[role]);
      });
    }
  }

  it("covers every page in PAGES", () => {
    for (const page of PAGES) expect(Object.keys(MATRIX)).toContain(page);
  });

  it("treats sub-paths of an allowed section as allowed", () => {
    expect(canAccess("receptionist", "/ruter/robot")).toBe(true);
    expect(canAccess("robot", "/hotell/3")).toBe(true);
  });

  it("does not match a prefix that is only part of a segment", () => {
    expect(canAccess("receptionist", "/ruterx")).toBe(false);
    expect(canAccess("robot", "/api/identifyx")).toBe(false);
    expect(canAccess("receptionist", "/api/receptionx")).toBe(false);
  });

  it("matches / only exactly, never as a prefix", () => {
    expect(canAccess("receptionist", "/hotell")).toBe(false);
  });

  it("ignores the query string and a trailing slash", () => {
    expect(canAccess("receptionist", "/ruter/?a=1")).toBe(true);
    expect(canAccess("receptionist", "/hotell/")).toBe(false);
  });

  it("decodes percent-encoding before matching, so encoding cannot smuggle a path", () => {
    expect(canAccess("receptionist", "/%68otell")).toBe(false);
    expect(canAccess("robot", "/%72esepsjon")).toBe(false);
  });

  it("refuses dot segments, encoded slashes and backslashes for every role but admin", () => {
    for (const path of ["/ruter/../hotell", "/ruter/..%2fhotell", "/ruter%2F..%2Fhotell", "/ruter\\..\\hotell", "/ruter/%5c"]) {
      expect(canAccess("receptionist", path)).toBe(false);
      expect(canAccess("robot", path)).toBe(false);
    }
  });

  it("refuses broken percent-encoding", () => {
    expect(canAccess("receptionist", "/ruter/%E0%A4%A")).toBe(false);
  });

  it("refuses unknown roles", () => {
    expect(canAccess("guest" as Role, "/")).toBe(false);
  });
});

describe("role helpers", () => {
  it("knows the three roles", () => {
    expect([...ROLES]).toEqual(["admin", "receptionist", "robot"]);
    expect(isRole("robot")).toBe(true);
    expect(isRole("root")).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });

  it("gives every role a Norwegian label", () => {
    expect(roleLabel("admin")).toBe("Admin");
    expect(roleLabel("receptionist")).toBe("Resepsjonist");
    expect(roleLabel("robot")).toBe("Robotansvarlig");
  });

  it("lists the routes of every role", () => {
    expect(ROUTES_BY_ROLE.receptionist).toContain("/resepsjon");
    expect(ROUTES_BY_ROLE.robot).toContain("/hotell");
    expect(ROUTES_BY_ROLE.admin).toContain("*");
  });
});
