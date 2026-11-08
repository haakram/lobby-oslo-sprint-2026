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

  it("--users prints a LOBBY_USERS line with the five accounts, each salted on its own", async () => {
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
      { u: "vert", name: "Ingrid Berge", role: "host" },
    ]);
    const hashes = [...config.users.values()].map((user) => user.hash);
    expect(new Set(hashes).size).toBe(5);
    expect(await verifyPassword("test-password", hashes[2]!)).toBe(true);
  }, 20_000);

  it("--users with a second password adds the jury's own admin account, which the team's password does not open", async () => {
    const line = execFileSync(process.execPath, [SCRIPT, "--users", "-"], {
      encoding: "utf8",
      input: "team-password\njury-password\n",
    }).trim();
    const config = authConfig({ LOBBY_AUTH_SECRET: "x".repeat(43), LOBBY_USERS: line.slice("LOBBY_USERS=".length) });
    expect(config.ok).toBe(true);
    if (!config.ok) return;
    expect(config.users.size).toBe(6);
    const jury = config.users.get("jury");
    expect(jury && { u: jury.u, name: jury.name, role: jury.role }).toEqual({ u: "jury", name: "Jury", role: "admin" });
    expect(await verifyPassword("jury-password", jury!.hash)).toBe(true);
    expect(await verifyPassword("team-password", jury!.hash)).toBe(false);
    expect(await verifyPassword("jury-password", config.users.get("hamad")!.hash)).toBe(false);
  }, 30_000);

  it("refuses a jury password that is the team's", () => {
    expect(() =>
      execFileSync(process.execPath, [SCRIPT, "--users", "same-password", "same-password"], { encoding: "utf8", stdio: "pipe" }),
    ).toThrow();
  });

  it("--secret prints 32 random bytes in base64url", () => {
    const line = run("--secret");
    expect(line).toMatch(/^LOBBY_AUTH_SECRET=[A-Za-z0-9_-]{43}$/);
    expect(run("--secret")).not.toBe(line);
  });

  it("refuses to run without a password", () => {
    expect(() => execFileSync(process.execPath, [SCRIPT], { encoding: "utf8", stdio: "pipe" })).toThrow();
  });
});
