"""Task 10: a tray or bags at the pickup carries its own request's name (live logs, 20 seeds, 46
numbered trays and 32 numbered bags). The first tray or bags for a room tonight is plain (tray-224,
luggage-205); a later one for the same room is numbered: bags by the request number (R-036 ->
luggage-205-36), a tray by its place among the night's tray requests, room service for a named
guest included (seed 5: R-054 was the 7th -> tray-104-7). Only this request's object is taken;
another request's numbered one never is (a wrong delivery costs 10-20 and loses that tray)."""

from agent.flows import (
    _fewer_objects_than_orders,
    _top_up_for_others,
    own_object,
    own_suffix,
    pick_for_others,
)
from agent.tasks import Kind, parse_request
from tests.agent.test_executor import calls, collect, setup
from tests.fakes.fake_wybe import FakeWybe

TRAY = "Bring the tray from the kitchen pass to {}."
NAMED = "Room service for {} is waiting at the kitchen pass."
BAGS = "Take the bags at the desk up to {}. The room is empty, the guest checks in later."


def _ledger(ex, *reqs):
    tasks = {}
    for rid, text in reqs:
        tasks[rid] = parse_request(rid, text, "22:00:00")
        ex.ledger.add(tasks[rid])
    return tasks


def _placed(fake):
    return [(e["args"]["item"], e["args"]["where"]) for e in calls(fake, "place") if e["ok"]]


# --- the naming rule -----------------------------------------------------------------------------


def test_bags_carry_the_request_number_and_trays_their_place_among_the_nights_trays(tmp_path):
    _fake, _session, ex = setup(tmp_path, requests=[])
    t = _ledger(ex, ("R-005", TRAY.format(330)), ("R-008", TRAY.format(105)), ("R-010", BAGS.format(332)),
                ("R-012", NAMED.format("Dr Kowalski")), ("R-021", "104 wants a towel."),
                ("R-024", TRAY.format(326)), ("R-034", TRAY.format(107)), ("R-035", BAGS.format(205)),
                ("R-036", BAGS.format(205)), ("R-038", NAMED.format("Mx Silva")), ("R-054", TRAY.format(104)))
    assert own_suffix(ex, t["R-054"]) == "7"  # live seed 5: R-054 -> tray-104-7, not tray-104-54
    assert own_suffix(ex, t["R-038"]) == "6"  # room service for a named guest counts as a tray
    assert own_suffix(ex, t["R-036"]) == "36"  # live seed 2: R-036 -> luggage-205-36
    assert own_suffix(ex, t["R-021"]) is None  # an amenity has no numbered pickup object


def test_with_a_plain_and_a_numbered_tray_each_request_takes_its_own(tmp_path):
    _fake, _session, ex = setup(tmp_path, requests=[])
    t = _ledger(ex, *((f"R-00{i}", TRAY.format(104 if i in (3, 7) else 320 + i)) for i in range(1, 8)))
    objects = ["tray-321", "tray-104", "tray-104-7"]
    assert own_object(ex, t["R-007"], objects, "tray-104") == "tray-104-7"  # the 7th tray request
    assert own_object(ex, t["R-003"], objects, "tray-104") == "tray-104"
    assert _fewer_objects_than_orders(ex, t["R-007"], objects, "tray-104") is None


def test_the_seventh_tray_request_takes_the_tray_numbered_seven_not_its_request_number(tmp_path):
    _fake, _session, ex = setup(tmp_path, requests=[])
    t = _ledger(ex, ("R-005", TRAY.format(330)), ("R-008", TRAY.format(105)), ("R-012", NAMED.format("Dr Kowalski")),
                ("R-024", TRAY.format(326)), ("R-034", TRAY.format(107)), ("R-038", NAMED.format("Mx Silva")),
                ("R-054", TRAY.format(104)))
    ex.ledger.set_room("R-012", "room-104")
    ex.ledger.set_status("R-012", "done")  # its plain tray-104 went up hours ago
    assert own_object(ex, t["R-054"], ["tray-203", "tray-104-7"], "tray-104") == "tray-104-7"
    assert own_object(ex, t["R-054"], ["tray-104-54"], "tray-104") is None


def test_luggage_numbered_by_request(tmp_path):
    _fake, _session, ex = setup(tmp_path, requests=[])
    t = _ledger(ex, ("R-022", BAGS.format(324)), ("R-035", BAGS.format(205)), ("R-036", BAGS.format(205)))
    objects = ["luggage-324", "luggage-205", "luggage-205-36"]
    assert own_object(ex, t["R-036"], objects, "luggage-205") == "luggage-205-36"
    assert own_object(ex, t["R-035"], objects, "luggage-205") == "luggage-205"


def test_another_requests_numbered_object_is_never_taken(tmp_path):
    _fake, _session, ex = setup(tmp_path, requests=[])
    t = _ledger(ex, ("R-001", TRAY.format(320)), ("R-003", TRAY.format(104)), ("R-004", TRAY.format(104)),
                ("R-007", TRAY.format(104)), ("R-035", BAGS.format(205)), ("R-036", BAGS.format(205)))
    assert own_object(ex, t["R-003"], ["tray-104-4"], "tray-104") is None  # R-003's is the plain one
    assert own_object(ex, t["R-007"], ["tray-104-3"], "tray-104") is None  # R-007 is the 4th: -4
    assert own_object(ex, t["R-035"], ["luggage-205-36"], "luggage-205") is None


def test_the_plain_tray_belongs_to_the_earliest_open_order_for_the_room(tmp_path):
    _fake, _session, ex = setup(tmp_path, requests=[])
    t = _ledger(ex, ("R-003", TRAY.format(224)), ("R-004", TRAY.format(306)), ("R-022", TRAY.format(224)))
    assert own_object(ex, t["R-022"], ["tray-224"], "tray-224") is None  # R-022's would be tray-224-3
    assert _fewer_objects_than_orders(ex, t["R-022"], ["tray-224"], "tray-224") == "R-003"
    ex.ledger.set_status("R-003", "failed")  # no earlier open order: the plain one is the fallback
    assert own_object(ex, t["R-022"], ["tray-224"], "tray-224") == "tray-224"


# --- the flows -----------------------------------------------------------------------------------


def test_trays_for_one_room_each_deliver_their_own_against_the_live_names(tmp_path):
    reqs = [("22:01:00", "R-001", TRAY.format(104)), ("22:01:10", "R-002", TRAY.format(322)),
            ("22:01:20", "R-003", NAMED.format("Ms Silva")), ("22:01:30", "R-004", TRAY.format(104))]
    fake, session, ex = setup(tmp_path, requests=reqs, live_names=True)
    got = collect(ex, session, {"R-001", "R-002", "R-003", "R-004"})
    for rid in sorted(got):
        ex.ledger.add(got[rid])
    assert set(fake._objects["kitchen-pass"]) >= {"tray-104", "tray-322", "tray-104-3", "tray-104-4"}
    for rid in ("R-004", "R-003", "R-001"):  # latest first: each still finds its own
        assert ex.run(got[rid]).status == "done", rid
    assert [p for p in _placed(fake) if p[1] == "room-104"] == [
        ("tray-104-4", "room-104"), ("tray-104-3", "room-104"), ("tray-104", "room-104")]
    assert not fake.wrong_deliveries and not fake.false_done


def test_a_tray_whose_own_is_gone_leaves_another_requests_numbered_tray(tmp_path):
    reqs = [("22:01:00", "R-001", TRAY.format(104)), ("22:01:30", "R-002", TRAY.format(104))]
    fake, session, ex = setup(tmp_path, requests=reqs, live_names=True)
    got = collect(ex, session, {"R-001", "R-002"})
    for rid in sorted(got):
        ex.ledger.add(got[rid])
    fake._objects["kitchen-pass"].pop("tray-104")  # R-001's tray is not there
    out = ex.run(got["R-001"])
    assert out.status == "declined", out
    assert "tray-104-2" not in [e["args"]["item"] for e in calls(fake, "pick")]
    assert ex.run(got["R-002"]).status == "done"
    assert not fake.wrong_deliveries


def test_bags_for_one_room_each_go_up_under_their_own_name(tmp_path):
    reqs = [("22:01:00", "R-035", BAGS.format(206)), ("22:01:30", "R-036", BAGS.format(206))]
    fake, session, ex = setup(tmp_path, requests=reqs, live_names=True)
    got = collect(ex, session, {"R-035", "R-036"})
    for rid in sorted(got):
        ex.ledger.add(got[rid])
    assert set(fake._objects["front-desk"]) >= {"luggage-206", "luggage-206-36"}
    assert ex.run(got["R-036"]).status == "done"
    assert ex.run(got["R-035"]).status == "done"
    assert _placed(fake) == [("luggage-206-36", "room-206"), ("luggage-206", "room-206")]
    assert not fake.wrong_deliveries and not fake.false_done


def test_picked_for_later_takes_each_waiting_orders_own_tray(tmp_path):
    _fake, _session, ex = setup(tmp_path, requests=[])
    t = _ledger(ex, ("R-003", TRAY.format(224)), ("R-004", TRAY.format(306)), ("R-022", TRAY.format(224)),
                ("R-030", TRAY.format(314)), ("R-041", TRAY.format(224)))
    picked = []
    ex.pick = lambda item: (picked.append(item), (True, f"Picked up {item}."))[1]
    ex.queue = [t["R-041"], t["R-022"], t["R-003"]]
    objects = ["tray-224", "tray-224-3", "tray-224-5"]  # R-030's tray-314 was just picked
    pick_for_others(ex, t["R-030"], Kind.TRAY, lambda o: f"tray-{o.room[5:]}", objects)
    assert picked == ["tray-224-5", "tray-224-3", "tray-224"]


def test_picked_for_later_skips_a_checked_out_room(tmp_path):
    _fake, _session, ex = setup(tmp_path, requests=[])
    t = _ledger(ex, ("R-001", TRAY.format(314)), ("R-002", TRAY.format(310)), ("R-003", BAGS.format(206)),
                ("R-004", BAGS.format(204)))
    picked = []
    ex.pick = lambda item: (picked.append(item), (True, f"Picked up {item}."))[1]
    ex.checked_out = {"room-310", "room-204"}
    ex.queue = [t["R-002"]]
    pick_for_others(ex, t["R-001"], Kind.TRAY, lambda o: f"tray-{o.room[5:]}", ["tray-310"])
    ex.queue = [t["R-004"]]
    pick_for_others(ex, t["R-003"], Kind.BAGS, lambda o: f"luggage-{o.room[5:]}", ["luggage-204"])
    assert picked == []
    ex.checked_out = set()  # the control: the same orders are picked when their rooms are not
    ex.queue = [t["R-002"]]
    pick_for_others(ex, t["R-001"], Kind.TRAY, lambda o: f"tray-{o.room[5:]}", ["tray-310"])
    assert picked == ["tray-310"]


def test_top_up_skips_a_checked_out_room(tmp_path):
    _fake, _session, ex = setup(tmp_path, requests=[])
    t = _ledger(ex, ("R-001", "311 wants a towel."), ("R-002", "309 wants a water bottle."))
    gathered = []
    ex.gather = lambda item, n=1: gathered.append(item)
    ex.state.location = "storage"
    ex.queue = [t["R-002"]]
    ex.checked_out = {"room-309"}
    _top_up_for_others(ex, t["R-001"])
    assert gathered == []
    ex.checked_out = set()
    _top_up_for_others(ex, t["R-001"])
    assert gathered == ["water-bottle"]


# --- the fake ------------------------------------------------------------------------------------


def test_the_fake_names_trays_and_luggage_like_the_live_server_when_asked():
    reqs = [("22:00:05", "R-001", TRAY.format(104)), ("22:00:05", "R-002", BAGS.format(206)),
            ("22:00:05", "R-003", NAMED.format("Ms Silva")), ("22:00:05", "R-004", BAGS.format(206)),
            ("22:00:05", "R-005", TRAY.format(104))]
    fake = FakeWybe(requests=reqs, live_names=True)
    fake._now += 10
    fake._deliver()
    assert set(fake._objects["kitchen-pass"]) >= {"tray-104", "tray-104-2", "tray-104-3"}
    assert set(fake._objects["front-desk"]) >= {"luggage-206", "luggage-206-4"}
    plain = FakeWybe(requests=reqs)  # the default keeps the older fake's names (one tray per room)
    plain._now += 10
    plain._deliver()
    assert "tray-104-2" not in plain._objects["kitchen-pass"] and "bags-206" in plain._objects["front-desk"]
