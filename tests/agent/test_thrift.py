"""Variant 15: fewer wasted calls and sim seconds, every safety look kept.

- the score before a rewarding action comes from the last status while only score-neutral calls
  followed it (no status call); anything else, or a slip, makes it a real status call;
- log-only score reads make no call;
- a dock reply names the battery, so the loop's next refresh needs no status call;
- idle docks once per IDLE_SCANS_PER_DOCK scans;
- the wet look before a corridor step counts a recent look from any neighbour of that corridor;
- a tray picked with no other tray waiting is not followed by a look at the kitchen pass.
"""

import httpx

from agent import price
from agent.client import Reply, WybeClient
from agent.config import Settings
from agent.executor import SCORE_TRUST_CALLS, WET_LOOK_S, Executor
from agent.world import Hotel, RobotState, clock_to_seconds
from tests.fakes.fake_wybe import FakeWybe

CHARGER = "319 wants a phone charger."


def _setup(tmp_path, requests=(), **fake_kw):
    fake = FakeWybe(requests=list(requests), **fake_kw)
    settings = Settings(url="https://nightshift.test/", key="test-key", anthropic_key=None,
                        budget_usd=30.0, max_rps=1000.0, final_armed=False, runs_dir=tmp_path / "runs")
    client = WybeClient(settings, transport=httpx.MockTransport(fake.handler), sleep=lambda s: None)
    session = client.start_shift("practice", seed=1)
    ex = Executor(session, Hotel.load(), RobotState())
    session.cmd("inbox")  # the welcome message, read the way the loop does
    ex.inbox_waiting = False
    ex._surveyed = True
    return fake, session, ex


def _cmds(fake, since):
    return [e["cmd"] for e in fake.log[since:]]


def _looked_places(fake, since):
    loc, out = "charging-dock", []
    for i, e in enumerate(fake.log):
        if e["cmd"] in ("move", "navigate") and e["ok"]:
            loc = e["result"]["at"]
        elif e["cmd"] == "look" and not e["args"] and i >= since:
            out.append(loc)
    return out


# --- the score before a rewarding action ----------------------------------------------------------


def test_score_before_reuses_the_last_status_after_only_neutral_calls(tmp_path):
    fake, _, ex = _setup(tmp_path)
    ex.refresh()
    ex.cmd("look")
    ex.move("lobby")
    ex.cmd("knock", door="room-104")  # not adjacent: refused, still score-neutral
    since = len(fake.log)
    assert ex.score_before() == 0
    assert _cmds(fake, since) == []


def test_score_before_asks_the_server_after_a_say_an_ask_a_use_or_a_done_report(tmp_path):
    for cmd, args in (("say", {"text": "hello"}), ("ask", {"person": "clerk", "question": "?"}),
                      ("use", {"item": "cart"}), ("report", {"request": "R-099", "outcome": "done"})):
        fake, _, ex = _setup(tmp_path)
        ex.refresh()
        ex.cmd(cmd, **args)
        fake.score = 9
        since = len(fake.log)
        assert ex.score_before() == 9, cmd
        assert _cmds(fake, since) == ["status"], cmd


def test_score_before_asks_the_server_after_a_slip(tmp_path):
    fake, _, ex = _setup(tmp_path)
    ex.go("lobby")
    ex.refresh()
    fake._spots.add("corridor-1a")  # unseen: the step onto it slips (-15, a slip event)
    reply = ex.move("corridor-1a")
    assert any(ev["type"] == "slip" for ev in reply.events)
    since = len(fake.log)
    assert ex.score_before() == -15
    assert _cmds(fake, since) == ["status"]


def test_score_before_asks_the_server_once_the_status_is_too_many_calls_old(tmp_path):
    fake, _, ex = _setup(tmp_path)
    ex.refresh()
    for _ in range(SCORE_TRUST_CALLS + 1):
        ex.cmd("help")
    since = len(fake.log)
    ex.score_before()
    assert _cmds(fake, since) == ["status"]


def test_score_after_is_always_a_real_status(tmp_path):
    fake, _, ex = _setup(tmp_path)
    ex.refresh()
    ex.cmd("look")
    since = len(fake.log)
    ex.score_now()
    assert _cmds(fake, since) == ["status"]


def test_score_known_never_calls(tmp_path):
    fake, _, ex = _setup(tmp_path)
    ex.refresh()
    ex.cmd("say", text="hello")
    since = len(fake.log)
    assert ex.score_known() == 0
    assert _cmds(fake, since) == []


def test_a_delivery_still_verifies_by_a_rise_and_reports_no_false_done(tmp_path):
    from tests.agent.test_executor import next_task

    fake, session, ex = _setup(tmp_path, requests=[("22:01:00", "R-001", CHARGER)])
    task = next_task(ex, session, "R-001")
    ex.refresh()
    out = ex.run(task)
    assert out.status == "done" and fake.reports == {"R-001": "done"} and not fake.false_done
    cmds = _cmds(fake, 0)
    place = max(i for i, c in enumerate(cmds) if c == "place")
    assert cmds[place + 1] == "status"  # the rise is read from a real status after the place


# --- docking ---------------------------------------------------------------------------------------


def test_a_dock_that_wakes_on_a_message_needs_no_status_before_the_inbox(tmp_path):
    fake, _, ex = _setup(tmp_path, requests=[("22:30:00", "R-001", CHARGER)])
    fake.battery = 50
    ex.refresh()
    ex.wait_for_request()
    assert ex.inbox_waiting
    since = len(fake.log)
    status = ex.refresh()  # the shift loop's next refresh
    assert _cmds(fake, since) == []
    real = fake._cmd_status({})[1]
    assert abs(ex.state.battery - real["battery"]) <= 1.0 and status["docked"] is True
    assert status["score"] == real["score"]


def test_a_dock_reply_without_a_battery_leaves_the_next_refresh_to_the_server(tmp_path):
    fake, _, ex = _setup(tmp_path)
    ex.refresh()
    ex._calls += 1  # as if a dock was sent: the cached status no longer covers it
    ex._after_dock(Reply(ok=True, clock="22:05:00", result="Docked.", events=[]))
    since = len(fake.log)
    ex.refresh()
    assert _cmds(fake, since) == ["status"]


def test_a_dock_after_a_say_leaves_the_next_refresh_to_the_server(tmp_path):
    fake, _, ex = _setup(tmp_path)
    ex.refresh()
    ex.cmd("say", text="hello")  # the score may have moved since the last status
    ex._calls += 1
    ex._after_dock(Reply(ok=True, clock="22:05:00", result="Docked for 3 min. Battery 90% to 93%.",
                         events=[]))
    since = len(fake.log)
    ex.refresh()
    assert _cmds(fake, since) == ["status"]


def test_idle_after_work_docks_first(tmp_path):
    fake, _, ex = _setup(tmp_path)
    fake.battery = 70
    ex.go("lobby")
    since = len(fake.log)
    ex.wait_for_request(max_idle=3)
    cmds = [c for c in _cmds(fake, since) if c not in ("status", "look")]
    assert cmds[:2] == ["move", "dock"], cmds  # back at the dock: charge first, scans after


# --- the wet look before a corridor step ----------------------------------------------------------


def _jump(fake, ex, seconds):
    fake._now += seconds
    ex.cmd("status")  # the robot learns the clock


def test_a_recent_look_from_another_neighbour_spares_the_wet_look(tmp_path, monkeypatch):
    monkeypatch.setitem(price.SWITCHES, "wet", False)  # pins the old fixed-window wet look; wet on is covered in test_price.py
    fake, _, ex = _setup(tmp_path)
    ex.go("corridor-1b")  # first visits: lobby, corridor-1a, corridor-1b are looked at
    _jump(fake, ex, WET_LOOK_S + 60)
    ex.go("lobby")  # 1b -> 1a: both looks that saw 1a are old, so 1b is looked at again
    _jump(fake, ex, 5 * 60)
    since = len(fake.log)
    ex.go("corridor-1b")
    # lobby -> 1a: the lobby's own look is old, but 1b's look saw 1a five minutes ago: no look.
    # 1a -> 1b: nothing saw 1b lately: 1a is looked at before the step.
    assert _looked_places(fake, since) == ["corridor-1a"]


def test_the_wet_look_rule_never_looks_more_than_before(tmp_path):
    _fake, _, ex = _setup(tmp_path)
    ex.go("corridor-1a")
    now = clock_to_seconds(ex.state.clock)
    ex._look_clock["corridor-1a"] = now  # a fresh look here
    ex._exit_seen["corridor-1b"] = now - 2 * WET_LOOK_S  # an old one elsewhere
    assert not ex._stale_before_corridor("corridor-1a", "corridor-1b")
    ex._look_clock["corridor-1a"] = now - 2 * WET_LOOK_S
    assert ex._stale_before_corridor("corridor-1a", "corridor-1b")


def test_a_known_wet_spot_seen_from_elsewhere_still_creeps(tmp_path):
    fake, _, ex = _setup(tmp_path)
    fake._spots.add("corridor-1b")
    ex.go("storage")  # the look at corridor-1a warns about 1b: the robot creeps, never slips
    assert ex.hotel.is_wet("corridor-1a", "corridor-1b")
    assert not any(ev["type"] == "slip" for e in fake.log for ev in e["events"])


# --- the tray look --------------------------------------------------------------------------------


def test_a_tray_alone_is_not_followed_by_a_look_at_the_kitchen(tmp_path):
    from tests.agent.test_executor import next_task

    tray = "Bring the tray from the kitchen pass to 322."
    fake, session, ex = _setup(tmp_path, requests=[("22:01:00", "R-001", tray)])
    task = next_task(ex, session, "R-001")
    out = ex.run(task)
    assert out.status == "done" and not fake.false_done
    cmds = _cmds(fake, 0)
    pick = next(i for i, e in enumerate(fake.log) if e["cmd"] == "pick" and "tray" in str(e["args"]))
    assert cmds[pick + 1] != "look", cmds[pick - 2:pick + 3]


def test_a_tray_with_another_tray_waiting_looks_and_takes_both(tmp_path):
    from tests.agent.test_executor import next_task

    t1 = "Bring the tray from the kitchen pass to 322."
    t2 = "Bring the tray from the kitchen pass to 104."
    _fake, session, ex = _setup(tmp_path, requests=[("22:01:00", "R-001", t1), ("22:01:00", "R-002", t2)])
    task = next_task(ex, session, "R-001")
    from agent.tasks import parse_request

    ex.queue.append(parse_request("R-002", t2, "22:01:00"))
    out = ex.run(task)
    assert out.status == "done"
    assert ex.state.carrying("tray-104")  # picked for the waiting R-002 after the look


def test_a_failed_report_keeps_the_score_trusted_but_a_done_report_does_not(tmp_path):
    fake, _, ex = _setup(tmp_path)
    ex.refresh()
    ex.cmd("report", request="R-099", outcome="failed", note="x")  # live: 426 of 426 left the score
    since = len(fake.log)
    ex.score_before()
    assert _cmds(fake, since) == []
    ex.cmd("report", request="R-098", outcome="done", note="x")
    since = len(fake.log)
    ex.score_before()
    assert _cmds(fake, since) == ["status"]


# --- the shift loop's own status ------------------------------------------------------------------


def test_loop_status_skips_the_call_after_a_scan_that_brought_a_message(tmp_path):
    fake, _, ex = _setup(tmp_path, requests=[("22:00:30", "R-001", CHARGER)])
    ex.refresh()
    ex.scan()  # 60 s: the request arrives during it, the reply carries the inbox event
    assert ex.inbox_waiting
    since = len(fake.log)
    status = ex.loop_status()
    assert _cmds(fake, since) == []
    real = fake._cmd_status({})[1]
    assert status["battery"] <= real["battery"]  # a pessimistic floor, never above the truth
    assert status["score"] == real["score"] and status["location"] == real["location"]


def test_loop_status_asks_the_server_when_the_battery_floor_is_low(tmp_path):
    fake, _, ex = _setup(tmp_path)
    fake.battery = 52
    ex.refresh()
    for _ in range(3):
        ex.scan()  # 3 min at a pessimistic 2 %/min: the floor drops under 50 %
    since = len(fake.log)
    ex.loop_status()
    assert _cmds(fake, since) == ["status"]


def test_loop_status_asks_the_server_after_a_place(tmp_path):
    fake, _, ex = _setup(tmp_path)
    ex.refresh()
    ex.cmd("place", item="towel")  # nothing held: refused, but a place is never assumed neutral
    since = len(fake.log)
    ex.loop_status()
    assert _cmds(fake, since) == ["status"]


def test_loop_status_with_nothing_sent_since_the_last_status_is_free(tmp_path):
    fake, _, ex = _setup(tmp_path)
    ex.cmd("say", text="hello")
    first = ex.refresh()
    since = len(fake.log)
    assert ex.loop_status() == first
    assert _cmds(fake, since) == []
