"""The robot-minute price lambda (agent/price.py) and the four decisions behind its switches."""

import json
from types import SimpleNamespace

import pytest

from agent import price
from agent.planner import Params, _overload_rank, choose_next, estimate_seconds, overloaded
from agent.tasks import Kind, Task
from agent.world import Hotel, RobotState, clock_to_seconds
from tests.agent.test_agent import client_for
from tests.agent.test_executor import _at_clock, _every, _inbox_hook, decisions
from tests.fakes.fake_wybe import FakeWybe

S = clock_to_seconds


@pytest.fixture
def hotel():
    return Hotel.load()


@pytest.fixture
def switch(monkeypatch):
    """Turn one switch on for a test; the module default comes back afterwards."""
    def turn(name: str) -> None:
        monkeypatch.setitem(price.SWITCHES, name, True)
    return turn


# --- lambda ------------------------------------------------------------------------------------------------

def test_only_wet_is_on_by_default_and_the_profile_is_measured():
    assert price.SWITCHES == {"overload": False, "hunt": False, "wet": True, "charge": False}
    prof = price.profile()
    assert len(prof["arrivals_per_hour"]) == 8 and prof["arrivals_per_hour"][5] > 1.8 * prof["arrivals_per_hour"][0]
    assert 60 <= sum(prof["arrivals_per_hour"]) <= 85  # 55-85 requests a night live
    assert prof["density_quantiles"] == sorted(prof["density_quantiles"]) and len(prof["density_quantiles"]) == 21
    assert 0.4 <= prof["drain_per_min"] <= 0.9 and 2 <= prof["task_minutes"] <= 6


def test_lambda_is_zero_on_a_light_night_and_early_in_the_night():
    assert price.lam(S("22:00:00"), 100.0) == 0.0  # 250 min of forecast work against 350 available
    assert price.lam(S("23:30:00"), 90.0, backlog_s=15 * 60) == 0.0  # a 15-min queue early: it all fits
    assert price.lam(S("02:00:00"), 60.0) == 0.0
    assert price.lam(S("04:00:00"), None) == 0.0  # battery unknown: time alone, and 2 h hold the forecast
    # a light night: no backlog, a full battery late: capacity exceeds the forecast
    assert price.lam(S("03:00:00"), 95.0) == 0.0


def test_lambda_rises_late_with_a_backlog_and_a_low_battery():
    late = price.lam(S("04:00:00"), 15.0)
    queued = price.lam(S("04:00:00"), 15.0, backlog_s=20 * 60)
    assert 0 < late < queued <= price.profile()["density_cap"]
    assert price.lam(S("03:00:00"), 25.0) > price.lam(S("03:00:00"), 40.0) == 0.0
    # the queue alone (forecast=False) is priced only once it cannot all be served
    assert price.lam(S("04:00:00"), 15.0, backlog_s=20 * 60, forecast=False) == 0.0
    assert price.lam(S("05:50:00"), 50.0, backlog_s=30 * 60, forecast=False) > 0
    # never above the cap, even with nothing left
    assert price.lam(S("05:59:00"), 1.0, backlog_s=3600) == price.profile()["density_cap"]


def test_capacity_is_the_time_and_battery_bound():
    prof = price.profile()
    d = prof["drain_per_min"]
    assert price.capacity_min(S("04:00:00"), 100.0) == pytest.approx(120)  # the battery covers 2 h
    assert price.capacity_min(S("04:00:00"), 15.0) == pytest.approx((15 - 10 + 120) / (d + 1))
    assert price.capacity_min(S("06:00:00"), 50.0) == 0.0


# --- (a) overload ---------------------------------------------------------------------------------------------

def _three_short_tasks(clock):
    st = RobotState(location="corridor-1a", clock=clock, cart=["towel"], hands=["keycard"])
    p = Params(action_seconds={**Params().action_seconds, "message": 100, "room_check": 140, "amenity": 192})
    msg = Task(request="R-1", kind=Kind.MESSAGE, text="", arrived=clock, room="room-101")
    check = Task(request="R-2", kind=Kind.ROOM_CHECK, text="", arrived=clock, room="room-102")
    towel = Task(request="R-3", kind=Kind.AMENITY, text="", arrived=clock, room="room-103", item="towel")
    return st, p, [towel, check, msg]


def test_overload_switch_uses_the_price_instead_of_the_backlog_test(hotel, switch):
    # 03:30, 30 %, a 9-min queue: the old test fits it (30 - 9 x 0.75 >= 10), but the forecast after 03:30
    # (~30 requests) does not fit the battery: the price is positive, so the planner ranks for overload now.
    st, p, tasks = _three_short_tasks("03:30:00")
    assert not overloaded(tasks, st, hotel, p, 30.0)
    switch("overload")
    assert overloaded(tasks, st, hotel, p, 30.0)
    assert not overloaded(tasks, st, hotel, p, 95.0)  # a full battery holds the forecast: price 0
    assert not overloaded([], st, hotel, p, 5.0)  # nothing queued: nothing to rank
    early_st, _, early = _three_short_tasks("23:00:00")
    assert not overloaded(early, early_st, hotel, p, 12.0)  # early: the day's spare minutes absorb the queue


def test_overload_rank_with_a_price_is_value_less_price_times_minutes(hotel):
    st, p, _ = _three_short_tasks("02:00:00")
    now = S("02:00:00")
    msg = Task(request="R-1", kind=Kind.MESSAGE, text="", arrived="02:00:00", room="room-101")
    lost = Task(request="R-2", kind=Kind.LOST_ITEM, text="", arrived="02:00:00", item="wallet")
    ms, ls = estimate_seconds(msg, st, hotel, p), estimate_seconds(lost, st, hotel, p)
    # value per second (no price): the message first
    assert _overload_rank(msg, ms, now, p) < _overload_rank(lost, ls, now, p)
    # a cheap minute: the hunt's 70 % of ~59 points beats a ~26-point message
    assert _overload_rank(lost, ls, now, p, lam=1.0) < _overload_rank(msg, ms, now, p, lam=1.0)
    # a dear minute: the 9-min hunt costs more than it brings, the message goes first
    assert _overload_rank(msg, ms, now, p, lam=6.0) < _overload_rank(lost, ls, now, p, lam=6.0)


def test_overload_switch_ranks_by_net_value_in_choose_next(hotel, switch, monkeypatch):
    st, p, _ = _three_short_tasks("02:00:00")
    msg = Task(request="R-1", kind=Kind.MESSAGE, text="", arrived="02:00:00", room="room-101")
    lost = Task(request="R-2", kind=Kind.LOST_ITEM, text="", arrived="02:00:00", item="wallet")
    assert choose_next([lost, msg], st, hotel, p, overload=True) is msg  # final build: value per second
    switch("overload")
    monkeypatch.setattr(price, "lam", lambda *a, **k: 1.0)
    assert choose_next([lost, msg], st, hotel, p, overload=True) is lost
    monkeypatch.setattr(price, "lam", lambda *a, **k: 6.0)
    assert choose_next([lost, msg], st, hotel, p, overload=True) is msg
    monkeypatch.setattr(price, "OVERLOAD_RANK", "density")  # trigger only: the old order
    monkeypatch.setattr(price, "lam", lambda *a, **k: 1.0)
    assert choose_next([lost, msg], st, hotel, p, overload=True) is msg


# --- (b) lost-item hunt ---------------------------------------------------------------------------------------

def test_hunt_probability_falls_after_the_hinted_places_and_the_stop_needs_a_price():
    p1, p2, p3 = price.hunt_p(1), price.hunt_p(2), price.hunt_p(3)
    assert p1 > p2 > p3 > 0 and price.hunt_p(8) == p3  # pooled after the second place
    assert price.hunt_worth(5, 40.0, 2.0, 1.5, 0.0)  # price 0: the hunt ends on its caps only
    assert price.hunt_worth(2, 50.0, 1.5, 1.5, 2.0)  # 0.27 x 47 > 3
    assert not price.hunt_worth(3, 40.0, 2.0, 1.5, 6.0)  # 0.085 x 31 < 12


def _hunt_ex(lam, location="lobby", clock="04:00:00"):
    hotel = Hotel.load()
    task = Task(request="R-9", kind=Kind.LOST_ITEM, text="", arrived="03:50:00", item="wallet", room="room-104")
    logged = []
    return SimpleNamespace(
        robot_price=lambda: lam, current=task, params=Params(), hotel=hotel,
        state=RobotState(location=location, clock=clock, cart=[]),
        _seconds_to=lambda place: 60.0, _now_s=lambda: S(clock),
        log=lambda kind, **d: logged.append((kind, d)), logged=logged)


def test_hunt_switch_stops_a_hunt_when_the_next_place_costs_more_than_it_finds(switch):
    from agent.flows import _hunt_worth

    assert _hunt_worth(_hunt_ex(0.0), "lobby-bar", 3, "R-9")  # light night: never stopped by price
    assert _hunt_worth(_hunt_ex(1.0), "lobby-bar", 2, "R-9")
    ex = _hunt_ex(7.0)
    assert not _hunt_worth(ex, "lobby-bar", 3, "R-9")
    assert ex.logged[0][0] == "hunt_stop" and ex.logged[0][1]["k"] == 3
    assert _hunt_worth(_hunt_ex(7.0), "lobby-bar", 3, "R-1")  # not the running task: no opinion


# --- (c) wet-floor re-looks -----------------------------------------------------------------------------------

def test_wet_look_rule_follows_the_patch_hazard_and_the_price():
    early, late = S("22:30:00"), S("03:30:00")
    # early, nothing waiting (no decay) and price 0: a look is free, so any chance of a patch pays
    assert price.look_worth(5 * 60, early, 11, 0, 4, 0.0, 0.0)
    assert not price.look_worth(30, early, 11, 0, 4, 0.0, 0.0)  # within a minute: never twice
    # busy late: a dear minute and decaying work make a look 5 min after the last not worth it ...
    assert not price.look_worth(5 * 60, late, 11, 0, 4, 7.0, 3.0)
    # ... unless a spill was reported on that floor since (a new patch among its 4 corridors)
    assert price.look_worth(5 * 60, late, 11, 1, 4, 7.0, 3.0)
    # and an approach not looked at for long enough is looked at again
    assert price.look_worth(4 * 3600, late, 11, 0, 4, 7.0, 3.0)
    assert price.patch_rate(late, 11) > price.patch_rate(early, 11)  # spills are back-loaded


def test_wet_switch_replaces_the_fixed_windows(tmp_path, switch, monkeypatch):
    monkeypatch.setitem(price.SWITCHES, "wet", False)  # start from the fixed windows, then turn the price on
    _fake, _session, ex = _at_clock(tmp_path, [], battery=90, clock="22:40:00")
    ex.go("lobby")
    now = S(ex.state.clock)

    def looked(ago: int) -> None:  # the approach was last seen `ago` seconds before now (from here and as an exit)
        ex._look_clock["lobby"] = ex._exit_seen["corridor-1a"] = now - ago

    looked(5 * 60)  # the final build's idle window is 10 min: no look yet
    assert ex._stale_before_corridor("lobby", "corridor-1a") is False
    switch("wet")
    assert ex._stale_before_corridor("lobby", "corridor-1a") is True  # idle, price 0: the look is free
    looked(30)
    assert ex._stale_before_corridor("lobby", "corridor-1a") is False  # not twice within a minute


# --- (d) charging --------------------------------------------------------------------------------------------

def test_charge_target_covers_the_forecast_work_and_a_margin_never_below_the_reserve():
    late = S("04:00:00")
    t = price.charge_target(late, 15.0, 0.0, 8.0)
    assert 30 < t < 100
    assert price.charge_target(late, 15.0, 0.0, 80.0) == 80.0  # never below the reserve
    assert price.charge_target(S("05:50:00"), 12.0, 0.0, 5.0) < 25  # 10 min left: little to cover
    assert price.charge_target(S("22:30:00"), 20.0, 0.0, 5.0) == 100.0  # the whole night ahead
    assert price.margin(late, 15.0, 0.0) > 0


def test_energy_is_worth_its_minute_only_while_the_forecast_outruns_the_battery():
    late = S("04:00:00")
    assert not price.energy_worth(late, 90.0, 0.0)  # the battery holds the forecast: energy worth 0
    assert price.energy_worth(late, 15.0, 0.0)  # battery-bound, nothing queued: keep charging
    assert not price.energy_worth(late, 15.0, 40 * 60)  # a long queue now: time dearer than energy


def test_charge_switch_sets_the_forced_target_from_the_forecast(tmp_path, switch):
    switch("charge")
    _fake, session, ex = _at_clock(tmp_path, _every(30, start="04:31:00", n=3), battery=10, clock="04:30:00")
    _inbox_hook(ex)
    assert ex.ensure_battery() is True
    [low] = decisions(session, "battery_low")
    expected = price.charge_target(S("04:30:00"), 10.0, 0.0, low["reserve"])
    assert low["forced"] is True and low["target"] == round(max(20.0, expected), 1)
    assert low["target"] > 40.0  # the final build's block target at 04:30: min(40, 10 + 0.4 x 90) = 40


def test_charge_switch_interrupts_a_forced_block_when_the_queue_makes_time_dear(tmp_path, switch, monkeypatch):
    switch("charge")
    _fake, session, ex = _at_clock(tmp_path, _every(2, start="04:31:00", n=30), battery=10, clock="04:30:00")
    _inbox_hook(ex)
    monkeypatch.setattr(price, "energy_worth", lambda *a, **k: False)
    assert ex.ensure_battery() is True
    [stop] = decisions(session, "charge_interrupted")
    assert stop["battery"] >= 25 and stop["queued"] >= 1
    [block] = decisions(session, "charge_block")
    assert block["to"] < block["target"]


# --- all switches off: the final build, byte for byte ---------------------------------------------------------

def test_all_switches_off_never_consult_the_price(tmp_path, monkeypatch):
    for name in price.SWITCHES:
        monkeypatch.setitem(price.SWITCHES, name, False)
    called = []
    for name in ("lam", "look_worth", "charge_target", "energy_worth", "hunt_worth"):
        real = getattr(price, name)
        monkeypatch.setattr(price, name, lambda *a, _n=name, _r=real, **k: called.append(_n) or _r(*a, **k))
    fake = FakeWybe(live=True)
    fake.battery = 30  # charges and overload happen on this short night too
    from agent.agent import run_shift

    result = run_shift(client_for(tmp_path, fake.handler), seed=1, sim_end="01:00:00")
    assert result["score"] is not None and called == []
    lines = [json.loads(x) for x in (tmp_path / "runs" / f"{result['shift']}.jsonl").read_text().splitlines()]
    kinds = {x["kind"] for x in lines if x["type"] == "decision"}
    assert not kinds & {"hunt_stop", "charge_interrupted"}
    assert all("price" not in x["data"] for x in lines if x["type"] == "decision" and x["kind"] == "plan_mode")
