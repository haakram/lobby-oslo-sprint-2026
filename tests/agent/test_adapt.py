"""Task 19: the agent adapts to the night's real map and stock (the final's shifts differ from seed 1).

The fake plays a "seed-2-like" hotel: the seed-1 floor plan, other metres and moved stock (live map
check of practice seed 2). The executor still loads `hotel_seed1.json` as its belief.
"""

import itertools

import httpx

from agent.agent import run_shift
from agent.client import WybeClient
from agent.executor import ActionFailed
from tests.agent.test_executor import calls, decisions, map_file, next_task, settings, setup, solo
from tests.fakes.fake_wybe import FakeWybe

SEED2_STOCK = {
    "storage": {"pillow": 5, "toiletry-kit": 6, "phone-charger": 4, "wet-floor-sign": 3},
    "laundry": {"cart": 1, "towel": 8, "water-bottle": 8},
    "front-desk": {"keycard": 2},
}


def seed2_like(data):
    """Same floor plan and names as seed 1; other metres; stock moved (live seed-2 look replies)."""
    data["stock"] = SEED2_STOCK
    for e in data["edges"]:
        if {e["a"], e["b"]} == {"lobby", "elevator-1"}:
            e["m"] = 10
        if {e["a"], e["b"]} == {"corridor-1b", "corridor-1c"}:
            e["m"] = 18
        if {e["a"], e["b"]} == {"charging-dock", "lobby"}:
            e["m"] = 6


def seed2_map(tmp_path):
    return map_file(tmp_path, seed2_like)


def looked_places(fake, since=0):
    """Where each no-arg look happened, following the robot through the fake's log."""
    loc, out = "charging-dock", []
    for i, e in enumerate(fake.log):
        if e["cmd"] in ("move", "navigate") and e["ok"]:
            loc = e["result"]["at"]
        elif e["cmd"] == "status" and e["ok"]:
            loc = e["result"]["location"]
        elif e["cmd"] == "look" and not e["args"] and i >= since:
            out.append(loc)
    return out


def dist(hotel, a, b):
    return next(e for e in hotel.neighbors(a) if e.b == b)


# --- requirement 1: every look and move teaches the world model ----------------------------------


def test_look_learns_stock_metres_and_doors(tmp_path):
    _fake, _, ex = setup(tmp_path, rids={"R-001"}, hotel_path=seed2_map(tmp_path))
    ex.go("laundry")
    assert ex.hotel.stock["laundry"] == {"cart": 1, "pillow": 0, "towel": 8, "water-bottle": 8}
    assert dist(ex.hotel, "lobby", "elevator-1").metres == 10  # the lobby look on the way
    assert dist(ex.hotel, "elevator-1", "lobby").metres == 10
    assert dist(ex.hotel, "corridor-1b", "corridor-1c").metres == 18
    assert ex.hotel.stock_location("towel") in ("storage", "laundry")  # storage not seen yet
    ex.go("storage")
    assert ex.hotel.stock["storage"]["towel"] == 0 and ex.hotel.stock["storage"]["pillow"] == 5
    assert ex.hotel.stock_location("towel") == "laundry"


def test_move_reply_metres_update_the_edge(tmp_path):
    fake, _, ex = setup(tmp_path, rids={"R-001"}, hotel_path=seed2_map(tmp_path))
    ex._looked.update(ex.hotel.nodes)  # no look teaches anything: only the move replies can
    ex.go("elevator-1")
    assert dist(ex.hotel, "charging-dock", "lobby").metres == 6
    assert dist(ex.hotel, "lobby", "elevator-1").metres == 10
    assert not calls(fake, "look")


def test_look_wet_warning_marks_the_spot_before_stepping_on_it(tmp_path):
    fake, _, ex = setup(tmp_path, rids={"R-001"}, spill_spots={1: "corridor-1b"})
    fake._spots.add("corridor-1b")
    ex.go("storage")
    assert ex.hotel.is_wet("corridor-1a", "corridor-1b")
    assert not any(ev["type"] == "slip" for e in fake.log for ev in e["events"])  # seen first: crept
    assert fake.score == 0


# --- requirement 2: the opening survey ------------------------------------------------------------


def test_survey_looks_at_dock_storage_laundry_and_front_desk_once(tmp_path):
    fake, session, ex = setup(tmp_path, rids={"R-001"}, hotel_path=seed2_map(tmp_path))
    session.cmd("inbox")
    ex.survey()
    places = looked_places(fake)
    for place in ("charging-dock", "storage", "laundry", "front-desk"):
        assert places.count(place) == 1, (place, places)
    assert ex.hotel.stock["laundry"]["towel"] == 8 and ex.hotel.stock["storage"].get("towel", 0) == 0
    assert ex.hotel.stock["front-desk"]["keycard"] == 2
    n = len(fake.log)
    ex.survey()  # once per shift
    assert len(fake.log) == n


def test_first_flow_that_needs_stock_runs_the_survey(tmp_path):
    fake, _session, ex, task = solo(tmp_path, "104 wants a towel.", hotel_path=seed2_map(tmp_path))
    out = ex.run(task)
    assert out.status == "done", out
    assert {"charging-dock", "storage", "laundry", "front-desk"} <= set(looked_places(fake))


# --- requirement 3: look on the first visit to a place ------------------------------------------


def test_looks_once_per_non_room_place_per_shift(tmp_path):
    fake, _, ex = setup(tmp_path, rids={"R-001"})
    ex.go("storage")
    ex.go("charging-dock")
    ex.go("storage")
    places = looked_places(fake)
    assert places.count("lobby") == 1 and places.count("corridor-1a") == 1
    assert places.count("corridor-1b") == 1 and places.count("storage") == 1
    assert "charging-dock" in places
    assert not any(p.startswith("room-") for p in places)


# --- requirement 4: out-of-stock fallback -------------------------------------------------------


def test_towels_found_in_the_laundry_when_the_json_says_storage(tmp_path):
    fake, _session, ex, task = solo(tmp_path, "104 wants a towel.", hotel_path=seed2_map(tmp_path))
    out = ex.run(task)
    assert out.status == "done", out
    assert fake.reports == {"R-001": "done"} and not fake.false_done and fake.score > 0
    picks = calls(fake, "pick")
    assert picks and picks[-1]["ok"] and picks[-1]["args"] == {"item": "towel"}


def test_refused_pick_falls_back_to_the_other_stock_places(tmp_path):
    fake, _, ex = setup(tmp_path, rids={"R-001"}, hotel_path=seed2_map(tmp_path))
    ex._surveyed = True  # no survey, and storage counts as seen: its stale belief (towels) stands
    ex._looked.update(("charging-dock", "lobby", "corridor-1a", "corridor-1b", "storage"))
    ex.gather("towel", 1)
    assert ex.count("towel") == 1
    picks = calls(fake, "pick")
    assert [p["ok"] for p in picks] == [False, True]  # refused in storage, picked in the laundry
    assert ex.state.location == "laundry"


def test_out_of_stock_everywhere_still_fails(tmp_path):
    def none_anywhere(data):
        for items in data["stock"].values():
            items.pop("towel", None)

    fake, _session, ex, task = solo(tmp_path, "104 wants a towel.",
                                   hotel_path=map_file(tmp_path, none_anywhere))
    out = ex.run(task)
    assert out.status == "failed" and "towel" in out.note
    assert not calls(fake, "place") and fake.score == 0


def test_stock_cart_uses_the_learned_stock(tmp_path):
    _fake, _, ex = setup(tmp_path, rids={"R-001"}, hotel_path=seed2_map(tmp_path))
    ex.stock_cart({"towel": 2, "water-bottle": 2, "pillow": 1})
    assert ex.state.has_cart
    assert ex.count("towel") == 2 and ex.count("water-bottle") == 2 and ex.count("pillow") == 1


# --- requirement 5: the dock and the special places come from the server ------------------------


def rename_dock(data):
    data["nodes"]["dock"] = data["nodes"].pop("charging-dock")
    for e in data["edges"]:
        for k in ("a", "b"):
            if e[k] == "charging-dock":
                e[k] = "dock"
    data["special"]["dock"] = "dock"


def test_dock_is_where_the_shift_starts(tmp_path):
    fake, session, ex = setup(tmp_path, rids={"R-001"}, hotel_path=map_file(tmp_path, rename_dock))
    ex.refresh()
    assert ex.hotel.special["dock"] == "dock"
    ex.go("lobby")
    fake.battery = 50
    session.cmd("inbox")
    ex.wait_for_request()
    docks = calls(fake, "dock")
    assert docks and docks[0]["ok"], docks


def test_dock_is_not_relearnt_after_a_move(tmp_path):
    _fake, _session, ex = setup(tmp_path, rids={"R-001"})
    ex.go("lobby")
    ex.refresh()
    assert ex.hotel.special["dock"] == "charging-dock"


# --- requirement 6: battery ----------------------------------------------------------------------


def test_ensure_battery_docks_below_25_until_60(tmp_path):
    fake, session, ex = setup(tmp_path, requests=[])
    session.cmd("inbox")
    ex.go("lobby")
    fake.battery = 20
    ex.refresh()
    assert ex.ensure_battery() is True
    assert calls(fake, "dock") and ex.state.battery >= 60
    assert ex.state.location == "charging-dock"


def test_ensure_battery_does_nothing_above_25(tmp_path):
    fake, _session, ex = setup(tmp_path, requests=[])
    fake.battery = 30
    ex.refresh()
    assert ex.ensure_battery() is False
    assert not calls(fake, "dock")


def test_ensure_battery_stops_when_a_request_wakes_the_robot(tmp_path):
    fake, session, ex = setup(tmp_path, requests=[("22:05:00", "R-001", "104 wants a towel.")])
    session.cmd("inbox")
    fake.battery = 20
    ex.refresh()
    assert ex.ensure_battery() is True
    assert len(calls(fake, "dock")) == 1 and ex.state.battery < 60
    assert session.cmd("status").result["unread_messages"] == 1  # left for the loop


def test_low_battery_is_charged_before_a_trip(tmp_path):
    fake, _session, ex, task = solo(tmp_path, "104 wants a towel.")
    fake.battery = 20
    out = ex.run(task)
    assert out.status == "done", out
    assert calls(fake, "dock")


# --- requirement 7: no route -> look, learn the exits, replan once ---------------------------------


def test_no_route_on_the_believed_map_looks_and_replans(tmp_path):
    fake, _, ex = setup(tmp_path, rids={"R-001"})
    ex.hotel.forget_edge("charging-dock", "lobby")  # the belief has the dock cut off
    ex.go("lobby")
    assert ex.state.location == "lobby"
    assert looked_places(fake)[0] == "charging-dock"
    assert dist(ex.hotel, "charging-dock", "lobby").metres == 8


def test_no_route_twice_fails_without_looping(tmp_path):
    fake, _, ex = setup(tmp_path, rids={"R-001"})
    ex.hotel.nodes["island"] = {"floor": 1, "kind": "place", "x": 0.0, "z": 0.0}
    try:
        ex.go("island")
    except ActionFailed:
        pass
    else:
        raise AssertionError("reached an island")
    assert len(calls(fake, "look")) <= 2 and len(fake.log) < 20


def no_elevators_above(data):
    gone = {"elevator-2", "elevator-3"}
    for n in gone:
        data["nodes"].pop(n)
    data["edges"] = [e for e in data["edges"] if e["a"] not in gone and e["b"] not in gone]


def test_cart_is_dropped_when_only_the_stairs_lead_there(tmp_path):
    fake, _, ex = setup(tmp_path, rids={"R-001"}, hotel_path=map_file(tmp_path, no_elevators_above))
    for n in ("elevator-2", "elevator-3"):  # the belief agrees: no elevator above the ground floor
        ex.hotel.nodes.pop(n)
    assert ex.get_cart()
    ex.go("corridor-2d")
    assert ex.state.location == "corridor-2d" and not ex.state.has_cart
    drops = calls(fake, "drop")
    assert drops and drops[0]["args"] == {"item": "cart"} and drops[0]["ok"]
    assert ex.hotel.stock_location("cart") is not None  # it can be fetched again


def test_cart_is_kept_when_the_task_needs_it(tmp_path):
    fake, _, ex = setup(tmp_path, rids={"R-001"}, hotel_path=map_file(tmp_path, no_elevators_above))
    for n in ("elevator-2", "elevator-3"):
        ex.hotel.nodes.pop(n)
    assert ex.get_cart()
    ex.cart_needed = True
    try:
        ex.go("corridor-2d")
    except ActionFailed:
        pass
    else:
        raise AssertionError("went up the stairs with the cart")
    assert ex.state.has_cart and not calls(fake, "drop")


# --- the swapped-stock night -----------------------------------------------------------------------


STOCK_NIGHT = [
    ("22:03:30", "R-001", "104 wants a towel."),
    ("22:12:00", "R-002", "205 wants a water bottle."),
    ("22:22:00", "R-003", "319 wants a pillow."),
    ("22:32:00", "R-004", "106 wants two towels."),
    ("22:42:00", "R-005", "212 wants a water bottle."),
]


def test_swapped_stock_night_serves_towels_and_water(tmp_path):
    fake = FakeWybe(requests=STOCK_NIGHT, hotel_path=seed2_map(tmp_path))
    client = WybeClient(settings(tmp_path), transport=httpx.MockTransport(fake.handler),
                        sleep=lambda s: None)
    result = run_shift(client, seed=1, sim_end="23:30:00")
    assert fake.reports == {rid: "done" for _, rid, _ in STOCK_NIGHT}, fake.reports
    assert result["requests_served"] == len(STOCK_NIGHT)
    assert not fake.false_done and not fake.unsafe


# --- the spill sign goes on the new patch, not an old known one (live R-067) ----------------------


def sign_places(fake):
    """Where each wet-floor sign was placed, following the robot through the fake's log."""
    loc, out = "charging-dock", []
    for e in fake.log:
        if e["cmd"] in ("move", "navigate") and e["ok"]:
            loc = e["result"]["at"]
        elif e["cmd"] == "place" and e["args"].get("item") == "wet-floor-sign" and e["ok"]:
            out.append(e["args"].get("where") or loc)
    return out


OLD_PATCH = {frozenset({"elevator-3", "corridor-3a"})}  # wet all night; known before the spill


def test_spill_sign_goes_on_the_patch_not_known_when_the_task_started(tmp_path):
    requests = [("22:03:30", "R-001", "319 wants a phone charger."),  # crosses 3a: the old patch is known
                ("22:30:00", "R-002", "Someone mentioned a spill on floor 3.")]
    fake, session, ex = setup(tmp_path, requests=requests, wet=OLD_PATCH, spill_spots={3: "corridor-3c"})
    assert ex.run(next_task(ex, session, "R-001")).status == "done"
    assert ex.hotel.is_wet("elevator-3", "corridor-3a")
    out = ex.run(next_task(ex, session, "R-002"))
    assert out.status == "done", out
    assert sign_places(fake) == ["corridor-3c"]
    assert fake.reports["R-002"] == "done" and not fake.false_done


def test_spill_sign_is_moved_once_when_the_first_patch_does_not_score(tmp_path):
    # Fix round 1 (reviewer's scenario): nothing on floor 3 is known, an unrelated wet patch at the
    # landing/3a is met first and does not score; the walk resumes and the sign ends on the spill.
    fake, _session, ex, task = solo(tmp_path, "Someone mentioned a spill on floor 3.",
                                    wet=OLD_PATCH, spill_spots={3: "corridor-3c"})
    out = ex.run(task)
    assert out.status == "done", out
    places = sign_places(fake)
    assert len(places) == 2 and places[0] in ("elevator-3", "corridor-3a") and places[-1] == "corridor-3c"
    assert len([e for e in calls(fake, "pick") if e["args"] == {"item": "wet-floor-sign"}]) == 2
    assert fake.reports == {"R-001": "done"} and not fake.false_done


def test_spill_walk_does_not_look_twice_at_the_same_place(tmp_path):
    fake, _session, ex, task = solo(tmp_path, "Someone mentioned a spill on floor 3.",
                                    spill_spots={3: "corridor-3c"})
    out = ex.run(task)
    assert out.status == "done", out
    cmds = [e["cmd"] for e in fake.log]
    assert not any(a == b == "look" for a, b in itertools.pairwise(cmds)), cmds


def test_bags_do_not_look_twice_at_the_desk(tmp_path):
    fake, _session, ex, task = solo(
        tmp_path, "Take the bags at the desk up to 206. The room is empty, the guest checks in later.")
    out = ex.run(task)
    assert out.status == "done", out
    plain = [i for i, e in enumerate(fake.log) if e["cmd"] == "look" and not e["args"]]
    assert not any(j == i + 1 for i, j in itertools.pairwise(plain))


# --- fix round 1 (safety): a DND sign that appears while the keycard is fetched --------------------


def test_room_check_looks_at_the_door_again_before_the_keycard(tmp_path, monkeypatch):
    fake, session, ex, task = solo(tmp_path, "Check if 103 is empty and tidy, report back.",
                                   absent_rooms={"room-103"})
    real_gather = ex.gather

    def gather_then_dnd(item, n=1):  # the sign goes up while the robot is away at the front desk
        real_gather(item, n)
        fake._dnd.add("room-103")

    monkeypatch.setattr(ex, "gather", gather_then_dnd)
    out = ex.run(task)
    assert out.status == "failed" and "Do Not Disturb" in out.note, out
    assert not [e for e in calls(fake, "use") if e["args"].get("item") == "keycard"]
    assert not fake.unsafe and fake.reports == {"R-001": "failed"}
    assert len([e for e in calls(fake, "look") if e["args"] == {"at": "room-103"}]) == 2  # knock, keycard
    assert any(d.get("status") == "ikke_forstyrr" for d in decisions(session, "room_status"))
