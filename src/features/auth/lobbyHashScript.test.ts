// @vitest-environment node
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { authConfig } from "./config";
import { verifyPassword } from "./password";

// scripts/lobby-hash.mjs writes what the server reads: it must stay in step with password.ts and config.ts.
const SCRIPT = fileURLToPath(new URL("../../../scripts/lobby-hash.mjs", import.meta.url));
const run = (...args: string[]) => execFileSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" }).trim();

describe("scripts/lobby-hash.mjs", () => {
  it("prints a hash of the password that verifyPassword accepts", async () => {
    const hash = run("test-password");
    expect(hash).toMatch(/^scrypt\$131072\$8\$1\$/);
    expect(await verifyPassword("test-password", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("--users prints a LOBBY_USERS line with the four accounts, each salted on its own", async () => {
    const line = run("--users", "test-password");
    expect(line).toMatch(/^LOBBY_USERS=[A-Za-z0-9_-]+$/);
    const config = authConfig({ LOBBY_AUTH_SECRET: "x".repeat(43), LOBBY_USERS: line.slice("LOBBY_USERS=".length) });
    expect(config.ok).toBe(true);
    if (!config.ok) return;
    expect([...config.users.values()].map(({ u, name, role }) => ({ u, name, role }))).toEqual([
      { u: "hamad", name: "Hamad", role: "admin" },
      { u: "shiraz", name: "Shiraz", role: "admin" },
      { u: "resepsjon", name: "Resepsjonist", role: "receptionist" },
      { u: "robot", name: "Robotansvarlig", role: "robot" },
    ]);
    const hashes = [...config.users.values()].map((user) => user.hash);
    expect(new Set(hashes).size).toBe(4);
    expect(await verifyPassword("test-password", hashes[2]!)).toBe(true);
  }, 20_000);

  it("--secret prints 32 random bytes in base64url", () => {
    const line = run("--secret");
    expect(line).toMatch(/^LOBBY_AUTH_SECRET=[A-Za-z0-9_-]{43}$/);
    expect(run("--secret")).not.toBe(line);
  });

  it("refuses to run without a password", () => {
    expect(() => execFileSync(process.execPath, [SCRIPT], { encoding: "utf8", stdio: "pipe" })).toThrow();
  });
});
