// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DUMMY_HASH, hashPassword, parseHash, verifyPassword } from "./password";

// Small cost for fast tests; production hashes use the defaults (N = 2^17).
const FAST = { N: 1024, r: 8, p: 1 };

describe("hashPassword", () => {
  it("writes scrypt$N$r$p$salt$hash with the default cost", async () => {
    const hash = await hashPassword("***REMOVED***");
    expect(hash).toMatch(/^scrypt\$131072\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/);
  });

  it("salts every hash, so the same password never hashes the same twice", async () => {
    expect(await hashPassword("***REMOVED***", FAST)).not.toBe(await hashPassword("***REMOVED***", FAST));
  });
});

describe("verifyPassword", () => {
  it("accepts the right password", async () => {
    const hash = await hashPassword("***REMOVED***", FAST);
    expect(await verifyPassword("***REMOVED***", hash)).toBe(true);
  });

  it("refuses a wrong password", async () => {
    const hash = await hashPassword("***REMOVED***", FAST);
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("refuses a hash whose stored key was changed", async () => {
    const hash = await hashPassword("***REMOVED***", FAST);
    const parts = hash.split("$");
    const key = parts[5]!;
    parts[5] = (key[0] === "A" ? "B" : "A") + key.slice(1);
    expect(await verifyPassword("***REMOVED***", parts.join("$"))).toBe(false);
  });

  it("refuses malformed hashes instead of throwing", async () => {
    for (const bad of ["", "plain", "scrypt$1$2$3", "bcrypt$1024$8$1$c2FsdA$aGFzaA", "scrypt31072"]) {
      expect(await verifyPassword("***REMOVED***", bad)).toBe(false);
    }
  });

  it("refuses a hash whose cost would exhaust memory (a bad env value can't take the server down)", async () => {
    const huge = (await hashPassword("x", FAST)).replace("$1024$", "$1073741824$");
    expect(await verifyPassword("x", huge)).toBe(false);
  });

  it("checks the dummy hash in the same way, and nothing matches it", async () => {
    expect(parseHash(DUMMY_HASH)).not.toBeNull();
    expect(await verifyPassword("***REMOVED***", DUMMY_HASH)).toBe(false);
  });
});

describe("parseHash", () => {
  it("reads the cost parameters back", async () => {
    const parsed = parseHash(await hashPassword("***REMOVED***", FAST));
    expect(parsed).toMatchObject({ N: 1024, r: 8, p: 1 });
    expect(parsed?.salt.length).toBe(16);
    expect(parsed?.key.length).toBe(32);
  });

  it("rejects N that isn't a power of two", () => {
    expect(parseHash("scrypt$1000$8$1$c2FsdHNhbHRzYWx0c2FsdA$aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2g")).toBeNull();
  });
});
