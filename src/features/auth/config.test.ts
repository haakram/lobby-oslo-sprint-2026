// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { authConfig } from "./config";
import { hashPassword } from "./password";

// Made-up test secret, never a real one.
const SECRET = "test-secret-0123456789-abcdefghijklmnopqrstuvwxyz";
let HASH = "";

beforeAll(async () => {
  HASH = await hashPassword("test-password", { N: 1024, r: 8, p: 1 });
});

function users(list: object[]): string {
  return JSON.stringify(list);
}

function problemsOf(env: Record<string, string | undefined>): string[] {
  const config = authConfig(env);
  expect(config.ok).toBe(false);
  return config.ok ? [] : config.problems;
}

describe("authConfig", () => {
  it("reads the users from a JSON array and keys them by lower-case username", () => {
    const config = authConfig({
      LOBBY_AUTH_SECRET: SECRET,
      LOBBY_USERS: users([
        { u: "Hamad", name: "Hamad", role: "admin", hash: HASH },
        { u: "resepsjon", name: "Resepsjonist", role: "receptionist", hash: HASH },
      ]),
    });
    expect(config.ok).toBe(true);
    if (!config.ok) return;
    expect(config.secret).toBe(SECRET);
    expect(config.users.get("hamad")).toEqual({ u: "hamad", name: "Hamad", role: "admin", hash: HASH });
    expect(config.users.get("resepsjon")?.role).toBe("receptionist");
    expect(config.users.size).toBe(2);
  });

  it("also reads the base64url form that survives .env files ($ signs intact)", () => {
    const raw = users([{ u: "robot", name: "Robotansvarlig", role: "robot", hash: HASH }]);
    const config = authConfig({ LOBBY_AUTH_SECRET: SECRET, LOBBY_USERS: Buffer.from(raw).toString("base64url") });
    expect(config.ok && config.users.get("robot")?.hash).toBe(HASH);
  });

  it("fails closed without a secret, naming the variable but never a value", () => {
    const problems = problemsOf({ LOBBY_USERS: users([{ u: "hamad", name: "Hamad", role: "admin", hash: HASH }]) });
    expect(problems.join(" ")).toContain("LOBBY_AUTH_SECRET");
    expect(problems.join(" ")).not.toContain(HASH);
  });

  it("fails closed with a short secret (under 32 random bytes)", () => {
    const problems = problemsOf({
      LOBBY_AUTH_SECRET: "short-secret",
      LOBBY_USERS: users([{ u: "hamad", name: "Hamad", role: "admin", hash: HASH }]),
    });
    expect(problems.join(" ")).toContain("LOBBY_AUTH_SECRET");
    expect(problems.join(" ")).not.toContain("short-secret");
  });

  it("fails closed without users, or with users that aren't JSON", () => {
    expect(problemsOf({ LOBBY_AUTH_SECRET: SECRET }).join(" ")).toContain("LOBBY_USERS");
    expect(problemsOf({ LOBBY_AUTH_SECRET: SECRET, LOBBY_USERS: "[{not json" }).join(" ")).toContain("LOBBY_USERS");
    expect(problemsOf({ LOBBY_AUTH_SECRET: SECRET, LOBBY_USERS: "[]" }).join(" ")).toContain("LOBBY_USERS");
  });

  it("explains a hash whose $ signs a .env loader expanded away", () => {
    const problems = problemsOf({
      LOBBY_AUTH_SECRET: SECRET,
      LOBBY_USERS: users([{ u: "hamad", name: "Hamad", role: "admin", hash: "scrypt31072" }]),
    });
    expect(problems.join(" ")).toMatch(/hash/);
    expect(problems.join(" ")).toMatch(/base64/);
  });

  it("refuses unknown roles, bad usernames and duplicates", () => {
    const base = { LOBBY_AUTH_SECRET: SECRET };
    problemsOf({ ...base, LOBBY_USERS: users([{ u: "hamad", name: "Hamad", role: "root", hash: HASH }]) });
    problemsOf({ ...base, LOBBY_USERS: users([{ u: "ha mad", name: "Hamad", role: "admin", hash: HASH }]) });
    problemsOf({
      ...base,
      LOBBY_USERS: users([
        { u: "hamad", name: "Hamad", role: "admin", hash: HASH },
        { u: "HAMAD", name: "Hamad 2", role: "robot", hash: HASH },
      ]),
    });
  });
});
