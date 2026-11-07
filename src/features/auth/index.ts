// Client-safe surface of the auth feature. Server-only helpers: import getSession / effectiveRole from
// "@/features/auth/server". Hashing, cookies and handlers stay out of this barrel (they use node:crypto).
export { ADMIN_VIEWS, PAGES, ROLES, ROUTES_BY_ROLE, SHARED_ROUTES, canAccess, homeFor, isRole, roleLabel, type Role } from "./roles";
export { SessionProvider, useSession, type SessionContextValue } from "./SessionProvider";
export type { Session, SessionUser } from "./types";
export { ViewAsBanner } from "./ViewAsBanner";
