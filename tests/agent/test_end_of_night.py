"""End of the night: the battery needed to 06:00 at a measured rate (END_DRAIN_PER_MIN x minutes left + END_MARGIN),
and a forced block that ends once the battery lasts the night (live docks end only on a message: a block charged to a
fixed target after 05:00 ran 15-25 min with 6-14 requests waiting and ended the night with 13-22 % unused, replay
seeds 9, 16, 23)."""

import pytest

from agent import executor
from agent.client import ShiftEnded
from agent.tasks import parse_request
from tests.agent.test_executor import _at_clock, _every, _inbox_hook, decisions, setup


def _late_block(tmp_path, battery, clock, start):
    """A forced block at `clock`: requests every 2 min from `start` wake the dock, the inbox hook queues them."""
    fake, session, ex = _at_clock(tmp_path, _every(2, start=start, n=20), battery, clock)
    _inbox_hook(ex)
    ex.queue.append(parse_request("R-900", "104 wants a towel.", clock))
    return fake, session, ex


def test_the_need_to_six_is_the_measured_rate_plus_a_margin(tmp_path):
    assert (executor.END_DRAIN_PER_MIN, executor.END_MARGIN, executor.END_STOP) == (0.8, 2.0, True)
    assert executor.DRAIN_PER_MIN == 0.9 and executor.DOCK_MARGIN == 5.0  # the dock reserve keeps its own
    _, _session, ex = setup(tmp_path, rids=set())
    ex.state.clock = "05:50:00"
    assert ex._needed_to_six() == 0.8 * 10 + 2.0
    ex.state.clock = "06:00:00"
    assert ex._needed_to_six() == 2.0


def test_a_late_forced_block_ends_once_the_battery_lasts_the_night(tmp_path):
    # 05:40, 10 %: 20 min x 0.8 + 2 = 18 % needed, a forced block (target 20 %). It stops at the first wake
    # where the battery covers what is left (each docked minute adds 1 % and takes 0.8 % off the need).
    _fake, session, ex = _late_block(tmp_path, 10.0, "05:40:00", "05:41:00")
    assert not ex._lasts_the_night(10.0)
    assert ex.ensure_battery() is True
    [low] = decisions(session, "battery_low")
    assert low["forced"] is True and low["target"] == 20.0
    [stop] = decisions(session, "charge_lasts")
    [block] = decisions(session, "charge_block")
    assert stop["battery"] >= stop["needed"] and block["to"] < block["target"], (stop, block)
    assert ex._lasts_the_night(ex.state.battery) and block["minutes"] < 10, block


def test_without_the_stop_the_block_charges_to_its_target(tmp_path, monkeypatch):
    monkeypatch.setattr(executor, "END_STOP", False)
    _fake, session, ex = _late_block(tmp_path, 10.0, "05:40:00", "05:41:00")
    assert ex.ensure_battery() is True
    assert not decisions(session, "charge_lasts")
    [block] = decisions(session, "charge_block")
    assert block["to"] >= block["target"] == 20.0, block


def test_early_in_the_night_the_block_is_unchanged(tmp_path):
    # 01:00: 5 h left needs far more than 100 %, the stop never fires and the block runs as before.
    _fake, session, ex = _late_block(tmp_path, 12.0, "01:00:00", "01:01:00")
    assert ex.ensure_battery() is True
    assert not decisions(session, "charge_lasts")
    [block] = decisions(session, "charge_block")
    assert block["forced"] is True and block["to"] >= executor.BATTERY_LOW, block


def test_the_stop_never_leaves_a_robot_under_the_dock_reserve_away_from_the_dock(tmp_path):
    # 05:55: 5 min x 0.8 + 2 = 6 % lasts the night, but 4,000 m from the dock (a ~65 % reserve) the block
    # still walks there and charges; at the dock (reserve 0) the same battery stops it.
    _fake, session, ex = _at_clock(tmp_path, [], 10.0, "05:55:00")
    dock = ex.hotel.special.get("dock", "charging-dock")
    assert ex.state.location == dock and ex._charged_enough(10.0, dock)
    ex.go("lobby")
    ex.hotel.set_metres(dock, "lobby", 4000.0)
    assert ex._lasts_the_night(10.0) and ex._dock_reserve(dock) > 10.0
    assert not ex._charged_enough(10.0, dock)
    # ... and the forced charge itself still starts under the reserve (the old guard, unchanged): the robot
    # heads for the dock 4,000 m away and the night ends on the way
    ex.queue.append(parse_request("R-901", "104 wants a towel.", "05:55:00"))
    with pytest.raises(ShiftEnded):
        ex.ensure_battery()
    assert decisions(session, "battery_low")[-1]["forced"] is True


def test_no_forced_charge_late_when_the_battery_covers_the_minutes_left(tmp_path):
    # 05:47, 14.4 % with work queued (replay seed 23: the old 0.9 x 13 + 5 = 16.7 % sent the robot to a dock
    # that no message woke before 06:00): 13 min x 0.8 + 2 = 12.4 % lasts the night, so it works on.
    _fake, session, ex = _at_clock(tmp_path, [], 14.4, "05:47:00")
    ex.queue.append(parse_request("R-902", "104 wants a towel.", "05:46:00"))
    assert ex.ensure_battery() is False
    assert decisions(session, "charge_deferred")
