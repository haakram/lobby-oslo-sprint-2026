// @vitest-environment node
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { hashPassword } from "@/features/auth/password";
import { SESSION_COOKIE, newSession, signSession, withView } from "@/features/auth/session";
import { config, proxy } from "./proxy";

// Made-up test secret, never a real one.
const SECRET = "test-secret-0123456789-abcdefghijklmnopqrstuvwxyz";
const BASE = "http://localhost:3104";

beforeAll(async () => {
  const hash = await hashPassword("test-password", { N: 1024, r: 8, p: 1 });
  vi.stubEnv("LOBBY_AUTH_SECRET", SECRET);
  vi.stubEnv(
    "LOBBY_USERS",
    JSON.stringify([
      { u: "hamad", name: "Hamad", role: "admin", hash },
      { u: "resepsjon", name: "Resepsjonist", role: "receptionist", hash },
      { u: "robot", name: "Robotansvarlig", role: "robot", hash },
    ]),
  );
});

afterAll(() => vi.unstubAllEnvs());

function request(path: string, token?: string) {
  return new NextRequest(`${BASE}${path}`, { headers: token ? { cookie: `${SESSION_COOKIE}=${token}` } : {} });
}

const token = (u: string, role: "admin" | "receptionist" | "robot") => signSession(newSession(u, role), SECRET);

describe("proxy", () => {
  it("redirects a logged-out page request to /login with next", () => {
    const response = proxy(request("/hotell?etasje=2"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${BASE}/login?next=%2Fhotell%3Fetasje%3D2`);
  });

  it("answers a logged-out API request with 401 JSON", async () => {
    const response = proxy(request("/api/identify"));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Ikke innlogget." });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("lets the right role through", () => {
    expect(proxy(request("/resepsjon", token("resepsjon", "receptionist"))).headers.get("x-middleware-next")).toBe("1");
    expect(proxy(request("/hotell", token("robot", "robot"))).headers.get("x-middleware-next")).toBe("1");
    expect(proxy(request("/login", undefined)).headers.get("x-middleware-next")).toBe("1");
  });

  it("shows the wrong role the 403 page, with status 403", () => {
    const response = proxy(request("/hotell", token("resepsjon", "receptionist")));
    expect(response.status).toBe(403);
    expect(response.headers.get("x-middleware-rewrite")).toBe(`${BASE}/login/ingen-tilgang`);
  });

  it("answers the wrong role on an API with 403 JSON", async () => {
    const response = proxy(request("/api/reception/calls", token("robot", "robot")));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Ingen tilgang." });
  });

  it("judges an admin by the view they switched to", () => {
    const asReceptionist = signSession(withView(newSession("hamad", "admin"), "receptionist")!, SECRET);
    expect(proxy(request("/oyne", asReceptionist)).status).toBe(403);
    expect(proxy(request("/oyne", token("hamad", "admin"))).headers.get("x-middleware-next")).toBe("1");
  });

  it("logs out a tampered cookie and clears it", () => {
    const response = proxy(request("/", `${token("resepsjon", "receptionist")}x`));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${BASE}/login`);
    expect(response.headers.get("set-cookie")).toMatch(new RegExp(`${SESSION_COOKIE}=;`));
  });

  it("fails closed without configuration: a once-valid cookie no longer opens anything", () => {
    const valid = token("hamad", "admin");
    vi.stubEnv("LOBBY_AUTH_SECRET", "");
    try {
      expect(proxy(request("/", valid)).status).toBe(307);
      expect(proxy(request("/api/scene", valid)).status).toBe(401);
    } finally {
      vi.stubEnv("LOBBY_AUTH_SECRET", SECRET);
    }
  });

  it("runs on everything except Next's static files, image optimiser and the favicon", () => {
    expect(config.matcher).toEqual(["/((?!_next/static|_next/image|favicon.ico).*)"]);
  });
});
