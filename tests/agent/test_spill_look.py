"""A spill reported on a floor since the robot last looked at a corridor approach there: the approach is looked
at again before the step in, even inside the busy window (live: 4 of 14 slips of the final build)."""

import pytest

from agent import price
from agent.tasks import Kind, Task
from agent.world import clock_to_seconds
from tests.agent.test_executor import setup


@pytest.fixture
def fixed_window(monkeypatch):
    monkeypatch.setitem(price.SWITCHES, "wet", False)  # pins the old fixed-window wet look; wet on is tested below


def _ex(tmp_path):
    _, _session, ex = setup(tmp_path, rids=set())
    here, to = "corridor-1a", "corridor-1b"
    assert ex.hotel.floor(to) == 1 and not ex.hotel.is_wet(here, to)
    ex._look_clock[here] = clock_to_seconds("23:00:00")
    ex.state.clock, ex.state.battery = "23:20:00", 80.0
    busy = [Task(f"R-90{i}", Kind.AMENITY, "x", "22:00:00", room="317", item="towel") for i in range(2)]
    return ex, here, to, busy


def spill(rid, floor, arrived):
    return Task(rid, Kind.SPILL, f"Someone mentioned a spill on floor {floor}.", arrived, floor=floor)


def test_a_spill_reported_on_the_floor_since_the_look_makes_the_approach_stale(tmp_path, fixed_window):
    ex, here, to, busy = _ex(tmp_path)
    ex.queue = list(busy)
    assert not ex._stale_before_corridor(here, to)  # busy: 20 min < 45 min
    ex.queue = [*busy, spill("R-950", 1, "23:10:00")]
    assert ex._stale_before_corridor(here, to)  # the floor-1 spill came after the 23:00 look


def test_the_running_spill_counts_too(tmp_path, fixed_window):
    ex, here, to, busy = _ex(tmp_path)
    ex.queue = list(busy)
    ex.current = spill("R-951", 1, "23:05:00")
    assert ex._stale_before_corridor(here, to)


def test_an_older_spill_or_one_on_another_floor_changes_nothing(tmp_path, fixed_window):
    ex, here, to, busy = _ex(tmp_path)
    ex.queue = [*busy, spill("R-952", 1, "22:50:00"), spill("R-953", 2, "23:10:00")]
    assert not ex._stale_before_corridor(here, to)  # before the look / floor 2
    ex.queue = [*busy, spill("R-954", 1, "23:10:00")]
    ex._exit_seen[to] = clock_to_seconds("23:15:00")  # a look since listed the corridor as an exit
    assert not ex._stale_before_corridor(here, to)


def test_with_the_priced_look_on_a_spill_since_the_look_forces_it_even_when_the_price_says_no(tmp_path, monkeypatch):
    """Both rules: the price (switch "wet") decides when a look is worth it, and a spill reported on the floor
    since the last look forces one; an older spill or one on another floor leaves it to the price."""
    monkeypatch.setitem(price.SWITCHES, "wet", True)
    ex, here, to, busy = _ex(tmp_path)
    asked = []
    monkeypatch.setattr(ex, "_look_worth", lambda *a: asked.append(a) or False)
    ex.queue = [*busy, spill("R-955", 1, "22:50:00"), spill("R-956", 2, "23:10:00")]
    assert not ex._stale_before_corridor(here, to)
    assert asked  # the price was asked
    asked.clear()
    ex.queue = [*busy, spill("R-957", 1, "23:10:00")]
    assert ex._stale_before_corridor(here, to)
    assert not asked  # forced: the price is not asked
    monkeypatch.setattr(ex, "_look_worth", lambda *a: True)
    ex.queue = list(busy)
    assert ex._stale_before_corridor(here, to)  # the price alone still decides a look
