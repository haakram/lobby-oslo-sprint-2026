import { authConfig } from "./config";
import { verifySession } from "./session";
import type { Session } from "./types";

type Env = Record<string, string | undefined>;

/**
 * The session a cookie stands for, or null. The user must still be in LOBBY_USERS with the same role, so
 * removing an account (or changing its role) there logs it out on its next request. Missing or broken
 * configuration: null for everyone (fail closed).
 */
export function resolveSession(token: string | undefined, env: Env = process.env, nowMs: number = Date.now()): Session | null {
  if (!token) return null;
  const config = authConfig(env);
  if (!config.ok) return null;
  const payload = verifySession(token, config.secret, nowMs);
  if (!payload) return null;
  const user = config.users.get(payload.u);
  if (!user || user.role !== payload.role) return null;
  return {
    user: { u: user.u, name: user.name, role: user.role },
    view: payload.view,
    effectiveRole: payload.view,
    exp: payload.exp,
  };
}
