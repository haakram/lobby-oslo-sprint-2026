import type { Role } from "./roles";

/** What the app knows about the person logged in. Safe to send to the browser: no hash, no secret. */
export type SessionUser = { u: string; name: string; role: Role };

export type Session = {
  user: SessionUser;
  /** The role an admin is looking through; always the user's own role for everyone else. */
  view: Role;
  /** The role every page and API judges this request by (= view). */
  effectiveRole: Role;
  /** Expiry, seconds since the epoch. */
  exp: number;
};
