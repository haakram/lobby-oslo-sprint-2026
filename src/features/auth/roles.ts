/**
 * Roles and what each may open (auth brief, team lead 2026-11-07 20:30).
 * TODO(auth): stub by the redesign builder against the auth contract; replaced by `hamad/uiauth`'s
 * `src/features/auth/roles.ts` when that branch merges (same exports: ROUTES_BY_ROLE, canAccess).
 */
export type Role = "admin" | "receptionist" | "robot";

export const ROLES: readonly Role[] = ["admin", "receptionist", "robot"];

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  receptionist: "Resepsjonist",
  robot: "Robotansvarlig",
};

/** Page routes each role may open. `/` is a different desk per role. */
export const ROUTES_BY_ROLE: Record<Role, readonly string[]> = {
  admin: ["/", "/hotell", "/ruter", "/natteskift", "/oyne", "/stemme", "/resepsjon"],
  receptionist: ["/", "/resepsjon", "/ruter"],
  robot: ["/", "/hotell", "/natteskift", "/oyne", "/stemme", "/ruter"],
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** True when `path` (a pathname, no query) is one of the role's routes or sits under one. */
export function canAccess(role: Role, path: string): boolean {
  const clean = path.split("?")[0] || "/";
  return ROUTES_BY_ROLE[role].some((route) => (route === "/" ? clean === "/" : clean === route || clean.startsWith(`${route}/`)));
}
