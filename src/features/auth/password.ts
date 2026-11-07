import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Salted scrypt password hashes, stored as `scrypt$N$r$p$salt$hash` (salt and hash in base64url).
 * Default cost follows OWASP's scrypt minimum: N = 2^17, r = 8, p = 1 (128 MiB, ~0.2 s). The same format
 * is written by scripts/lobby-hash.mjs.
 */

export type ScryptCost = { N: number; r: number; p: number };
export type ParsedHash = ScryptCost & { salt: Buffer; key: Buffer };

export const DEFAULT_COST: ScryptCost = { N: 2 ** 17, r: 8, p: 1 };
const SALT_BYTES = 16;
const KEY_BYTES = 32;
/** 128 * N * r bytes of memory per hash; refuse anything above 256 MiB, whatever the env says. */
const MAX_MEMORY = 256 * 1024 * 1024;

/**
 * A hash of 32 random bytes nobody kept. Unknown usernames are checked against it, so a login for a user
 * that doesn't exist takes as long as one with a wrong password.
 */
export const DUMMY_HASH = "scrypt$131072$8$1$YbZ6v7tq-y86_MOfmTBtnA$Fyn61cj7zrg9g8IPIEr7RlcbRV1Oobzv436RkJ281_A";

const B64URL = /^[A-Za-z0-9_-]+$/;

function derive(password: string, salt: Buffer, cost: ScryptCost, length: number): Promise<Buffer> {
  const options: ScryptOptions = { N: cost.N, r: cost.r, p: cost.p, maxmem: 2 * 128 * cost.N * cost.r };
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFC"), salt, length, options, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

function isPowerOfTwo(n: number): boolean {
  return Number.isSafeInteger(n) && n > 1 && (n & (n - 1)) === 0;
}

/** The parts of a stored hash, or null when it is malformed or its cost is out of bounds. */
export function parseHash(stored: string): ParsedHash | null {
  if (typeof stored !== "string") return null;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;
  const [, n, r, p, salt, key] = parts as [string, string, string, string, string, string];
  if (![n, r, p].every((value) => /^[1-9][0-9]{0,9}$/.test(value))) return null;
  const cost = { N: Number(n), r: Number(r), p: Number(p) };
  if (!isPowerOfTwo(cost.N) || cost.N < 2 ** 10) return null;
  if (cost.r < 1 || cost.r > 32 || cost.p < 1 || cost.p > 4) return null;
  if (128 * cost.N * cost.r > MAX_MEMORY) return null;
  if (!B64URL.test(salt) || !B64URL.test(key)) return null;
  const saltBytes = Buffer.from(salt, "base64url");
  const keyBytes = Buffer.from(key, "base64url");
  if (saltBytes.length < 16 || keyBytes.length < 32 || keyBytes.length > 64) return null;
  return { ...cost, salt: saltBytes, key: keyBytes };
}

/** A new salted hash of the password. */
export async function hashPassword(password: string, cost: ScryptCost = DEFAULT_COST): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, cost, KEY_BYTES);
  return ["scrypt", cost.N, cost.r, cost.p, salt.toString("base64url"), key.toString("base64url")].join("$");
}

/** True only when the password matches. Compares in constant time; never throws. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parseHash(stored);
  if (!parsed || typeof password !== "string") return false;
  try {
    const key = await derive(password, parsed.salt, parsed, parsed.key.length);
    return timingSafeEqual(key, parsed.key);
  } catch {
    return false;
  }
}
