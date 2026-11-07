// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "./password";
import { resolveSession } from "./resolve";
import { newSession, signSession, withView } from "./session";

// Made-up test values, never real ones.
const SECRET = "test-secret-0123456789-abcdefghijklmnopqrstuvwxyz";
const NOW = Date.UTC(2026, 10, 7, 20, 0, 0);
let env: Record<string, string> = {};

beforeAll(async () => {
  const hash = await hashPassword("test-password", { N: 1024, r: 8, p: 1 });
  env = {
    LOBBY_AUTH_SECRET: SECRET,
    LOBBY_USERS: JSON.stringify([
      { u: "hamad", name: "Hamad", role: "admin", hash },
      { u: "resepsjon", name: "Resepsjonist", role: "receptionist", hash },
    ]),
  };
});

describe("resolveSession", () => {
  it("turns a valid cookie into the user, the view and the effective role", () => {
    const token = signSession(newSession("resepsjon", "receptionist", NOW), SECRET);
    expect(resolveSession(token, env, NOW)).toEqual({
      user: { u: "resepsjon", name: "Resepsjonist", role: "receptionist" },
      view: "receptionist",
      effectiveRole: "receptionist",
      exp: NOW / 1000 + 12 * 3600,
    });
  });

  it("judges an admin viewing as the receptionist as the receptionist", () => {
    const token = signSession(withView(newSession("hamad", "admin", NOW), "receptionist")!, SECRET);
    expect(resolveSession(token, env, NOW)).toMatchObject({ user: { role: "admin" }, view: "receptionist", effectiveRole: "receptionist" });
  });

  it("logs out a user who was removed from LOBBY_USERS, or whose role changed there", () => {
    expect(resolveSession(signSession(newSession("robot", "robot", NOW), SECRET), env, NOW)).toBeNull();
    expect(resolveSession(signSession(newSession("resepsjon", "admin", NOW), SECRET), env, NOW)).toBeNull();
  });

  it("logs everybody out when the configuration is missing (fail closed)", () => {
    const token = signSession(newSession("hamad", "admin", NOW), SECRET);
    expect(resolveSession(token, {}, NOW)).toBeNull();
    expect(resolveSession(token, { LOBBY_AUTH_SECRET: SECRET }, NOW)).toBeNull();
    expect(resolveSession(token, { LOBBY_USERS: env.LOBBY_USERS }, NOW)).toBeNull();
  });

  it("returns null without a cookie", () => {
    expect(resolveSession(undefined, env, NOW)).toBeNull();
  });
});
