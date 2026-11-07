"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { isRole, type Role } from "./roles";

/**
 * The session contract the shell and the dashboards build against (auth brief):
 * `useSession()` → `{ user: { u, name, role }, view, effectiveRole, switchView(view) }`.
 *
 * TODO(auth): this is the redesign builder's stand-in until `hamad/uiauth` merges. It has no login
 * and no server check; it reads two optional cookies so every role can be looked at locally:
 *   lobby_stub_user = hamad | shiraz | resepsjon | robot      (default hamad, admin)
 *   lobby_stub_view = admin | receptionist | robot             (admins only)
 * Delete this file when the real `SessionProvider`/`useSession` land and point the imports there.
 */

export type SessionUser = { u: string; name: string; role: Role };

export type Session = {
  user: SessionUser;
  /** The role whose desk and navigation are shown. Equals `user.role` unless an admin switched. */
  view: Role;
  effectiveRole: Role;
  /** Admins only; others are ignored. */
  switchView: (view: Role) => void;
  /** False until the browser has read who is logged in (the stub reads cookies after mount). */
  ready: boolean;
};

const STUB_USERS: Record<string, SessionUser> = {
  hamad: { u: "hamad", name: "Hamad", role: "admin" },
  shiraz: { u: "shiraz", name: "Shiraz", role: "admin" },
  resepsjon: { u: "resepsjon", name: "Resepsjonist", role: "receptionist" },
  robot: { u: "robot", name: "Robotansvarlig", role: "robot" },
};

const DEFAULT_USER = STUB_USERS.hamad;

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const hit = document.cookie.split("; ").find((part) => part.startsWith(`${name}=`));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null;
}

function writeCookie(name: string, value: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=43200; samesite=lax`;
}

const noop = () => {};

const FALLBACK: Session = { user: DEFAULT_USER, view: "admin", effectiveRole: "admin", switchView: noop, ready: true };

const SessionContext = createContext<Session>(FALLBACK);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser>(DEFAULT_USER);
  const [view, setView] = useState<Role>(DEFAULT_USER.role);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stubUser = STUB_USERS[(readCookie("lobby_stub_user") ?? "").toLowerCase()] ?? DEFAULT_USER;
    const stubView = readCookie("lobby_stub_view");
    setUser(stubUser);
    setView(stubUser.role === "admin" && isRole(stubView) ? stubView : stubUser.role);
    setReady(true);
  }, []);

  const switchView = useCallback(
    (next: Role) => {
      if (user.role !== "admin" || !isRole(next)) return;
      writeCookie("lobby_stub_view", next);
      setView(next);
    },
    [user.role],
  );

  const value = useMemo<Session>(
    () => ({ user, view, effectiveRole: user.role === "admin" ? view : user.role, switchView, ready }),
    [user, view, switchView, ready],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** Who is logged in and which desk they are looking at. Outside a provider: an admin, for tests. */
export function useSession(): Session {
  return useContext(SessionContext);
}
