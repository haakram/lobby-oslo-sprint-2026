// @vitest-environment node
import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  newSession,
  sessionCookieOptions,
  signSession,
  verifySession,
  withView,
} from "./session";

// Made-up test secrets, never real ones.
const SECRET = "test-secret-0123456789-abcdefghijklmnopqrstuvwxyz";
const OTHER = "another-test-secret-0123456789-abcdefghijklmnopq";
const NOW = Date.UTC(2026, 10, 7, 20, 0, 0);

function b64(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

describe("newSession", () => {
  it("starts in the user's own view and lasts 12 hours", () => {
    const s = newSession("hamad", "admin", NOW);
    expect(s).toEqual({ u: "hamad", role: "admin", view: "admin", exp: NOW / 1000 + 12 * 3600 });
    expect(SESSION_TTL_SECONDS).toBe(12 * 3600);
  });
});

describe("signSession / verifySession", () => {
  it("round-trips a signed session", () => {
    const s = newSession("resepsjon", "receptionist", NOW);
    expect(verifySession(signSession(s, SECRET), SECRET, NOW)).toEqual(s);
  });

  it("refuses a payload changed after signing (a receptionist making itself admin)", () => {
    const token = signSession(newSession("resepsjon", "receptionist", NOW), SECRET);
    const [, sig] = token.split(".");
    const forged = `${b64({ u: "resepsjon", role: "admin", view: "admin", exp: NOW / 1000 + 3600 })}.${sig}`;
    expect(verifySession(forged, SECRET, NOW)).toBeNull();
  });

  it("refuses a changed signature", () => {
    const token = signSession(newSession("hamad", "admin", NOW), SECRET);
    const last = token.at(-1) === "A" ? "B" : "A";
    expect(verifySession(token.slice(0, -1) + last, SECRET, NOW)).toBeNull();
  });

  it("refuses a session signed with another secret", () => {
    expect(verifySession(signSession(newSession("hamad", "admin", NOW), OTHER), SECRET, NOW)).toBeNull();
  });

  it("refuses an expired session, and one at the exact second it expires", () => {
    const s = newSession("robot", "robot", NOW);
    const token = signSession(s, SECRET);
    expect(verifySession(token, SECRET, NOW + SESSION_TTL_SECONDS * 1000 - 1000)).toEqual(s);
    expect(verifySession(token, SECRET, NOW + SESSION_TTL_SECONDS * 1000)).toBeNull();
    expect(verifySession(token, SECRET, NOW + SESSION_TTL_SECONDS * 1000 + 1)).toBeNull();
  });

  it("refuses a correctly signed session where a non-admin views as another role", () => {
    const payload = b64({ u: "resepsjon", role: "receptionist", view: "robot", exp: NOW / 1000 + 3600 });
    const sig = createHmac("sha256", SECRET).update(payload).digest("base64url");
    expect(verifySession(`${payload}.${sig}`, SECRET, NOW)).toBeNull();
  });

  it("refuses a correctly signed session with unknown fields' values", () => {
    for (const bad of [
      { u: "hamad", role: "root", view: "root", exp: NOW / 1000 + 3600 },
      { u: "<script>", role: "admin", view: "admin", exp: NOW / 1000 + 3600 },
      { u: "hamad", role: "admin", view: "admin", exp: "never" },
      { u: "hamad", role: "admin", view: "admin" },
    ]) {
      const payload = b64(bad);
      const sig = createHmac("sha256", SECRET).update(payload).digest("base64url");
      expect(verifySession(`${payload}.${sig}`, SECRET, NOW)).toBeNull();
    }
  });

  it("refuses garbage without throwing", () => {
    for (const bad of [undefined, "", ".", "a.b", "a.b.c", "x".repeat(5000), "%%%.%%%", `${b64({})}.`]) {
      expect(verifySession(bad, SECRET, NOW)).toBeNull();
    }
  });

  it("refuses to sign or verify with a missing secret", () => {
    expect(() => signSession(newSession("hamad", "admin", NOW), "")).toThrow();
    expect(verifySession(signSession(newSession("hamad", "admin", NOW), SECRET), "", NOW)).toBeNull();
  });
});

describe("withView", () => {
  it("lets an admin view as the receptionist or the robot manager and back, keeping the expiry", () => {
    const admin = newSession("hamad", "admin", NOW);
    expect(withView(admin, "receptionist")).toEqual({ ...admin, view: "receptionist" });
    expect(withView(admin, "robot")).toEqual({ ...admin, view: "robot" });
    expect(withView({ ...admin, view: "robot" }, "admin")).toEqual(admin);
  });

  it("refuses non-admins and unknown views", () => {
    expect(withView(newSession("resepsjon", "receptionist", NOW), "admin")).toBeNull();
    expect(withView(newSession("robot", "robot", NOW), "receptionist")).toBeNull();
    expect(withView(newSession("hamad", "admin", NOW), "guest")).toBeNull();
    expect(withView(newSession("hamad", "admin", NOW), undefined)).toBeNull();
  });
});

describe("sessionCookieOptions", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is HttpOnly, SameSite=Lax, Path=/ and lasts 12 hours", () => {
    expect(sessionCookieOptions()).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 12 * 3600 });
    expect(SESSION_COOKIE).toBe("lobby_session");
  });

  it("is Secure in production only", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(sessionCookieOptions().secure).toBe(true);
    vi.stubEnv("NODE_ENV", "development");
    expect(sessionCookieOptions().secure).toBe(false);
  });

  it("can expire the cookie at once (logout)", () => {
    expect(sessionCookieOptions(0).maxAge).toBe(0);
  });
});
