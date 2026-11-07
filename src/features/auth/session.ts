import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ROLES, type Role } from "./roles";

/**
 * The session cookie: `base64url(JSON payload).base64url(HMAC-SHA256(secret, first part))`.
 * Nothing secret is inside (username, role, view, expiry); the signature stops anyone from changing it.
 */

export const SESSION_COOKIE = "lobby_session";
export const SESSION_TTL_SECONDS = 12 * 60 * 60;
const MAX_TOKEN_LENGTH = 1024;

export const USERNAME = /^[a-z]{2,24}$/;

const payloadSchema = z
  .object({
    u: z.string().regex(USERNAME),
    role: z.enum(ROLES),
    view: z.enum(ROLES),
    exp: z.number().int().positive(),
  })
  .strict()
  .refine((s) => s.role === "admin" || s.view === s.role, { message: "only admins switch view" });

export type SessionPayload = z.infer<typeof payloadSchema>;

export function newSession(u: string, role: Role, nowMs: number = Date.now()): SessionPayload {
  return { u, role, view: role, exp: Math.floor(nowMs / 1000) + SESSION_TTL_SECONDS };
}

function mac(data: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(data).digest();
}

export function signSession(payload: SessionPayload, secret: string): string {
  if (!secret) throw new Error("signSession: no secret");
  const body = Buffer.from(JSON.stringify(payloadSchema.parse(payload))).toString("base64url");
  return `${body}.${mac(body, secret).toString("base64url")}`;
}

/** The payload when the token is ours, untouched and unexpired; otherwise null. Never throws. */
export function verifySession(token: string | undefined, secret: string, nowMs: number = Date.now()): SessionPayload | null {
  if (!secret || typeof token !== "string" || token.length > MAX_TOKEN_LENGTH) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts as [string, string];
  if (!/^[A-Za-z0-9_-]+$/.test(body) || !/^[A-Za-z0-9_-]+$/.test(sig)) return null;
  const given = Buffer.from(sig, "base64url");
  const expected = mac(body, secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) return null;
  if (parsed.data.exp * 1000 <= nowMs) return null;
  return parsed.data;
}

/** The same session seen as another role. Admins only, known roles only; the expiry stays. */
export function withView(session: SessionPayload, view: unknown): SessionPayload | null {
  if (session.role !== "admin") return null;
  const parsed = z.enum(ROLES).safeParse(view);
  if (!parsed.success) return null;
  return { ...session, view: parsed.data };
}

export function sessionCookieOptions(maxAge: number = SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
