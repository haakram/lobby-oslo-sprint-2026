# ARCHITECTURE.md — Technical architecture

> How the app is built. PRD says what; this says how. Sections 3 and 4 are what let several people
> build in parallel without breaking each other: who owns which part, and the contracts between parts.

## 1. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | TBD | |
| Backend / API | Track A agent: Python 3.12 + httpx | Plays the Wybe Night Shift over HTTP. |
| Database | TBD | |
| Auth | TBD (or "none: seeded demo user") | |
| AI / LLM | Claude via `anthropic` (Python SDK) | Track A brain, capped at USD 30 (R7.7). |
| Hosting | TBD | |
| Package manager | pip + requirements files (Track A, `.venv`) | Versions pinned with `==`. |

## 2. Folder layout

```
.
├── CLAUDE.md · AGENTS.md · MEMORY.md · DESIGN.md · README.md · CONTRIBUTING.md
├── docs/            # the docs in CLAUDE.md's reading order
│   ├── sessions/    #   one handoff note per work session
│   ├── superpowers/ #   specs/ and plans/ from the brainstorming and planning skills
│   ├── research/    #   research notes
│   └── checks/      #   reviews, audits, test reports
├── src/             # app code (inner layout below)
├── tests/           # integration and e2e tests (unit tests sit next to the code)
├── scripts/         # setup.sh, check.sh, protect-main.sh, plus project scripts
├── .githooks/       # shared git hooks (installed by setup.sh)
├── .github/         # CI workflow, PR template
├── .claude/         # shared Claude Code commands (/kickoff, /handoff)
└── temp/            # gitignored: screenshots, scratch output
```

**`src/` layout: TBD at the rehearsal.** Rule of thumb: split by feature (`src/features/<name>/`)
rather than by file type, so two people rarely touch the same folder. Shared code (types, UI
primitives, API client) gets one clearly owned home.

## 3. Module ownership

<!-- Who owns which part. Owners review changes to their area; others ask before editing it.
     Keep in sync with CONTEXT.md § 9. -->

| Area | Paths | Owner | Backup |
|---|---|---|---|
| Track A: Night Shift agent | `agent/`, `tests/agent/`, `tests/fakes/`, `viewer/`, `requirements*.txt`, `pyproject.toml` | Hamad | ShirazIQ |
| Track B: Fettero app | TBD (set in the design spec) | ShirazIQ | Hamad |
| Shared contracts (the agent's log format the app reads, env vars) | `docs/ARCHITECTURE.md` § 4, `.env.example` | Hamad | ShirazIQ |
| Repo tooling, CI, docs | `scripts/`, `.githooks/`, `.github/`, `.claude/`, `docs/` | Hamad | |

## 4. Contracts

> Change any of these only with the doc updated in the same PR, `[contract]` in the PR title, and
> the team told. Everyone else's code depends on them.

### 4.1 Data model

TBD — entities, fields, relations. A table per entity is enough.

### 4.2 API

| Method | Path | Request | Response | Owner |
|---|---|---|---|---|
| POST | `/api/auth/login` | JSON `{ username, password, next? }` (zod: `^[A-Za-z]{2,24}$`, 1–128 chars), same origin | 200 `{ session, next }` + `lobby_session` cookie · 400/401 `{ error }` (generic) · 403 cross-site · 429 + `Retry-After` · 503 not configured | Hamad (auth) |
| POST | `/api/auth/logout` | `{}`, same origin | 200 `{ ok: true }`, cookie cleared | Hamad (auth) |
| GET | `/api/auth/session` | the cookie | 200 `{ session: { user: { u, name, role }, view, effectiveRole, exp } }` · 401 | Hamad (auth) |
| POST | `/api/auth/view` | JSON `{ view: "admin" \| "receptionist" \| "robot" }`, admins only, same origin | 200 `{ session }` + re-signed cookie · 400 · 401 · 403 | Hamad (auth) |

Every other route sits behind `src/proxy.ts`: logged out → 307 to `/login?next=…` (pages) or 401 `{ error }`
(APIs); a role that may not open it → 403 (the "Ingen tilgang" page, or `{ error }`). Who may open what:
`ROUTES_BY_ROLE` / `canAccess` in `src/features/auth/roles.ts`. Public: `/login`, `/api/auth/login`,
`/api/auth/logout`, Next's assets, the favicon, and `/api/reception/tools/*` (ElevenLabs webhook, its own secret).

### 4.3 Shared types and events

**Run log v1 (Track A → Track B).** The Night Shift agent writes one JSON object per line to
`temp/runs/<shift>.jsonl`, `"v": 1` on every line. Types: `start` (shift, mode, seed), `call` (cmd,
args, ok, clock, result, events, latency_ms, status), `decision` (kind: plan · task_start · task_done ·
task_failed · brain · note · room_status · work_order · hypothesis · noise_look · person, data), `state`
(clock, location, score, battery, hands, cart), `end` (score, requests_served, reason). The 3D viewer
(`viewer/`, served by `python -m agent viewer`) and anything
Track B shows about the agent read only this. Hotel map: `agent/data/hotel_seed1.json` (nodes with
floor, kind, x, z; edges in metres). Shortest routes for the app (Holio 6):
`python -m agent route <from> <to>`. Details: `docs/superpowers/specs/2026-11-07-nightshift-agent-design.md`.

Data of the newer decision kinds (Track A, additive):

- `room_status`: `{"room": "room-206", "status": "klar" | "opptatt" | "ikke_forstyrr" | "ma_vaskes", "source": "room_check" | "knock" | "door_sign", "note": "<what the robot saw>"}`
- `work_order`: `{"room": "room-201" | null, "place": "corridor-3a" | null, "type": "stoy" | "sol" | "teknisk" | "gjesteklage" | "annet", "text": "<short Norwegian description>", "request": "R-025" | null}`
- `hypothesis`: `{"id": "<H-id>", "request", "action", "score_before", "score_after"}`, exactly one per run of
  a hypothesis flow (H-named, H-bags, H-noise, H-spill, H-followup, H-duplicate, H-bathrobe; `request` is
  null for H-bathrobe); optional extras `guest`, `room`, `seen`, `original`, `text`, `score_at_start`.
- `noise_look`: `{"request": "R-010", "at": "corridor-2a", "description": "<look text>", "people": ["<name state>"]}`
- `person`: `{"text": "<what the person said>", "repeat": true | false}`; `repeat` = the same words within
  10 sim-minutes, not answered again.

Decision kinds added for the final's readiness (Task 18, additive):

- `adopted_shift`: `{"shift": "w2-…", "started": "Sun 12:00" | null}`; a restarted `final` took over a
  live final shift of this team instead of starting a new one. The shift's log then holds a second
  `start` line (from the new process) before this decision.
- `task_requeued`: `{"request": "R-012", "error": "<server error text>"}`; a server error in the middle
  of the task; it was put back once and runs again later.
- `task_given_up`: `{"request": "R-012", "error": "<server error text>", "time_left": true | false}`;
  the second such error (or no time left): the task is reported `failed` with the reason, never `done`.
- `report_failed`: `{"request": "R-012", "error": "<server error text>"}`; that give-up report itself
  failed; the request stays `pending` in the ledger.
- `brain_rejected`: `{"request": "R-030", "kind": "room_check", "room": "room-999" | null, "reason":
  "<why>"}`; the Brain's answer was refused (a room check on a noise/complaint/object text, or on a
  room the map does not have); the request stays unknown and is reported `failed`.
- `walk_interrupted`: `{"at": "corridor-1a", "towards": "charging-dock"}`; the idle walk back to the
  dock stopped at this node because a request arrived; the request is planned from here.
- `setup_failed`: `{"reason": "setup failed: <Error>: <message>"}`; written right after `start` when
  the shift could not be set up; the shift is ended and the `end` line carries the same reason.

Task 22 (additive): `report_skipped_ambiguous`: `{"request": "R-014", "other": "R-005", "room": "room-314",
"item": "water-bottle"}`; the delivery scored, but an earlier not-done order for the same room and item
(waiting, declined as a duplicate, failed or unreported) may have earned that rise, so the request is not
reported at all; its `task_failed` line has status `skipped`.

`task_done`/`task_failed` `points` (changed with Task 18): the score rise the flow itself observed,
from the loop's last `status` before the task to the flow's verifying `status` after its last
`place`/`say`. It **excludes the report's own +5**, which shows on the next `state` line. Sum
`state.score`/the `end` line for totals, not `points`.

### 4.4 Environment variables

Every variable in `.env.example`, with what reads it. Keys reach teammates only through `scripts/secrets.sh` (OPERATIONS § 4), never GitHub. Added (blank) to `.env.example` and here in the
same PR that first reads it.

| Name | Read by | Secret? | Real value lives in |
|---|---|---|---|
| `WYBE_NIGHTSHIFT_URL` | Track A agent | no (default in `.env.example`) | `.env.example` |
| `WYBE_NIGHTSHIFT_KEY` | Track A agent | **yes**: one team, one key | Hamad's `.env`, sent privately |
| `ANTHROPIC_API_KEY` | Track A agent, Track B server | **yes** | Hamad's `.env`, sent privately |
| `ANTHROPIC_BUDGET_USD` | everything that calls Claude | no (default 30) | `.env.example` |
| `NIGHTSHIFT_MAX_RPS` | Track A agent client | no (default 5) | `.env.example` |
| `SECRETS_CLEAR_AFTER` | `scripts/secrets.sh` | no (default 60) | `.env.example` |
| `VIEWER_ALLOWED_ORIGINS` | Track A viewer server (CORS on `/api/*`) | no (default `http://localhost:3000,http://127.0.0.1:3000`) | `.env.example` |
| `FINAL_ARMED` | Track A final-mode lock | no | real environment only, never a file (export in the shell) |
| `ELEVENLABS_API_KEY` | Track B server | **yes** | Hamad's `.env.local` (written by the ElevenLabs CLI), sent privately |
| `ELEVENLABS_AGENT_ID` | Track B server (`/api/voice/token`), `src/features/voice/setup-agent.ts` | no (blank in `.env.example`; printed by `setup-agent.ts`) | `.env` and Vercel project settings |
| `APP_CLAUDE_BUDGET_USD` | Track B server (Claude spend meter) | no (default 5) | `.env.example` |
| `ELEVENLABS_RECEPTION_AGENT_ID` | Track B server (`/api/reception/token`, `/api/reception/calls`), `src/features/reception/setup-agent.ts` | no: not a secret; defaults to the team's agent (`RECEPTION_AGENT_ID_DEFAULT` in `src/lib/env.ts`), set it only to use another agent | `src/lib/env.ts`; optional override in `.env` |
| `RECEPTION_PUBLIC_URL` | `src/features/reception/setup-agent.ts` (webhook mode; `https://` only) | no (blank in `.env.example`) | `.env` when setting up the phone agent |
| `RECEPTION_TOOL_SECRET` | Track B server (`/api/reception/tools/[tool]`), `src/features/reception/setup-agent.ts` | **yes**: at least 24 characters, also stored at ElevenLabs as a workspace secret | `.env` and Vercel project settings |
| `LOBBY_AUTH_SECRET` | Lobby app: `src/proxy.ts`, `/api/auth/*`, `getSession()` (HMAC key of the session cookie) | **yes**: at least 32 random bytes (`node scripts/lobby-hash.mjs --secret`); rotating it logs everyone out; missing = nobody logs in | `.env` and Vercel project settings |
| `LOBBY_USERS` | Lobby app: `src/proxy.ts`, `/api/auth/*`, `getSession()` (accounts, roles, scrypt hashes) | **yes** (hashes, never passwords; keep private): `node scripts/lobby-hash.mjs --users <password>`; missing = nobody logs in | `.env` and Vercel project settings |

## 5. External services

| Service | What for | Free tier / cost | Account owner |
|---|---|---|---|
| GitHub | repo, CI, PRs | free on a public repo | Hamad |
| TBD | | | |

## 6. Security basics

- Secrets only in env vars, read server-side. Nothing secret in client code or a public env prefix
  (`NEXT_PUBLIC_`, `VITE_`, …).
- Every input is validated at the boundary (request bodies, params, uploads, LLM output used as data).
- No real personal data anywhere; demo and seed data are made up.
- TBD — anything stack-specific (auth, row-level security, CORS, rate limits).

## 7. Testing strategy

TBD — what we test (the demo path first, then tricky logic), with which tools, and how
`scripts/check.sh` runs them.

## 8. Deployment

TBD — platform, what a merge to `main` deploys, preview URLs per PR, how to roll back.
