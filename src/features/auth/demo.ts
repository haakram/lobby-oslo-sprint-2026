import { SESSION_TTL_SECONDS } from "./session";
import type { Session, SessionUser } from "./types";

/**
 * Open demo mode (the public copy). With no accounts configured (`LOBBY_USERS` unset, the default for
 * anyone who clones the repo) there is no login: every request is a signed-in demo admin, so the whole
 * menu and every screen show. Nothing is signed and no cookie is set; the API keys are what cost money,
 * and without them those screens say they are not set up.
 *
 * As soon as `LOBBY_USERS` is set, the real login is back (src/proxy.ts, /api/auth/*), and a missing or
 * broken `LOBBY_AUTH_SECRET` or `LOBBY_USERS` still fails closed.
 */

type Env = Record<string, string | undefined>;

export const DEMO_USER: SessionUser = { u: "demo", name: "Demo", role: "admin" };

export function isOpenDemo(env: Env = process.env): boolean {
  return !env.LOBBY_USERS?.trim();
}

export function demoSession(nowMs: number = Date.now()): Session {
  return { user: { ...DEMO_USER }, view: "admin", effectiveRole: "admin", exp: Math.floor(nowMs / 1000) + SESSION_TTL_SECONDS };
}
