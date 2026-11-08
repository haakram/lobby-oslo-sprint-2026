"""Checked-out rooms (live seed 16): after the manager's "Skip R-NNN, 309 checked out" every other task for
that room is worth 0 and a knock there is penalised (-10). The room's queued tasks are dropped and
reported declined; a later request for it is declined before any knock, place, say or keycard."""

from agent.agent import _skip, run_shift
from agent.tasks import parse_request
from tests.agent.test_agent import _decisions, client_for
from tests.agent.test_executor import calls, decisions, next_task, setup, solo
from tests.fakes.fake_wybe import FakeWybe

AT_THE_ROOM = ("knock", "place", "say", "use")


def _touched(fake, room: str) -> list[dict]:
    """Every knock, place, say, keycard use or door look aimed at `room`."""
    def aimed(e: dict) -> bool:
        args = e.get("args") or {}
        if e["cmd"] == "look":
            return args.get("at") == room
        return e["cmd"] in AT_THE_ROOM and room in (args.get("door"), args.get("where"), args.get("on"))

    return [e for e in fake.log if aimed(e)]


def test_skip_drops_the_rooms_other_queued_task_and_declines_it(tmp_path):
    # The skip arrives with R-001 (live skips come 8-29 min later): var-2's opening loadout already
    # carries a towel, so a skip 1 s later would be read after the delivery (as in 8564396).
    fake = FakeWybe(requests=[
        ("22:03:30", "R-001", "104 wants a towel."),
        ("22:03:30", "R-002", "104 wants a pillow."),
        ("22:03:30", "skip", "Skip R-001, 104 checked out. Don't bother with it."),
        ("22:03:32", "R-003", "106 wants a pillow."),
    ])
    result = run_shift(client_for(tmp_path, fake.handler), seed=1, sim_end="22:40:00")
    assert fake.reports["R-001"] == "cancelled"
    assert fake.reports["R-002"] == "declined"
    note = next(e["args"]["note"] for e in fake.log if e["cmd"] == "report"
                and e["args"].get("request") == "R-002")
    assert note == "Guest checked out (manager's skip of R-001)"
    assert fake.reports["R-003"] == "done"
    assert _touched(fake, "room-104") == []
    assert _decisions(tmp_path, result, "room_checked_out") == [
        {"room": "room-104", "request": "R-001", "dropped": ["R-002"]}]
    starts = [d["request"] for d in _decisions(tmp_path, result, "task_start")]
    assert "R-002" not in starts  # dropped from the queue, never run


def test_later_request_for_a_checked_out_room_is_declined_without_a_knock(tmp_path):
    fake = FakeWybe(requests=[  # the skip with R-001: var-2's loaded towel would beat a later one
        ("22:03:30", "R-001", "104 wants a towel."),
        ("22:03:30", "skip", "Skip R-001, 104 checked out. Don't bother with it."),
        ("22:10:00", "R-002", "104 wants a pillow."),
        ("22:10:00", "R-003", "Check if 104 is empty and tidy, report back."),
    ])
    result = run_shift(client_for(tmp_path, fake.handler), seed=1, sim_end="22:40:00")
    assert fake.reports["R-002"] == "declined" and fake.reports["R-003"] == "declined"
    assert _touched(fake, "room-104") == []
    failed = {d["request"]: d for d in _decisions(tmp_path, result, "task_failed")}
    assert failed["R-002"]["status"] == "declined"
    assert failed["R-002"]["note"] == "room-104 checked out tonight"
    assert not fake.false_done and not fake.unsafe


def test_skip_reads_the_room_form_and_keeps_other_rooms(tmp_path):
    fake, session, ex = setup(tmp_path, requests=[("22:01:00", "R-009", "311 wants a towel.")])
    pending = [parse_request(rid, text, "22:00:00") for rid, text in (
        ("R-010", "309 wants a towel."), ("R-011", "309 wants a pillow."),
        ("R-012", "Check if 309 is empty and tidy, report back."), ("R-013", "311 wants a pillow."))]
    for task in pending:
        ex.ledger.add(task)
    seen = {t.request for t in pending}
    _skip(ex, "R-010", "Skip R-010, room-309 checked out. Don't bother with it.", seen, pending)
    assert ex.checked_out == {"room-309"}
    assert [t.request for t in pending] == ["R-013"]
    assert [ex.ledger.get(r).status for r in ("R-011", "R-012", "R-013")] == ["declined", "declined", "pending"]
    assert ex.ledger.get("R-010").status == "skipped"
    assert decisions(session, "room_checked_out") == [
        {"room": "room-309", "request": "R-010", "dropped": ["R-011", "R-012"]}]
    reports = [e["args"] for e in calls(fake, "report")]
    assert [(r["request"], r["outcome"]) for r in reports] == [
        ("R-010", "cancelled"), ("R-011", "declined"), ("R-012", "declined")]


def test_a_skip_without_a_room_drops_only_its_request(tmp_path):
    _fake, session, ex = setup(tmp_path, requests=[("22:01:00", "R-009", "311 wants a towel.")])
    pending = [parse_request("R-011", "309 wants a pillow.", "22:00:00")]
    _skip(ex, "R-010", "Skip R-010. Don't bother with it.", {"R-011"}, pending)
    assert ex.checked_out == set() and [t.request for t in pending] == ["R-011"]
    assert decisions(session, "room_checked_out") == []


def test_named_guest_in_a_checked_out_room_is_declined_before_the_trip(tmp_path):
    fake, session, ex = setup(tmp_path, requests=[("22:01:00", "R-001", "Ms Kvam would like a pillow.")],
                              guests={"Ms Kvam": "room-208"})
    ex.checked_out.add("room-208")
    task = next_task(ex, session, "R-001")
    start = len(fake.log)
    out = ex.run(task)
    assert out.status == "declined" and out.note == "room-208 checked out tonight"
    assert not {"pick", "knock", "place", "use"} & {e["cmd"] for e in fake.log[start:]}
    assert _touched(fake, "room-208") == [] and fake.reports == {"R-001": "declined"}


def test_noise_never_knocks_on_a_checked_out_room(tmp_path):
    fake, _session, ex, task = solo(tmp_path, "Complaint about noise near 201.",
                                   noise_sources={"room-201": "room-202"})
    ex.checked_out.add("room-202")
    out = ex.run(task)
    assert out.status == "declined" and out.note == "room-202 checked out tonight"
    assert not calls(fake, "knock") and not calls(fake, "say")
    assert _touched(fake, "room-202") == [] and fake.reports == {"R-001": "declined"}


def test_a_complaint_from_a_checked_out_room_is_declined_without_a_trip(tmp_path):
    fake, _session, ex, task = solo(tmp_path, "Complaint about noise near 201.",
                                   noise_sources={"room-201": "room-202"})
    ex.checked_out.add("room-201")
    start = len(fake.log)
    out = ex.run(task)
    assert out.status == "declined" and out.note == "room-201 checked out tonight"
    assert not {"move", "navigate", "knock", "say"} & {e["cmd"] for e in fake.log[start:]}
