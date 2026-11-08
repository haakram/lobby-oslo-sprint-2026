import { MODULES, moduleRoutesFor } from "@/features/modules/registry";

/**
 * Who may open what. The proxy enforces this on the server (src/proxy.ts); the navigation uses the same
 * map only to hide links. The pages come from the module registry (one place to add a module); the
 * API sections are listed here. Plain data and pure functions: safe to import on the client.
 */

export const ROLES = ["admin", "receptionist", "robot", "host"] as const;
export type Role = (typeof ROLES)[number];

const LABEL: Record<Role, string> = {
  admin: "Admin",
  receptionist: "Resepsjonist",
  robot: "Robotansvarlig",
  host: "Vert",
};

/**
 * The roles an admin can look through (the view switcher). The host (an Airbnb host with their own app
 * under /vert) is not one of them: the switcher stays the hotel's.
 */
export const ADMIN_VIEWS = ["admin", "receptionist", "robot"] as const satisfies readonly Role[];

/** Every page in the app, in navigation order (the module registry's routes). */
export const PAGES: readonly string[] = MODULES.map((module) => module.route);

/** Open to every logged-in role: the auth API, the demo run log, the "no access" page. */
export const SHARED_ROUTES = ["/api/auth", "/runs", "/login/ingen-tilgang"] as const;

/**
 * Pages and API sections per role. "/" matches only the home page; every other entry matches itself and
 * everything below it. "*" (admin) is everything, including routes added later.
 */
export const ROUTES_BY_ROLE: Record<Role, readonly string[]> = {
  admin: ["*"],
  receptionist: [...moduleRoutesFor("receptionist"), "/api/reception"],
  robot: [
    ...moduleRoutesFor("robot"),
    "/api/identify",
    "/api/scene",
    "/api/voice",
    // Øyne's on-device model files in public/.
    "/mediapipe",
    "/models",
  ],
  host: moduleRoutesFor("host"),
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function roleLabel(role: Role): string {
  return LABEL[role];
}

/**
 * Where a role starts. The pilot accounts (admin: siri, hamad, jury) start on Overlevering, the product's one
 * page (round 5, product and marketing reviews: "the cut you claim should be the cut I see first"); Oversikt stays
 * one tap away in the rail. Other roles: Oversikt when they may open it, else their first page (the host: /vert).
 */
export const PILOT_HOME = "/overlevering";

export function homeFor(role: Role): string {
  if (role === "admin") return PILOT_HOME;
  if (ROUTES_BY_ROLE[role].includes("/")) return "/";
  return ROUTES_BY_ROLE[role][0] ?? "/";
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
