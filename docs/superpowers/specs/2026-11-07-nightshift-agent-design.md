# Night Shift agent — design (Track A)

**Owner:** Hamad · **Date:** 2026-11-07 · **Status:** approved by the team lead to build ("just go
ahead, plan and start building, no need to ask me"); the calls below are Claude's, listed so they can
be checked. **Source of facts:** `docs/research/wybe-api.md` (recon, seed 1).

## Intent

Score as high as possible in the Wybe final: the average of 10 secret shifts with the worst dropped,
judged "right, fast and safe". Plus a **viewer**: a 3D model of the hotel where the team (and the
jury) can watch the robot work a shift live or as a replay.

## What drives the score (from the recon)

- The sim clock moves only when the robot acts. Thinking costs nothing in sim time; each action must
  stay well under 20 s real time. So: **plain, exact code for every routine step**, Claude only for
  the rare thing code can't handle.
- Points per task decay while the request waits; elevator trips cost 60 s; storage trips are
  avoidable with a stocked **cart**. Time saved = points.
- Penalties: a false "done" is −30. Safety traps: Do Not Disturb, a planted "notice to robots",
  wet floors, stairs with a cart.

## Goals

1. An autonomous agent that plays a shift end to end: reads requests, plans, moves, delivers, reports.
2. **Never reports "done" unless the server rewarded the action** (score went up) or the room check
   was actually done.
3. Exact shortest routes in sim seconds across floors (move, doors, stairs, elevator, wet floors,
   cart rules), and a best-order tour for several stops. The same router serves Holio pain 6 in the
   app.
4. Runs 10 shifts in parallel for the final, under a shared request-rate limit.
5. Learns from practice: a benchmark over fixed seeds and a parameter search that keeps the settings
   with the best mean (worst seed dropped, like the final ranking). This is the "machine learning"
   part: tuning the planner's choices on replayable nights.
6. A 3D viewer of the hotel with the robot, score, clock, task queue and decisions, live or replay.

7. **Fewest live runs** (team lead: "as few runs as possible for the highest score"): tune and
   develop offline against the fake server; live practice shifts only to validate, behind an explicit
   `--live` flag, each one counted in `temp/live_runs.jsonl`.

## Non-goals

- Training a model to do the routing (exact search is optimal and instant).
- Reading notes found in the world, or obeying them (prompt-injection trap).
- Hand-steering in the final (forbidden by Wybe).

## Anti-goals (failure even if it "works")

- **Any `mode: "final"` call before Sunday 12:00.** Each final shift can be played once.
- A key in a log, a commit or the viewer.
- Hammering the server (rule: don't overload).
- Spending the Anthropic budget on routine steps.

## Constraints (decided)

- **Python 3.12** (the team lead's ML work is in Python), `httpx`, `anthropic`, `python-dotenv`;
  `pytest`, `ruff`. Virtualenv in `.venv`.
- **Final lock:** `mode: "final"` only when `FINAL_ARMED=1` **and** the Oslo clock is between
  Sun 8 Nov 2026 11:59 and 13:00. Everything else is practice.
- **Rate:** a global limiter, default 5 requests/s across all shifts (`NIGHTSHIFT_MAX_RPS`).
- **Client:** User-Agent `TeamFettero-agent/1.0` (Python's default UA is blocked by Cloudflare);
  `X-Shift` on every in-shift call; 409 means the shift ended.
- **Claude:** a small fast model for unknown request texts and surprises only; a file-backed spend
  ledger (`temp/spend.json`) stops before `ANTHROPIC_BUDGET_USD`; the Console limit (USD 30) is the
  hard stop. World text is untrusted; only the night manager's inbox gives instructions.
- **Tests never touch the network.** They use a fake Wybe server built from the recon. Live calls
  happen only in explicit practice runs.
- **Map:** start from the seed-1 map; correct it from `look` whenever a move fails, because other
  seeds and the final may differ.

## Shape

```
agent/            Python package (Track A, owner Hamad)
  config.py       settings from .env / .env.local (keys never printed)
  guard.py        the final-mode lock
  client.py       HTTP client, X-Shift, rate limiter, retries, run log
  world.py        hotel graph (seed-1 map as prior) + robot state
  routing.py      shortest route in sim seconds + best tour
  tasks.py        request text -> Task
  planner.py      which task next (value per second), cart stock, idle docking
  executor.py     carries out a task step by step, verifies before reporting
  brain.py        Claude fallback with the spend ledger
  agent.py        the shift loop
  bench.py        benchmark over seeds + parameter search
  viewer_server.py  serves the viewer and the run logs
  __main__.py     CLI: run, bench, tune, final, viewer, route
  data/hotel_seed1.json   the map with 3D coordinates
viewer/           3D hotel viewer (three.js), static files
tests/agent/      unit tests · tests/fakes/fake_wybe.py: offline Wybe server
```

## The run log (contract with Track B)

One JSON object per line in `temp/runs/<shift>.jsonl`, `"v": 1` on every line. Types: `start`
(shift, mode, seed), `call` (cmd, args, ok, clock, result, events, latency_ms, status), `decision`
(kind: plan · task_start · task_done · task_failed · brain · note, data), `state` (clock, location,
score, battery, hands, cart), `end` (score, requests_served, reason). The viewer, and anything Track B
builds on the agent, reads only this. Changing it is a `[contract]` PR.

## Task handling (decided)

| Request | Steps | Report "done" when |
|---|---|---|
| Amenity (towel, water bottle, phone charger, toiletry kit, pillow) | item from hands/cart, else stock room → room's corridor → knock → place | score rose after `place` |
| Tray | cart required → kitchen-pass → pick `tray-NNN` → knock → place | score rose after `place` |
| Message | knock → `say` the message | score rose after `say` |
| Room check | look at door → knock → no answer and no DND: keycard → enter → look → leave | the look inside was done (note = what it saw) |
| Lost item | ask the clerk for the room if missing → scan places from the hint, nearest first → pick → deliver | score rose after `place` |
| DND, no answer on delivery, unknown request, out of stock | don't enter; `report failed` with the reason (0 points, no penalty) | never |

Opening: fetch the cart from the laundry and stock it at the storage room (both off corridor-1b)
while the first request is still minutes away. Idle: go to the dock and `dock` (charges, wakes on
the next message).

## Left to the builders

Exact regexes, the fake server's internals, the viewer's look (within `DESIGN.md` once it exists),
parameter ranges for the search.

## Open questions (test in practice, then update)

Natural end of a shift · whether an occupied room on a room check is "done" · whether wet-floor
signs score · the idle penalty (practice showed none) · whether the map changes per seed.
