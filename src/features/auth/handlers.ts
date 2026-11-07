import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { safeNext } from "./access";
import { authConfig } from "./config";
import { DUMMY_HASH, verifyPassword } from "./password";
import { createLoginLimiter } from "./rateLimit";
import { resolveSession } from "./resolve";
import { canAccess, ROLES } from "./roles";
import { SESSION_COOKIE, newSession, sessionCookieOptions, signSession, withView } from "./session";
import type { Session } from "./types";

/**
 * The logic behind /api/auth/*. The route files are one line each; these take their environment and
 * limiter as arguments so the tests can drive them. No database, no shell, no query is built from input:
 * every body is parsed with zod and only compared against the accounts in LOBBY_USERS.
 */

type Env = Record<string, string | undefined>;
type LoginLimiter = ReturnType<typeof createLoginLimiter>;

const MAX_BODY_BYTES = 2048;
const GENERIC_LOGIN_ERROR = "Feil brukernavn eller passord.";
const NO_STORE = { "Cache-Control": "no-store" } as const;

/** One limiter per server instance. */
const sharedLimiter = createLoginLimiter();

function json(body: unknown, status = 200, headers: Record<string, string> = {}): NextResponse {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

function fail(status: number, error: string, headers: Record<string, string> = {}): NextResponse {
  return json({ error }, status, headers);
}

/**
 * Same-site requests only, for every POST here: a browser on another site can't log someone in as us
 * (login CSRF), log them out, or switch their view. Non-browser clients send neither header.
 */
export function isSameOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** The client's IP. On Vercel these headers are set by the platform, not by the client. */
function clientIp(request: Request): string {
  return (
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

type Body = { ok: true; value: unknown } | { ok: false; status: number; error: string };

async function readJson(request: Request): Promise<Body> {
  const type = request.headers.get("content-type") ?? "";
  if (!/^application\/json\b/i.test(type)) return { ok: false, status: 415, error: "Send JSON." };
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return { ok: false, status: 413, error: "For stor forespørsel." };
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return { ok: false, status: 413, error: "For stor forespørsel." };
      }
      chunks.push(value);
    }
  }
  try {
    return { ok: true, value: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
  } catch {
    return { ok: false, status: 400, error: "Ugyldig forespørsel." };
  }
}

const loginSchema = z.object({
  username: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2,24}$/),
  password: z.string().min(1).max(128),
  next: z.string().max(512).optional(),
});

function setSession(response: NextResponse, token: string): NextResponse {
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
}

export async function handleLogin(
  request: NextRequest,
  { env = process.env, limiter = sharedLimiter, now = Date.now }: { env?: Env; limiter?: LoginLimiter; now?: () => number } = {},
): Promise<NextResponse> {
  if (!isSameOrigin(request)) return fail(403, "Ikke tillatt.");
  const body = await readJson(request);
  if (!body.ok) return fail(body.status, body.error);
  const parsed = loginSchema.safeParse(body.value);
  if (!parsed.success) return fail(400, GENERIC_LOGIN_ERROR);

  const config = authConfig(env);
  if (!config.ok) {
    console.error(`auth: login is switched off until the server environment is fixed: ${config.problems.join("; ")}`);
    return fail(503, "Innlogging er ikke satt opp på serveren.");
  }

  const username = parsed.data.username.toLowerCase();
  const ip = clientIp(request);
  const limit = limiter.check(ip, username, now());
  if (!limit.ok) {
    const minutes = Math.ceil(limit.retryAfterSeconds / 60);
    return fail(429, `For mange forsøk. Vent ${minutes} ${minutes === 1 ? "minutt" : "minutter"} og prøv igjen.`, {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }

  // Unknown users are checked against a dummy hash: same scrypt work, same answer, no user enumeration.
  const user = config.users.get(username);
  const matches = await verifyPassword(parsed.data.password, user?.hash ?? DUMMY_HASH);
  if (!user || !matches) {
    limiter.fail(ip, username, now());
    return fail(401, GENERIC_LOGIN_ERROR);
  }
  limiter.succeed(ip, username);

  const payload = newSession(user.u, user.role, now());
  const session: Session = { user: { u: user.u, name: user.name, role: user.role }, view: payload.view, effectiveRole: payload.view, exp: payload.exp };
  const next = safeNext(parsed.data.next);
  return setSession(json({ session, next: canAccess(user.role, next) ? next : "/" }), signSession(payload, config.secret));
}

export async function handleLogout(request: NextRequest): Promise<NextResponse> {
  if (!isSameOrigin(request)) return fail(403, "Ikke tillatt.");
  const response = json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(0));
  return response;
}

export async function handleSession(request: NextRequest, env: Env = process.env): Promise<NextResponse> {
  const session = resolveSession(request.cookies.get(SESSION_COOKIE)?.value, env);
  if (!session) return fail(401, "Ikke innlogget.");
  return json({ session });
}

const viewSchema = z.object({ view: z.enum(ROLES) });

export async function handleView(request: NextRequest, env: Env = process.env): Promise<NextResponse> {
  if (!isSameOrigin(request)) return fail(403, "Ikke tillatt.");
  const config = authConfig(env);
  const session = resolveSession(request.cookies.get(SESSION_COOKIE)?.value, env);
  if (!session || !config.ok) return fail(401, "Ikke innlogget.");
  if (session.user.role !== "admin") return fail(403, "Bare admin kan bytte visning.");
  const body = await readJson(request);
  if (!body.ok) return fail(body.status, body.error);
  const parsed = viewSchema.safeParse(body.value);
  if (!parsed.success) return fail(400, "Ukjent visning.");

  const payload = withView({ u: session.user.u, role: session.user.role, view: session.view, exp: session.exp }, parsed.data.view);
  if (!payload) return fail(403, "Bare admin kan bytte visning.");
  const next: Session = { ...session, view: payload.view, effectiveRole: payload.view };
  return setSession(json({ session: next }), signSession(payload, config.secret));
}
