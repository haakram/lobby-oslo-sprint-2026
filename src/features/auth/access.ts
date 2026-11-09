import { canAccess, homeFor, type Role } from "./roles";

/**
 * What the proxy does with one request. Pure: the proxy (src/proxy.ts) turns the decision into a
 * response, the tests check every branch.
 */

export type Decision =
  | { kind: "next" }
  | { kind: "redirect"; location: string; clearCookie: boolean }
  | { kind: "unauthorized" }
  | { kind: "forbidden"; api: boolean };

export type DecideInput = {
  pathname: string;
  search: string;
  /** The verified session, or null when there is none or it didn't verify. */
  session: { role: Role; view: Role } | null;
  /** A session cookie was sent (even one that didn't verify): clear it on the way to /login. */
  hadCookie?: boolean;
  /** The open demo (no LOBBY_USERS, ./demo.ts): there is no login page, /login goes to the home page. */
  openDemo?: boolean;
};

/**
 * The brand files (src/app/ and public/): the tab icon, the home-screen icons and manifest, and the link
 * preview image, and the logo. A browser asks for them before anyone logs in (and a Slack preview never logs in), and
 * every role's tab needs them, so they answer without a session. Exact paths; nothing else in public/.
 */
const BRAND_FILES = [
  "/favicon.ico",
  "/icon.svg",
  "/apple-icon.png",
  "/manifest.webmanifest",
  "/opengraph-image.png",
  "/twitter-image.png",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  // The Lobby logo: the rail's and the top bar's lockup, and the login page's full logo.
  "/brand/lobby-mark.png",
  "/brand/lobby-wordmark.png",
  "/brand/lobby-logo-full.png",
  "/brand/lobby-tagline.png",
];

/** Reachable without a session. Exact paths, except the prefixes below. */
const PUBLIC_EXACT = new Set(["/login", "/api/auth/login", "/api/auth/logout", ...BRAND_FILES]);
const PUBLIC_PREFIXES = [
  "/_next/",
  // ElevenLabs' phone agent calls these server to server; each call carries its own shared secret
  // (x-reception-secret, checked in constant time by the route), so no browser session applies.
  "/api/reception/tools/",
];

function stripSlash(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") || "/" : pathname;
}

/** Dot segments, encoded dots/slashes and backslashes: never inside a public prefix. */
const TRAVERSAL = /\.\.|%2e|%2f|%5c|\\/i;

function isPublic(pathname: string): boolean {
  if (PUBLIC_EXACT.has(stripSlash(pathname))) return true;
  return !TRAVERSAL.test(pathname) && PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isApi(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

const MAX_NEXT_LENGTH = 512;
const BASE = "http://lobby.invalid";

/**
 * A safe place to go after login: a same-origin relative path, never back to /login or to an API.
 * Anything else becomes "/". No open redirect.
 */
export function safeNext(raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_NEXT_LENGTH) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/";
  // Control characters and spaces: browsers strip some of them, which can turn "/\t/x" into "//x".
  if (/[\u0000- \u007f]/.test(raw)) return "/";
  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return "/";
  }
  if (url.origin !== BASE) return "/";
  const path = stripSlash(url.pathname);
  if (path === "/login" || path.startsWith("/login/") || isApi(path)) return "/";
  return `${url.pathname}${url.search}${url.hash}`;
}

export function decide({ pathname, search, session, hadCookie = false, openDemo = false }: DecideInput): Decision {
  if (openDemo && stripSlash(pathname) === "/login") return { kind: "redirect", location: "/", clearCookie: false };
  if (session && stripSlash(pathname) === "/login") {
    const next = safeNext(new URLSearchParams(search).get("next"));
    return { kind: "redirect", location: next !== "/" && canAccess(session.view, next) ? next : homeFor(session.view), clearCookie: false };
  }
  if (isPublic(pathname)) return { kind: "next" };

  if (!session) {
    if (isApi(pathname)) return { kind: "unauthorized" };
    const next = safeNext(`${pathname}${search}`);
    return { kind: "redirect", location: next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`, clearCookie: hadCookie };
  }

  if (canAccess(session.view, pathname)) return { kind: "next" };
  // A role without Oversikt (the host) is sent to its own start page instead of a 403 on "/".
  if (stripSlash(pathname) === "/" && homeFor(session.view) !== "/") {
    return { kind: "redirect", location: homeFor(session.view), clearCookie: false };
  }
  return { kind: "forbidden", api: isApi(pathname) };
}
