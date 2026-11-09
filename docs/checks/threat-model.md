# Threat model

## Lobby login and roles (2026-11-07)

**What it protects.** The app runs on a public URL. Behind it: paid AI routes (Claude in `/api/identify`
and `/api/scene`, ElevenLabs tokens in `/api/voice/*` and `/api/reception/token`), the receptionist's call
notes (guest names and phone numbers, `/api/reception/calls`) and the demo itself. Code: `src/proxy.ts`,
`src/features/auth/`, `src/app/api/auth/*`, `src/app/login/`.

**No SQL to inject.** There is no database and none is added. Every input at the boundary is parsed with
zod (username `^[A-Za-z]{2,24}$`, password 1–128 characters, `view` one of three roles, JSON bodies of at
most 2 KB) and is only ever compared against the accounts in `LOBBY_USERS`. No query, shell command, file
path or HTML is built from input.

| Threat | Control | Test |
|---|---|---|
| Anyone on the internet uses the app or burns AI credit | `src/proxy.ts` runs before every route: logged out → `/login?next=…` (pages) or 401 (APIs). Public: `/login`, `/api/auth/login`, `/api/auth/logout`, Next's assets, the favicon. | `proxy.test.ts`, `access.test.ts` |
| A role opens another role's pages or APIs | `canAccess(role, path)` on the server (default deny for unknown paths); 403 page or JSON. An admin viewing as another role is judged by that role. | `roles.test.ts` (every route × role) |
| Path tricks (`/%68otell`, `..%2f`, backslashes) | Paths are decoded before matching; dot segments, encoded slashes and backslashes are refused for every role but admin and never pass a public prefix. | `roles.test.ts`, `access.test.ts` |
| Forged or changed session cookie | HMAC-SHA256 over the payload `{ u, role, view, exp }` with `LOBBY_AUTH_SECRET`, compared in constant time; payload re-validated; the user must still be in `LOBBY_USERS` with the same role. Tampered or expired → logged out and the cookie cleared. Cookie: `HttpOnly`, `Secure` in production, `SameSite=Lax`, `Path=/`, 12 h. | `session.test.ts`, `resolve.test.ts` |
| Password guessing | Generic "Feil brukernavn eller passord." for every failure; 5 failed tries per IP and username and 20 per IP in 5 minutes (429 + `Retry-After`), on top of the edge limit on `/api`. | `rateLimit.test.ts`, `handlers.test.ts` |
| User enumeration by timing | Unknown usernames are checked against a dummy scrypt hash with the same cost. | `handlers.test.ts` |
| Leaked hashes | scrypt N = 2^17, r = 8, p = 1 (OWASP minimum), 16-byte salt per account; cost bounded when read so a bad env value can't exhaust memory. | `password.test.ts` |
| Login CSRF, forced logout or view switch from another site | `SameSite=Lax`, and every `POST /api/auth/*` refuses a foreign `Origin` or `Sec-Fetch-Site: cross-site`. | `handlers.test.ts` |
| Another site drives a logged-in browser at a data or paid API | `SameSite=Lax` and the proxy's session check. The route-level cross-site guard (403 on a foreign `Origin`) was on the review branch only and is not in this build (`docs/PRIVACY.md` § 5.1). | `proxy.test.ts` |
| Open redirect after login | `next` must be a same-origin relative path (no `//`, `\`, scheme, control characters, `/login`, `/api`), and one the role may open; otherwise `/`. | `access.test.ts` |
| Misconfigured deploy opens the app | With accounts set: a missing or short `LOBBY_AUTH_SECRET`, or a malformed `LOBBY_USERS` → nobody logs in (503 on login, every cookie invalid); the server log names the variable, never a value. **Public copy:** no `LOBBY_USERS` at all is the open demo on purpose (every request is the demo admin, `src/features/auth/demo.ts`), so set `LOBBY_USERS` before deploying with paid API keys. | `config.test.ts`, `resolve.test.ts`, `proxy.test.ts`, `proxy.openDemo.test.ts` |

**Deliberate exception.** `/api/reception/tools/*` skips the session check: ElevenLabs' phone agent calls it
server to server, and each call carries `x-reception-secret`, checked in constant time by the route.

**Residual risks (accepted for the demo).**

- The team's accounts share one password (team lead's choice; the jury account has its own). If it
  leaks, regenerate `LOBBY_USERS` with a new one; rotating `LOBBY_AUTH_SECRET` logs every session out.
- Sessions are stateless: one can't be revoked before it expires except by removing the user from
  `LOBBY_USERS` or rotating the secret.
- **The named security step before a pilot** (`TODO(phase-3)`): one account per person with its own
  password, and sessions that can be revoked one by one (a server-side session list, or a session
  version per user checked on every request), with a shorter session than 12 h on a shared desk PC.
  Then a leaked token or a person who leaves is one revocation, not a new secret for everyone.
- The login limiter lives in memory per server instance. On Vercel the client IP header is set by the
  platform; locally it can be spoofed (irrelevant there).
- The data and paid APIs (`/api/identify`, `/api/scene`, `/api/reception/calls`, `/api/voice/token`,
  `/api/reception/token`) rely on the proxy and `SameSite=Lax` alone in this build: the route-level
  cross-site guard and per-user rate limits were on the review branch only (`docs/PRIVACY.md` § 5.1). Server Functions
  don't exist today; any added later must call `getSession()` itself, because a proxy matcher change can
  silently drop coverage.
