import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { canAccess, PAGES } from "@/features/auth/roles";
import { WIDGETS } from "@/features/dashboard/widgets";
import { MODULE_GROUPS, MODULES, moduleById, moduleRoutesFor } from "./registry";

// The registry is the one list of the hotel's modules: the navigation, the route table and the
// widgets on Oversikt all read it. These tests keep the three in step with it.
describe("the module registry", () => {
  it("lists every module once, with its own route, in the five groups", () => {
    expect(MODULE_GROUPS.map((group) => group.label)).toEqual(["Hotellet", "Drift", "Roboten", "Resepsjon", "Utleie"]);
    expect(new Set(MODULES.map((module) => module.id)).size).toBe(MODULES.length);
    expect(new Set(MODULES.map((module) => module.route)).size).toBe(MODULES.length);
    for (const group of MODULE_GROUPS) expect(MODULES.some((module) => module.group === group.id), group.id).toBe(true);
    expect(MODULES.map((module) => module.id)).toEqual([
      "oversikt",
      "rom",
      "gjester",
      "ruter",
      "overlevering",
      "natt",
      "foresporsler",
      "vedlikehold",
      "lager",
      "ansatte",
      "hotell3d",
      "natteskift",
      "oyne",
      "stemme",
      "resepsjon",
      "vert",
      "vert-meldinger",
      "vert-bookinger",
      "vert-drift",
    ]);
  });

  it("has a page under src/app for every route", () => {
    for (const entry of MODULES) {
      const dir = entry.route === "/" ? "" : entry.route;
      expect(existsSync(resolve(process.cwd(), `src/app${dir}/page.tsx`)), entry.route).toBe(true);
    }
  });

  it("has a widget on Oversikt exactly for the modules that say they have one", () => {
    for (const entry of MODULES) expect(Boolean(WIDGETS[entry.id]), entry.id).toBe(Boolean(entry.widget));
  });

  it("drives the route table: admin opens everything, the other roles only their modules", () => {
    expect(PAGES).toEqual(MODULES.map((module) => module.route));
    for (const entry of MODULES) {
      expect(canAccess("admin", entry.route), entry.route).toBe(true);
      expect(canAccess("receptionist", entry.route), entry.route).toBe(entry.roles.includes("receptionist"));
      expect(canAccess("robot", entry.route), entry.route).toBe(entry.roles.includes("robot"));
      expect(canAccess("host", entry.route), entry.route).toBe(entry.roles.includes("host"));
    }
    expect(moduleRoutesFor("receptionist")).toEqual(["/", "/rom", "/gjester", "/ruter", "/overlevering", "/natt", "/foresporsler", "/ansatte", "/resepsjon"]);
    expect(moduleRoutesFor("robot")).toEqual(["/", "/rom", "/ruter", "/foresporsler", "/vedlikehold", "/lager", "/hotell", "/natteskift", "/oyne", "/stemme"]);
    // The host (an Airbnb host) has only the Utleie group, and no hotel role has any of it.
    expect(moduleRoutesFor("host")).toEqual(["/vert", "/vert/meldinger", "/vert/bookinger", "/vert/drift"]);
    for (const entry of MODULES.filter((module) => module.group === "utleie")) expect(entry.roles).toEqual(["host"]);
  });

  it("finds a module by id and refuses an unknown one", () => {
    expect(moduleById("rom")).toMatchObject({ name: "Rom og renhold", short: "Rom", route: "/rom", group: "hotellet" });
    expect(() => moduleById("kjeller" as never)).toThrow(/Unknown module/);
  });

  it("says where every module's figures come from, so test data is never shown as real", () => {
    const sources = new Set(["run-log", "reception", "test", "mixed", "none"]);
    for (const entry of MODULES) expect(sources.has(entry.data), entry.id).toBe(true);
    expect(MODULES.filter((module) => module.data === "test").map((module) => module.id)).toEqual(["lager", "ansatte", "vert", "vert-meldinger", "vert-bookinger", "vert-drift"]);
  });
});
