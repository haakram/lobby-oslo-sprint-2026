// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ADMIN_VIEWS, PAGES, ROLES, ROUTES_BY_ROLE, canAccess, homeFor, isRole, roleLabel, type Role } from "./roles";

// Every page and API the app has today, and who may open it (auth brief, "Roles and access").
const MATRIX: Record<string, Record<Role, boolean>> = {
  "/": { admin: true, receptionist: true, robot: true, host: false },
  "/rom": { admin: true, receptionist: true, robot: true, host: false },
  "/gjester": { admin: true, receptionist: true, robot: false, host: false },
  "/foresporsler": { admin: true, receptionist: true, robot: true, host: false },
  "/vedlikehold": { admin: true, receptionist: false, robot: true, host: false },
  "/lager": { admin: true, receptionist: false, robot: true, host: false },
  "/ansatte": { admin: true, receptionist: true, robot: false, host: false },
  "/hotell": { admin: true, receptionist: false, robot: true, host: false },
  "/natteskift": { admin: true, receptionist: false, robot: true, host: false },
  "/oyne": { admin: true, receptionist: false, robot: true, host: false },
  "/stemme": { admin: true, receptionist: false, robot: true, host: false },
  "/ruter": { admin: true, receptionist: true, robot: true, host: false },
  "/resepsjon": { admin: true, receptionist: true, robot: false, host: false },
  "/api/reception/calls": { admin: true, receptionist: true, robot: false, host: false },
  "/api/reception/token": { admin: true, receptionist: true, robot: false, host: false },
  "/api/identify": { admin: true, receptionist: false, robot: true, host: false },
  "/api/scene": { admin: true, receptionist: false, robot: true, host: false },
  "/api/voice/token": { admin: true, receptionist: false, robot: true, host: false },
  "/api/auth/session": { admin: true, receptionist: true, robot: true, host: true },
  "/api/auth/view": { admin: true, receptionist: true, robot: true, host: true },
  "/runs/demo.jsonl": { admin: true, receptionist: true, robot: true, host: true },
  "/login/ingen-tilgang": { admin: true, receptionist: true, robot: true, host: true },
  "/mediapipe/vision_wasm_internal.wasm": { admin: true, receptionist: false, robot: true, host: false },
  "/models/efficientdet_lite0.tflite": { admin: true, receptionist: false, robot: true, host: false },
  "/vert": { admin: true, receptionist: false, robot: false, host: true },
  "/vert/meldinger": { admin: true, receptionist: false, robot: false, host: true },
  "/vert/bookinger": { admin: true, receptionist: false, robot: false, host: true },
  "/vert/drift": { admin: true, receptionist: false, robot: false, host: true },
  "/something-new": { admin: true, receptionist: false, robot: false, host: false },
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
  it("knows the four roles; an admin views as the hotel's three, never as the host", () => {
    expect([...ROLES]).toEqual(["admin", "receptionist", "robot", "host"]);
    expect([...ADMIN_VIEWS]).toEqual(["admin", "receptionist", "robot"]);
    expect(isRole("robot")).toBe(true);
    expect(isRole("root")).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });

  it("gives every role a Norwegian label", () => {
    expect(roleLabel("admin")).toBe("Admin");
    expect(roleLabel("receptionist")).toBe("Resepsjonist");
    expect(roleLabel("robot")).toBe("Robotansvarlig");
    expect(roleLabel("host")).toBe("Vert");
  });

  it("starts every hotel role on Oversikt and the host on its own app", () => {
    expect(homeFor("admin")).toBe("/");
    expect(homeFor("receptionist")).toBe("/");
    expect(homeFor("robot")).toBe("/");
    expect(homeFor("host")).toBe("/vert");
  });

  it("keeps the host inside /vert: no hotel, robot, reception or admin screen and none of their APIs", () => {
    for (const path of ["/", "/rom", "/gjester", "/resepsjon", "/hotell", "/natteskift", "/oyne", "/stemme", "/lager", "/api/reception/calls", "/api/identify", "/api/voice/token", "/vertx"]) {
      expect(canAccess("host", path), path).toBe(false);
    }
    expect(canAccess("host", "/vert/meldinger?tråd=1")).toBe(true);
    expect(canAccess("host", "/vert/../rom")).toBe(false);
  });

  it("lists the routes of every role", () => {
    expect(ROUTES_BY_ROLE.receptionist).toContain("/resepsjon");
    expect(ROUTES_BY_ROLE.robot).toContain("/hotell");
    expect(ROUTES_BY_ROLE.admin).toContain("*");
    expect(ROUTES_BY_ROLE.host).toEqual(["/vert", "/vert/meldinger", "/vert/bookinger", "/vert/drift"]);
  });
});
