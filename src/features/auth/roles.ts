/**
 * Who may open what. The proxy enforces this on the server (src/proxy.ts); the navigation uses the same
 * map only to hide links. Plain data and pure functions: safe to import on the client.
 */

export const ROLES = ["admin", "receptionist", "robot"] as const;
export type Role = (typeof ROLES)[number];

const LABEL: Record<Role, string> = {
  admin: "Admin",
  receptionist: "Resepsjonist",
  robot: "Robotansvarlig",
};

/** Every page in the app, in navigation order. */
export const PAGES = ["/", "/hotell", "/natteskift", "/oyne", "/stemme", "/ruter", "/resepsjon"] as const;

/** Open to every logged-in role: the auth API, the demo run log, the "no access" page. */
export const SHARED_ROUTES = ["/api/auth", "/runs", "/login/ingen-tilgang"] as const;

/**
 * Pages and API sections per role. "/" matches only the home page; every other entry matches itself and
 * everything below it. "*" (admin) is everything, including routes added later.
 */
export const ROUTES_BY_ROLE: Record<Role, readonly string[]> = {
  admin: ["*"],
  receptionist: ["/", "/resepsjon", "/ruter", "/api/reception"],
  robot: [
    "/",
    "/hotell",
    "/natteskift",
    "/oyne",
    "/stemme",
    "/ruter",
    "/api/identify",
    "/api/scene",
    "/api/voice",
    // Øyne's on-device model files in public/.
    "/mediapipe",
    "/models",
  ],
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function roleLabel(role: Role): string {
  return LABEL[role];
}

/**
 * The path to match, or null when it can't be trusted: broken percent-encoding, dot segments, encoded
 * slashes or backslashes. Decoding first means "/%68otell" is judged as "/hotell".
 */
function normalisePath(path: string): string | null {
  const raw = path.split(/[?#]/, 1)[0] ?? "";
  if (/%2f|%5c|\\/i.test(raw)) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (!decoded.startsWith("/") || decoded.includes("\\")) return null;
  if (decoded.split("/").some((segment) => segment === "." || segment === "..")) return null;
  return decoded.length > 1 ? decoded.replace(/\/+$/, "") || "/" : decoded;
}

function matches(path: string, route: string): boolean {
  if (route === "/") return path === "/";
  return path === route || path.startsWith(`${route}/`);
}

/** May this role open this path? Unknown roles and untrusted paths: no. */
export function canAccess(role: Role, path: string): boolean {
  if (!isRole(role)) return false;
  if (role === "admin") return true;
  const clean = normalisePath(path);
  if (clean === null) return false;
  return [...SHARED_ROUTES, ...ROUTES_BY_ROLE[role]].some((route) => matches(clean, route));
}
