// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createLoginLimiter, createRateLimiter } from "./rateLimit";

const MIN = 60_000;

describe("createRateLimiter", () => {
  it("allows max failures in the window, then blocks with a retry time", () => {
    const limiter = createRateLimiter({ max: 5, windowMs: 5 * MIN });
    for (let i = 0; i < 5; i++) {
      expect(limiter.check("k", 0).ok).toBe(true);
      limiter.hit("k", 0);
    }
    const blocked = limiter.check("k", 1000);
    expect(blocked).toEqual({ ok: false, retryAfterSeconds: 299 });
  });

  it("opens again when the window has passed", () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 5 * MIN });
    limiter.hit("k", 0);
    expect(limiter.check("k", 5 * MIN - 1).ok).toBe(false);
    expect(limiter.check("k", 5 * MIN).ok).toBe(true);
  });

  it("keeps keys apart and forgets a key on reset", () => {
    const limiter = createRateLimiter({ max: 1, windowMs: MIN });
    limiter.hit("a", 0);
    expect(limiter.check("a", 0).ok).toBe(false);
    expect(limiter.check("b", 0).ok).toBe(true);
    limiter.reset("a");
    expect(limiter.check("a", 0).ok).toBe(true);
  });

  it("holds at most maxKeys entries, so a flood of keys can't fill the memory", () => {
    const limiter = createRateLimiter({ max: 1, windowMs: MIN, maxKeys: 100 });
    for (let i = 0; i < 1000; i++) limiter.hit(`k${i}`, 0);
    expect(limiter.size()).toBeLessThanOrEqual(100);
  });
});

describe("createLoginLimiter", () => {
  it("blocks the sixth try for one IP and username within 5 minutes", () => {
    const limiter = createLoginLimiter();
    for (let i = 0; i < 5; i++) {
      expect(limiter.check("1.2.3.4", "hamad", 0).ok).toBe(true);
      limiter.fail("1.2.3.4", "hamad", 0);
    }
    expect(limiter.check("1.2.3.4", "hamad", 0).ok).toBe(false);
    expect(limiter.check("1.2.3.4", "HAMAD", 0).ok).toBe(false);
    expect(limiter.check("5.6.7.8", "hamad", 0).ok).toBe(true);
    expect(limiter.check("1.2.3.4", "hamad", 5 * MIN).ok).toBe(true);
  });

  it("also caps one IP across usernames (20 tries per 5 minutes)", () => {
    const limiter = createLoginLimiter();
    for (let i = 0; i < 20; i++) limiter.fail("1.2.3.4", `user${String.fromCharCode(97 + (i % 26))}x`, 0);
    expect(limiter.check("1.2.3.4", "brandnew", 0).ok).toBe(false);
  });

  it("clears the username's count after a successful login", () => {
    const limiter = createLoginLimiter();
    for (let i = 0; i < 4; i++) limiter.fail("1.2.3.4", "hamad", 0);
    limiter.succeed("1.2.3.4", "hamad");
    for (let i = 0; i < 4; i++) limiter.fail("1.2.3.4", "hamad", 0);
    expect(limiter.check("1.2.3.4", "hamad", 0).ok).toBe(true);
  });
});
