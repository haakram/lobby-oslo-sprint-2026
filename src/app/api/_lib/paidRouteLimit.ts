import { createRateLimiter } from "@/features/auth/rateLimit";
import { resolveSession } from "@/features/auth/resolve";
import { SESSION_COOKIE } from "@/features/auth/session";

/**
 * Per-user limits on the routes that cost money: Claude (identify, scene) and ElevenLabs (the two token
 * routes). The proxy already turns away anyone who isn't logged in; this stops a logged-in user (or a
 * leaked password) from looping a paid route until the Claude budget or the ElevenLabs quota is gone.
 * Every call counts, before any backend is reached. In memory, per server instance, like the login limit:
 * the provider-side budgets stay the hard ceiling.
 */

export type PaidRoute = "identify" | "scene" | "voice-token" | "reception-token";

type Window = { max: number; windowMs: number };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * Generous for real use, tight for a loop. Live recognition asks at most every 2 s (autoIdentify.ts) and
 * the scene scan every 10 s (sceneSchedule.ts), so neither trips in normal use; a conversation needs one token.
 */
export const PAID_ROUTE_LIMITS: Record<PaidRoute, readonly Window[]> = {
  identify: [
    { max: 40, windowMs: MINUTE },
    { max: 400, windowMs: HOUR },
  ],
  scene: [
    { max: 12, windowMs: MINUTE },
    { max: 360, windowMs: HOUR },
  ],
  "voice-token": [
    { max: 10, windowMs: MINUTE },
    { max: 60, windowMs: HOUR },
  ],
  "reception-token": [
    { max: 10, windowMs: MINUTE },
    { max: 60, windowMs: HOUR },
  ],
};

export const RATE_LIMITED_COPY = "For mange forespørsler på kort tid. Vent litt og prøv igjen.";

type Limiter = ReturnType<typeof createRateLimiter>;

function buildLimiters(): Record<PaidRoute, Limiter[]> {
  const entries = Object.entries(PAID_ROUTE_LIMITS).map(([route, windows]) => [
    route,
    windows.map((window) => createRateLimiter(window)),
  ]);
  return Object.fromEntries(entries) as Record<PaidRoute, Limiter[]>;
}

/** One set per server instance. */
let limiters = buildLimiters();

/** Tests only: start every window afresh. */
export function resetPaidRouteLimits(): void {
  limiters = buildLimiters();
}

function cookieValue(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
}

/** The logged-in user, else the client's IP (only reachable if the proxy were bypassed). */
function callerKey(request: Request): string {
  const session = resolveSession(cookieValue(request, SESSION_COOKIE));
  if (session) return `user:${session.user.u}`;
  const ip =
    request.headers.get("x-real-ip")?.trim() || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return `ip:${ip}`;
}

/**
 * Counts this call against the caller's limits for the route. Returns the 429 to send when a limit is
 * reached (with Retry-After), or null to go ahead.
 */
export function limitPaidRoute(route: PaidRoute, request: Request, now: number = Date.now()): Response | null {
  const key = callerKey(request);
  const routeLimiters = limiters[route];
  let wait = 0;
  for (const limiter of routeLimiters) {
    const result = limiter.check(key, now);
    if (!result.ok) wait = Math.max(wait, result.retryAfterSeconds);
  }
  if (wait > 0) {
    return Response.json(
      { error: RATE_LIMITED_COPY, code: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(wait), "Cache-Control": "no-store" } },
    );
  }
  for (const limiter of routeLimiters) limiter.hit(key, now);
  return null;
}
