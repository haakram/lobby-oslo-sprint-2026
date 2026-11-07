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
   (the env override keeps working in both modes; `0` still switches it off). `ShiftSession.mode` (agent/client.py:165)
   holds the mode. In final mode the projection limit is `self.session.call_cap` when set, else `CALL_PROJECTION_LIMIT`
   (the final will set the cap from the measured rate limit).
2. Adaptive wet-floor re-looks (same file, `_stale_before_corridor` ~line 498, `WET_LOOK_S` line 48): live seed 16
   spent 143 re-looks (12 sim-min, 169 calls) to avoid at most 2 slips. Keep `WET_LOOK_S = 10 * 60` when the robot
   is not busy; use `WET_LOOK_BUSY_S = 45 * 60` when `len(self.queue) >= 2` or the battery is below 40 %. A corridor
   never looked at is still looked at before the first step in (safety unchanged).
3. The server's rate limit, measured 2026-11-07 22:50 on one practice shift with `status` bursts: 5, 10 and 20 req/s
   clean (0 errors, p50 36 ms); at ~22 req/s HTTP 429 "Too many requests. Slow down." on 35 of 179 calls. Our
   limiter default of 5 req/s (`NIGHTSHIFT_MAX_RPS`, agent/config.py) is therefore a guess 4× too low, and the
   final's self-imposed 1,320-call share cut every rich night at 04:16–05:02 (−280 to −750 points a night). Change
   the default to **16** in `agent/config.py` and `.env.example` (comment: measured 20 clean, 429 above ~22), check
   that `client.py`'s 429 handling backs off (Retry-After or 1 s) and retries the same call, and that
   `bench.default_max_calls(16)` (= 4,224) makes the final's projection limit irrelevant. Add `.env.example` and
   `docs/ARCHITECTURE.md` § 4.4 (the default column) to this task's allowed files.
4. Tests in `tests/agent/test_executor.py` (or where `_nav_min_hops` is tested today): practice mode never
   navigates even at a high call pace; final mode behaves as before; the env override wins; the stale window is
   45 min with 2 queued tasks and 10 min with none; a 429 reply is retried after the backoff.

## Task 3 — Charge in blocks during the rush (branch `hamad/energy`)

Why (seed 16 live, 03:58–06:00): about 20 forced docks of 0–13 min, each woken by the next message after a few
minutes, each costing a walk to the dock and back (an elevator call + ride each way when the work is upstairs:
2+ min and ~2 % battery per cycle, i.e. the energy of most of a task). The robot rode at 7–18 % for two hours.

Live facts that shape the design [obs, throttle-audit.md]: a `dock` sent while a message is already unread returns at
once ("Docked for 0 min … A new message woke it up"; 9 of 38 woken docks on seed 16 were 0-min); any dock lasts only
until the next arrival (mean 3.6 min after 03:00), so BATTERY_OK 60 was never reached late. Long charges are therefore
**chains of short docks with the inbox read (0 s) between them**, never one long dock. The real active drain is
0.70–0.76 %/min (not 0.9); keep `DRAIN_PER_MIN` for reserves (conservative) but use 0.75 in any new estimate.

In `agent/executor.py` (`_charge`, `ensure_battery`, constants near line 61) and `agent/agent.py` (`run_shift`):

1. Inbox hook. Add to `Executor.__init__`: `self.read_inbox: Callable[[], None] | None = None`. In `run_shift`
   (agent.py), right after `ex.queue = pending`, set `ex.read_inbox = lambda: _read_inbox(ex, brain, seen, pending)`.
   Use exactly these two lines (the hygiene branch adds the same two lines for its reply flow; identical hunks merge
   clean). Inside the executor, "read the inbox" means `self.read_inbox()` when set, else `self.cmd("inbox")`.
2. New constants: `CHARGE_TARGET_FORCED = 40.0`, `BATTERY_CRITICAL` 10 → 15, `CHARGE_TARGET_MIN = 20.0`. The target of
   a forced block shrinks toward 06:00: `target = max(CHARGE_TARGET_MIN, min(CHARGE_TARGET_FORCED, 10 + 0.4 ×
   minutes_left))` (Ghosts' rule; a 25 % charge 20 minutes before the end is wasted).
3. In `_charge`, when `forced`: never send `dock` while `self.inbox_waiting` (read the inbox first); after a dock woken
   by a message, read the inbox (hook), log `charge_woken` (battery, queued) and dock again at once (no walking, no
   task) until the battery is ≥ target, the dock refuses as full, or `CHARGE_ROUNDS` (raise to 20) is used up. When not
   forced, a wake-up still ends the charge (the request goes first).
4. Ordering bug: `ensure_battery` runs in the loop after `pending.remove(task)` (agent.py ~392) and in `flows.handle`
   (flows.py:63) after the task was popped, so the running task does not count as work waiting (6 charges on seed 16
   started while holding the only request). Count the running task: `Executor.run` sets `self.current = task` before
   the flow and clears it after (check whether the merged variant 20 already added `current`; reuse it if so), and
   `_work_waiting` returns true when `self.current` is set.
4b. Pre-emptive block before the rush [energy-model.md]: a forced cycle on seed 16 netted only +2.1 % per 4.6 min
   (the walk to the dock eats 40 % of what the dock gives). So after 02:00, when the known queue is ≤ 1 and the
   battery is under 45 %, start a block to 40 % at once (walk to the dock, chained docks with inbox reads); a wake-up
   ends this non-forced block only when the queue has grown to ≥ 2. Manager skips arrive 7–30 min after a request
   (median 18.7 min), so a block never exceeds 15 min.
5. Opportunistic floor-1 top-up (should-have, gated by the bench): when a task's route is about to leave the dock's
   floor by elevator with the battery under 70 % and the dock is within 25 m, dock first; the dock returns on the next
   message anyway (bounded). Behind a module constant `TOP_UP_BEFORE_UP = True/False`; report both bench results.
6. One decision line per block: `charge_block` `{"from": %, "to": %, "minutes": n, "queued": n, "woken": n,
   "forced": bool, "target": %}`.
7. Tests (`tests/agent/test_executor.py`, fake or scripted client): a forced charge with messages arriving every
   2 sim-min keeps docking (inbox read between) until the target; no `dock` is sent with a message unread; a
   non-forced charge still stops on the first wake; the target shrinks near 06:00; the block decision has the right
   counts; a charge is not started while a task is running.
8. Bench before/after at `--hourly-scale 1.3 --seeds 2-13 --max-calls 0` (Task 1's measuring stick): score, dock
   calls, minimum battery, requests served, per seed and mean. Keep each piece only if the mean rises; if the block
   target hurts, try 30 and 50 and report all three.

## Task 4 — Overload-aware ordering in the planner (branch `hamad/energy`)

Why: `planner.choose_next` is shortest-task-first, which minimises total waiting while everything can be served. After
~03:00 on a rich night it cannot: the queue (3–10) exceeds the time and battery left. Then the right rule is value per
robot-second (orienteering greedy), so the cheap, valuable work is done and the rest is declined at close-out.

In `agent/planner.py` (and the call site in `agent/agent.py` `run_shift`, which has the executor):

1. Decay per kind. `Params.decay_per_min` default 1.0 → 0.5 (fallback), plus a new `Params.decay_by_kind`
   dict (points lost per minute of waiting, measured live by two teams over ~1,600 served requests):
   `{"message": 0.27, "tray": 0.53, "room_check": 0.53, "spill": 0.36, "lost_item": 0.75, "amenity": 0.40,
   "bags": 0.84, "noise": 0.49, "followup": 0.0}`. Messages pay 24 → 0 after 90 min; trays 39 → 15 at 45 min;
   lost items 46 → 12 at 45 min; spills 52 → 44 at 22 min. `estimate_value` and `value_at` use the kind's decay.
2. New helpers: `value_at(task, finish_s, params)` = `max(VALUE_FLOOR, base × (1 + 0.08 × hours_since_22) −
   decay_kind × waited_min)`, 0 past 06:00; `overloaded(tasks, state, hotel, params, battery)` = the backlog
   `1.25 × Σ estimate_seconds` does not fit before 06:00, **or** the battery cannot cover it:
   `battery − backlog_min × 0.75 < 10` (ignore the battery test when `state.battery` is unknown).
3. `choose_next(tasks, state, hotel, params, battery=None)`: unchanged (SPT) when not overloaded; when overloaded,
   rank by `−value_at(t, now + 1.25 × secs) / max(secs, 1)` with ties by secs. `Kind.UNKNOWN` stays last in both.
   The loop in `run_shift` passes `ex._battery()` (or the state's battery). Log one `plan_mode` decision when the
   mode flips (spt ↔ overload) with the queue length, backlog minutes and battery.
4. Live evidence for the overload rule (seed 23, 2026-11-07 22:45 run): four spill requests arrived 03:28–05:00 and
   were **never started**: SPT always ranked them (sign fetch + search, ~5 min) behind newer 2–3 min deliveries,
   though a spill pays ~52 and loses only ~0.36 point/min. That is ~200 points on one night. Required test: at
   04:00 with a spill queued 30 min and three amenities queued 2–5 min, battery 30 %, the overload rule chooses the
   spill (value per second 52/300 s beats 25/180 s once decay is per kind).
5. Tests in `tests/agent/test_planner.py`: existing order tests still pass; at 05:50 with a 4-min message and a 9-min
   lost item queued, the message is chosen; with battery 12 % and a 3-task backlog of 9 min, the overload rule
   picks the best value per second; `value_at` grows with the hour and shrinks with waiting.
6. Bench at `--hourly-scale 1.3 --seeds 2-13 --max-calls 0` before/after; keep only if the mean rises.

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
   the place failed) report `declined` with the reason and leave the old sign alone. Never move a sign off the patch
   it was credited for in THIS request.
2. Out of signs (storage holds 3; rich nights have 5–7 spills; another team measured ~58 points a night lost to
   uncovered spills and saw no penalty for moving a sign from an already-credited, older spill): when no sign is in
   stock or on the cart, pick up the sign from the oldest spill patch that was already reported done (the robot knows
   where it placed them: keep `ex.signs_placed: dict[place, request]`) and use it for the new patch. Behind the
   existing experiment mechanism (`sign_move`, on by default, self-disabling when its first `done` report is not
   verified), so one live night settles it.
3. Tests in `tests/agent/` (the fake has wet spots; see how existing spill tests set them up): new patch → done;
   only an old patch → declined, no −30; sign placement failure → declined; out of signs → the oldest credited sign
   is moved and the new spill verified.

## Task 7 — Lost items lying in plain sight, and the search under load (branch `hamad/lost`, merged into `hamad/hygiene`)

Why (live, seed 41, wave branch, 2026-11-07 ~23:00): six lost-item requests failed after 9–10 scans each (an hour of
scanning, ~60 % battery, ~270 points) while the items were **visible**: a `look` at corridor-1b at 22:19 and 23:36
listed `glasses` (R-002, "glasses, maybe the ground floor corridor", failed after 10 scans); `look` at kitchen-pass at
00:20, 02:31, 03:43 and 05:02 listed `wallet` (R-012, "wallet, maybe the kitchen pass", failed after 10 scans);
corridor-1c at 05:01 listed `toy` and `glasses-2`. `scan` reports only HIDDEN things ("Nothing hidden here" where an
item lies in the open), and `Executor.found` (agent/executor.py ~144) is filled only by `scan` (~1314). Another team saw
the same: 68 of 159 given-up items were visible in `look.objects`; all 288 finds were in 8 ground-floor places (lobby,
lobby-bar, front-desk, kitchen-pass, corridor-1a/1b/1c, laundry).

1. Every `look` result (no-arg looks; `Executor.look`/`fresh_look` and any flow that parses `objects`) records each
   object that could be a lost item into `ex.found[name] = location` (the same dict scans fill). A lost-item object is
   any object whose base name (strip a trailing `-N`) is not stock or a fixture: exclude names with an ` xN` count,
   `tray-*`, `luggage-*`, `wet-floor-sign`, `keycard`, `cart`, notes (`*note*`, `manual`), and the stock items
   (towel, water-bottle, phone-charger, toiletry-kit, pillow). When a later look at that place no longer lists an
   object the robot recorded there, drop it from `found` (someone took it; avoids a wasted trip).
2. `_find` (agent/flows.py): before the first scan, `_pick_found` already checks `found` — with step 1 that now
   includes looked-at items. Then at each candidate place: if this visit has no look yet, `look` (5 s) first and pick
   via `_pick_found` when the item is listed; scan (60 s) only when it is not. Keep `_verdict`'s ownership rule (the
   Nth request of an item owns the Nth item: `wallet`, `wallet-2`, …; failed requests count).
3. Search under load: when at least two other tasks are queued (`len(ex.queue) >= 2`), cap the scans at 3
   (`SCAN_CAP_BUSY = 3`), log `scan_cap` `{"request", "cap", "queued"}`; otherwise today's cap. A hunt ending on the
   busy cap raises `ActionFailed("... not found after N scans (others waiting)")` (reported `failed`, 0 points).
4. Tests (the fake must be able to place a lost item visible, not hidden, if it cannot yet: add the minimum): an item
   seen in an earlier look is fetched with 0 scans; an item lying visible at the hinted place is picked after one look
   and no scan; an object that vanished from a later look is dropped from `found`; stock and trays are never recorded;
   with 2 queued tasks the hunt stops after 3 scans.

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

## Task 9 — Ask the manager about an unclear room: +10 and the answer (branch `hamad/hygiene`)

Why [obs, our logs]: on seed 23 the robot sent `reply` for R-014 ("Which room number is the one next to the
elevator on floor 2?") and the score rose 324 → 334 at once (+10; the same +10 on seed 16, R-082). Another team
measured +10 on 24 of 25 such replies. The manager's answer arrived as an inbox message with the same request id
and the same clock as the reply ("R-014: Sorry: 201."), but our flow had already asked the clerk, failed, and read
the answer 2.5 minutes later. Commit 3381426 then removed the reply. Seed 23 had six requests for that room
(R-014, R-031, R-032, R-034, R-041, R-043), all failed: about 150 points plus 6 × 10 lost on one night.

1. Inbox hook (identical to the energy branch's lines so the merge is clean): in `Executor.__init__` add
   `self.read_inbox: Callable[[], None] | None = None`; in `run_shift` (agent.py) right after `ex.queue = pending`
   add `ex.read_inbox = lambda: _read_inbox(ex, brain, seen, pending)`. Make `_read_inbox` also stash every message
   it reads on the executor: `ex.answers.setdefault(rid, []).append(text)` for messages whose `request` id is already
   in `seen` (an answer, a skip or a follow-up on a known request), before its own handling.
2. In the flow that resolves "the room next to the elevator on floor N" (and any other request whose room cannot be
   parsed but is described: `_ask_room` / the desk-note path in `agent/flows.py`): first `reply` with the request id
   and the question "Which room number is <phrase>?" (0 s), then read the inbox through the hook and look for an
   answer in `ex.answers[rid]`; parse the first room number (`\b([1-3]\d{2})\b` → `room-NNN`; also "room-NNN").
   Found → remember `ex.room_aliases[phrase] = room` for the rest of the night and continue the delivery. Not found →
   today's clerk / desk-note path. Later requests with the same phrase use the alias without asking anyone.
3. Never `reply` on a request whose room is already clear (the manager answers "exactly as written", 0 points, 0 s).
4. Tests: the fake answers a reply with "R-014: Sorry: 201." in the next inbox; the flow delivers to room-201 and the
   second request for the same phrase asks nobody; a clear request never sends `reply`.

## Task 10 — Tray and luggage names carry the request number (branch `hamad/hygiene`)

Why: live names are `tray-104-7`, `luggage-205-36`; another team's logs show the suffix is the request number
(R-036 → luggage-205-36), not the n-th request for that room; our replay notes assumed the n-th. Seven trays on five
nights were "not at the kitchen pass" and lost (~39 points each).

1. Check our live logs first (`/Users/hamadaliakram/oslo-wt/score/temp/runs/*.jsonl`, `look` results at the
   kitchen pass and the front desk with `tray-\d+-\d+` / `luggage-\d+-\d+` against the request ids) and write the rule
   you find in the report with examples.
2. Fix the matching in `agent/flows.py` (`carried_like`, `_tray`, `pick_for_others`, `_fewer_objects_than_orders`) and
   `agent/flows_extra.py` (`find_object` for bags) so the object whose suffix equals the request number is preferred,
   a bare `tray-104` is taken only when no suffixed one for this request exists, and an object with another request's
   suffix is never taken for this request.
3. Tests: with `tray-104` and `tray-104-7` at the pass, R-007 takes `tray-104-7` and R-003 takes `tray-104`.
