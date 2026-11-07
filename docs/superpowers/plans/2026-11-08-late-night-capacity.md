# Plan: late-night capacity for the Night Shift agent (Track A)

> Spec: `.superpowers/sdd/2026-11-07-nightshift-agent/seed16-diagnosis.md` (main checkout) and
> `docs/research/wybe-api.md`. Goal: on rich nights (80–85 requests) the agent serves what it now
> leaves unserved after ~03:00. Seed 16 live: 1,930 of ~3,750 formula points; 14 requests never
> reached; from 03:58 to 06:00 about 20 forced short docks with 3–10 requests waiting.

## Global constraints (binding for every task)

- Python 3.12, stdlib + `httpx` only. Tests: `/Users/hamadaliakram/Oslo_Sprint_26/.venv/bin/python -m pytest tests/agent -q`
  from the worktree root (627 tests pass today; all must still pass; none disabled). Lint: the same venv's `ruff check agent tests`.
- **Never call the live server** (`--live`) from a task: offline fake only (`agent/offline.py`, `python -m agent bench`).
- Touch only `agent/` and `tests/agent/` (and this plan's report files). No reformatting of untouched code.
- Run-log contract (ARCHITECTURE § 4.3): new `decision` kinds are allowed (additive) and must be listed in the task
  report so the controller documents them. Never change existing line shapes.
- Battery facts [obs]: drain ≈ 0.9 %/min of sim time while not docked (walking, waiting for the elevator, scanning,
  looking alike); charge 1 %/min docked, capped at 100 %; `dock` wakes on a new message ("A new message woke it up");
  `dock` at 100 % is refused (2 s); at 0 % the robot is stranded: −200 and the shift is over.
- Sim costs [obs]: move 1 s/m (+3 s closed door), navigate ≈ 1.25 s/m, call_elevator 45 s, ride 15 s, look/say 5 s,
  pick/place/use 10 s, knock 15 s, scan 60 s, ask 30 s, read 20 s; status/inbox/report 0 s. Night ends 06:00.
- Scoring [obs]: pay per request grows ≈ 8 %/h over the night; waiting costs ≈ 0.5 point/min (calibrated range 0.4–0.8);
  false `done` −20…−40; `declined`/`cancelled`/`failed` cost nothing; a skipped (checked-out) request scores 0 even
  when done.
- Commit per task on the task's branch with a clear message; never push, merge or deploy.

Two branches, built in parallel in separate worktrees (ruling: they touch different files).

- **Branch `hamad/energy`** (worktree `/Users/hamadaliakram/oslo-wt/energy`): Tasks 1–4 (`agent/bench.py`,
  `agent/offline.py`, `agent/executor.py`, `agent/planner.py`, `agent/agent.py`).
- **Branch `hamad/hygiene`** (worktree `/Users/hamadaliakram/oslo-wt/hygiene`): Tasks 5–8 (`agent/flows.py`,
  `agent/flows_extra.py`, and only `_skip` in `agent/agent.py` plus a new set attribute on `Executor`).

---

## Task 1 — Rich-night bench knob and battery realism in the fake (branch `hamad/energy`)

Why: Tasks 2–4 must be measured offline on nights as rich as seeds 10/16/23 (82–85 requests), and the fake must
strand the robot like the live server does, or a bad charging policy looks fine offline.

1. `agent/bench.py`: add `hourly_scale: float = 1.0` to `_arrivals(rng, end_s, hourly_scale=1.0)` (each
   `_HOURLY` count × scale before the jitter) and to `offline_scenario(seed, end_clock=OFFLINE_END, hourly_scale=1.0)`;
   seed 1 (the live replay) ignores the scale. Plumb a CLI flag `--hourly-scale FLOAT` (default 1.0) on `bench` and
   `tune` in `agent/__main__.py` through `run_bench`/`tune` to the scenario. `--hourly-scale 1.3` must give
   generated nights of about 85–92 requests (print the request count per seed in the bench table if it is not there).
2. `agent/offline.py`: check and, where missing, make the fake match the live facts above: drain 0.9 %/min on every
   sim-time-advancing action including `call_elevator`, `scan`, `look`, refused actions and the elevator ride; charge
   1 %/min docked, capped at 100 %; `dock` at 100 % refused with "Battery is already full." (2 s); dock wakes on the
   next message; **at ≤ 0 % the shift ends**: the reply says `"The battery is dead. ... Shift over."`, the score
   drops by 200, later calls get the ended-shift error (HTTP 409 path the client maps to `ShiftEnded`). Keep the
   existing wording constants where tests assert them; add tests for the new behaviour in `tests/agent/test_fake_wybe.py`.
3. Run the baseline and write it to the report: `python -m agent bench --seeds 2-13 --parallel 6 --sim-end 06:00:00
   --max-calls 0 --hourly-scale 1.3` and the same at `--hourly-scale 1.0`. Report per seed: requests, score, calls,
   served, and (if the bench prints it; else add it) the minimum battery and the number of `dock` calls.

Tests: scale 1.3 yields ≥ 80 requests on seeds 2–5; seed 1 unchanged; stranding ends the shift with −200.

## Task 2 — Navigate only in the final (branch `hamad/energy`)

Why: `Executor._nav_min_hops` (agent/executor.py ~460) switches to `navigate` once the night's projected calls pass
1,250. That protects the final's call cap (10 shifts share 5 req/s for 44 min), but navigate costs ≈ 25 % more sim
time per metre and the same battery per minute, so on a rich practice night (1,700+ calls) most legs are walked 25 %
slower from 23:00 on: ~15–20 min and ~15 % battery a night, in the hours that pay most.

1. `_nav_min_hops`: return `None` (no navigate) unless `self.session.mode == "final"` or `NS_NAV_MIN_HOPS` is set
   (the env override keeps working in both modes; `0` still switches it off). Check how `ShiftSession` exposes the
   mode (agent/client.py) and use that attribute.
2. Tests in `tests/agent/test_executor.py` (or where `_nav_min_hops` is tested today): practice mode never
   navigates even at a high call pace; final mode behaves as before; the env override wins.

## Task 3 — Charge in blocks during the rush (branch `hamad/energy`)

Why (seed 16 live, 03:58–06:00): about 20 forced docks of 0–13 min, each woken by the next message after a few
minutes, each costing a walk to the dock and back (an elevator call + ride each way when the work is upstairs:
2+ min and ~2 % battery per cycle, i.e. the energy of most of a task). The robot rode at 7–18 % for two hours.

In `agent/executor.py` (`_charge`, constants near line 61):

1. New constants: `CHARGE_TARGET_FORCED = 45.0` (% a forced charge aims for), `BATTERY_CRITICAL` 10 → 15.
2. In `_charge`, when `forced` is true: after a `dock` reply that was woken by a message, do **not** break; log the
   wake (`charge_woken`, battery, queued) and dock again at once (no walking, no task) until the battery is ≥
   `CHARGE_TARGET_FORCED`, the dock refuses as full, or `CHARGE_ROUNDS` is used up. The queued requests keep waiting:
   that decay is cheaper than another round trip. When not forced, the behaviour stays as today (a wake-up ends the
   charge so the request goes first).
3. Interleave cheap floor-1 work (should-have; keep only if Task 1's rich-night bench says it pays): inside a forced
   block, once the battery is above `BATTERY_CRITICAL + 10`, if a queued task is estimated under 150 s and needs no
   elevator (its `_stops` are all on the dock's floor), run it and come back to dock. Implement behind a module
   constant `INTERLEAVE_FLOOR1 = True/False` and report both bench results.
4. One decision line per block: `charge_block` `{"from": %, "to": %, "minutes": n, "queued": n, "woken": n,
   "forced": bool}`.
5. Tests (`tests/agent/test_executor.py` with the fake or a scripted client): a forced charge with messages arriving
   every 2 sim-min keeps docking until 45 %; a non-forced charge still stops on the first wake; the block decision is
   logged with the right counts.
6. Bench before/after at `--hourly-scale 1.3 --seeds 2-13 --max-calls 0` (Task 1's measuring stick): report score,
   dock calls, minimum battery, requests served, per seed and mean. Keep the change only if the mean score rises;
   if it falls, tune `CHARGE_TARGET_FORCED` (try 35 and 55) and report all three.

## Task 4 — Overload-aware ordering in the planner (branch `hamad/energy`)

Why: `planner.choose_next` is shortest-task-first, which minimises total waiting while everything can be served. After
~03:00 on a rich night it cannot: the queue (3–10) exceeds the time and battery left. Then the right rule is value per
robot-second (orienteering greedy), so the cheap, valuable work is done and the rest is declined at close-out.

In `agent/planner.py` (and the call site in `agent/agent.py` `run_shift`, which has the executor):

1. `Params.decay_per_min` default 1.0 → 0.5 (calibrated live).
2. New helpers: `value_at(task, finish_s, params)` = `max(VALUE_FLOOR, base × (1 + 0.08 × hours_since_22) −
   decay × waited_min)`, 0 past 06:00; `overloaded(tasks, state, hotel, params, battery)` = the backlog
   `1.25 × Σ estimate_seconds` does not fit before 06:00, **or** the battery cannot cover it:
   `battery − backlog_min × 0.9 < 10` (ignore the battery test when `state.battery` is unknown).
3. `choose_next(tasks, state, hotel, params, battery=None)`: unchanged (SPT) when not overloaded; when overloaded,
   rank by `−value_at(t, now + 1.25 × secs) / max(secs, 1)` with ties by secs. `Kind.UNKNOWN` stays last in both.
   The loop in `run_shift` passes `ex._battery()` (or the state's battery). Log one `plan_mode` decision when the
   mode flips (spt ↔ overload) with the queue length, backlog minutes and battery.
4. Tests in `tests/agent/test_planner.py`: existing order tests still pass; at 05:50 with a 4-min message and a 9-min
   lost item queued, the message is chosen; with battery 12 % and a 3-task backlog of 9 min, the overload rule
   picks the best value per second; `value_at` grows with the hour and shrinks with waiting.
5. Bench at `--hourly-scale 1.3 --seeds 2-13 --max-calls 0` before/after; keep only if the mean rises.

---

## Task 5 — Checked-out rooms (branch `hamad/hygiene`)

Why (seed 16 live): after "Skip R-053, 309 checked out. Don't bother with it." the robot still knocked on 309 for
another request (−10 at 04:16). Every queued task for that room is worth 0 and a knock there is penalised.

1. `agent/agent.py` `_skip`: parse the room from the skip text (`(\d{3}) checked out` → `room-NNN`; also the
   `room-NNN` form). Add the room to a new `Executor.checked_out: set[str]` (initialised in `Executor.__init__`).
   Drop every other queued task for that room: report each `declined` with the note "Guest checked out
   (manager's skip of R-NNN)", set its ledger status `declined`, log `room_checked_out` `{"room", "request", "dropped": [ids]}`.
2. `agent/flows.py`: before any knock, place, say or keycard use at a room in `ex.checked_out`, raise
   `Declined("room-NNN checked out tonight")` (the task is then reported `declined`, never `failed`/`done`). Put the
   check in one place that every room flow passes through (`_refuse_known_dnd` is called by all of them: add a
   sibling `_refuse_checked_out` next to it and call it from the same places, or fold it into a shared guard).
3. Tests: skip text drops the other task and declines it; a later request for that room is declined without a knock.

## Task 6 — Spill done only when it can be verified (branch `hamad/hygiene`)

Why: six live `done` reports for spills with the sign not on the new patch cost −30 each (one on seed 16, R-036);
verified ones (+43, +63) had the sign standing on the newly wet spot.

1. Read `agent/flows_extra.py` `spill`, `_find_wet`, `_rank` and the `spill_done` experiment. Make the rule: report
   `done` **only** when the sign was placed on a wet spot that was not known wet before this request (a new patch)
   and the robot is still on that spot; otherwise (no new patch found on the floor, the only wet spot is an old one,
   the place failed) report `declined` with the reason and leave the old sign alone. Never move a standing sign.
2. Tests in `tests/agent/` (the fake has wet spots; see how existing spill tests set them up): new patch → done;
   only an old patch → declined, no −30; sign placement failure → declined.

## Task 7 — Lost-item search under load (branch `hamad/hygiene`)

Why: lost-item hunts run up to 6–10 scans (60 s and ~1 % battery each) while other requests wait; on seed 16 a wallet
hunt failed after 10 scans during the rush.

1. `agent/flows.py` `_find`: when at least two other tasks are queued (`len(ex.queue) >= 2`), cap the scans at 3
   (`SCAN_CAP_BUSY = 3`), log `scan_cap` `{"request", "cap", "queued"}`; otherwise today's cap. A hunt that ends on
   the busy cap raises `ActionFailed("... not found after N scans (others waiting)")` so the request is reported
   `failed` (0, no penalty) and the robot moves on.
2. Tests: with 2 queued tasks the hunt stops after 3 scans; with none it runs to the usual cap.

## Task 8 — No door look before a plain knock (branch `hamad/hygiene`)

Why: `_knock` looks at the door (5 s) before every knock (15 s), ~50 times a night = ~4 min and ~4 % battery in the
hours that pay most. The knock itself reveals a DND sign ("No answer. A Do Not Disturb sign hangs on the handle."),
and `_refuse_known_dnd` already refuses rooms seen with a sign. The look stays where a keycard may be used (room
checks, bags: nobody must slip in, Task 27) and where the request is for a room already known DND.

1. `agent/flows.py` `_knock`: skip `_door_sign` for amenity, tray, message and noise flows; on "Do Not Disturb" in the
   knock reply, note the DND exactly as the look path does (`ex.ledger.note_dnd`, `room_status`). Keep the look in
   `room_check` and `bags` (keycard paths). Add a module constant `LOOK_BEFORE_KNOCK = False` so it can be switched
   back in one line.
2. Tests: a delivery knock issues no `look`; a DND reply still marks the room; room checks still look first.
