// @vitest-environment node
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { hashPassword } from "./password";
import { SESSION_COOKIE, newSession, signSession, withView } from "./session";

vi.mock("server-only", () => ({}));
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined) }),
}));

import { effectiveRole, getSession } from "./server";

// Made-up test secret, never a real one.
const SECRET = "test-secret-0123456789-abcdefghijklmnopqrstuvwxyz";

beforeAll(async () => {
  const hash = await hashPassword("test-password", { N: 1024, r: 8, p: 1 });
  vi.stubEnv("LOBBY_AUTH_SECRET", SECRET);
  vi.stubEnv("LOBBY_USERS", JSON.stringify([{ u: "hamad", name: "Hamad", role: "admin", hash }]));
});

afterEach(() => jar.clear());

describe("getSession / effectiveRole", () => {
  it("read the session from the request's cookie", async () => {
    jar.set(SESSION_COOKIE, signSession(withView(newSession("hamad", "admin"), "robot")!, SECRET));
    expect(await getSession()).toMatchObject({ user: { u: "hamad", name: "Hamad", role: "admin" }, view: "robot" });
    expect(await effectiveRole()).toBe("robot");
  });

  it("return null when there is no valid cookie", async () => {
    expect(await getSession()).toBeNull();
    expect(await effectiveRole()).toBeNull();
    jar.set(SESSION_COOKIE, "forged.token");
    expect(await getSession()).toBeNull();
  });
});
