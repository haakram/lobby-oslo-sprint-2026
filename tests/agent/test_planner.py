import pytest

from agent.planner import Params, choose_next, estimate_seconds, estimate_value, opening_plan
from agent.tasks import Kind, Task
from agent.world import Hotel, RobotState


@pytest.fixture
def hotel():
    return Hotel.load()


def amenity(room, item="towel", arrived="22:10:00", req="R-1"):
    return Task(request=req, kind=Kind.AMENITY, text="", arrived=arrived, room=room, item=item)


def test_prefers_nearby_task_when_values_equal(hotel):
    st = RobotState(location="corridor-3c", clock="22:10:00", cart=["towel"])
    far, near = amenity("room-104", req="R-1"), amenity("room-319", req="R-2")
    assert choose_next([far, near], st, hotel, Params()) is near


def test_prefers_high_value_far_task_when_worth_it(hotel):
    st = RobotState(location="corridor-1b", clock="22:10:00", cart=[])
    tray = Task(request="R-1", kind=Kind.TRAY, text="", arrived="22:10:00", room="room-104", item="tray-104")
    am = amenity("room-319", req="R-2")
    assert choose_next([am, tray], st, hotel, Params()) is tray


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
