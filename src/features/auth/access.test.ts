// @vitest-environment node
import { describe, expect, it } from "vitest";
import { decide, safeNext } from "./access";
import type { Role } from "./roles";

const as = (role: Role, view: Role = role) => ({ role, view });

describe("decide: not logged in", () => {
  it("sends pages to /login with the page as next", () => {
    expect(decide({ pathname: "/hotell", search: "", session: null })).toEqual({
      kind: "redirect",
      location: "/login?next=%2Fhotell",
      clearCookie: false,
    });
  });

  it("keeps the query in next, and leaves next out for the home page", () => {
    expect(decide({ pathname: "/ruter", search: "?fra=lobby", session: null })).toMatchObject({
      location: "/login?next=%2Fruter%3Ffra%3Dlobby",
    });
    expect(decide({ pathname: "/", search: "", session: null })).toMatchObject({ location: "/login" });
  });

  it("answers APIs with 401 instead of a redirect", () => {
    for (const pathname of ["/api/identify", "/api/reception/calls", "/api/auth/session", "/api/auth/view", "/api"]) {
      expect(decide({ pathname, search: "", session: null })).toEqual({ kind: "unauthorized" });
    }
  });

  it("protects the demo run log and the model files too", () => {
    expect(decide({ pathname: "/runs/demo.jsonl", search: "", session: null }).kind).toBe("redirect");
    expect(decide({ pathname: "/models/x.tflite", search: "", session: null }).kind).toBe("redirect");
  });

  it("lets through only the login page, login/logout API, Next's assets, the favicon and the phone-agent webhook", () => {
    for (const pathname of [
      "/login",
      "/login/",
      "/api/auth/login",
      "/api/auth/logout",
      "/_next/static/chunks/main.js",
      "/_next/image",
      "/favicon.ico",
      "/api/reception/tools/book_room",
    ]) {
      expect(decide({ pathname, search: "", session: null })).toEqual({ kind: "next" });
    }
  });

  it("lets the brand files through, so a tab, a home screen and a Slack preview get them before anyone logs in", () => {
    for (const pathname of [
      "/icon.svg",
      "/apple-icon.png",
      "/manifest.webmanifest",
      "/opengraph-image.png",
      "/twitter-image.png",
      "/icon-192.png",
      "/icon-512.png",
      "/icon-maskable-512.png",
      "/brand/lobby-mark.png",
      "/brand/lobby-wordmark.png",
      "/brand/lobby-logo-full.png",
      "/brand/lobby-tagline.png",
    ]) {
      expect(decide({ pathname, search: "", session: null })).toEqual({ kind: "next" });
      // And for every role: the receptionist's tab gets the icon too, not a 403 page.
      expect(decide({ pathname, search: "", session: as("receptionist") })).toEqual({ kind: "next" });
      expect(decide({ pathname, search: "", session: as("host") })).toEqual({ kind: "next" });
    }
  });

  it("does not treat look-alike paths as public", () => {
    for (const pathname of [
      "/loginx",
      "/login/ingen-tilgang",
      "/api/auth/loginx",
      "/api/reception/toolsx",
      "/favicon.ico.php",
      "/icon.svg/x",
      "/opengraph-image.png.php",
      "/icon-1024.png",
      "/runs/icon.svg",
    ]) {
      expect(decide({ pathname, search: "", session: null }).kind).not.toBe("next");
    }
  });

  it("does not let a public prefix carry an encoded way out", () => {
    for (const pathname of ["/_next/..%2fhotell", "/_next/%2e%2e/hotell", "/api/reception/tools/..%2F..%2Fidentify", "/_next/x\\y"]) {
      expect(decide({ pathname, search: "", session: null }).kind).not.toBe("next");
    }
  });

  it("clears a cookie that was sent but didn't verify (tampered or expired)", () => {
    expect(decide({ pathname: "/", search: "", session: null, hadCookie: true })).toMatchObject({ clearCookie: true });
  });
});

describe("decide: logged in", () => {
  it("lets each role through to its own pages and APIs", () => {
    expect(decide({ pathname: "/resepsjon", search: "", session: as("receptionist") }).kind).toBe("next");
    expect(decide({ pathname: "/api/reception/calls", search: "", session: as("receptionist") }).kind).toBe("next");
    expect(decide({ pathname: "/hotell", search: "", session: as("robot") }).kind).toBe("next");
    expect(decide({ pathname: "/api/voice/token", search: "", session: as("robot") }).kind).toBe("next");
    expect(decide({ pathname: "/anything", search: "", session: as("admin") }).kind).toBe("next");
  });

  it("answers the wrong role with 403: a page for pages, JSON for APIs", () => {
    expect(decide({ pathname: "/hotell", search: "", session: as("receptionist") })).toEqual({ kind: "forbidden", api: false });
    expect(decide({ pathname: "/api/identify", search: "", session: as("receptionist") })).toEqual({ kind: "forbidden", api: true });
    expect(decide({ pathname: "/resepsjon", search: "", session: as("robot") })).toEqual({ kind: "forbidden", api: false });
    expect(decide({ pathname: "/api/reception/token", search: "", session: as("robot") })).toEqual({ kind: "forbidden", api: true });
  });

  it("judges an admin viewing as another role by that role, but always lets them switch back", () => {
    expect(decide({ pathname: "/hotell", search: "", session: as("admin", "receptionist") }).kind).toBe("forbidden");
    expect(decide({ pathname: "/resepsjon", search: "", session: as("admin", "receptionist") }).kind).toBe("next");
    expect(decide({ pathname: "/api/auth/view", search: "", session: as("admin", "receptionist") }).kind).toBe("next");
  });

  it("sends /login on to next (when that role may open it) or home", () => {
    expect(decide({ pathname: "/login", search: "", session: as("robot") })).toMatchObject({ kind: "redirect", location: "/" });
    expect(decide({ pathname: "/login", search: "?next=%2Fhotell", session: as("robot") })).toMatchObject({ location: "/hotell" });
    expect(decide({ pathname: "/login", search: "?next=%2Fhotell", session: as("receptionist") })).toMatchObject({ location: "/" });
    expect(decide({ pathname: "/login", search: "?next=%2F%2Fevil.example", session: as("admin") })).toMatchObject({ location: "/overlevering" });
    expect(decide({ pathname: "/login", search: "", session: as("admin") })).toMatchObject({ location: "/overlevering" });
    // The pilot accounts still open Oversikt when they ask for it.
    expect(decide({ pathname: "/", search: "", session: as("admin") })).toEqual({ kind: "next" });
  });
});

describe("decide: the open demo (no accounts configured)", () => {
  const demo = { session: as("admin"), openDemo: true };

  it("sends /login to the home page, whatever next says", () => {
    expect(decide({ pathname: "/login", search: "", ...demo })).toEqual({ kind: "redirect", location: "/", clearCookie: false });
    expect(decide({ pathname: "/login/", search: "?next=%2Fhotell", ...demo })).toEqual({ kind: "redirect", location: "/", clearCookie: false });
  });

  it("opens every page and API to the demo admin", () => {
    for (const pathname of ["/", "/overlevering", "/hotell", "/oyne", "/resepsjon", "/vert", "/runs/demo.jsonl", "/api/scene", "/api/reception/calls"]) {
      expect(decide({ pathname, search: "", ...demo })).toEqual({ kind: "next" });
    }
  });

  it("leaves the login behaviour alone when the flag is off", () => {
    expect(decide({ pathname: "/login", search: "", session: as("admin") })).toMatchObject({ location: "/overlevering" });
    expect(decide({ pathname: "/hotell", search: "", session: null })).toMatchObject({ kind: "redirect", location: "/login?next=%2Fhotell" });
  });
});

describe("decide: the host (an Airbnb host with their own app)", () => {
  it("lands on /vert: from /login, and from / (no Oversikt for the host, so no 403 on the front page)", () => {
    expect(decide({ pathname: "/login", search: "", session: as("host") })).toEqual({ kind: "redirect", location: "/vert", clearCookie: false });
    expect(decide({ pathname: "/login", search: "?next=%2From", session: as("host") })).toMatchObject({ location: "/vert" });
    expect(decide({ pathname: "/login", search: "?next=%2Fvert%2Fmeldinger", session: as("host") })).toMatchObject({ location: "/vert/meldinger" });
    expect(decide({ pathname: "/", search: "", session: as("host") })).toEqual({ kind: "redirect", location: "/vert", clearCookie: false });
  });

  it("opens its own pages and the shared auth API", () => {
    for (const pathname of ["/vert", "/vert/meldinger", "/vert/bookinger", "/vert/drift", "/api/auth/session"]) {
      expect(decide({ pathname, search: "", session: as("host") }).kind, pathname).toBe("next");
    }
  });

  it("gets the 403 page for every hotel, robot, reception and admin screen, and 403 JSON for their APIs", () => {
    for (const pathname of ["/rom", "/gjester", "/resepsjon", "/hotell", "/natteskift", "/oyne", "/stemme", "/vedlikehold", "/lager", "/ansatte", "/ruter", "/foresporsler"]) {
      expect(decide({ pathname, search: "", session: as("host") }), pathname).toEqual({ kind: "forbidden", api: false });
    }
    for (const pathname of ["/api/reception/calls", "/api/identify", "/api/voice/token", "/api/scene"]) {
      expect(decide({ pathname, search: "", session: as("host") }), pathname).toEqual({ kind: "forbidden", api: true });
    }
  });

  it("leaves the hotel roles' front page alone, and lets an admin open /vert", () => {
    expect(decide({ pathname: "/", search: "", session: as("robot") }).kind).toBe("next");
    expect(decide({ pathname: "/vert", search: "", session: as("admin") }).kind).toBe("next");
    expect(decide({ pathname: "/vert", search: "", session: as("receptionist") })).toEqual({ kind: "forbidden", api: false });
  });
});

describe("safeNext", () => {
  it("keeps same-origin relative paths with their query and hash", () => {
    expect(safeNext("/ruter")).toBe("/ruter");
    expect(safeNext("/ruter?fra=lobby#kart")).toBe("/ruter?fra=lobby#kart");
  });

  it("falls back to / for anything that could leave the site or loop", () => {
    for (const bad of [
      undefined,
      null,
      "",
      "ruter",
      "//evil.example",
      "/\\evil.example",
      "\\\\evil.example",
      "https://evil.example",
      "javascript:alert(1)",
      " /ruter",
      "/\t/evil.example",
      "/ruter\n",
      "/login",
      "/login?next=/hotell",
      "/api/identify",
      `/${"a".repeat(600)}`,
      42,
    ]) {
      expect(safeNext(bad)).toBe("/");
    }
  });
});
