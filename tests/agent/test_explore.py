"""Task 26: a request names a room the map does not know -> explore that floor, then serve it.

Live seed 2: rooms 325-333 were never in the seed-1 map and every request to them failed at once
as "unknown room". The fake here plays a floor 3 numbered differently (3b-3d carry 325-335); the
executor still believes `hotel_seed1.json`.
"""

import json

from agent.agent import run_shift
from agent.executor import ActionFailed
from agent.tasks import Kind, Task, parse_request
from agent.world import DEFAULT_MAP
from tests.agent.test_adapt import looked_places
from tests.agent.test_agent import _decisions, client_for
from tests.agent.test_executor import calls, decisions, setup, solo
from tests.fakes.fake_wybe import FakeWybe

FLOOR3_CORRIDORS = {"corridor-3a", "corridor-3b", "corridor-3c", "corridor-3d"}


def renumbered_floor3() -> dict:
    """Seed 1's plan; rooms 314-324 (corridors 3b-3d) are 325-335 tonight. 3a keeps 311-313."""
    data = json.loads(DEFAULT_MAP.read_text())
    rename = {f"room-{n}": f"room-{n + 11}" for n in range(314, 325)}
    data["nodes"] = {rename.get(k, k): v for k, v in data["nodes"].items()}
    for e in data["edges"]:
        e["a"], e["b"] = rename.get(e["a"], e["a"]), rename.get(e["b"], e["b"])
    return data


def floor3_looks(fake):
    return [p for p in looked_places(fake) if p in FLOOR3_CORRIDORS]


# --- the flows: an unknown room is explored, then served --------------------------------------------


def test_unknown_room_on_floor_3_is_served_after_exploring(tmp_path):
    fake, session, ex, task = solo(tmp_path, "326 wants a towel.", hotel=renumbered_floor3())
    assert task.room == "room-326" and "room-326" not in ex.hotel.nodes
    out = ex.run(task)
    assert out.status == "done", out
    assert fake.reports == {"R-001": "done"} and not fake.false_done and not fake.unsafe
    assert "corridor-3b" in floor3_looks(fake)
    explored = decisions(session, "floor_explored")
    assert explored and explored[0]["floor"] == 3 and explored[0]["target"] == "room-326"
    assert explored[0]["found"] is True
    assert ex.hotel.room_corridor("room-326") == "corridor-3b"


def test_exploration_stops_as_soon_as_the_room_appears(tmp_path):
    fake, _session, ex = setup(tmp_path, requests=[], hotel=renumbered_floor3())
    ex.refresh()
    assert ex.explore_floor(3, "room-326") is True
    assert floor3_looks(fake) == ["corridor-3a", "corridor-3b"]  # 3c and 3d were not needed
    assert ex.state.location == "corridor-3b"


def tasks_from_inbox(ex, session, rids):
    """Like next_task for several requests arriving together (one inbox read hands over all)."""
    got = {}
    for _ in range(12):
        for msg in session.cmd("inbox").result["messages"]:
            if rid := msg.get("request"):  # the welcome message has none
                got[rid] = parse_request(rid, msg["text"], msg["at"])
        ex.inbox_waiting = False
        if rids <= set(got):
            return got
        ex.wait_for_request()
    raise AssertionError(f"{rids - set(got)} never arrived")


def test_a_room_that_does_not_exist_still_fails_and_the_sweep_runs_once(tmp_path):
    fake, session, ex = setup(tmp_path, requests=[("22:01:00", "R-001", "399 wants a towel."),
                                                  ("22:01:00", "R-002", "398 wants a towel.")],
                              hotel=renumbered_floor3())
    tasks = tasks_from_inbox(ex, session, {"R-001", "R-002"})
    out = ex.run(tasks["R-001"])
    assert out.status == "failed" and out.note == "unknown room room-399", out
    looks = floor3_looks(fake)
    assert set(looks) == FLOOR3_CORRIDORS and len(looks) <= 8  # the whole floor, once each
    assert not calls(fake, "place") and not calls(fake, "knock")
    since = len(fake.log)
    out = ex.run(tasks["R-002"])
    assert out.status == "failed" and out.note == "unknown room room-398", out
    assert not calls(fake, "move", since)  # floor 3 was swept this shift: no second trip
    assert floor3_looks(fake) == looks
    assert fake.reports == {"R-001": "failed", "R-002": "failed"} and not fake.false_done


def test_a_room_on_a_floor_the_hotel_does_not_have_fails_after_one_refused_lift_call(tmp_path):
    fake, session, ex = setup(tmp_path, requests=[("22:01:00", "R-001", "999 wants a towel."),
                                                  ("22:01:00", "R-002", "998 wants a towel.")],
                              hotel=renumbered_floor3())
    tasks = tasks_from_inbox(ex, session, {"R-001", "R-002"})
    since = len(fake.log)  # after the first idle time's survey
    out = ex.run(tasks["R-001"])
    assert out.status == "failed" and out.note == "unknown room room-999", out
    lifts = calls(fake, "call_elevator", since)
    assert [(c["args"], c["ok"]) for c in lifts] == [({"floor": 9}, False)]  # one bounded try
    assert ex.state.location == "elevator-1" and not calls(fake, "place", since)
    since = len(fake.log)
    out = ex.run(tasks["R-002"])
    assert out.status == "failed" and out.note == "unknown room room-998", out
    assert [e["cmd"] for e in fake.log[since:]] == ["report"]  # floor 9 refused once: closed tonight


def with_floor4(data: dict) -> dict:
    """A fourth floor the starting map knows nothing about: elevator-4 - corridor-4a - room-401."""
    data["nodes"].update({"elevator-4": {"floor": 4, "kind": "elevator", "x": 0.0, "z": 0.0},
                          "corridor-4a": {"floor": 4, "kind": "corridor", "x": 0.0, "z": 0.0},
                          "room-401": {"floor": 4, "kind": "room", "x": 0.0, "z": 0.0}})
    data["edges"] += [{"a": "elevator-4", "b": "corridor-4a", "m": 6},
                      {"a": "corridor-4a", "b": "room-401", "m": 4, "door": True}]
    return data


def test_a_room_on_a_floor_the_map_does_not_have_is_reached_by_the_lift(tmp_path):
    fake, session, ex, task = solo(tmp_path, "401 wants a towel.", hotel=with_floor4(renumbered_floor3()))
    assert not any(v["floor"] == 4 for v in ex.hotel.nodes.values())
    out = ex.run(task)
    assert out.status == "done", out
    assert fake.reports == {"R-001": "done"} and not fake.false_done and not fake.unsafe
    assert any(c["args"] == {"floor": 4} and c["ok"] for c in calls(fake, "call_elevator"))
    explored = decisions(session, "floor_explored")
    assert explored[0]["found"] is True and explored[0]["looked"] == ["elevator-4", "corridor-4a"]
    assert ex.hotel.room_corridor("room-401") == "corridor-4a"


def test_a_corridor_closed_on_the_first_call_is_tried_again_on_the_next(tmp_path):
    """A cleaning crew closes 3b for a while: the floor must not count as swept for the night."""
    fake, _session, ex = setup(tmp_path, requests=[], hotel=renumbered_floor3())
    ex.refresh()
    real_go, closed = ex.go, {"corridor-3b"}

    def go(dst, **kw):
        if dst in closed:
            raise ActionFailed(f"could not reach {dst}: Closed off: a cleaning crew has blocked that corridor.")
        return real_go(dst, **kw)

    ex.go = go
    assert ex.explore_floor(3, "room-326") is False
    assert "corridor-3b" not in floor3_looks(fake)
    closed.clear()  # the crew leaves
    assert ex.explore_floor(3, "room-326") is True
    assert "corridor-3b" in floor3_looks(fake) and ex.hotel.room_corridor("room-326") == "corridor-3b"


def test_explore_floor_is_bounded_per_call(tmp_path):
    fake, _session, ex = setup(tmp_path, requests=[], hotel=renumbered_floor3())
    ex.refresh()
    # Floor 3 is believed to have many corridors tonight: the call may not sweep them all at once.
    for i in range(20):
        ex.hotel.add_node(f"corridor-3x{i}", 3, "corridor")
        ex.hotel.update_from_look("corridor-3d", {"floor": 3, "exits": [{"to": f"corridor-3x{i}", "metres": 5}]})
    assert ex.explore_floor(3, "room-nowhere") is False
    assert len([e for e in calls(fake, "look") if not e["args"]]) <= 8 + 2  # + elevator landings


def test_explore_floor_with_a_stale_orphan_room(tmp_path):
    """Seed 3: a room on the believed map lost its corridor edge (3a's look dropped it): explore."""
    fake, _session, ex, task = solo(tmp_path, "326 wants a towel.", hotel=renumbered_floor3())
    ex.hotel.add_node("room-326", 3, "room")  # believed but unattached: no corridor on the map
    out = ex.run(task)
    assert out.status == "done", out
    assert fake.reports == {"R-001": "done"} and not fake.false_done


# --- agent.py: a Brain room check on an unknown room is explored before it is refused ---------------


class CheckingBrain:
    """A Brain that calls every text a room check of `room`."""

    enabled = True

    def __init__(self, room: str):
        self.room = room

    def classify(self, rid, text, arrived):
        return Task(rid, Kind.ROOM_CHECK, text, arrived, room=self.room)


# The agent's own parser leaves "check on" without empty/tidy/occupied to the Brain; the fake
# reads it as a room check of 326, so it can judge the keycard look inside.
CHECK_326 = "Please check on 326, the guest has gone."


def test_brain_room_check_on_an_unexplored_room_is_explored_not_refused(tmp_path):
    fake = FakeWybe(requests=[("22:03:30", "R-001", CHECK_326)], absent_rooms={"room-326"},
                    hotel=renumbered_floor3())
    result = run_shift(client_for(tmp_path, fake.handler), seed=1, sim_end="22:40:00",
                       brain=CheckingBrain("326"))
    assert not _decisions(tmp_path, result, "brain_rejected")
    assert {d["request"] for d in _decisions(tmp_path, result, "brain_classified")} == {"R-001"}
    assert fake.reports == {"R-001": "done"}, fake.reports
    assert not fake.unsafe and not fake.false_done


def test_brain_room_check_on_an_unknown_room_makes_no_game_call_in_the_inbox_read(tmp_path):
    """The inbox hands each message over once: the read must not walk (an error would lose the
    batch). The unknown room is accepted into pending; the task explores when it runs."""
    from agent.agent import _read_inbox

    fake, _session, ex = setup(tmp_path, requests=[("22:01:00", "R-001", CHECK_326)],
                               absent_rooms={"room-326"}, hotel=renumbered_floor3())
    _session.cmd("inbox")  # the welcome message, so the wait below is for R-001 itself
    while not ex._request_waiting():
        ex.wait_for_request()
    since, pending = len(fake.log), []
    _read_inbox(ex, CheckingBrain("326"), set(), pending)
    assert [e["cmd"] for e in fake.log[since:]] == ["inbox"]
    assert [(t.request, t.kind, t.room) for t in pending] == [("R-001", Kind.ROOM_CHECK, "room-326")]
    out = ex.run(pending[0])
    assert out.status == "done", out
    assert fake.reports == {"R-001": "done"} and not fake.unsafe and not fake.false_done
    assert decisions(_session, "floor_explored")[0]["found"] is True


def test_brain_room_check_on_a_room_the_hotel_cannot_have_is_still_refused(tmp_path):
    fake = FakeWybe(requests=[("22:03:30", "R-001", "Have a quick peek at 999 please, the guest left.")])
    result = run_shift(client_for(tmp_path, fake.handler), seed=1, sim_end="22:30:00",
                       brain=CheckingBrain("999"))
    assert fake.reports == {"R-001": "failed"}
    assert {d["request"] for d in _decisions(tmp_path, result, "brain_rejected")} == {"R-001"}
    assert not calls(fake, "call_elevator")


def test_room_floor():
    from agent.flows import room_floor

    assert room_floor("room-326") == 3
    assert room_floor("room-104") == 1
    assert room_floor("room-1204") == 12
    assert room_floor("room-nowhere") is None
    assert room_floor(None) is None
