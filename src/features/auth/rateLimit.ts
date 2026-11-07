/**
 * In-memory fixed-window limits for failed logins. Per server instance (a serverless deploy may run a few),
 * on top of the edge limit on /api; enough to make guessing the password slow, not a global lockout.
 */

export type LimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

type Entry = { count: number; resetAt: number };

export function createRateLimiter({ max, windowMs, maxKeys = 10_000 }: { max: number; windowMs: number; maxKeys?: number }) {
  const entries = new Map<string, Entry>();

  function prune(now: number) {
    for (const [key, entry] of entries) if (entry.resetAt <= now) entries.delete(key);
    // Still full: drop the oldest windows first (a Map iterates in insertion order).
    for (const key of entries.keys()) {
      if (entries.size < maxKeys) break;
      entries.delete(key);
    }
  }

  return {
    check(key: string, now: number = Date.now()): LimitResult {
      const entry = entries.get(key);
      if (!entry || entry.resetAt <= now || entry.count < max) return { ok: true };
      return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
    },
    hit(key: string, now: number = Date.now()): void {
      const entry = entries.get(key);
      if (entry && entry.resetAt > now) {
        entry.count += 1;
        return;
      }
      entries.delete(key);
      if (entries.size >= maxKeys) prune(now);
      entries.set(key, { count: 1, resetAt: now + windowMs });
    },
    reset(key: string): void {
      entries.delete(key);
    },
    size(): number {
      return entries.size;
    },
  };
}

const WINDOW_MS = 5 * 60_000;

/** 5 failed tries per IP and username, and 20 per IP, in 5 minutes. */
export function createLoginLimiter() {
  const perUser = createRateLimiter({ max: 5, windowMs: WINDOW_MS });
  const perIp = createRateLimiter({ max: 20, windowMs: WINDOW_MS });
  const userKey = (ip: string, username: string) => `${ip}|${username.toLowerCase()}`;

  return {
    check(ip: string, username: string, now: number = Date.now()): LimitResult {
      const ipResult = perIp.check(ip, now);
      const userResult = perUser.check(userKey(ip, username), now);
      if (ipResult.ok && userResult.ok) return { ok: true };
      const wait = Math.max(ipResult.ok ? 0 : ipResult.retryAfterSeconds, userResult.ok ? 0 : userResult.retryAfterSeconds);
      return { ok: false, retryAfterSeconds: wait };
    },
    fail(ip: string, username: string, now: number = Date.now()): void {
      perIp.hit(ip, now);
      perUser.hit(userKey(ip, username), now);
    },
    succeed(ip: string, username: string): void {
      perUser.reset(userKey(ip, username));
    },
  };
}
