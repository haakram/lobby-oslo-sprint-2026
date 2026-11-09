"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { hardNavigate } from "./navigate";
import { canAccess, type Role } from "./roles";
import type { Session, SessionUser } from "./types";

export type SessionContextValue = {
  status: "authenticated" | "unauthenticated";
  user: SessionUser | null;
  /** The role an admin is looking through; the user's own role for everyone else. */
  view: Role | null;
  /** The role the server judges every request by (= view). Filter navigation with canAccess(effectiveRole, href). */
  effectiveRole: Role | null;
  /** The open demo (no accounts configured): no login, so no logout and no view switch either. */
  openDemo: boolean;
  /** Admins only: look at the app as another role (or "admin" to go back). Reloads the page. */
  switchView: (view: Role) => Promise<void>;
  logout: () => Promise<void>;
};

async function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin",
  });
}

async function errorOf(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    return typeof body.error === "string" ? body.error : fallback;
  } catch {
    return fallback;
  }
}

async function switchView(view: Role): Promise<void> {
  const response = await postJson("/api/auth/view", { view });
  if (!response.ok) throw new Error(await errorOf(response, "Fikk ikke byttet visning. Prøv igjen."));
  const { pathname, search } = window.location;
  hardNavigate(canAccess(view, pathname) ? `${pathname}${search}` : "/");
}

async function logout(): Promise<void> {
  try {
    await postJson("/api/auth/logout", {});
  } finally {
    hardNavigate("/login");
  }
}

const LOGGED_OUT: SessionContextValue = {
  status: "unauthenticated",
  user: null,
  view: null,
  effectiveRole: null,
  openDemo: false,
  switchView,
  logout,
};

const SessionContext = createContext<SessionContextValue>(LOGGED_OUT);

/** Wraps the app in the root layout with the session the server read for this request. */
export function SessionProvider({ session, openDemo = false, children }: { session: Session | null; openDemo?: boolean; children: ReactNode }) {
  const value = useMemo<SessionContextValue>(
    () =>
      session
        ? { status: "authenticated", user: session.user, view: session.view, effectiveRole: session.effectiveRole, openDemo, switchView, logout }
        : LOGGED_OUT,
    [session, openDemo],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** The logged-in user in client components. Outside a provider it reads as logged out. */
export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}
