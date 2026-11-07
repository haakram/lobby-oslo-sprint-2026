import { z } from "zod";
import { parseHash } from "./password";
import { ROLES, type Role } from "./roles";

/**
 * The accounts and the session secret, read from the environment on every call (cached per value).
 * Anything missing or malformed switches login off: nobody gets in, the server log says why, and no
 * value is ever written to the log.
 */

export type LobbyUser = { u: string; name: string; role: Role; hash: string };
export type AuthConfig =
  | { ok: true; secret: string; users: ReadonlyMap<string, LobbyUser> }
  | { ok: false; problems: string[] };

/** 32 random bytes are 43 characters in base64url (44 in base64, 64 in hex). */
const MIN_SECRET_LENGTH = 43;

const userSchema = z.object({
  u: z
    .string()
    .regex(/^[A-Za-z]{2,24}$/, "username must be 2–24 letters")
    .transform((u) => u.toLowerCase()),
  name: z.string().trim().min(1).max(40),
  role: z.enum(ROLES),
  hash: z.string().refine((hash) => parseHash(hash) !== null, {
    message:
      "hash is not scrypt$N$r$p$salt$hash (a .env loader may have expanded the $ signs: use the base64 form from scripts/lobby-hash.mjs)",
  }),
});

const usersSchema = z.array(userSchema).min(1, "lists no users").max(20, "lists more than 20 users");

type Env = Record<string, string | undefined>;

function decodeUsers(raw: string): unknown {
  const text = raw.trim().startsWith("[") ? raw.trim() : Buffer.from(raw.trim(), "base64url").toString("utf8");
  return JSON.parse(text);
}

function parseUsers(raw: string | undefined, problems: string[]): Map<string, LobbyUser> {
  const users = new Map<string, LobbyUser>();
  if (!raw?.trim()) {
    problems.push("LOBBY_USERS is missing");
    return users;
  }
  let json: unknown;
  try {
    json = decodeUsers(raw);
  } catch {
    problems.push("LOBBY_USERS is neither a JSON array nor base64url-encoded JSON");
    return users;
  }
  const parsed = usersSchema.safeParse(json);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      problems.push(`LOBBY_USERS${issue.path.length ? `[${issue.path.join(".")}]` : ""}: ${issue.message}`);
    }
    return users;
  }
  for (const user of parsed.data) {
    if (users.has(user.u)) problems.push(`LOBBY_USERS lists "${user.u}" twice`);
    users.set(user.u, user);
  }
  return users;
}

let cache: { key: string; config: AuthConfig } | null = null;

export function authConfig(env: Env = process.env): AuthConfig {
  const secret = env.LOBBY_AUTH_SECRET?.trim() ?? "";
  const rawUsers = env.LOBBY_USERS ?? "";
  const key = `${secret}\u0000${rawUsers}`;
  if (cache?.key === key) return cache.config;

  const problems: string[] = [];
  if (!secret) problems.push("LOBBY_AUTH_SECRET is missing");
  else if (secret.length < MIN_SECRET_LENGTH) problems.push(`LOBBY_AUTH_SECRET is shorter than 32 random bytes`);
  const users = parseUsers(rawUsers, problems);

  const config: AuthConfig = problems.length ? { ok: false, problems } : { ok: true, secret, users };
  cache = { key, config };
  return config;
}
