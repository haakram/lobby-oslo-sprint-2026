// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword } from "@/features/auth/password";
import { SESSION_COOKIE, newSession, signSession } from "@/features/auth/session";
import { PAID_ROUTE_LIMITS, RATE_LIMITED_COPY, limitPaidRoute, resetPaidRouteLimits } from "./paidRouteLimit";

// Made-up test values, never real ones.
const SECRET = "test-secret-0123456789-abcdefghijklmnopqrstuvwxyz";
let users = "";

beforeAll(async () => {
  const hash = await hashPassword("test-password", { N: 1024, r: 8, p: 1 });
  users = JSON.stringify([
    { u: "robot", name: "Robotansvarlig", role: "robot", hash },
    { u: "jury", name: "Jury", role: "admin", hash },
  ]);
});

beforeEach(() => {
  vi.stubEnv("LOBBY_AUTH_SECRET", SECRET);
  vi.stubEnv("LOBBY_USERS", users);
  resetPaidRouteLimits();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const as = (u: string, role: "robot" | "admin") =>
  new Request("http://localhost/api/identify", {
    method: "POST",
    headers: { cookie: `theme=dark; ${SESSION_COOKIE}=${signSession(newSession(u, role), SECRET)}` },
  });

const T0 = Date.UTC(2026, 10, 8, 1, 0, 0);

describe("limitPaidRoute", () => {
  it("lets a user make the per-minute number of calls, then answers 429 with Retry-After", async () => {
    const max = PAID_ROUTE_LIMITS.identify[0]!.max;
    for (let i = 0; i < max; i++) expect(limitPaidRoute("identify", as("robot", "robot"), T0 + i)).toBeNull();
    const blocked = limitPaidRoute("identify", as("robot", "robot"), T0 + max);
    expect(blocked?.status).toBe(429);
    expect(Number(blocked?.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(Number(blocked?.headers.get("retry-after"))).toBeLessThanOrEqual(60);
    expect(blocked?.headers.get("cache-control")).toContain("no-store");
    expect(await blocked?.json()).toEqual({ error: RATE_LIMITED_COPY, code: "rate_limited" });
  });

  it("counts per user: one user's loop does not block another", () => {
    const max = PAID_ROUTE_LIMITS.scene[0]!.max;
    for (let i = 0; i < max; i++) limitPaidRoute("scene", as("jury", "admin"), T0);
    expect(limitPaidRoute("scene", as("jury", "admin"), T0)?.status).toBe(429);
    expect(limitPaidRoute("scene", as("robot", "robot"), T0)).toBeNull();
  });

  it("counts per route: a spent identify limit leaves the scene scan alone", () => {
    for (let i = 0; i < PAID_ROUTE_LIMITS.identify[0]!.max; i++) limitPaidRoute("identify", as("robot", "robot"), T0);
    expect(limitPaidRoute("identify", as("robot", "robot"), T0)?.status).toBe(429);
    expect(limitPaidRoute("scene", as("robot", "robot"), T0)).toBeNull();
  });

  it("opens again once the minute is over", () => {
    const max = PAID_ROUTE_LIMITS["voice-token"][0]!.max;
    for (let i = 0; i < max; i++) limitPaidRoute("voice-token", as("robot", "robot"), T0);
    expect(limitPaidRoute("voice-token", as("robot", "robot"), T0)?.status).toBe(429);
    expect(limitPaidRoute("voice-token", as("robot", "robot"), T0 + 60_000)).toBeNull();
  });

  it("caps the hour too: a loop paced under the minute limit still stops", () => {
    const [minute, hour] = PAID_ROUTE_LIMITS["reception-token"];
    const spacing = Math.ceil(60_000 / minute!.max) + 1;
    let allowed = 0;
    for (let i = 0; i < hour!.max + 5; i++) {
      if (limitPaidRoute("reception-token", as("jury", "admin"), T0 + i * spacing) === null) allowed += 1;
    }
    expect(allowed).toBe(hour!.max);
  });

  it("keys a request without a session on the client's IP (only if the proxy were bypassed)", () => {
    const fromIp = (ip: string) => new Request("http://localhost/api/scene", { headers: { "x-real-ip": ip } });
    for (let i = 0; i < PAID_ROUTE_LIMITS.scene[0]!.max; i++) limitPaidRoute("scene", fromIp("10.0.0.1"), T0);
    expect(limitPaidRoute("scene", fromIp("10.0.0.1"), T0)?.status).toBe(429);
    expect(limitPaidRoute("scene", fromIp("10.0.0.2"), T0)).toBeNull();
  });

  it("does not trust a forged cookie as a user: it falls back to the IP", () => {
    const forged = new Request("http://localhost/api/identify", {
      headers: { cookie: `${SESSION_COOKIE}=${signSession(newSession("robot", "robot"), "x".repeat(48))}`, "x-real-ip": "10.0.0.9" },
    });
    for (let i = 0; i < PAID_ROUTE_LIMITS.identify[0]!.max; i++) limitPaidRoute("identify", forged, T0);
    // The real robot user is untouched by the forger's calls.
    expect(limitPaidRoute("identify", as("robot", "robot"), T0)).toBeNull();
  });
});
