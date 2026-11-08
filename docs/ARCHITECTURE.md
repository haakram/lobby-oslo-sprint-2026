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
`ROUTES_BY_ROLE` / `canAccess` in `src/features/auth/roles.ts`. Roles: `admin` (everything, and the view
switcher), `receptionist`, `robot`, and `host` ("Vert", an Airbnb host: only `/vert` and below, plus the
shared routes; `homeFor(role)` sends the host to `/vert` after login and from `/`, never to a 403 on the
front page). `/api/auth/view` takes only the hotel's views (`ADMIN_VIEWS`); `host` there is a 400. Public: `/login`, `/api/auth/login`,
`/api/auth/logout`, Next's assets, the favicon, and `/api/reception/tools/*` (ElevenLabs webhook, its own secret).

### 4.3 Shared types and events

**Run log v1 (Track A → Track B).** The Night Shift agent writes one JSON object per line to
`temp/runs/<shift>.jsonl`, `"v": 1` on every line. Types: `start` (shift, mode, seed; additive: `build`
{commit, dirty} = the checkout's git commit and whether tracked files differed from it, `flags` {score_blind,
experiments, price_switches, env (the NS_* variables)}), `call` (cmd,
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

Decision kinds of the integrated final build (additive; every kind the code logs that is not listed
above; data fields as written by `Executor.log` / `ShiftSession.log_decision`). The viewer ignores kinds
it does not know.

Tasks and requests:
- `task_start`: `{request, kind, room, item}`.
- `note`: `{request, text}`; free-text remark of a flow (a skipped bag, a failed top-up).
- `request_skipped`: `{request, text, was_queued, reported, reply}`; the night manager skipped a request.
- `room_checked_out`: `{room, request, dropped}`; the guest left, queued tasks for that room were dropped.
- `override_declined`: `{request, text}`; a guest message relayed by the desk that countermands the manager.
- `brain_classified`: `{request, kind, room, item}`; the Brain's accepted classification.
- `picked_for_later`: `{request, item, during}`; an item for another queued request taken on the way.
- `experiment`: `{name, request, verified, reply, score}`; `report_unverified`: `{request, reply}`.
- `executor_error`: `{request, error, message, where}`; `after_task_failed`: `{request, reason}`;
  `opening_failed`: `{step, reason}`; `wybe_error`: `{error, streak}` or `{error, during: "end_shift"}`;
  `end_failed`: `{error}`.

Planner:
- `plan_mode`: `{mode: "overload" | "spt", queue, backlog_min, battery}`; logged when the mode flips.

Battery and charging:
- `battery_low`: `{battery, at, dock, reserve, forced, target}`; `battery_unknown`: `{battery}`;
  `charge_deferred`: `{battery, queued, inbox, running}`; `charge_failed`: `{error, reason}`.
- `charge_woken`: `{battery, queued}` (a message woke the charge); `charged`: `{battery, woken, wakes}`.
- `charge_block`: `{from, to, minutes, queued, woken, forced, target}`; one per charging block.
- `top_up`: `{from, to, to_place, minutes, woken, queued, request}`; charging on the way (navigate top-up).
- `skipped_while_charging`: `{request}`; the manager skipped the running task while the robot charged.
- `dock_kept` `{dock, at, clock}` · `dock_learnt` `{dock, believed}` · `dock_reverted` `{dock, learnt, reason}` ·
  `dock_out_of_reach` `{at, dock, reason}` · `dock_replan` `{at, dock, reason, dropped}`.

Stock and cart:
- `restock`: `{want, short}`; `loadout_top_up`: `{at, picked}`; `stock_cart`: `{picked}`;
  `stock_cart_skip`: `{place, reason}`; `stock_miss`: `{item, at}`; `hands_full`: `{item, at}`;
  `cart_dropped`: `{at, to_reach, ok, left_in_cart}`; `get_cart_failed`: `{reason}`; `ensure_item_failed`: `{item, reason}`.
- `survey`: `{from_place, looked, stock}`; `survey_skip`: `{place, reason}`; `survey_failed`: `{reason}`.

Lost items:
- `lost_item_seen`: `{item, at}` (a look listed it); `lost_item_vanished`: `{item, at}` (it is gone from where it was seen).
- `lost_item_beyond`: `{item, candidates, request}`; `lost_item_ambiguous`: `{item, candidates}`; `found_item_gone`: `{item, at, reply}`.
- `scan`: `{at, found}`; `scan_skip`: `{place, reason}`; `scan_cap`: `{request, cap, queued}` (busy scan cap hit);
  `look_failed`: `{at, reason}`; `wait_failed`: `{reason}`.

Signs and wet floors:
- `sign_moved`: `{request, place, old_request}`; `sign_move_failed`: `{request, place, reason}`.
- `wet_floor`: `{edge: [from, to], slipped, navigated?}`.

Asking people:
- `asked_manager`: `{request, phrase, reply}`; `manager_answer`: `{request, room, phrase}`;
  `asked_room`: `{guest, room, answer}`; `clerk_named_someone_else`: `{guest, answer}`;
  `desk_note`: `{object, request, text}`; `keycard_withheld`: `{room, who, final?}`; `probe`: `{name, request, reply}`.

Map and movement:
- `map_learnt`: `{at, lost, new}`; `edge_learnt`: `{edge: [from, to], metres}`; `replan`: `{at, reason, to}`;
  `stale_room_link`: `{room, corridor}`; `move_refused_repeatedly`: `{at, to, times, reason, edge_dropped}`;
  `navigate_declined`: `{at, to, reply}`; `navigate_short`: `{at, to}`;
  `explore_skip`: `{place, reason}`; `floor_explored`: `{floor, target, looked, found, reason?}`.

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
| `NIGHTSHIFT_MAX_RPS` | Track A agent client | no (default 16) | `.env.example` |
| `SECRETS_CLEAR_AFTER` | `scripts/secrets.sh` | no (default 60) | `.env.example` |
| `VIEWER_ALLOWED_ORIGINS` | Track A viewer server (CORS on `/api/*`) | no (default `http://localhost:3000,http://127.0.0.1:3000`) | `.env.example` |
| `NEXT_PUBLIC_VIEWER_URL` | Lobby app (Oversikt, Rom, Gjester, Forespørsler, Vedlikehold, 3D-kart, Natteskift and the bell ask this viewer server for a live night) | no: not a secret, optional; blank = the recorded night (`public/runs`) without a live connection | `.env.example`; `.env.local` when the viewer runs |
| `FINAL_ARMED` | Track A final-mode lock | no | real environment only, never a file (export in the shell) |
| `ELEVENLABS_API_KEY` | Track B server | **yes** | Hamad's `.env.local` (written by the ElevenLabs CLI), sent privately |
| `ELEVENLABS_AGENT_ID` | Track B server (`/api/voice/token`), `src/features/voice/setup-agent.ts` | no (blank in `.env.example`; printed by `setup-agent.ts`) | `.env` and Vercel project settings |
| `APP_CLAUDE_BUDGET_USD` | Track B server (Claude spend meter) | no (default 5) | `.env.example` |
| `ELEVENLABS_RECEPTION_AGENT_ID` | Track B server (`/api/reception/token`, `/api/reception/calls`), `src/features/reception/setup-agent.ts` | no: not a secret; defaults to the team's agent (`RECEPTION_AGENT_ID_DEFAULT` in `src/lib/env.ts`), set it only to use another agent | `src/lib/env.ts`; optional override in `.env` |
| `RECEPTION_PUBLIC_URL` | `src/features/reception/setup-agent.ts` (webhook mode; `https://` only) | no (blank in `.env.example`) | `.env` when setting up the phone agent |
| `RECEPTION_TOOL_SECRET` | Track B server (`/api/reception/tools/[tool]`), `src/features/reception/setup-agent.ts` | **yes**: at least 24 characters, also stored at ElevenLabs as a workspace secret | `.env` and Vercel project settings |
| `LOBBY_AUTH_SECRET` | Lobby app: `src/proxy.ts`, `/api/auth/*`, `getSession()` (HMAC key of the session cookie) | **yes**: at least 32 random bytes (`node scripts/lobby-hash.mjs --secret`); rotating it logs everyone out; missing = nobody logs in | `.env` and Vercel project settings |
| `LOBBY_USERS` | Lobby app: `src/proxy.ts`, `/api/auth/*`, `getSession()` (accounts, roles, scrypt hashes) | **yes** (hashes, never passwords; keep private): `node scripts/lobby-hash.mjs --users <password>` (five accounts: hamad, shiraz, resepsjon, robot, and `vert` with role `host`; regenerate when an account is added); missing = nobody logs in | `.env` and Vercel project settings |

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
