import pytest

from agent.planner import (
    VALUE_FLOOR,
    Params,
    choose_next,
    estimate_seconds,
    estimate_value,
    opening_plan,
    overloaded,
    value_at,
)
from agent.tasks import Kind, Task
from agent.world import Hotel, RobotState, clock_to_seconds


@pytest.fixture
def hotel():
    return Hotel.load()


def amenity(room, item="towel", arrived="22:10:00", req="R-1"):
    return Task(request=req, kind=Kind.AMENITY, text="", arrived=arrived, room=room, item=item)


def test_stops_come_from_the_learned_stock_and_specials(hotel):
    from agent.planner import _stops

    hotel.stock["laundry"] = {"cart": 0, "pillow": 5}
    hotel.stock["storage"]["cart"] = 1  # tonight the cart stands in storage ...
    hotel.stock["front-desk"] = {}
    hotel.stock["staff-room"] = {"keycard": 2}  # ... and the keycards hang in the staff room
    hotel.special["kitchen"] = "lobby-bar"
    st = RobotState(location="lobby", clock="22:10:00")
    tray = Task(request="R-1", kind=Kind.TRAY, text="", arrived="22:10:00", room="room-104", item="tray-104")
    assert _stops(tray, st, hotel) == ["storage", "lobby-bar", "corridor-1b"]
    check = Task(request="R-2", kind=Kind.ROOM_CHECK, text="", arrived="22:10:00", room="room-103")
    assert _stops(check, st, hotel) == ["staff-room", "corridor-1a"]
    assert estimate_seconds(tray, st, hotel, Params()) < 1e6


def test_prefers_nearby_task_when_values_equal(hotel):
    st = RobotState(location="corridor-3c", clock="22:10:00", cart=["towel"])
    far, near = amenity("room-104", req="R-1"), amenity("room-319", req="R-2")
    assert choose_next([far, near], st, hotel, Params()) is near


def _ratio(task, st, hotel, p):
    secs = estimate_seconds(task, st, hotel, p)
    return estimate_value(task, int(clock_to_seconds(st.clock) + secs), p) / secs


def test_shortest_task_first_and_ratio_order_on_request(hotel):
    st = RobotState(location="corridor-3a", clock="22:10:00", cart=["towel"])
    tray = Task(request="R-1", kind=Kind.TRAY, text="", arrived="22:10:00", room="room-104", item="tray-104")
    am = amenity("room-210", req="R-2")
    p = Params()
    # the tray is strictly farther; every request loses about a point a minute while it waits,
    # so the nearer amenity goes first whatever the tray is worth (live seed 6: a tray waited 86 min
    # under the value-per-second order once its value had decayed to the floor)
    assert estimate_seconds(tray, st, hotel, p) > estimate_seconds(am, st, hotel, p)
    assert _ratio(tray, st, hotel, p) > _ratio(am, st, hotel, p)
    assert choose_next([am, tray], st, hotel, p) is am
    assert choose_next([tray, am], st, hotel, p) is am
    # the old rule is still there on request
    assert choose_next([am, tray], st, hotel, Params(order="ratio")) is tray


def test_zero_action_seconds_does_not_divide_by_zero(hotel):
    st = RobotState(location="corridor-1a", clock="22:10:00")
    unk = Task(request="R-1", kind=Kind.UNKNOWN, text="??", arrived="22:00:00")
    assert choose_next([unk], st, hotel, Params(action_seconds={"unknown": 0})) is unk


def test_midnight_wrap_in_value():
    t = amenity("room-101", arrived="23:50:00")
    p = Params(decay_per_min=1.0, decay_by_kind={})  # the fallback decay alone
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
    p = Params(decay_per_min=1.0, decay_by_kind={})  # the fallback decay alone
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


# --- Task 4 (late-night capacity): decay per kind, value_at, overload-aware order -------------------

def test_decay_is_per_kind_and_older_params_files_get_the_defaults():
    from pathlib import Path

    import agent

    p = Params()
    assert p.decay_per_min == 0.5  # the fallback for a kind without a measured decay
    assert p.decay_by_kind == {"message": 0.27, "tray": 0.53, "room_check": 0.53, "spill": 0.36,
                               "lost_item": 0.75, "amenity": 0.40, "bags": 0.84, "noise": 0.49,
                               "followup": 0.0}
    lost = Task(request="R-1", kind=Kind.LOST_ITEM, text="", arrived="22:00:00", item="wallet")
    msg = Task(request="R-2", kind=Kind.MESSAGE, text="", arrived="22:00:00", room="room-101")
    unk = Task(request="R-3", kind=Kind.UNKNOWN, text="??", arrived="22:00:00")
    at = clock_to_seconds("22:20:00")
    assert estimate_value(lost, at, p) == pytest.approx(40 - 0.75 * 20)
    assert estimate_value(msg, at, p) == pytest.approx(20 - 0.27 * 20)
    assert estimate_value(unk, clock_to_seconds("22:00:00"), Params(base_values={"unknown": 30})) == 30
    assert estimate_value(unk, at, Params(base_values={"unknown": 30})) == pytest.approx(30 - 0.5 * 20)
    old = Params.from_json('{"decay_per_min": 0.81, "max_scans": 3}')  # a file from before Task 4
    assert old.decay_by_kind == p.decay_by_kind and old.decay_per_min == 0.81
    partial = Params.from_json('{"decay_by_kind": {"spill": 0.1}}')
    assert partial.decay_by_kind == {**p.decay_by_kind, "spill": 0.1}
    shipped = Path(agent.__file__).parent / "data" / "params_candidate.json"
    assert Params.from_json(shipped.read_text()).decay_by_kind == p.decay_by_kind
    assert Params.from_json(p.to_json()) == p


def test_value_at_grows_with_the_hour_and_shrinks_with_waiting():
    p = Params()
    early, late = amenity("room-101", arrived="23:00:00"), amenity("room-101", arrived="04:00:00")
    # the same 10-minute wait five hours later pays more: ~8 % more per hour of the night
    assert value_at(early, clock_to_seconds("23:10:00"), p) == pytest.approx(20 * (1 + 0.08 * 70 / 60) - 0.40 * 10)
    assert value_at(late, clock_to_seconds("04:10:00"), p) == pytest.approx(20 * (1 + 0.08 * 370 / 60) - 0.40 * 10)
    assert value_at(late, clock_to_seconds("04:10:00"), p) > value_at(early, clock_to_seconds("23:10:00"), p)
    # the same finish after a longer wait pays less, down to the floor; nothing after 06:00
    fresh, stale = amenity("room-101", arrived="03:58:00"), amenity("room-101", arrived="03:20:00")
    assert value_at(stale, clock_to_seconds("04:00:00"), p) < value_at(fresh, clock_to_seconds("04:00:00"), p)
    msg = Task(request="R-9", kind=Kind.MESSAGE, text="", arrived="22:00:00", room="room-101")
    assert value_at(msg, clock_to_seconds("03:00:00"), p) == VALUE_FLOOR  # 20 x 1.4 - 0.27 x 300 min
    assert value_at(fresh, clock_to_seconds("06:00:00"), p) > 0
    assert value_at(fresh, clock_to_seconds("06:00:01"), p) == 0


def test_at_0550_a_4_min_message_goes_before_a_9_min_lost_item(hotel):
    st = RobotState(location="corridor-1a", clock="05:50:00", cart=[])
    p = Params(action_seconds={**Params().action_seconds, "message": 240, "lost_item": 540})
    msg = Task(request="R-1", kind=Kind.MESSAGE, text="", arrived="05:46:00", room="room-101")
    lost = Task(request="R-2", kind=Kind.LOST_ITEM, text="", arrived="05:40:00", item="wallet")  # no hint
    assert estimate_seconds(msg, st, hotel, p) == 240 and estimate_seconds(lost, st, hotel, p) == 540
    assert overloaded([lost, msg], st, hotel, p, None)  # 1.25 x 13 min of backlog, 10 min to 06:00
    assert value_at(lost, int(clock_to_seconds("05:50:00") + 1.25 * 540), p) == 0  # it would end after 06:00
    assert choose_next([lost, msg], st, hotel, p) is msg
    assert choose_next([msg, lost], st, hotel, p, battery=50.0) is msg


def _three_short_tasks(hotel):
    """A message (100 s), a room check (140 s) and a carried towel (192 s), all at corridor-1a at
    02:00: 432 s, a 9-minute backlog. Shortest first is the message; the room check pays most per
    second (32 x 1.32 over 140 s against 20 x 1.32 over 100 s)."""
    st = RobotState(location="corridor-1a", clock="02:00:00", cart=["towel"], hands=["keycard"])
    p = Params(action_seconds={**Params().action_seconds, "message": 100, "room_check": 140, "amenity": 192})
    msg = Task(request="R-1", kind=Kind.MESSAGE, text="", arrived="02:00:00", room="room-101")
    check = Task(request="R-2", kind=Kind.ROOM_CHECK, text="", arrived="02:00:00", room="room-102")
    towel = amenity("room-103", "towel", arrived="02:00:00", req="R-3")
    tasks = [towel, check, msg]
    assert sum(estimate_seconds(t, st, hotel, p) for t in tasks) * 1.25 == 9 * 60
    return st, p, tasks, msg, check


def test_with_12_percent_left_a_9_min_backlog_is_ordered_by_value_per_second(hotel):
    st, p, tasks, msg, check = _three_short_tasks(hotel)
    assert overloaded(tasks, st, hotel, p, 12.0)  # 12 - 9 x 0.75 < 10: the battery cannot cover it
    assert choose_next(tasks, st, hotel, p, battery=12.0) is check
    # the same queue with the battery to cover it, or the battery unknown: shortest first
    assert not overloaded(tasks, st, hotel, p, 60.0) and not overloaded(tasks, st, hotel, p, None)
    assert choose_next(tasks, st, hotel, p, battery=60.0) is msg
    assert choose_next(tasks, st, hotel, p) is msg
    # the caller may pass the mode it already worked out
    assert choose_next(tasks, st, hotel, p, overload=True) is check
    assert choose_next(tasks, st, hotel, p, battery=12.0, overload=False) is msg


def test_overload_keeps_unknown_last_and_breaks_ties_by_seconds(hotel):
    st, p, tasks, _msg, check = _three_short_tasks(hotel)
    unk = Task(request="R-9", kind=Kind.UNKNOWN, text="??", arrived="02:00:00")
    p.base_values["unknown"] = 500  # worth a lot per second: still last
    assert choose_next([unk, *tasks], st, hotel, p, overload=True) is check
    assert choose_next([unk], st, hotel, p, overload=True) is unk
    assert choose_next([], st, hotel, p, overload=True) is None
    # at 05:58 neither can end before 06:00: both are worth 0, so the shorter goes first (and the
    # loop's close-out, which checks only the task chosen, still sees the shortest)
    late = RobotState(location="corridor-1a", clock="05:58:00", cart=[])
    p3 = Params(action_seconds={**Params().action_seconds, "message": 240, "lost_item": 540})
    msg2 = Task(request="R-6", kind=Kind.MESSAGE, text="", arrived="05:50:00", room="room-101")
    lost = Task(request="R-7", kind=Kind.LOST_ITEM, text="", arrived="05:57:00", item="wallet")
    assert choose_next([lost, msg2], late, hotel, p3, overload=True) is msg2


def test_unreachable_tasks_are_left_out_of_the_backlog(hotel):
    st, p, tasks, _msg, _check = _three_short_tasks(hotel)
    nowhere = amenity("room-999", req="R-8")
    assert estimate_seconds(nowhere, st, hotel, p) >= 1e6
    assert not overloaded([nowhere, *tasks], st, hotel, p, 60.0)
    assert not overloaded([], st, hotel, p, 5.0)  # nothing queued: nothing to cover


def _seed23_at_0400():
    """Live seed 23 (2026-11-07 22:45 run): spills that arrived 03:28-05:00 were never started;
    shortest-first always put the sign fetch and search (~5 min) behind newer 2-3 min deliveries."""
    st = RobotState(location="corridor-1b", clock="04:00:00", battery=30.0, cart=[])
    spill = Task(request="R-1", kind=Kind.SPILL, text="", arrived="03:30:00", floor=3)
    ams = [amenity("room-210", "pillow", arrived="03:55:00", req="R-2"),
           amenity("room-319", "toiletry-kit", arrived="03:56:30", req="R-3"),
           amenity("room-208", "phone-charger", arrived="03:58:00", req="R-4")]
    return st, spill, ams


def test_overload_rule_starts_the_waiting_spill_before_fresh_deliveries(hotel):
    st, spill, ams = _seed23_at_0400()
    p = Params()
    assert p.base_values["spill"] == 52  # measured by two teams: a spill pays ~52, losing ~0.36/min
    now = clock_to_seconds(st.clock)

    def per_second(t):
        secs = estimate_seconds(t, st, hotel, p)
        return value_at(t, int(now + 1.25 * secs), p) / secs

    spill_s = estimate_seconds(spill, st, hotel, p)
    assert 240 <= spill_s <= 320  # sign from storage, the floor-3 landing, the search
    assert all(150 <= estimate_seconds(a, st, hotel, p) <= 200 for a in ams)
    assert all(per_second(spill) > per_second(a) for a in ams)  # ~52/300 s beats ~25/180 s
    queue = [*ams, spill]
    assert choose_next(queue, st, hotel, p, battery=30.0, overload=True) is spill
    assert choose_next(queue, st, hotel, p, battery=30.0, overload=False) in ams  # what seed 23 did
    # On its own this four-task queue (~16 min of backlog) trips the battery test below ~22 %, not at
    # 30 % (30 - 16 x 0.75 >= 10); live seed 23 got there at ~04:34 (27 %, seven queued, three spills).
    assert not overloaded(queue, st, hotel, p, 30.0)
    assert overloaded(queue, st, hotel, p, 20.0)
    assert choose_next(queue, st, hotel, p, battery=20.0) is spill
