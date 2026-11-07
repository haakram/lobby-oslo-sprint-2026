import pytest

from agent.planner import Params, choose_next, estimate_seconds, estimate_value, opening_plan
from agent.tasks import Kind, Task
from agent.world import Hotel, RobotState, clock_to_seconds


@pytest.fixture
def hotel():
    return Hotel.load()


def amenity(room, item="towel", arrived="22:10:00", req="R-1"):
    return Task(request=req, kind=Kind.AMENITY, text="", arrived=arrived, room=room, item=item)


def test_prefers_nearby_task_when_values_equal(hotel):
    st = RobotState(location="corridor-3c", clock="22:10:00", cart=["towel"])
    far, near = amenity("room-104", req="R-1"), amenity("room-319", req="R-2")
    assert choose_next([far, near], st, hotel, Params()) is near


def _ratio(task, st, hotel, p):
    secs = estimate_seconds(task, st, hotel, p)
    return estimate_value(task, int(clock_to_seconds(st.clock) + secs), p) / secs


def test_prefers_high_value_far_task_when_worth_it(hotel):
    st = RobotState(location="corridor-3a", clock="22:10:00", cart=["towel"])
    tray = Task(request="R-1", kind=Kind.TRAY, text="", arrived="22:10:00", room="room-104", item="tray-104")
    am = amenity("room-210", req="R-2")
    p = Params()
    # the tray is strictly farther, so only its higher value can make it win
    assert estimate_seconds(tray, st, hotel, p) > estimate_seconds(am, st, hotel, p)
    assert _ratio(tray, st, hotel, p) > _ratio(am, st, hotel, p)
    assert choose_next([am, tray], st, hotel, p) is tray
    # control: same positions, tray worth little -> the amenity wins
    low = Params(base_values={**p.base_values, "tray": 10})
    assert _ratio(tray, st, hotel, low) < _ratio(am, st, hotel, low)
    assert choose_next([am, tray], st, hotel, low) is am


def test_zero_action_seconds_does_not_divide_by_zero(hotel):
    st = RobotState(location="corridor-1a", clock="22:10:00")
    unk = Task(request="R-1", kind=Kind.UNKNOWN, text="??", arrived="22:00:00")
    assert choose_next([unk], st, hotel, Params(action_seconds={"unknown": 0})) is unk


def test_midnight_wrap_in_value():
    t = amenity("room-101", arrived="23:50:00")
    p = Params()
    assert estimate_value(t, clock_to_seconds("00:10:00"), p) == 5  # 20 min waited: 20 - 20 -> floor 5
    assert estimate_value(t, clock_to_seconds("23:55:00"), p) == pytest.approx(15)


def test_unreachable_or_unstocked_sorts_after_reachable(hotel):
    st = RobotState(location="corridor-1a", clock="22:10:00")
    no_stock = amenity("room-101", "unobtainium", req="R-1")
    no_room = amenity("room-999", req="R-2")
    ok = amenity("room-319", req="R-3")
    assert estimate_seconds(no_stock, st, hotel, Params()) >= 1e6
    assert estimate_seconds(no_room, st, hotel, Params()) >= 1e6
    assert choose_next([no_stock, no_room, ok], st, hotel, Params()) is ok


def test_carried_item_is_cheaper(hotel):
    st = RobotState(location="corridor-1a", clock="22:10:00", cart=["water-bottle"])
    towel, water = amenity("room-101", "towel", req="R-1"), amenity("room-101", "water-bottle", req="R-2")
    p = Params()
    assert estimate_seconds(water, st, hotel, p) < estimate_seconds(towel, st, hotel, p)
    assert choose_next([towel, water], st, hotel, p) is water


def test_unknown_last(hotel):
    st = RobotState(location="corridor-1a", clock="22:10:00")
    unk = Task(request="R-1", kind=Kind.UNKNOWN, text="??", arrived="22:00:00")
    am = amenity("room-319", req="R-2")
    assert choose_next([unk, am], st, hotel, Params()) is am
    assert choose_next([unk], st, hotel, Params()) is unk
    assert choose_next([], st, hotel, Params()) is None


def test_value_decays_and_floors():
    p = Params()
    t = amenity("room-101", arrived="22:00:00")
    assert estimate_value(t, 79200 + 300, p) == pytest.approx(15)
    assert estimate_value(t, 79200 + 36000, p) == 5


def test_tray_without_cart_costs_laundry_trip(hotel):
    tray = Task(request="R-1", kind=Kind.TRAY, text="", arrived="22:10:00", room="room-104", item="tray-104")
    p = Params()
    no = estimate_seconds(tray, RobotState(location="corridor-1b", clock="22:10:00"), hotel, p)
    yes = estimate_seconds(tray, RobotState(location="corridor-1b", clock="22:10:00", cart=[]), hotel, p)
    assert no > yes


def test_opening_plan():
    assert opening_plan(Params()) == ["get_cart", "stock_cart"]
    assert opening_plan(Params(use_cart=False)) == []


def test_params_json_roundtrip():
    p = Params(decay_per_min=2.5, max_scans=3)
    assert Params.from_json(p.to_json()) == p
