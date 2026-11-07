"""Executor against the offline fake server: right, honest, safe (spec § Task handling)."""

import json
from dataclasses import replace

import httpx

from agent.client import WybeClient
from agent.config import Settings
from agent.executor import Executor
from agent.flows import scan_candidates
from agent.tasks import Kind, Task, parse_request
from agent.world import DEFAULT_MAP, Hotel, RobotState
from tests.fakes.fake_wybe import DEFAULT_REQUESTS, FakeWybe


def settings(tmp_path) -> Settings:
    return Settings(
        url="https://nightshift.test/",
        key="test-key",
        anthropic_key=None,
        budget_usd=30.0,
        max_rps=1000.0,
        final_armed=False,
        runs_dir=tmp_path / "runs",
    )


def setup(tmp_path, rids=None, requests=None, **fake_kw):
    """A fake with only the named default requests (or the given script), a shift and an executor."""
    if requests is None:
        requests = [r for r in DEFAULT_REQUESTS if rids is None or r[1] in rids]
    fake = FakeWybe(requests=requests, **fake_kw)
    client = WybeClient(
        settings(tmp_path), transport=httpx.MockTransport(fake.handler), sleep=lambda s: None
    )
    session = client.start_shift("practice", seed=1)
    ex = Executor(session, Hotel.load(), RobotState())
    return fake, session, ex


def next_task(ex, session, rid):
    """Dock until request `rid` is in the inbox, then parse it like the shift loop will."""
    for _ in range(12):
        for msg in session.cmd("inbox").result["messages"]:
            if msg.get("request") == rid:
                return parse_request(rid, msg["text"], msg["at"])
        ex.wait_for_request()
    raise AssertionError(f"{rid} never arrived")


def calls(fake, cmd, since=0):
    return [e for e in fake.log[since:] if e["cmd"] == cmd]


def scan_places(fake, since=0):
    loc, out = "charging-dock", []
    for i, e in enumerate(fake.log):
        if e["cmd"] in ("move", "navigate") and e["ok"]:
            loc = e["result"]["at"]
        elif e["cmd"] == "scan" and i >= since:
            out.append(loc)
    return out


def map_file(tmp_path, mutate):
    data = json.loads(DEFAULT_MAP.read_text())
    mutate(data)
    path = tmp_path / "hotel.json"
    path.write_text(json.dumps(data))
    return path


def _without_1a_1b(data):
    data["edges"] = [e for e in data["edges"] if {e["a"], e["b"]} != {"corridor-1a", "corridor-1b"}]


def run_one(tmp_path, rid, **fake_kw):
    fake, session, ex = setup(tmp_path, rids={rid}, **fake_kw)
    task = next_task(ex, session, rid)
    return fake, session, ex, ex.run(task)


# --- the ten tests the plan names --------------------------------------------------------------


def test_amenity_delivered_and_verified(tmp_path):
    fake, _, _, out = run_one(tmp_path, "R-001")
    assert out.status == "done", out
    assert fake.score >= 21
    assert out.points == fake.score
    reports = calls(fake, "report")
    assert [r["result"] for r in reports] == ["Noted. Thanks."]
    assert fake.reports == {"R-001": "done"} and not fake.false_done


def test_never_reports_done_without_reward(tmp_path):
    # The executor is pointed at the wrong room (as a bad route or parse would): the place
    # succeeds, the server gives nothing, so it must not claim "done".
    fake, session, ex = setup(tmp_path, rids={"R-001"})
    task = replace(next_task(ex, session, "R-001"), room="room-318")
    out = ex.run(task)
    assert out.status == "failed", out
    assert any(e["ok"] and e["args"].get("where") == "room-318" for e in calls(fake, "place"))
    assert fake.reports.get("R-001") != "done"
    assert not fake.false_done and fake.score == 0


def test_dnd_reports_failed(tmp_path):
    fake, _, _, out = run_one(tmp_path, "R-006", dnd_rooms={"room-208"})
    assert out.status == "failed" and "Do Not Disturb" in out.note
    assert fake.score == 0 and fake.reports == {"R-006": "failed"}
    assert not calls(fake, "use") and not fake.unsafe
    assert not calls(fake, "place")


def test_room_check_empty_room(tmp_path):
    fake, session, ex, out = run_one(tmp_path, "R-004", absent_rooms={"room-103"})
    assert out.status == "done", out
    assert "Nobody is here" in out.note
    used = [e for e in calls(fake, "use") if e["args"] == {"item": "keycard", "on": "room-103"}]
    assert used and used[0]["ok"]
    assert fake.reports == {"R-004": "done"} and not fake.false_done and fake.score >= 25
    assert ex.state.location == "corridor-1a"
    assert session.cmd("status").result["location"] == "corridor-1a"
    assert not fake.unsafe


def test_lost_item_found_and_delivered(tmp_path):
    fake, session, ex = setup(tmp_path, rids={"R-005"})
    task = next_task(ex, session, "R-005")
    start = len(fake.log)
    out = ex.run(task)
    assert out.status == "done", out
    # From the dock, corridor-1a is the nearest candidate; the glasses are in corridor-1b.
    assert scan_places(fake, since=start) == ["corridor-1a", "corridor-1b"]
    assert fake.reports == {"R-005": "done"} and not fake.false_done and fake.score > 0


def test_tray_requires_cart(tmp_path):
    fake, _, _, out = run_one(tmp_path, "R-002")
    assert out.status == "done", out
    cmds = [(e["cmd"], e["args"]) for e in fake.log]
    use_cart = cmds.index(("use", {"item": "cart"}))
    pick_tray = cmds.index(("pick", {"item": "tray-104"}))
    assert use_cart < pick_tray
    assert fake.reports == {"R-002": "done"} and not fake.false_done and fake.score >= 30


def test_message_said(tmp_path):
    fake, _, _, out = run_one(tmp_path, "R-003")
    assert out.status == "done", out
    cmds = [e["cmd"] for e in fake.log]
    assert cmds.index("knock") < cmds.index("say") < cmds.index("report")
    assert "taxi" in calls(fake, "say")[0]["args"]["text"]
    assert fake.reports == {"R-003": "done"} and not fake.false_done and fake.score >= 20


def test_recovers_when_map_differs(tmp_path):
    def insert_node(data):  # corridor-1a -10- corridor-1ab -10- corridor-1b, no direct edge
        _without_1a_1b(data)
        data["nodes"]["corridor-1ab"] = {"floor": 1, "kind": "corridor", "x": 6.5, "z": 9.0}
        data["edges"] += [{"a": "corridor-1a", "b": "corridor-1ab", "m": 10},
                          {"a": "corridor-1ab", "b": "corridor-1b", "m": 10}]

    fake, session, ex = setup(tmp_path, rids={"R-001"}, hotel_path=map_file(tmp_path, insert_node))
    task = next_task(ex, session, "R-001")
    start = len(fake.log)
    out = ex.run(task)
    assert out.status == "done", out
    assert fake.reports == {"R-001": "done"} and not fake.false_done
    looks = [e for e in calls(fake, "look", since=start) if not e["args"]]
    assert len(looks) == 1
    # The detour through the new node was learnt, so it is in the map for the next trip.
    assert {e.b for e in ex.hotel.neighbors("corridor-1ab")} >= {"corridor-1a", "corridor-1b"}
    assert "corridor-1b" not in {e.b for e in ex.hotel.neighbors("corridor-1a")}


def test_unknown_request_reported_failed(tmp_path):
    fake, session, ex = setup(tmp_path, requests=[("22:01:00", "R-001", "Sing to the lobby, please.")])
    out = ex.run(next_task(ex, session, "R-001"))
    assert out.status == "failed" and out.points == 0
    assert fake.reports == {"R-001": "failed"} and fake.score == 0


def test_out_of_stock_reports_failed(tmp_path):
    def no_chargers(data):
        data["stock"]["storage"]["phone-charger"] = 0

    fake, _, ex, out = run_one(tmp_path, "R-001", hotel_path=map_file(tmp_path, no_chargers))
    assert out.status == "failed" and "phone-charger" in out.note
    assert fake.reports == {"R-001": "failed"} and fake.score == 0
    assert ex.hotel.stock["storage"]["phone-charger"] == 0  # learnt: no second trip
    assert not calls(fake, "place")


# --- more edges of the same rules ----------------------------------------------------------------


def test_room_check_occupied_reports_failed(tmp_path):
    # A guest answering does not verify the check (controller ruling): report failed, never enter.
    fake, session, _, out = run_one(tmp_path, "R-004", guests={"Ms Nygaard": "room-103"})
    assert out.status == "failed" and out.note == "occupied: guest answered; did not enter"
    assert fake.reports == {"R-004": "failed"} and not fake.false_done and fake.score == 0
    assert not calls(fake, "use") and not fake.unsafe
    lines = [json.loads(x) for x in session.log_path.read_text().splitlines()]
    assert any(x["type"] == "decision" and x["kind"] == "note" for x in lines)


def test_lost_item_without_room_asks_the_clerk(tmp_path):
    text = "Ms Nygaard lost glasses earlier tonight, probably somewhere around the ground floor corridor."
    fake, session, ex = setup(tmp_path, requests=[("22:01:00", "R-001", text)])
    out = ex.run(next_task(ex, session, "R-001"))
    assert out.status == "done", out
    asks = calls(fake, "ask")
    assert asks[0]["args"] == {"person": "clerk", "question": "Which room is Ms Nygaard in?"}
    assert any(e["ok"] and e["args"].get("where") == "room-314" for e in calls(fake, "place"))


def test_no_reward_after_place_means_failed(tmp_path, monkeypatch):
    fake, session, ex = setup(tmp_path, rids={"R-001"})
    monkeypatch.setattr(fake, "_judge_delivery", lambda room, item: None)
    out = ex.run(next_task(ex, session, "R-001"))
    assert out.status == "failed" and fake.reports == {"R-001": "failed"} and not fake.false_done


def test_slip_marks_the_edge_wet(tmp_path):
    fake, _, ex, out = run_one(tmp_path, "R-001", wet={frozenset({"lobby", "corridor-1a"})})
    assert out.status == "done"
    assert any(ev["type"] == "slip" for e in fake.log for ev in e["events"])
    assert ex.hotel.is_wet("lobby", "corridor-1a")


def test_wrong_bridge_guess_falls_back_to_known_route(tmp_path):
    def dead_end(data):  # 1a-1b gone; a new dead-end alcove off 1a must not trap the robot
        _without_1a_1b(data)
        data["nodes"]["alcove"] = {"floor": 1, "kind": "hub", "x": 0.0, "z": 12.0}
        data["edges"].append({"a": "corridor-1a", "b": "alcove", "m": 2})

    fake, session, ex = setup(tmp_path, rids={"R-001"}, hotel_path=map_file(tmp_path, dead_end))
    task = next_task(ex, session, "R-001")
    start = len(fake.log)
    out = ex.run(task)
    assert out.status == "done", out
    assert len([e for e in calls(fake, "look", since=start) if not e["args"]]) == 1
    assert "corridor-1b" not in {e.b for e in ex.hotel.neighbors("alcove")}


def test_wait_for_request_idles_with_scans_until_a_request_arrives(tmp_path):
    fake, session, ex = setup(tmp_path, rids={"R-001"})
    session.cmd("inbox")  # the welcome message
    ex.wait_for_request()
    docks = calls(fake, "dock")
    assert docks[0]["result"] == "Battery is already full."
    assert calls(fake, "scan") and set(scan_places(fake)) == {"charging-dock"}
    assert session.cmd("status").result["unread_messages"] == 1  # R-001, left for the loop
    assert not calls(fake, "inbox", since=2)  # the executor never eats the inbox
    assert len(fake.log) < 40


def test_wait_for_request_returns_at_once_when_a_message_is_waiting(tmp_path):
    fake, _, ex = setup(tmp_path, rids={"R-001"})  # the welcome message is unread
    ex.wait_for_request()
    assert not calls(fake, "dock") and not calls(fake, "scan")


def test_wait_for_request_is_bounded(tmp_path):
    fake, session, ex = setup(tmp_path, requests=[])
    session.cmd("inbox")
    ex.wait_for_request()  # nothing will ever arrive: it must still return
    assert 1 <= len(calls(fake, "scan")) <= 20


def test_idle_scan_remembers_found_items(tmp_path):
    fake, session, ex = setup(tmp_path, rids={"R-005"}, hidden={"glasses": "charging-dock"})
    task = next_task(ex, session, "R-005")
    assert ex.found.get("glasses") == "charging-dock"
    scans_before = len(calls(fake, "scan"))
    out = ex.run(task)
    assert out.status == "done", out
    assert len(calls(fake, "scan")) == scans_before  # picked up where the idle scan found it


def test_logs_task_decisions(tmp_path):
    _, session, _, out = run_one(tmp_path, "R-001")
    lines = [json.loads(x) for x in session.log_path.read_text().splitlines()]
    kinds = [x["kind"] for x in lines if x["type"] == "decision"]
    assert kinds.index("task_start") < kinds.index("task_done")
    assert any(x["type"] == "state" for x in lines)
    done = next(x for x in lines if x["type"] == "decision" and x["kind"] == "task_done")
    assert done["data"]["request"] == "R-001" and out.status == "done"


def test_unknown_request_uses_the_brain_when_given(tmp_path):
    class StubBrain:
        def classify(self, request_id, text, arrived):
            return Task(request=request_id, kind=Kind.AMENITY, text=text, arrived=arrived,
                        room="319", item="Phone Charger")

    fake, session, ex = setup(tmp_path, rids={"R-001"})
    ex.brain = StubBrain()
    # As if our parser had not understood the text: the brain's answer is normalised and used.
    task = replace(next_task(ex, session, "R-001"), kind=Kind.UNKNOWN, room=None, item=None)
    out = ex.run(task)
    assert out.status == "done", out
    assert any(e["args"] == {"item": "phone-charger", "where": "room-319"} for e in calls(fake, "place"))


def test_scan_candidates_from_hints():
    hotel = Hotel.load()
    assert scan_candidates(hotel, "ground floor corridor") == (
        ["corridor-1a", "corridor-1b", "corridor-1c"], ["lobby-bar", "front-desk", "lobby"])
    assert scan_candidates(hotel, "the lobby bar")[0] == ["lobby-bar"]
    assert scan_candidates(hotel, "near the kitchen")[0] == ["kitchen-pass"]
    assert scan_candidates(hotel, "second floor corridor")[0] == [
        "corridor-2a", "corridor-2b", "corridor-2c", "corridor-2d"]
    assert scan_candidates(hotel, "corridor 2b")[0] == ["corridor-2b"]
    assert scan_candidates(hotel, None) == ([], ["lobby-bar", "front-desk", "lobby"])


def test_go_from_an_unknown_place_looks_once_then_routes(tmp_path):
    fake, _, ex = setup(tmp_path, rids={"R-001"})
    ex.state.location = "somewhere-new"  # e.g. a place name our map has never seen
    ex.go("lobby")
    assert ex.state.location == "lobby"
    assert len([e for e in calls(fake, "look") if not e["args"]]) == 1
