import "server-only";
import { cookies } from "next/headers";
import { resolveSession } from "./resolve";
import type { Role } from "./roles";
import { SESSION_COOKIE } from "./session";
import type { Session } from "./types";

/**
 * The logged-in session for this request, in server components and route handlers; null when logged out.
 * The proxy has already turned away anyone without access, so pages can trust what this returns.
 */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  return resolveSession(store.get(SESSION_COOKIE)?.value);
}

/**
 * The role this request is judged by: an admin viewing as the receptionist gets "receptionist".
 * The home page switches its dashboard on this.
 */
export async function effectiveRole(): Promise<Role | null> {
  return (await getSession())?.effectiveRole ?? null;
}
