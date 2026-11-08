"""The in-flow battery guard (live seed 23, w2-51a7f747, stranded at 05:51, -200): at 05:32:57 the battery was exactly
15.0 % with 27 min left, the charge was deferred (15.0 < 15 is false), a lost-item hunt (R-077, a wallet) started,
ran 9 scans 05:35-05:47 while the queue grew from 1 to 4, went on past the server's "Battery below 5%" at 05:43
(the battery was only checked between tasks), found the wallet at corridor-1c and stranded on the way to floor 2."""

import pytest

from agent import executor
from agent.client import ShiftEnded
from agent.executor import Executor, LowBattery
from agent.tasks import parse_request
from tests.agent.test_executor import _at_clock, _every, _inbox_hook, calls, decisions, setup

WALLET = "Guest in 202 lost a wallet, maybe the front desk."
WAKES = _every(2, start="05:34:00", n=12)  # requests that wake a dock (a live dock ends only on a message)


def _hunt_at_15(tmp_path, requests=(), arrived="05:20:00", battery=15.0):
    """The live case on the measured fake: 05:32:57, 15.0 %, the robot at corridor-3b, the wallet hidden at
    corridor-1c (the 9th place the live hunt scanned), R-077 queued since `arrived`."""
    from agent.world import clock_to_seconds

    fake, session, ex = setup(tmp_path, requests=list(requests), live=True, hidden={"wallet": "corridor-1c"})
    fake._now = clock_to_seconds("05:32:57")
    ex.cmd("inbox")
    ex.inbox_waiting = False
    fake._location = "corridor-3b"
    fake.battery = battery
    ex.refresh()
    _inbox_hook(ex)
    task = parse_request("R-077", WALLET, arrived)
    return fake, session, ex, task


def test_exactly_15_percent_with_the_night_not_covered_forces_the_charge(tmp_path):
    fake, session, ex, task = _hunt_at_15(tmp_path, WAKES)
    ex.queue.append(task)
    assert not ex._lasts_the_night(15.0)  # 27 min x 0.8 + 2 = 23.6 %
    assert ex.ensure_battery() is True  # was: 15.0 < max(15, reserve) false -> charge_deferred -> the hunt
    assert decisions(session, "battery_low")[0]["forced"] is True and calls(fake, "dock")
    assert not decisions(session, "charge_deferred")


def test_just_above_15_percent_is_still_deferred_while_work_waits(tmp_path):
    _fake, session, ex, task = _hunt_at_15(tmp_path, battery=15.1)
    ex.queue.append(task)
    assert ex.ensure_battery() is False and decisions(session, "charge_deferred")


def test_the_live_hunt_without_the_guard_runs_the_battery_flat(tmp_path, monkeypatch):
    """The reproduction itself: the same hunt with the old boundary and no guard or start check scans 9 places,
    finds the wallet at corridor-1c and delivers it on the last 1 % (the measured fake's drain; live, a slip on
    the way and the server's own drain stranded it at 05:51)."""
    monkeypatch.setattr(Executor, "battery_guard", lambda self: None)
    monkeypatch.setattr(Executor, "charge_for", lambda self, task: False)
    monkeypatch.setattr(executor, "BATTERY_CRITICAL", 14.99)  # the old strict test: 15.0 was not "low"
    fake, _session, ex, task = _hunt_at_15(tmp_path)
    try:
        ex.run(task)
    except ShiftEnded:
        pass
    assert len(calls(fake, "scan")) >= 8 and not calls(fake, "dock")  # live: 9 (the lobby-bar too)
    assert fake.stranded or fake.battery < 2.0, fake.battery


def test_the_guard_stops_the_hunt_puts_it_back_and_charges(tmp_path, monkeypatch):
    # The start check would charge first (next test); without it the hunt runs and the guard stops it. No
    # request comes after 05:33 here, so the charge after it lasts to 06:00 (the night ends by time).
    monkeypatch.setattr(Executor, "charge_for", lambda self, task: False)
    monkeypatch.setattr(executor, "BATTERY_CRITICAL", 14.99)  # the old strict test: the hunt starts at 15.0
    fake, session, ex, task = _hunt_at_15(tmp_path)
    with pytest.raises(ShiftEnded):
        ex.run(task)
    assert not fake.stranded and fake._now >= fake._end_s
    [abort] = decisions(session, "battery_abort")
    assert abort["request"] == "R-077" and abort["battery"] < abort["reserve"] + executor.FLOW_MARGIN, abort
    assert [t.request for t in ex.queue] == ["R-077"]  # back in the queue, unreported
    assert decisions(session, "task_requeued")[0]["request"] == "R-077"
    assert not [c for c in calls(fake, "report") if (c["args"] or {}).get("request") == "R-077"]
    assert calls(fake, "dock") and ex.ledger.get("R-077").status == "pending"


def test_the_start_check_charges_before_a_task_whose_drain_the_battery_cannot_cover(tmp_path, monkeypatch):
    # 03:00, 20 %: over BATTERY_CRITICAL, so the loop's rule lets it start; a 20-min task drains ~18 % and the way
    # back from 202 to the dock needs its reserve on top: a forced block first, inside the task.
    monkeypatch.setattr("agent.planner.estimate_seconds", lambda *a, **k: 1200.0)
    fake, session, ex = _at_clock(tmp_path, _every(2, start="03:01:00", n=20), 20.0, "03:00:00")
    _inbox_hook(ex)
    task = parse_request("R-077", WALLET, "02:59:00")
    ex.current = task
    assert ex.charge_for(task) is True
    [low] = decisions(session, "battery_low")
    assert low["task"] == "R-077" and low["forced"] is True and low["drain"] == 18.0, low
    assert low["reserve"] > 20.0 and calls(fake, "dock") and ex.state.battery > 20.0
    # ... and not when the battery covers it
    monkeypatch.setattr("agent.planner.estimate_seconds", lambda *a, **k: 300.0)
    assert ex.charge_for(task) is False


def test_the_start_check_leaves_a_battery_that_lasts_the_night(tmp_path):
    from agent.world import clock_to_seconds

    fake, _session, ex, task = _hunt_at_15(tmp_path)
    fake._now = clock_to_seconds("05:56:00")  # 4 min x 0.8 + 2 = 5.2 % <= 15: lasts the night
    ex.refresh()
    ex.current = task
    assert ex.charge_for(task) is False and not calls(fake, "dock")


def test_the_servers_five_percent_warning_stops_the_flow_at_its_next_step_whatever_the_clock(tmp_path):
    from agent.world import clock_to_seconds

    fake, session, ex = _at_clock(tmp_path, [], 4.9, "05:58:00")
    ex.current = parse_request("R-901", "104 wants a towel.", "05:50:00")
    assert ex._lasts_the_night(4.9)  # 2 min x 0.8 + 2 = 3.6 %: only the warning stops it
    ex.battery_guard()  # at the dock, lasting: no stop
    ex._battery_event("Battery below 5%. The robot is slowing down.")
    assert ex.state.battery <= 5.0
    with pytest.raises(LowBattery):
        ex.battery_guard()
    assert decisions(session, "battery_abort")[-1]["alarm"] is True
    ex._battery_event("Battery below 5%. The robot is slowing down.")
    ex.current = None
    ex.battery_guard()  # between tasks: quiet (the loop's own charge rule decides)
    fake._now = clock_to_seconds("05:58:10")
    reply = ex.cmd("dock")
    ex._after_dock(reply)
    assert not ex._battery_alarm  # a dock clears the warning


def test_the_guard_is_quiet_while_the_battery_floor_is_high(tmp_path):
    fake, _session, ex = _at_clock(tmp_path, [], 80.0, "03:00:00")
    ex.current = parse_request("R-902", "104 wants a towel.", "02:59:00")
    before = len(fake.log)
    ex.battery_guard()
    assert len(fake.log) == before  # no status call: the pessimistic floor is far above the reserve
