// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { handleLogin, handleLogout, handleSession, handleView } from "./handlers";
import { hashPassword } from "./password";
import { createLoginLimiter } from "./rateLimit";
import { SESSION_COOKIE, newSession, signSession, verifySession } from "./session";

// Made-up test values, never real ones.
const SECRET = "test-secret-0123456789-abcdefghijklmnopqrstuvwxyz";
const PASSWORD = "test-password";
const ORIGIN = "http://localhost:3104";
let env: Record<string, string> = {};

beforeAll(async () => {
  const hash = await hashPassword(PASSWORD, { N: 1024, r: 8, p: 1 });
  env = {
    LOBBY_AUTH_SECRET: SECRET,
    LOBBY_USERS: JSON.stringify([
      { u: "hamad", name: "Hamad", role: "admin", hash },
      { u: "resepsjon", name: "Resepsjonist", role: "receptionist", hash },
      { u: "robot", name: "Robotansvarlig", role: "robot", hash },
      { u: "vert", name: "Ingrid Berge", role: "host", hash },
    ]),
  };
});

afterEach(() => vi.restoreAllMocks());

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, host: "localhost:3104", "x-real-ip": "10.0.0.1", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function deps() {
  return { env, limiter: createLoginLimiter() };
}

function cookieFrom(response: Response): string | undefined {
  const header = response.headers.get("set-cookie") ?? "";
  const match = header.match(new RegExp(`${SESSION_COOKIE}=([^;]*)`));
  return match?.[1];
}

describe("POST /api/auth/login", () => {
  it("logs in with the right password, case-insensitive username, and sets a signed HttpOnly cookie", async () => {
    const response = await handleLogin(post("/api/auth/login", { username: "Hamad", password: PASSWORD }), deps());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.session).toMatchObject({ user: { u: "hamad", name: "Hamad", role: "admin" }, view: "admin", effectiveRole: "admin" });
    expect(body.next).toBe("/overlevering"); // the pilot accounts land on the one page (round 5)
    const header = response.headers.get("set-cookie") ?? "";
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/SameSite=lax/i);
    expect(header).toMatch(/Path=\//);
    expect(header).toMatch(/Max-Age=43200/);
    expect(verifySession(decodeURIComponent(cookieFrom(response)!), SECRET)).toMatchObject({ u: "hamad", role: "admin" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("answers a wrong password and an unknown user with the same generic 401", async () => {
    const wrong = await handleLogin(post("/api/auth/login", { username: "hamad", password: "nope" }), deps());
    const unknown = await handleLogin(post("/api/auth/login", { username: "ghost", password: PASSWORD }), deps());
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrong.json()).toEqual({ error: "Feil brukernavn eller passord." });
    expect(await unknown.json()).toEqual({ error: "Feil brukernavn eller passord." });
    expect(wrong.headers.get("set-cookie")).toBeNull();
  });

  it("checks an unknown user against the dummy hash, so it costs the same scrypt run", async () => {
    const password = await import("./password");
    const spy = vi.spyOn(password, "verifyPassword");
    await handleLogin(post("/api/auth/login", { username: "ghost", password: PASSWORD }), deps());
    expect(spy).toHaveBeenCalledWith(PASSWORD, password.DUMMY_HASH);
  });

  it("validates the body at the boundary: username letters only, password 1–128 characters", async () => {
    for (const body of [
      { username: "hamad' OR 1=1 --", password: PASSWORD },
      { username: "h", password: PASSWORD },
      { username: "hamad", password: "" },
      { username: "hamad", password: "x".repeat(129) },
      { username: ["hamad"], password: PASSWORD },
      {},
    ]) {
      const response = await handleLogin(post("/api/auth/login", body), deps());
      expect(response.status).toBe(400);
    }
    expect((await handleLogin(post("/api/auth/login", "{not json"), deps())).status).toBe(400);
  });

  it("refuses bodies that aren't JSON or are too large", async () => {
    const text = post("/api/auth/login", { username: "hamad", password: PASSWORD }, { "content-type": "text/plain" });
    expect((await handleLogin(text, deps())).status).toBe(415);
    const big = post("/api/auth/login", { username: "hamad", password: PASSWORD, pad: "x".repeat(10_000) });
    expect((await handleLogin(big, deps())).status).toBe(413);
  });

  it("refuses a login posted from another site (login CSRF)", async () => {
    const response = await handleLogin(
      post("/api/auth/login", { username: "hamad", password: PASSWORD }, { origin: "https://evil.example" }),
      deps(),
    );
    expect(response.status).toBe(403);
    const fetchSite = await handleLogin(
      post("/api/auth/login", { username: "hamad", password: PASSWORD }, { "sec-fetch-site": "cross-site" }),
      deps(),
    );
    expect(fetchSite.status).toBe(403);
  });

  it("blocks the sixth failed try in 5 minutes with 429 and Retry-After, even with the right password", async () => {
    const d = deps();
    for (let i = 0; i < 5; i++) {
      expect((await handleLogin(post("/api/auth/login", { username: "hamad", password: "nope" }), d)).status).toBe(401);
    }
    const blocked = await handleLogin(post("/api/auth/login", { username: "hamad", password: PASSWORD }), d);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await blocked.json()).error).toMatch(/For mange forsøk/);
    // Another IP is not blocked by this one.
    const other = await handleLogin(post("/api/auth/login", { username: "hamad", password: PASSWORD }, { "x-real-ip": "10.0.0.2" }), d);
    expect(other.status).toBe(200);
  });

  it("fails closed when the configuration is missing: 503, nobody logs in, the log names the variable only", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await handleLogin(post("/api/auth/login", { username: "hamad", password: PASSWORD }), {
      env: { LOBBY_USERS: env.LOBBY_USERS },
      limiter: createLoginLimiter(),
    });
    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
    const logged = log.mock.calls.flat().join(" ");
    expect(logged).toContain("LOBBY_AUTH_SECRET");
    expect(logged).not.toContain("scrypt$");
  });

  it("sends the user on to a safe next the role may open, otherwise home", async () => {
    const ok = await handleLogin(post("/api/auth/login", { username: "robot", password: PASSWORD, next: "/hotell?etasje=3" }), deps());
    expect((await ok.json()).next).toBe("/hotell?etasje=3");
    const wrongRole = await handleLogin(post("/api/auth/login", { username: "resepsjon", password: PASSWORD, next: "/hotell" }), deps());
    expect((await wrongRole.json()).next).toBe("/");
    const offsite = await handleLogin(post("/api/auth/login", { username: "hamad", password: PASSWORD, next: "//evil.example" }), deps());
    expect((await offsite.json()).next).toBe("/overlevering");
    const oversikt = await handleLogin(post("/api/auth/login", { username: "hamad", password: PASSWORD, next: "/foresporsler" }), deps());
    expect((await oversikt.json()).next).toBe("/foresporsler");
  });

  it("sends the host to their own app, never to the hotel's front page", async () => {
    const home = await handleLogin(post("/api/auth/login", { username: "vert", password: PASSWORD }), deps());
    expect(await home.json()).toMatchObject({ session: { user: { u: "vert", role: "host" }, view: "host" }, next: "/vert" });
    const hotel = await handleLogin(post("/api/auth/login", { username: "vert", password: PASSWORD, next: "/rom" }), deps());
    expect((await hotel.json()).next).toBe("/vert");
    const own = await handleLogin(post("/api/auth/login", { username: "vert", password: PASSWORD, next: "/vert/meldinger" }), deps());
    expect((await own.json()).next).toBe("/vert/meldinger");
  });
});

describe("POST /api/auth/logout", () => {
  it("clears the cookie", async () => {
    const response = await handleLogout(post("/api/auth/logout", {}));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toMatch(new RegExp(`${SESSION_COOKIE}=;.*Max-Age=0`, "i"));
  });

  it("refuses a logout posted from another site", async () => {
    expect((await handleLogout(post("/api/auth/logout", {}, { origin: "https://evil.example" }))).status).toBe(403);
  });
});

function withCookie(token: string, path = "/api/auth/session", method = "GET", body?: unknown) {
  return new NextRequest(`${ORIGIN}${path}`, {
    method,
    headers: { cookie: `${SESSION_COOKIE}=${token}`, origin: ORIGIN, host: "localhost:3104", "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("GET /api/auth/session", () => {
  it("returns the session for a valid cookie", async () => {
    const response = await handleSession(withCookie(signSession(newSession("robot", "robot"), SECRET)), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ session: { user: { u: "robot", role: "robot" }, effectiveRole: "robot" } });
  });

  it("answers 401 for a missing or tampered cookie", async () => {
    expect((await handleSession(new NextRequest(`${ORIGIN}/api/auth/session`), env)).status).toBe(401);
    const token = signSession(newSession("robot", "robot"), SECRET);
    expect((await handleSession(withCookie(`${token}x`), env)).status).toBe(401);
  });
});

describe("POST /api/auth/view", () => {
  it("lets an admin view as the receptionist, re-signing the cookie, and back", async () => {
    const admin = signSession(newSession("hamad", "admin"), SECRET);
    const response = await handleView(withCookie(admin, "/api/auth/view", "POST", { view: "receptionist" }), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ session: { user: { role: "admin" }, view: "receptionist", effectiveRole: "receptionist" } });
    const token = decodeURIComponent(cookieFrom(response)!);
    expect(verifySession(token, SECRET)).toMatchObject({ role: "admin", view: "receptionist" });
    const back = await handleView(withCookie(token, "/api/auth/view", "POST", { view: "admin" }), env);
    expect(await back.json()).toMatchObject({ session: { view: "admin", effectiveRole: "admin" } });
  });

  it("refuses non-admins with 403", async () => {
    const token = signSession(newSession("resepsjon", "receptionist"), SECRET);
    const response = await handleView(withCookie(token, "/api/auth/view", "POST", { view: "admin" }), env);
    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("refuses the host a view switch (403), and keeps the host out of the admin's views (400)", async () => {
    const host = signSession(newSession("vert", "host"), SECRET);
    const response = await handleView(withCookie(host, "/api/auth/view", "POST", { view: "admin" }), env);
    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
    const admin = signSession(newSession("hamad", "admin"), SECRET);
    expect((await handleView(withCookie(admin, "/api/auth/view", "POST", { view: "host" }), env)).status).toBe(400);
  });

  it("refuses unknown views with 400 and no session with 401", async () => {
    const admin = signSession(newSession("hamad", "admin"), SECRET);
    expect((await handleView(withCookie(admin, "/api/auth/view", "POST", { view: "root" }), env)).status).toBe(400);
    const noCookie = new NextRequest(`${ORIGIN}/api/auth/view`, {
      method: "POST",
      headers: { origin: ORIGIN, host: "localhost:3104", "content-type": "application/json" },
      body: JSON.stringify({ view: "robot" }),
    });
    expect((await handleView(noCookie, env)).status).toBe(401);
  });

  it("refuses a view switch posted from another site", async () => {
    const admin = signSession(newSession("hamad", "admin"), SECRET);
    const request = new NextRequest(`${ORIGIN}/api/auth/view`, {
      method: "POST",
      headers: { cookie: `${SESSION_COOKIE}=${admin}`, origin: "https://evil.example", host: "localhost:3104", "content-type": "application/json" },
      body: JSON.stringify({ view: "robot" }),
    });
    expect((await handleView(request, env)).status).toBe(403);
  });
});
