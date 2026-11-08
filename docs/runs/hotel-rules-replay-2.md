# Hotel rules, part 2: honest room checks and home by 05:45

Worktree `/Users/hamadaliakram/oslo-wt/hotelrules`, branch `hamad/hotelrules`, commit **41b10f4** (on top of
70d5be4). Committed, not pushed. No live shift was run.

## The answer (replay of 202 real nights, 30 seeds)

| Rules on | Plain mean delta per night | Seed-weighted | Nights better / worse / same | Seeds better / worse | Strands |
|---|---:|---:|---:|---:|---:|
| **self_conflict** alone | **0.0** | **0.0** | 0 / 0 / 202 | 0 / 0 | 0 (base 0) |
| **home_by_0545** alone | **-90.4** | **-84.3** | 0 / 195 / 7 | 0 / 28 | 0 |
| the four earlier rules (reference) | -123.7 | -93.7 | 14 / 188 / 0 | 4 / 26 | 0 |
| four + self_conflict | -123.7 | -93.7 | 14 / 188 / 0 | 4 / 26 | 0 |
| four + home_by_0545 | -207.3 | -172.1 | 0 / 202 / 0 | 0 / 30 | 0 |
| **all six** (`NS_HOTEL_RULES=1`) | **-207.3** | **-172.1** | 0 / 202 / 0 | 0 / 30 | 0 |

On top of the four earlier rules, self_conflict adds 0.0 / 0.0 (all 202 nights the same) and home_by_0545 adds
**-83.6 / -78.4** (0 nights better, 196 worse, 6 the same; 0 seeds better, 27 worse).

The base (flag off) replay mean is 2552.4. With all six rules it is 2345.1, about -8 %. "Plain" is the mean over
the nights. "Seed-weighted" is the mean of each seed's mean, because seed 10 has 111 of the 202 nights. No replay
crashed or stranded. The four-rule numbers differ slightly from the first report (-125.8 / -100.4 on 164 nights)
because the night set has grown since; every row above is on the same frozen 202 nights.

## 1. self_conflict: a room check never calls a room empty against the robot's own record

**The flaw.** In the default build a room check reports what the look inside says ("Nobody is here. The room
is tidy.") and marks the room ready (`klar`). That happens even when the robot itself carried bags into that room
earlier the same night. The live look almost never lists the bags: 3 of 390 such looks did. So only the robot's
own record shows that the room is not empty. The same code would call a room with a sleeping guest "to be cleaned"
(`ma_vaskes`), because "Someone is asleep." does not contain "tidy".

**What the rule does** (`flows._self_conflict`, behind `NS_HOTEL_RULES=1` or the rule name `self_conflict`):

1. While the rule is on, the executor records every successful `place` into a room: clock, item and request
   (`Executor.hr_placed`). That covers bags, amenities, trays and lost items.
2. Before the room check's report it reads those records and the look inside: a person in the look's
   `people`, or person words in its description ("someone", "asleep", "guest is here", ...).
3. If either is found, the report note says so. For example, from a replay of seed 1:
   `looked inside room-206: NOT EMPTY: our own delivery is in it (luggage-206 placed at 00:17 for R-013;
   luggage-206-39 placed at 03:12 for R-039). Seen: Nobody is here. The room is tidy.`
   The dashboard gets `opptatt` instead of `klar`. One decision line is logged:
   `{"kind":"self_conflict","data":{request, room, placed:[{item, at, request}], person, seen, objects,
   would_have_said, report}}`.
4. The outcome stays **"done"**. The check was made and its answer is reported. The live evidence: 218 live
   nights had 390 room checks of rooms the robot had carried bags into earlier. The server thanked 389 of them
   ("Noted. Thanks."), with a mean credit of 37.9, against 35.2 for the other room checks. So the server
   does not treat these as false. Changing the outcome is a policy choice I did not make on my own. Its price
   is below.

**What it costs: nothing in points.** That is true by construction: the server grades the report, not the
note. The replay shows no side effects: same score and same calls on every night. Each night still logs what
the rule changed:

- **368 conflicts on 190 of 202 nights** (1.8 a night). All of them were the robot's own bags, which shows how
  common the flaw is: the manager's room checks often ask about a room that a bags request just filled.
- **0 persons.** In the replay world, a person is only ever in a room the flow refuses before the keycard
  (a DND sign or a guest answering). Live: 0 of 1,086 looks inside a room during a room check showed a person.
  The person path is covered by offline tests only.
- **If the hotel wants "not empty" reported as failed**, those checks lose their credit: 368 × 38.3 is about
  **-70 a night**. This is estimated from the replay credits and was not replayed as its own variant.

## 2. home_by_0545: keycard back and docked from 05:45

**What the rule does** (`Executor.hr_go_home` plus the shift loop, behind the rule name `home_by_0545`):

- From 05:45 no new task starts. A task already running at 05:45 is finished first: stopping it halfway
  would leave items in a corridor.
- At the next task boundary the robot returns every keycard it carries to where it picked the first one up
  (the front desk). Then it walks to the dock and docks. It stays docked until 06:00: a message wakes it and
  is read (a skip is still reported cancelled), but the request stays queued and unreported. Live, a request
  still open at 06:00 costs nothing.
- An idle wait ends at 05:45. A low-battery charge that would dock after 05:45 with a keycard still out stops
  short of the dock: a dock ends only on a message or a full battery, so it could keep the card until 06:00.
  The keycard goes back first, then the robot docks.
- Three `hotel_rule` lines: `{rule: home_by_0545, step: home}` (clock, place, keycards, queue left, battery),
  `step: keycard` (place, returned, kept), and `step: docked`.

**What it costs: -90.4 plain / -84.3 seed-weighted alone, -83.6 / -78.4 on top of the four rules.**

- The keycard went back on 202 of 202 nights: the robot carried one every night. The home step started a
  median 1.7 min after 05:45 (p90 2.8, max 8.3: the task running at 05:45). The robot was docked a median
  3.5 min after 05:45 (p90 4.3, max 9.0).
- No task started after 05:45. The default build starts 626 tasks there (3.1 a night). 539 requests arrived
  after 05:45 (2.7 a night), and 208 more were still queued at 05:45 (1.0 a night). All of them stay
  unserved.
- Done tasks fell from 14,175 to 13,758: 417 fewer, 2.1 a night, at about 44 points each. The last quarter
  hour is the most valuable of the night, because a task pays about 7.5 % more for each hour of the night.
  That is the whole cost. 7 nights had nothing to lose after 05:45 and scored the same.

Offline seed-1 night (the fake's demo night): flag off 1819, four rules 1730, all six 1695. Two self_conflict
lines: R-046 room-206 (bags of R-013 and R-039) and R-050 room-204 (bags of R-045). Home at 05:50:48 (a dock
that started before 05:45 ran until a message woke it), keycard back 05:51:13, docked 05:51:28. R-066 (05:50,
two water bottles) was not served: -35. No errors.

## Verified

- **Flag off is byte-identical to 70d5be4.** The offline night (`python -m agent run --seed 1`): 2,018 lines,
  0 differing (`temp/normlog.py`; it drops the wall clock, latency, build and shift id). Replay of all 202 nights,
  this worktree with the flag off against `git archive 70d5be4`: 0 nights differ in score or calls. In the
  first round, 12 kept replay logs also matched line for line. After the charge fix below, all 202 nights still
  had the same score and calls, and the offline night still matched line for line.
- **Tests.** 6 new offline tests in `tests/agent/test_hotel_rules.py`. Bags then a check of the same room:
  NOT EMPTY with the bags, the request and the clock, `opptatt`, and one self_conflict line; flag off gives the
  old note and `klar`. A person inside, both by the description ("Someone is asleep.") and by the people list.
  An empty room with nothing of ours: the plain report, unchanged. A whole night with a room check at 05:20 and
  a charger at 05:50: flag off serves both; the rule leaves the charger unstarted, puts the keycard back at the
  front desk after 05:45 (both cards there again), docks, and makes no move afterwards. A charge after 05:45 with
  the keycard out: no dock until the card is back. Full suite: **884 passed** (878 + 6). Ruff is clean.
- **A bug found while pricing, fixed before the numbers above.** The first version checked 05:45 only before
  the battery check. On 2 nights a low-battery charge began at 05:44, docked after 05:45 and kept the keycard
  until 06:00. On 3 nights the charge woke after 05:45 and a new task started. Now the loop checks again after
  the charge, and the charge stops before docking while a keycard is still out. After the fix: 202 of 202 nights
  went home, and 0 tasks started after 05:45.

## Method

- **Frozen night set.** Other worktrees were playing live seed-10 nights during this work. The replay bed's
  `--logs all` and its sibling merge pick up every new full night, so the base and the variants could have
  replayed different worlds. `driver.py` (kept in `temp/hotelrules-replay-2/`) calls `replaybed.select_nights("all")`
  once (202 nights), then `reconstruct_all(nights, siblings=nights)` once, and pickles the scenarios. Every
  variant replays exactly those scenarios with `replaybed.replay_night`, one night per child process, 8 at a
  time, about 50 s per variant.
- **Flag through a copy.** The replay bed strips `NS_*` from its children. As in the first report, each
  variant played from a copy of `agent/` whose `hotel_rules.DEFAULT` holds the rule list, the only line that
  differs. The base was `git archive 70d5be4` with the flag off.
- Per night, the driver read the score and the rule counts from the replay log (the self_conflict lines and
  the credit after each conflicted report, the home steps and clocks, tasks started and requests after 05:45,
  done counts), then deleted the log.
- **Results.** Per-night tables and the summary are in `temp/hotelrules-replay-2/` (`r_<variant>.json`,
  `analysis.json`; `analyze.py` recomputes it). The live counts come from `rc_survey.py` and `rc_reply.py`, over
  nights the live ledgers list. The variant code copies, the pickled scenarios, the replay logs and the offline
  logs are deleted. About 7.0 GB of disk was free throughout.

## Caveats

- **self_conflict keeps "done".** That rests on the live evidence (389 of 390 thanked) and on the team's API
  notes (`docs/research/wybe-api.md`: "report done with the finding in note"). Whether the live server or a human reviewer reads the note
  is unknown. If "not empty" should fail the check, it costs about -70 a night.
- **The person path never happened**, live or in replay. It is tested offline only. Its person words are a
  short list ("someone", "somebody", "asleep", "sleeping", "snoring", "guest is here", "guest is in").
- **home_by_0545 finishes the task running at 05:45**, up to 8.3 min late. A dock that started before 05:45
  cannot be interrupted, so the keycard goes back at the first free moment after it. The requests left at 05:45
  are neither declined nor reported. A `declined` report would also pay 0 live, but that was not built.
- The replay's world is a reconstruction (see the first report). Late-night request density is replayed from
  the real nights, so the -84 to -90 for home_by_0545 should carry over live better than the sign costs do.

## Live measurement (the controller runs it, not me)

```bash
cd /Users/hamadaliakram/oslo-wt/hotelrules
NS_HOTEL_RULES=self_conflict /Users/hamadaliakram/Oslo_Sprint_26/.venv/bin/python -m agent run --seed <N> --live
NS_HOTEL_RULES=home_by_0545  /Users/hamadaliakram/Oslo_Sprint_26/.venv/bin/python -m agent run --seed <N> --live
NS_HOTEL_RULES=1             /Users/hamadaliakram/Oslo_Sprint_26/.venv/bin/python -m agent run --seed <N> --live   # all six
```

What to look for in the run log: `self_conflict` decision lines and the matching `report` note, plus whether
that report's reply is still "Noted. Thanks.". Also the `hotel_rule` lines with `rule: home_by_0545`
(home / keycard / docked clocks) and `place keycard` at the front desk.
