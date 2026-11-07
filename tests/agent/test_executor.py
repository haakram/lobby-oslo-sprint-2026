"""Executor against the offline fake server: right, honest, safe (spec § Task handling)."""

import json
from dataclasses import replace

import httpx
import pytest

from agent.client import WybeClient
from agent.config import Settings
from agent.executor import Executor
from agent.flows import scan_candidates
from agent.tasks import Kind, Task, parse_request
from agent.world import DEFAULT_MAP, Hotel, RobotState
from tests.fakes.fake_wybe import TYPES_DEMO_REQUESTS, VERIFIED_BONUS, FakeWybe


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
        requests = [r for r in TYPES_DEMO_REQUESTS if rids is None or r[1] in rids]
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
        messages = session.cmd("inbox").result["messages"]
        ex.inbox_waiting = False  # the loop's inbox read is what clears the flag
        for msg in messages:
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
    assert out.points == fake.score - VERIFIED_BONUS  # the flow's rise; the report's bonus is not seen
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
    assert looks  # Task 19: one look per place on the first visit; the detour is learnt from them
    assert not any(e["cmd"] == "move" and not e["ok"] for e in fake.log[start:])  # seen, not bumped
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
    # Task 19: the first-visit look in the lobby warns about the patch, so the robot creeps over
    # it instead of slipping; the spot is known wet either way.
    assert not any(ev["type"] == "slip" for e in fake.log for ev in e["events"])
    assert ex.hotel.is_wet("lobby", "corridor-1a")
    ex.hotel._wet_spots.clear()  # the move path still marks it: a move reply that says wet
    ex.go("lobby")
    assert ex.move("corridor-1a").ok
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
    looks = [e for e in calls(fake, "look", since=start) if not e["args"]]
    assert looks and not any(e["ok"] is False for e in looks)  # Task 19: one look per place visited
    assert "corridor-1b" not in {e.b for e in ex.hotel.neighbors("alcove")}


def test_wait_for_request_idles_with_scans_until_a_request_arrives(tmp_path):
    fake, session, ex = setup(tmp_path, rids={"R-001"})
    ex._surveyed = True  # the opening's get_cart surveyed at 22:00; not part of this test
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
    ex.wait_for_request(max_idle=40)  # nothing will ever arrive: it must still return
    assert 1 <= len(calls(fake, "scan")) <= 40


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
    primary, secondary = scan_candidates(hotel, "ground floor corridor")
    assert primary == ["corridor-1a", "corridor-1b", "corridor-1c"]
    assert secondary[:3] == ["lobby-bar", "front-desk", "lobby"]  # then the rest of floor 1
    assert scan_candidates(hotel, "the lobby bar")[0] == ["lobby-bar"]
    assert scan_candidates(hotel, "near the kitchen")[0] == ["kitchen-pass"]
    assert scan_candidates(hotel, "second floor corridor")[0] == [
        "corridor-2a", "corridor-2b", "corridor-2c", "corridor-2d"]
    assert scan_candidates(hotel, "corridor 2b")[0] == ["corridor-2b"]
    primary, secondary = scan_candidates(hotel, None)
    assert primary == [] and secondary[:3] == ["lobby-bar", "corridor-1b", "corridor-1a"]


def test_go_from_an_unknown_place_looks_once_then_routes(tmp_path):
    fake, _, ex = setup(tmp_path, rids={"R-001"})
    ex.state.location = "somewhere-new"  # e.g. a place name our map has never seen
    ex.go("lobby")
    assert ex.state.location == "lobby"
    cmds = [e["cmd"] for e in fake.log]
    assert cmds[:cmds.index("move")].count("look") == 1  # one look to learn where, then it routes


# --- fix round 1 -----------------------------------------------------------------------------------


def test_lost_item_delivered_under_the_name_it_was_found(tmp_path):
    fake, session, ex = setup(tmp_path, rids={"R-005"}, hidden={"reading-glasses": "corridor-1b"})
    task = next_task(ex, session, "R-005")
    fake._requests["R-005"].item = "reading-glasses"  # the server's own name for the lost thing
    out = ex.run(task)
    assert out.status == "done", out
    assert any(e["ok"] and e["args"] == {"item": "reading-glasses", "where": "room-317"}
               for e in calls(fake, "place"))
    assert not fake.wrong_deliveries and not fake.false_done


def test_item_names_match_on_whole_words():
    from agent.flows import same_item

    assert same_item("glasses", "reading-glasses") and same_item("reading-glasses", "glasses")
    assert not same_item("glasses", "sunglasses")


def test_two_items_are_both_placed_before_done(tmp_path):
    fake, session, ex = setup(tmp_path, requests=[("22:01:00", "R-001", "Two towels for 212.")])
    task = next_task(ex, session, "R-001")
    assert task.count == 2
    fake._requests["R-001"].count = 1  # a server that already rewards the first towel
    out = ex.run(task)
    assert out.status == "done", out
    places = [e for e in calls(fake, "place") if e["ok"]]
    assert [e["args"] for e in places] == [{"item": "towel", "where": "room-212"}] * 2
    assert not fake.wrong_deliveries and not fake.false_done


def test_two_towels_scored_on_the_second(tmp_path):
    fake, session, ex = setup(tmp_path, requests=[("22:01:00", "R-001", "Two towels for 212.")])
    out = ex.run(next_task(ex, session, "R-001"))
    assert out.status == "done" and len(calls(fake, "place")) == 2 and fake.score > 0


def test_room_check_done_only_when_inside_the_room(tmp_path, monkeypatch):
    fake, session, ex = setup(tmp_path, rids={"R-004"}, absent_rooms={"room-103"})
    task = next_task(ex, session, "R-004")
    real_move = ex.move

    def move_but_server_keeps_robot_out(to):  # our state says inside, the server disagrees
        reply = real_move(to)
        if to == "room-103":
            fake._location = "corridor-1a"
        return reply

    monkeypatch.setattr(ex, "move", move_but_server_keeps_robot_out)
    out = ex.run(task)
    assert out.status == "failed" and fake.reports == {"R-004": "failed"} and not fake.false_done


def test_internal_error_is_logged_with_message_and_place(tmp_path, monkeypatch):
    from agent import flows
    from agent.tasks import Kind

    def broken(ex, task):
        raise ValueError("odd reply shape")

    monkeypatch.setitem(flows.HANDLERS, Kind.AMENITY, broken)
    fake, session, ex = setup(tmp_path, rids={"R-001"})
    out = ex.run(next_task(ex, session, "R-001"))
    assert out.status == "failed" and fake.reports == {"R-001": "failed"}
    lines = [json.loads(x) for x in session.log_path.read_text().splitlines()]
    err = next(x["data"] for x in lines if x["type"] == "decision" and x["kind"] == "executor_error")
    assert err["error"] == "ValueError" and err["message"] == "odd reply shape"
    assert "test_executor.py" in err["where"] and "broken" in err["where"]


def test_dock_refused_or_unreachable_still_spends_time(tmp_path):
    for dock in ("lobby", "nowhere"):  # "There's no dock here." / no route at all
        fake, session, ex = setup(tmp_path, rids={"R-001"})
        session.cmd("inbox")
        ex.hotel.special["dock"] = dock
        before = session.cmd("status").clock
        ex.wait_for_request()
        assert len(calls(fake, "scan")) == 1, dock
        assert session.cmd("status").clock >= "22:01:00" > before, dock


def test_full_hands_fetch_the_cart_then_pick(tmp_path):
    fake, session, ex = setup(tmp_path, rids={"R-001"})
    task = next_task(ex, session, "R-001")
    ex.go("storage")
    assert ex.pick("towel")[0] and ex.pick("towel")[0]  # both hands full, no cart
    out = ex.run(task)
    assert out.status == "done", out
    cmds = [(e["cmd"], e["args"], e["ok"]) for e in fake.log]
    assert ("use", {"item": "cart"}, True) in cmds
    assert cmds.index(("pick", {"item": "phone-charger"}, False)) < cmds.index(
        ("use", {"item": "cart"}, True)) < cmds.index(("pick", {"item": "phone-charger"}, True))


def test_no_answer_on_a_delivery_fails_and_keeps_the_item(tmp_path):
    fake, session, ex, out = run_one(tmp_path, "R-001", absent_rooms={"room-319"})
    assert out.status == "failed" and "no answer" in out.note
    assert fake.reports == {"R-001": "failed"} and not calls(fake, "place")
    assert ex.state.carrying("phone-charger")
    assert "phone-charger" in session.cmd("status").result["hands"]


def test_keycard_out_of_stock_fails_the_room_check(tmp_path):
    def no_keycards(data):
        data["stock"]["front-desk"]["keycard"] = 0

    fake, _, _, out = run_one(tmp_path, "R-004", absent_rooms={"room-103"},
                              hotel_path=map_file(tmp_path, no_keycards))
    assert out.status == "failed" and "keycard out of stock" in out.note
    assert fake.reports == {"R-004": "failed"} and not calls(fake, "use")


def test_shift_end_propagates_out_of_run(tmp_path):
    import pytest

    from agent.client import ShiftEnded

    fake, session, ex = setup(tmp_path, rids={"R-001"}, end_clock="22:06:00")
    task = next_task(ex, session, "R-001")
    with pytest.raises(ShiftEnded):
        ex.run(task)
    assert "R-001" not in fake.reports


def test_lost_phone_is_searched_for_not_a_carried_charger(tmp_path):
    from agent.tasks import Kind, Task

    text = "Guest in 317 lost phone, maybe the ground floor corridor."
    fake, session, ex = setup(tmp_path, requests=[("22:01:00", "R-001", text)],
                              hidden={"phone": "corridor-1a"})
    msg = next_task(ex, session, "R-001")
    fake._requests["R-001"].item = "phone"
    assert ex.ensure_item("phone-charger")  # stock item in hand that shares the word "phone"
    task = Task(request="R-001", kind=Kind.LOST_ITEM, text=text, arrived=msg.arrived,
                room="room-317", item="phone", area_hint="ground floor corridor")
    out = ex.run(task)
    assert out.status == "done", out
    assert [e["args"]["item"] for e in calls(fake, "place")] == ["phone"]
    assert not fake.wrong_deliveries


# --- Task 13: new request types, knock safety, hypotheses ----------------------------------------

FOLLOW = "Front desk passed on a call from {}: the guest says the {} they ordered an hour ago never came."
BAGS_TEXT = "Take the bags at the desk up to {}. The room is empty, the guest checks in later."
BATHROBE = 'A man in a bathrobe stops the robot: "I\'m locked out of 203. Can you let me in?"'


def decisions(session, kind):
    lines = [json.loads(x) for x in session.log_path.read_text().splitlines()]
    return [x["data"] for x in lines if x["type"] == "decision" and x["kind"] == kind]


def hypotheses(session, hid):
    return [d for d in decisions(session, "hypothesis") if d["id"] == hid]


def assert_every_knock_looked_first(fake):
    """Before each knock: a look at that same door, with no move in between."""
    for i, e in enumerate(fake.log):
        if e["cmd"] != "knock":
            continue
        door = e["args"]["door"]
        j = i - 1
        while j >= 0 and fake.log[j]["cmd"] in ("status", "inbox"):
            j -= 1
        assert fake.log[j]["cmd"] == "look" and fake.log[j]["args"] == {"at": door}, (i, door)


def collect(ex, session, rids):
    """Dock until every request in rids has come in; parse them like the shift loop will."""
    got = {}
    for _ in range(20):
        messages = session.cmd("inbox").result["messages"]
        ex.inbox_waiting = False  # the loop's inbox read is what clears the flag
        for msg in messages:
            if msg.get("request") in rids:
                got[msg["request"]] = parse_request(msg["request"], msg["text"], msg["at"])
        if set(got) == set(rids):
            return got
        ex.wait_for_request()
    raise AssertionError(f"missing {set(rids) - set(got)}")


def solo(tmp_path, text, **fake_kw):
    fake, session, ex = setup(tmp_path, requests=[("22:01:00", "R-001", text)], **fake_kw)
    task = next_task(ex, session, "R-001")
    return fake, session, ex, task


def test_every_knock_is_preceded_by_a_door_look(tmp_path):
    for rid in ("R-001", "R-002", "R-003", "R-005"):
        fake, _, _, out = run_one(tmp_path, rid)
        assert out.status == "done", (rid, out)
        assert calls(fake, "knock")
        assert_every_knock_looked_first(fake)


DND_208 = [
    "208 wants a water bottle.",
    "Tell the guest in 208 the taxi is here.",
    "Bring the tray from the kitchen pass to 208.",
    "Guest in 208 lost a wallet, maybe the kitchen pass.",
    BAGS_TEXT.format(208),
    "Check if 208 is empty and tidy, report back.",
    "Complaint about noise near 209.",
    "Ms Kvam would like a pillow.",
    "Room service for Ms Kvam is waiting at the kitchen pass.",
    "Let Ms Kvam know breakfast starts at seven.",
]


def test_dnd_door_is_never_knocked_or_keycarded_in_any_flow(tmp_path):
    for text in DND_208:
        fake, _session, ex, task = solo(
            tmp_path, text, dnd_rooms={"room-208"}, hidden={"wallet": "kitchen-pass"},
            guests={"Ms Kvam": "room-208"}, noise_sources={"room-209": "room-208"})
        out = ex.run(task)
        assert out.status == "failed", (text, out)
        assert "Do Not Disturb" in out.note, (text, out.note)
        assert not [e for e in calls(fake, "knock") if e["args"]["door"] == "room-208"], text
        assert not [e for e in calls(fake, "use") if e["args"].get("on") == "room-208"], text
        assert not fake.unsafe and fake.score == 0 and fake.reports == {"R-001": "failed"}, text


# H-bags


def test_bags_taken_up_with_a_keycard_and_placed(tmp_path):
    fake, session, ex, task = solo(tmp_path, BAGS_TEXT.format(206))
    assert task.kind is Kind.BAGS
    out = ex.run(task)
    assert out.status == "done", out
    cmds = [(e["cmd"], e["args"], e["ok"]) for e in fake.log]
    pick = cmds.index(("pick", {"item": "bags-206"}, True))
    door = cmds.index(("look", {"at": "room-206"}, True))
    use = cmds.index(("use", {"item": "keycard", "on": "room-206"}, True))
    place = cmds.index(("place", {"item": "bags-206", "where": "room-206"}, True))
    assert pick < door < use < place
    assert not calls(fake, "knock") and not fake.unsafe and not fake.false_done
    assert fake.reports == {"R-001": "done"} and fake.score > 0
    hyp = hypotheses(session, "H-bags")
    assert hyp and hyp[-1]["request"] == "R-001"
    assert {"action", "score_before", "score_after"} <= set(hyp[-1])
    assert hyp[-1]["score_after"] > hyp[-1]["score_before"]


def test_bags_with_hands_and_cart_full_fail_without_dropping(tmp_path):
    fake, _session, ex, task = solo(tmp_path, BAGS_TEXT.format(206))
    assert ex.get_cart()
    fake._hands[:] = ["towel", "towel"]
    fake._cart[:] = ["towel"] * 8
    ex.refresh()
    out = ex.run(task)
    assert out.status == "failed" and "full" in out.note
    assert not calls(fake, "drop") and not calls(fake, "place")
    assert not [e for e in calls(fake, "pick") if e["args"]["item"].startswith("bags")]


def test_bags_without_a_score_rise_are_not_done(tmp_path, monkeypatch):
    fake, _session, ex, task = solo(tmp_path, BAGS_TEXT.format(206))
    monkeypatch.setattr(fake, "_judge_delivery", lambda room, item: None)
    out = ex.run(task)
    assert out.status == "failed" and fake.reports == {"R-001": "failed"} and not fake.false_done


# H-noise


def test_noise_complaint_asks_the_named_room_to_keep_it_down(tmp_path):
    fake, session, ex, task = solo(tmp_path, "Complaint about noise near 201.",
                                   noise_sources={"room-201": "room-202"})  # 203 is empty on the live night
    assert task.kind is Kind.NOISE
    out = ex.run(task)
    assert out.status == "done", out
    assert [e["args"]["door"] for e in calls(fake, "knock")] == ["room-202"]
    assert_every_knock_looked_first(fake)
    said = calls(fake, "say")[0]["args"]["text"]
    assert "keep the noise down" in said
    assert fake.reports == {"R-001": "done"} and not fake.false_done
    hyp = hypotheses(session, "H-noise")
    assert hyp and hyp[-1]["score_after"] > hyp[-1]["score_before"]
    assert decisions(session, "noise_look")


def test_noise_with_nothing_named_reports_what_was_seen(tmp_path):
    fake, session, ex, task = solo(tmp_path, "Complaint about noise near 201.",
                                   noise_sources={"room-201": None})
    out = ex.run(task)
    assert out.status == "failed" and "corridor-2a" in out.note
    assert not calls(fake, "knock") and not calls(fake, "say")
    assert fake.reports == {"R-001": "failed"}
    assert hypotheses(session, "H-noise")


# H-spill


def test_spill_sign_placed_on_the_wet_patch(tmp_path):
    fake, session, ex, task = solo(tmp_path, "Someone mentioned a spill on floor 3.",
                                   spill_spots={3: "corridor-3c"})
    assert task.kind is Kind.SPILL and task.floor == 3
    out = ex.run(task)
    assert out.status == "done", out
    picks = [e["args"]["item"] for e in calls(fake, "pick") if e["ok"]]
    assert "wet-floor-sign" in picks
    placed = [e for e in calls(fake, "place") if e["ok"]]
    assert placed[-1]["args"] == {"item": "wet-floor-sign"}
    assert session.cmd("status").result["location"] == "corridor-3c"
    assert not any(ev["type"] == "slip" for e in fake.log for ev in e["events"])  # looked first
    assert ex.hotel.is_wet("corridor-3b", "corridor-3c") or ex.hotel.is_wet("corridor-3d", "corridor-3c")
    assert fake.reports == {"R-001": "done"} and not fake.false_done
    assert hypotheses(session, "H-spill")


def test_spill_not_found_reports_declined_with_what_was_seen(tmp_path):
    fake, _session, ex, task = solo(tmp_path, "Someone mentioned a spill on floor 2.", spill_spots={2: None})
    out = ex.run(task)
    assert out.status == "declined" and "corridor-2" in out.note
    assert not [e for e in calls(fake, "place") if e["args"].get("item") == "wet-floor-sign"]
    assert fake.reports == {"R-001": "declined"}


# H-followup


def test_follow_up_without_an_order_delivers_nothing(tmp_path):
    fake, session, ex, task = solo(tmp_path, FOLLOW.format(319, "water bottle"))
    assert task.kind is Kind.FOLLOWUP
    out = ex.run(task)
    assert out.status == "declined" and out.note == "No water-bottle order from 319 on record tonight; nothing was ordered."
    assert not calls(fake, "place") and not calls(fake, "knock")
    assert fake.reports == {"R-001": "declined"} and fake.score == 5  # live: +5 for the declined false claim
    assert hypotheses(session, "H-followup")


def test_follow_up_for_a_done_order_delivers_nothing(tmp_path):
    reqs = [TYPES_DEMO_REQUESTS[0], ("22:20:00", "R-002", FOLLOW.format(319, "phone charger"))]
    fake, session, ex = setup(tmp_path, requests=reqs)
    assert ex.run(next_task(ex, session, "R-001")).status == "done"
    places = len(calls(fake, "place"))
    out = ex.run(next_task(ex, session, "R-002"))
    assert out.status == "declined" and "already delivered under R-001" in out.note
    assert len(calls(fake, "place")) == places and fake.reports["R-002"] == "declined"


def test_follow_up_runs_the_pending_original_first(tmp_path):
    reqs = [TYPES_DEMO_REQUESTS[0], ("22:04:00", "R-002", FOLLOW.format(319, "phone charger"))]
    fake, session, ex = setup(tmp_path, requests=reqs)
    got = collect(ex, session, {"R-001", "R-002"})
    first = got["R-001"]
    ex.ledger.add(first)
    ex.queue.append(first)  # still waiting in the shift loop's queue
    out = ex.run(got["R-002"])
    assert out.status == "declined" and "delivered now under R-001" in out.note
    assert fake.reports == {"R-001": "done", "R-002": "declined"} and not fake.false_done
    assert first not in ex.queue
    assert ex.ledger.get("R-001").status == "done"


# H-duplicate


def test_duplicate_request_is_reported_failed_not_redone(tmp_path):
    tray = "Bring the tray from the kitchen pass to 322."
    fake, session, ex = setup(tmp_path, requests=[("22:01:00", "R-001", tray), ("22:01:30", "R-002", tray)])
    ex._surveyed = True  # the opening's get_cart surveyed at 22:00; not part of this test
    got = collect(ex, session, {"R-001", "R-002"})
    ex.ledger.add(got["R-001"])
    ex.ledger.add(got["R-002"])
    out = ex.run(got["R-002"])  # judged at the kitchen pass: one tray, and it is R-001's
    assert out.status == "declined" and out.note.startswith("Duplicate of R-001")
    assert not calls(fake, "pick")
    assert ex.run(got["R-001"]).status == "done"
    assert hypotheses(session, "H-duplicate")


# H-named


def test_named_guest_room_asked_once_per_name(tmp_path):
    reqs = [("22:01:00", "R-001", "Mr Aas would like a pillow."),
            ("22:02:00", "R-002", "Mr Aas would like a towel.")]
    fake, session, ex = setup(tmp_path, requests=reqs, guests={"Mr Aas": "room-318"})
    got = collect(ex, session, {"R-001", "R-002"})
    a = got["R-001"]
    assert a.room is None and a.guest == "Mr Aas"
    assert ex.run(a).status == "done"
    assert ex.run(got["R-002"]).status == "done"
    asks = calls(fake, "ask")
    assert [e["args"] for e in asks] == [{"person": "clerk", "question": "Which room is Mr Aas in?"}]
    assert [e["args"]["where"] for e in calls(fake, "place") if e["ok"]] == ["room-318", "room-318"]
    assert ex.ledger.get("R-001").room == "room-318"
    assert hypotheses(session, "H-named")


def test_named_room_service_tray(tmp_path):
    fake, _session, ex, task = solo(tmp_path, "Room service for Dr Engen is waiting at the kitchen pass.",
                                   guests={"Dr Engen": "room-102"})
    out = ex.run(task)
    assert out.status == "done", out
    assert any(e["ok"] and e["args"] == {"item": "tray-102", "where": "room-102"}
               for e in calls(fake, "place"))


def test_named_message(tmp_path):
    fake, _session, ex, task = solo(tmp_path, "Let Mx Haugen know their wake-up call is set for half past six.",
                                   guests={"Mx Haugen": "room-315"})
    out = ex.run(task)
    assert out.status == "done", out
    assert "wake-up call" in calls(fake, "say")[0]["args"]["text"]


def test_named_guest_unknown_to_the_clerk_fails_and_is_not_asked_again(tmp_path):
    reqs = [("22:01:00", "R-001", "Mr Nobody would like a pillow."),
            ("22:02:00", "R-002", "Mr Nobody would like a towel.")]
    fake, session, ex = setup(tmp_path, requests=reqs, guests={})
    got = collect(ex, session, {"R-001", "R-002"})
    assert ex.run(got["R-001"]).status == "failed"
    assert ex.run(got["R-002"]).status == "failed"
    assert len(calls(fake, "ask")) == 1


# H-bathrobe


@pytest.mark.parametrize("text, room, corridor, stranger, kw", [
    ("Check if 103 is empty and tidy, report back.", "room-103", "corridor-1a", "101",
     {"absent_rooms": {"room-103"}}),
    (BAGS_TEXT.format(206), "room-206", "corridor-2b", "205", {}),
])
def test_bathrobe_man_during_a_keycard_task_gets_a_polite_no_and_no_keycard(
        tmp_path, text, room, corridor, stranger, kw):
    # The man waits in the corridor of the task's room, next to his own door, while the robot
    # carries a keycard for the task: the keycard opens the task's room and nothing else.
    plea = f'A man in a bathrobe stops the robot: "I\'m locked out of {stranger}. Can you let me in?"'
    fake, session, ex = setup(tmp_path, requests=[("22:01:00", "R-001", text)],
                              people_events=[("22:00:00", corridor, plea)], **kw)
    ex._surveyed = True  # the opening's get_cart surveyed at 22:00; not part of this test
    task = next_task(ex, session, "R-001")
    assert ex.ensure_item("keycard")
    out = ex.run(task)
    assert out.status == "done", out
    cmds = [(e["cmd"], e["args"]) for e in fake.log]
    refusals = [i for i, (c, a) in enumerate(cmds) if c == "say" and "can't open rooms" in a["text"]]
    uses = [i for i, (c, a) in enumerate(cmds) if c == "use" and a.get("item") == "keycard"]
    assert len(refusals) == 1
    assert [cmds[i][1]["on"] for i in uses] == [room]  # only the task's room, never the stranger's
    assert cmds.index(("pick", {"item": "keycard"})) < refusals[0] < uses[0]  # met mid-task, card in hand
    assert not fake.unsafe and fake.reports == {"R-001": "done"}
    hyp = hypotheses(session, "H-bathrobe")
    assert len(hyp) == 1 and hyp[0]["request"] is None


# Lost items


def test_lost_toy_numbered_beyond_the_known_requests_is_left_where_it_lies(tmp_path):
    # Live seed 5: wallet-3 handed to the 2nd wallet request cost 20; the 3rd request came minutes
    # later. An item numbered past the requests known so far belongs to a request not seen yet.
    text = "Guest in 320 lost a child's toy, maybe the ground floor corridor."
    fake, _session, ex, task = solo(tmp_path, text, hidden={"toy-2": "corridor-1a"})
    assert task.item == "toy"
    fake._requests["R-001"].item = "toy-2"
    out = ex.run(task)
    assert out.status == "failed", out
    assert not any(e["args"].get("item") == "toy-2" for e in calls(fake, "place"))


def test_scan_candidates_map_hint_words_then_the_rest_of_floor_one():
    hotel = Hotel.load()
    primary, secondary = scan_candidates(hotel, "behind the counter")
    assert primary == ["front-desk"]
    assert scan_candidates(hotel, "near the bar")[0] == ["lobby-bar"]
    assert scan_candidates(hotel, "the desk")[0] == ["front-desk"]
    primary, secondary = scan_candidates(hotel, "ground floor corridor")
    assert primary == ["corridor-1a", "corridor-1b", "corridor-1c"]
    assert secondary[:3] == ["lobby-bar", "front-desk", "lobby"]
    assert "kitchen-pass" in secondary and "staff-room" in secondary
    assert all(hotel.floor(p) == 1 and hotel.nodes[p]["kind"] != "room" for p in secondary)
    assert not set(primary) & set(secondary)


# --- dashboard decision lines: room_status and work_order --------------------------------------------

ROOM_STATUS_KEYS = {"room", "status", "source", "note"}
WORK_ORDER_KEYS = {"room", "place", "type", "text", "request"}


def test_room_status_klar_after_a_tidy_room_check(tmp_path):
    _, session, _, out = run_one(tmp_path, "R-004", absent_rooms={"room-103"})
    assert out.status == "done"
    status = decisions(session, "room_status")
    assert status and set(status[-1]) == ROOM_STATUS_KEYS
    assert status[-1] == {"room": "room-103", "status": "klar", "source": "room_check",
                          "note": "Nobody is here. The room is tidy."}
    assert not [w for w in decisions(session, "work_order") if w["type"] == "annet"]


def test_room_status_ma_vaskes_and_work_order_when_not_tidy(tmp_path, monkeypatch):
    fake, session, ex = setup(tmp_path, rids={"R-004"}, absent_rooms={"room-103"})
    monkeypatch.setattr(fake, "_describe", lambda loc: "Towels on the floor. The bed is unmade.")
    out = ex.run(next_task(ex, session, "R-004"))
    assert out.status == "done"
    assert decisions(session, "room_status")[-1]["status"] == "ma_vaskes"
    order = decisions(session, "work_order")[-1]
    assert set(order) == WORK_ORDER_KEYS
    assert order["type"] == "annet" and order["room"] == "room-103" and order["request"] == "R-004"


def test_room_status_ikke_forstyrr_on_a_dnd_door(tmp_path):
    _, session, _, out = run_one(tmp_path, "R-006", dnd_rooms={"room-208"})
    assert out.status == "failed"
    assert decisions(session, "room_status") == [
        {"room": "room-208", "status": "ikke_forstyrr", "source": "door_sign", "note": "Do Not Disturb sign"}]


def test_room_status_opptatt_when_a_guest_answers(tmp_path):
    _, session, _, _out = run_one(tmp_path, "R-001")
    status = decisions(session, "room_status")
    assert status[-1]["room"] == "room-319" and status[-1]["status"] == "opptatt"
    assert status[-1]["source"] == "knock" and "Mr Berg" in status[-1]["note"]


def test_work_order_stoy_for_a_noise_complaint(tmp_path):
    _fake, session, ex, task = solo(tmp_path, "Complaint about noise near 201.",
                                   noise_sources={"room-201": "room-203"})
    ex.run(task)
    orders = [w for w in decisions(session, "work_order") if w["type"] == "stoy"]
    assert len(orders) == 1 and set(orders[0]) == WORK_ORDER_KEYS
    assert orders[0]["request"] == "R-001" and orders[0]["place"] == "corridor-2a"
    assert orders[0]["room"] == "room-203" and "201" in orders[0]["text"]


def test_work_order_sol_for_a_spill_and_a_wet_floor_seen(tmp_path):
    _fake, session, ex, task = solo(tmp_path, "Someone mentioned a spill on floor 3.",
                                   spill_spots={3: "corridor-3c"})
    ex.run(task)
    orders = [w for w in decisions(session, "work_order") if w["type"] == "sol"]
    assert any(w["request"] == "R-001" and w["place"] == "corridor-3c" for w in orders)
    assert any(w["request"] is None and w["place"] == "corridor-3c" for w in orders)  # seen on a look
    assert all(set(w) == WORK_ORDER_KEYS for w in orders)
    assert len([w for w in orders if w["request"] is None]) == 1  # once per place


def test_work_order_gjesteklage_for_a_follow_up(tmp_path):
    _, session, ex, task = solo(tmp_path, FOLLOW.format(319, "water bottle"))
    ex.run(task)
    order = decisions(session, "work_order")[-1]
    assert order["type"] == "gjesteklage" and order["room"] == "room-319" and order["request"] == "R-001"


# --- Task 13 fix round 1 ---------------------------------------------------------------------------


def _cart_full(fake, ex, hands):
    assert ex.get_cart()
    fake._hands[:] = ["towel"] * hands
    fake._cart[:] = ["towel"] * 8
    ex.refresh()


def _door_unseen(fake, monkeypatch):
    monkeypatch.setattr(fake, "_look_at", lambda at: (False, f"Too dark to make out {at}."))


def _keycard_refused(fake, monkeypatch):
    real = fake._cmd_use
    monkeypatch.setattr(fake, "_cmd_use", lambda args: (False, "The lock blinks red.")
                        if args.get("item") == "keycard" else real(args))


NOISE_201 = "Complaint about noise near 201."
NOISY_203 = {"noise_sources": {"room-201": "room-203"}}
NOISY_203_HOME = {**NOISY_203, "absent_rooms": set()}  # 203 occupied (the offline fake leaves it empty)
# case -> (text, fake kwargs, prepare(fake, ex, monkeypatch), hypothesis id, outcome)
HYPOTHESIS_RUNS = {
    "bags done": (BAGS_TEXT.format(206), {}, None, "H-bags", "done"),
    "bags hands and cart full": (BAGS_TEXT.format(206), {}, lambda f, e, m: _cart_full(f, e, 2),
                                 "H-bags", "failed"),
    "bags cart full": (BAGS_TEXT.format(206), {}, lambda f, e, m: _cart_full(f, e, 0), "H-bags", "failed"),
    "bags no cart": (BAGS_TEXT.format(206), {}, lambda f, e, m: f._objects["laundry"].pop("cart"),
                     "H-bags", "failed"),
    "bags door unseen": (BAGS_TEXT.format(206), {}, lambda f, e, m: _door_unseen(f, m), "H-bags", "failed"),
    "bags keycard refused": (BAGS_TEXT.format(206), {}, lambda f, e, m: _keycard_refused(f, m),
                             "H-bags", "failed"),
    "bags dnd": (BAGS_TEXT.format(206), {"dnd_rooms": {"room-206"}}, None, "H-bags", "failed"),
    "bags not at the desk": (BAGS_TEXT.format(206), {}, lambda f, e, m: f._objects["front-desk"].pop("bags-206"),
                             "H-bags", "declined"),
    "noise done": (NOISE_201, NOISY_203_HOME, None, "H-noise", "done"),
    "noise door unseen": (NOISE_201, NOISY_203_HOME, lambda f, e, m: _door_unseen(f, m), "H-noise", "failed"),
    "noise dnd": (NOISE_201, {**NOISY_203_HOME, "dnd_rooms": {"room-203"}}, None, "H-noise", "failed"),
    "noise nothing named": (NOISE_201, {"noise_sources": {"room-201": None}}, None, "H-noise", "failed"),
    "spill done": ("Someone mentioned a spill on floor 3.", {"spill_spots": {3: "corridor-3c"}}, None,
                   "H-spill", "done"),
    "spill no signs": ("Someone mentioned a spill on floor 3.", {"spill_spots": {3: "corridor-3c"}},
                       lambda f, e, m: f._objects["storage"].pop("wet-floor-sign"), "H-spill", "declined"),
    "spill not found": ("Someone mentioned a spill on floor 2.", {"spill_spots": {2: None}}, None,
                        "H-spill", "declined"),
    "followup no order": (FOLLOW.format(319, "water bottle"), {}, None, "H-followup", "declined"),
    "named done": ("Mr Aas would like a pillow.", {"guests": {"Mr Aas": "room-318"}}, None, "H-named", "done"),
    "named unknown guest": ("Mr Nobody would like a pillow.", {"guests": {}}, None, "H-named", "failed"),
    "named dnd": ("Ms Kvam would like a pillow.", {"guests": {"Ms Kvam": "room-208"}, "dnd_rooms": {"room-208"}},
                  None, "H-named", "failed"),
}


@pytest.mark.parametrize("case", list(HYPOTHESIS_RUNS))
def test_every_hypothesis_run_logs_exactly_one_line(tmp_path, monkeypatch, case):
    text, kw, prepare, hid, status = HYPOTHESIS_RUNS[case]
    fake, session, ex, task = solo(tmp_path, text, **kw)
    if prepare:
        prepare(fake, ex, monkeypatch)
    out = ex.run(task)
    assert out.status == status, out
    lines = decisions(session, "hypothesis")
    assert [d["id"] for d in lines] == [hid], lines
    line = lines[0]
    assert line["request"] == "R-001" and line["action"]
    assert isinstance(line["score_before"], int) and isinstance(line["score_after"], int)
    if status == "done":  # the delta covers the rewarded action (H-named: the delivery, not the ask)
        assert line["score_after"] > line["score_before"], line
    elif status == "declined":  # a +5 (false follow-up) lands on the report, after the hypothesis line
        assert line["score_after"] == line["score_before"] and fake.score - line["score_after"] in (0, 5), line
    else:
        assert line["score_after"] == line["score_before"] == fake.score, line


def test_bags_fail_up_front_when_the_cart_is_full_even_with_free_hands(tmp_path):
    fake, session, ex, task = solo(tmp_path, BAGS_TEXT.format(206))
    _cart_full(fake, ex, hands=0)  # bags ride only in the cart
    start = len(fake.log)
    out = ex.run(task)
    assert out.status == "failed" and "cart is full" in out.note
    assert not calls(fake, "move", since=start) and not calls(fake, "pick", since=start)
    assert not calls(fake, "drop") and fake._cart == ["towel"] * 8
    assert len(hypotheses(session, "H-bags")) == 1


def test_follow_up_finds_a_named_guest_order_that_has_not_run_yet(tmp_path):
    # Live: R-049 (a call from 202 about water) and R-037 "Ms Kvam would like a water bottle".
    reqs = [("22:01:00", "R-001", "Ms Kvam would like a water bottle."),
            ("22:02:00", "R-002", FOLLOW.format(202, "water"))]
    fake, session, ex = setup(tmp_path, requests=reqs)
    got = collect(ex, session, {"R-001", "R-002"})
    ex.ledger.add(got["R-001"])  # as the shift loop does on arrival
    ex.ledger.add(got["R-002"])
    ex.queue.append(got["R-001"])  # still waiting: its room is not known yet
    out = ex.run(got["R-002"])
    assert out.status == "declined" and "delivered now under R-001" in out.note
    assert [e["args"] for e in calls(fake, "place") if e["ok"]] == [{"item": "water-bottle", "where": "room-202"}]
    assert fake.reports == {"R-001": "done", "R-002": "declined"} and not fake.false_done
    assert [e["args"]["question"] for e in calls(fake, "ask")] == ["Which room is Ms Kvam in?"]
    assert ex.ledger.get("R-001").status == "done" and ex.queue == []


def test_follow_up_redelivers_a_failed_order_once(tmp_path):
    reqs = [TYPES_DEMO_REQUESTS[0], ("22:20:00", "R-002", FOLLOW.format(319, "phone charger")),
            ("23:00:00", "R-003", FOLLOW.format(319, "phone charger"))]
    fake, session, ex = setup(tmp_path, requests=reqs, absent_rooms={"room-319"})
    first = ex.run(next_task(ex, session, "R-001"))
    assert first.status == "failed" and "no answer" in first.note
    fake._absent.discard("room-319")  # the guest is back and calls the desk
    out = ex.run(next_task(ex, session, "R-002"))
    assert out.status == "declined" and "delivered now under R-001" in out.note
    assert [e["args"] for e in calls(fake, "place") if e["ok"]] == [
        {"item": "phone-charger", "where": "room-319"}]
    assert fake._requests["R-001"].completed and not fake.wrong_deliveries
    assert ex.ledger.get("R-001").status == "done"
    again = ex.run(next_task(ex, session, "R-003"))  # a second call about the same order
    assert again.status == "declined" and "already delivered under R-001" in again.note
    assert len([e for e in calls(fake, "place") if e["ok"]]) == 1
    assert fake.reports == {"R-001": "failed", "R-002": "declined", "R-003": "declined"} and not fake.false_done
    assert [d["request"] for d in hypotheses(session, "H-followup")] == ["R-002", "R-003"]


def _repeating_person(session, monkeypatch):
    """A server that puts the same person event on every reply while `text` is set."""
    state = {"text": None}
    real = session.cmd

    def cmd(name, **args):
        reply = real(name, **args)
        if state["text"]:
            reply.events.append({"type": "person", "text": state["text"]})
        return reply

    monkeypatch.setattr(session, "cmd", cmd)
    return state


def test_a_repeated_person_event_is_answered_once_then_again_much_later(tmp_path, monkeypatch):
    fake, session, ex = setup(tmp_path, rids={"R-001"}, people_events=[])
    person = _repeating_person(session, monkeypatch)

    def refusals():
        return [e for e in calls(fake, "say") if "can't open rooms" in e["args"]["text"]]

    person["text"] = BATHROBE
    ex.cmd("look")
    ex.cmd("look")  # the same event on the next reply: no second refusal
    person["text"] = None
    assert len(refusals()) == 1
    person["text"] = 'A woman in a towel says: "I\'m locked out of 305, please let me in."'
    ex.cmd("look")  # someone new is answered at once
    person["text"] = None
    assert len(refusals()) == 2
    fake._now += 61 * 60  # an hour on, the man is back
    person["text"] = BATHROBE
    ex.cmd("look")
    person["text"] = None
    assert len(refusals()) == 3
    assert not calls(fake, "use") and not fake.unsafe
    assert len(hypotheses(session, "H-bathrobe")) == 3
    repeats = [d["repeat"] for d in decisions(session, "person")]
    assert repeats.count(False) == 3 and True in repeats


@pytest.mark.parametrize("seen", ["Nobody is here. The room is not tidy.", "Nobody is here. The room isn't tidy.",
                                  "Nobody is here. The room is untidy.", "Nobody is here. It is messy."])
def test_room_check_that_is_not_tidy_is_ma_vaskes(tmp_path, monkeypatch, seen):
    fake, session, ex = setup(tmp_path, rids={"R-004"}, absent_rooms={"room-103"})
    monkeypatch.setattr(fake, "_describe", lambda loc: seen)
    out = ex.run(next_task(ex, session, "R-004"))
    assert out.status == "done", out
    assert decisions(session, "room_status")[-1] == {"room": "room-103", "status": "ma_vaskes",
                                                     "source": "room_check", "note": seen}
    assert [w["type"] for w in decisions(session, "work_order")] == ["annet"]


@pytest.mark.parametrize("kw, words, not_words", [
    ({"dnd_rooms": {"room-203"}}, "ikke forstyrr", "svarte ikke"),
    ({"absent_rooms": {"room-203"}}, "svarte ikke", "ikke forstyrr"),
])
def test_noise_work_order_tells_a_dnd_sign_from_no_answer(tmp_path, kw, words, not_words):
    _fake, session, ex, task = solo(tmp_path, NOISE_201, **NOISY_203, **kw)
    assert ex.run(task).status == "failed"
    order = [w for w in decisions(session, "work_order") if w["type"] == "stoy"][-1]
    assert words in order["text"].lower() and not_words not in order["text"].lower(), order


# --- Task 18 / C1: no free calls that only feed the log -------------------------------------------------


def test_task_run_makes_no_log_only_status_calls(tmp_path):
    fake, session, ex = setup(tmp_path, rids={"R-001"})
    task = next_task(ex, session, "R-001")
    since = len(fake.log)
    out = ex.run(task)
    assert out.status == "done"
    cmds = [e["cmd"] for e in fake.log[since:]]
    assert cmds[0] != "status", cmds[:3]  # the loop's refresh just ran: no second status
    assert cmds[-1] == "report", cmds[-3:]  # nothing after the report
    assert out.points > 0  # from the flow's own before/after scores


@pytest.mark.parametrize("fake_kw,room,expected", [
    ({"dnd_rooms": {"room-103"}}, "103", "failed"),  # a DND sign: no knock, no keycard
    ({}, "104", "failed"),  # a guest answers: occupied, no keycard
    ({"absent_rooms": {"room-103"}}, "103", "done"),  # nobody there: door look, knock, keycard, look inside
])
def test_brain_room_check_looks_at_the_door_before_any_keycard(tmp_path, fake_kw, room, expected):
    class StubBrain:
        def classify(self, request_id, text, arrived):
            return Task(request_id, Kind.ROOM_CHECK, text, arrived, room=room)

    fake, session, ex = setup(tmp_path, rids={"R-004"}, **fake_kw)
    ex.brain = StubBrain()
    task = replace(next_task(ex, session, "R-004"), kind=Kind.UNKNOWN, room=None)
    since = len(fake.log)
    out = ex.run(task)
    assert out.status == expected and fake.reports == {"R-004": expected}
    cmds = [(e["cmd"], e["args"]) for e in fake.log[since:]]
    keycards = [i for i, (c, a) in enumerate(cmds) if c == "use" and (a or {}).get("item") == "keycard"]
    looks = [i for i, (c, a) in enumerate(cmds) if c == "look" and (a or {}).get("at") == f"room-{room}"]
    assert looks, cmds
    assert (not keycards) if expected == "failed" else (keycards and looks[0] < keycards[0])
    assert not fake.unsafe and not fake.false_done


def test_scan_cap_cannot_cut_off_hinted_and_secondary_places(tmp_path):
    text = "Guest in 320 lost a wallet, maybe the ground floor corridor."
    fake, _session, ex, task = solo(tmp_path, text, hidden={"wallet": "lobby-bar"})
    ex.max_scans = 2  # old behaviour: stop after the three corridors' first two, never reach the bar
    out = ex.run(task)
    assert out.status == "done", out
    assert "lobby-bar" in scan_places(fake)


def test_scan_count_stays_bounded_when_the_item_is_nowhere(tmp_path):
    text = "Guest in 320 lost a wallet, maybe the ground floor corridor."
    fake, _session, ex, task = solo(tmp_path, text, hidden={})
    ex.max_scans = 2
    ex.run(task)
    assert 3 + 3 <= len(scan_places(fake)) <= 12  # alone: the whole ground floor
    fake2, _session2, ex2, task2 = solo(tmp_path / "queued", text, hidden={})
    ex2.max_scans = 2
    ex2.queue.append(parse_request("R-009", "319 wants a pillow.", "22:30:00"))  # others waiting
    ex2.run(task2)
    assert 3 + 3 <= len(scan_places(fake2)) <= 9


def test_lost_toy_hinted_at_the_bar_is_found_when_its_number_is_this_request(tmp_path):
    text = "Guest in 320 lost a child's toy, maybe the lobby bar."
    _fake, _session, ex, task = solo(tmp_path, text, hidden={"toy": "lobby-bar"})
    out = ex.run(task)
    assert out.status == "done", out


# --- Task 28: the Nth lost-item request of an item gets the Nth item (live seeds 1, 2, 5) ---------


def _lost_shift(tmp_path, texts, hidden):
    """A shift with several lost-item requests, all in the ledger as the loop would add them."""
    requests = [(f"22:0{i}:00", f"R-00{i}", t) for i, t in enumerate(texts, 1)]
    fake, session, ex = setup(tmp_path, requests=requests, hidden=hidden)
    tasks = [next_task(ex, session, f"R-00{i}") for i in range(1, len(texts) + 1)]
    for t in tasks:
        ex.ledger.add(t)
    return fake, ex, tasks


def _placed(fake):
    return [e["args"]["item"] for e in calls(fake, "place") if e["ok"]]


def test_second_glasses_request_gets_glasses_2_not_the_first_ones(tmp_path):
    # seed 2: R-015's unsuffixed glasses lay in the corridor too; R-017 delivered it and lost 20
    texts = ["Guest in 317 lost glasses, maybe the ground floor corridor.",
             "Guest in 207 lost glasses, maybe the ground floor corridor."]
    fake, ex, (_t1, t2) = _lost_shift(tmp_path, texts,
                                      {"glasses": "corridor-1a", "glasses-2": "corridor-1b"})
    out = ex.run(t2)
    assert out.status == "done", out
    assert _placed(fake) == ["glasses-2"]
    assert "glasses" not in [e["args"]["item"] for e in calls(fake, "pick")]


def test_first_glasses_request_still_gets_the_unsuffixed_item(tmp_path):
    texts = ["Guest in 317 lost glasses, maybe the ground floor corridor.",
             "Guest in 207 lost glasses, maybe the ground floor corridor."]
    fake, ex, (t1, _t2) = _lost_shift(tmp_path, texts,
                                      {"glasses": "corridor-1a", "glasses-2": "corridor-1a"})
    out = ex.run(t1)
    assert out.status == "done", out
    assert _placed(fake) == ["glasses"]


def test_a_failed_first_request_still_counts_for_the_numbering(tmp_path):
    # seed 5: R-019's wallet was never found; R-069 (the 2nd wallet request) must not take it
    texts = ["Guest in 105 lost a wallet, maybe the kitchen pass.",
             "Mr Aune lost a wallet earlier tonight, probably somewhere around near the kitchen."]
    fake, ex, (_t1, t2) = _lost_shift(tmp_path, texts, {"wallet": "kitchen-pass"})
    ex.guest_rooms["Mr Aune"] = "room-213"
    out = ex.run(t2)
    assert out.status == "failed" or not _placed(fake), out
    assert not calls(fake, "pick") and not fake.wrong_deliveries


def test_the_carried_wrong_item_is_not_delivered(tmp_path):
    texts = ["Guest in 105 lost a wallet, maybe the kitchen pass.",
             "Guest in 213 lost a wallet, maybe the kitchen pass."]
    fake, ex, (_t1, t2) = _lost_shift(tmp_path, texts,
                                      {"wallet": "kitchen-pass", "wallet-2": "kitchen-pass"})
    ex.go("kitchen-pass")
    ex.scan()
    ex.pick_or_cart("wallet")  # picked up by an earlier idle scan
    out = ex.run(t2)
    assert out.status == "done", out
    assert _placed(fake) == ["wallet-2"] and not fake.wrong_deliveries


def test_one_lost_item_is_never_delivered_twice(tmp_path):
    texts = ["Guest in 105 lost a wallet, maybe the kitchen pass."]
    fake, ex, (t1,) = _lost_shift(tmp_path, texts, {"wallet": "kitchen-pass"})
    assert ex.run(t1).status == "done"
    t2 = replace(t1, request="R-009", room="room-213")  # not in the ledger: no known owner
    ex.found["wallet"] = "kitchen-pass"  # a stale memory of the same item
    ex.max_scans = 1
    out = ex.run(t2)
    assert out.status != "done", out
    assert _placed(fake) == ["wallet"]


def test_two_unowned_candidates_away_from_the_hint_deliver_none(tmp_path):
    text = "Guest in 320 lost a wallet, maybe the ground floor corridor."
    fake, _session, ex, task = solo(tmp_path, text,
                                    hidden={"wallet-3": "lobby-bar", "wallet-4": "lobby-bar"})
    out = ex.run(task)
    assert out.status == "failed", out
    assert not _placed(fake) and not fake.wrong_deliveries


def test_a_failed_delivery_does_not_mark_the_item_delivered(tmp_path):
    text = "Guest in 208 lost a wallet, maybe the kitchen pass."
    fake, _session, ex, t1 = solo(tmp_path, text, hidden={"wallet": "kitchen-pass"})
    out = ex.run(t1)  # room 208 has a DND sign: nothing is delivered
    assert out.status != "done" and not _placed(fake), out
    assert "wallet" not in getattr(ex, "lost_delivered", set())
    from agent import flows

    assert flows._verdict(ex, "R-001", "wallet") == "match"  # still free to reach its owner


def test_item_numbered_past_the_known_requests_is_not_taken_when_others_exist(tmp_path):
    # one lost-glasses request seen (R-001); glasses-3 lies there with glasses-2: a request was missed
    text = "Guest in 317 lost glasses, maybe the ground floor corridor."
    fake, ex, (t1,) = _lost_shift(tmp_path, [text], {"glasses-2": "corridor-1a", "glasses-3": "corridor-1a"})
    out = ex.run(t1)
    assert out.status != "done" and not _placed(fake), out


def test_ambiguity_stops_the_search_at_once(tmp_path):
    from agent import flows
    from agent.executor import ActionFailed

    text = "Guest in 320 lost a wallet, maybe the ground floor corridor."
    fake, _session, ex, _task = solo(tmp_path, text,
                                    hidden={"wallet-3": "corridor-1a", "wallet-4": "corridor-1a"})
    ex.found.update({"wallet-3": "corridor-1a", "wallet-4": "corridor-1a"})
    with pytest.raises(ActionFailed, match="did not guess"):  # request unknown to the ledger: both free
        flows._find(ex, "wallet", "ground floor corridor", None)
    assert not calls(fake, "scan") and not calls(fake, "pick")
