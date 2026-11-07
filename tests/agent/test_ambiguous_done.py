"""Task 22: never report "done" on an ambiguous score rise.

A delivery reply does not name the request it was credited to ("Placed water-bottle inside
room-314."). When an earlier request for the same room and item is not done (still open, declined as
a duplicate, or reported failed), the rise after delivering may be that one's: no report at all.
"""

import httpx

from agent.agent import load_params, run_shift
from agent.bench import offline_scenario
from agent.client import WybeClient
from agent.flows import same_item
from agent.tasks import Kind, Ledger, Task
from tests.agent.test_executor import calls, collect, decisions, settings, setup
from tests.fakes.fake_wybe import FakeWybe

WATER = "314 wants a water bottle."


def _task(rid, kind=Kind.AMENITY, room="room-314", item="water-bottle", **kw):
    return Task(request=rid, kind=kind, text=f"{rid}: {kind.value}", arrived="22:00:00", room=room,
                item=item, **kw)


def _ledger(*tasks, status=None):
    ledger = Ledger()
    for t in tasks:
        ledger.add(t)
    for rid, st in (status or {}).items():
        ledger.set_status(rid, st)
    return ledger


# --- the ledger query -----------------------------------------------------------------------------


def test_open_twin_is_an_earlier_not_done_order_for_the_same_room_and_item():
    first, now = _task("R-001"), _task("R-002")
    for st in ("pending", "failed", "skipped"):
        twin = _ledger(first, now, status={"R-001": st}).open_twin(now, "room-314", same=same_item)
        assert twin is not None and twin.request == "R-001", st
    assert _ledger(first, now, status={"R-001": "done"}).open_twin(now, "room-314", same=same_item) is None


def test_open_twin_ignores_later_requests_other_rooms_other_items_and_follow_ups():
    now = _task("R-005")
    later = _task("R-006")
    ledger = _ledger(
        _task("R-001", room="room-315"),
        _task("R-002", item="pillow"),
        _task("R-003", kind=Kind.FOLLOWUP),  # a "never came" claim is not completed by a delivery
        _task("R-004", kind=Kind.MESSAGE, item=None, message="the taxi is here"),
        now, later, status={"R-001": "failed", "R-002": "failed", "R-003": "failed", "R-004": "failed"},
    )
    assert ledger.open_twin(now, "room-314", same=same_item) is None


def test_open_twin_matches_items_on_whole_words_and_named_guests_by_room():
    toy2 = _task("R-002", kind=Kind.LOST_ITEM, item="toy-2")
    lost = _ledger(_task("R-001", kind=Kind.LOST_ITEM, item="toy"), toy2)
    assert lost.open_twin(toy2, "room-314", same=same_item).request == "R-001"
    sun = _task("R-002", kind=Kind.LOST_ITEM, item="sunglasses")
    assert _ledger(_task("R-001", kind=Kind.LOST_ITEM, item="glasses"), sun).open_twin(
        sun, "room-314", same=same_item) is None
    now = _task("R-002")
    ledger = _ledger(_task("R-001", room=None, guest="Ms Nygaard"), now)
    assert ledger.open_twin(now, "room-314", same=same_item) is None  # the guest's room is not known
    assert ledger.open_twin(now, "room-314", same=same_item,
                            guest_rooms={"Ms Nygaard": "room-314"}).request == "R-001"
    assert ledger.open_twin(now, None, same=same_item) is None  # no room: nothing to compare


def test_open_twin_counts_a_named_tray_by_its_room():
    named_tray = _task("R-001", kind=Kind.TRAY, room="room-314", item=None, guest="Dr Engen")
    now = _task("R-002", kind=Kind.TRAY, item="tray-314")
    assert _ledger(named_tray, now).open_twin(now, "room-314", same=same_item).request == "R-001"


# --- the report-done site -----------------------------------------------------------------------


def _seed2_mechanism(tmp_path, extra=()):
    """Seed 2: R-001 done, R-002 (same text 3 minutes later) declined as a duplicate, R-003 the
    same order an hour later. The fake credits R-003's delivery to the older open R-002."""
    reqs = [("22:01:00", "R-001", WATER), ("22:04:00", "R-002", WATER), ("23:10:00", "R-003", WATER),
            *extra]
    fake, session, ex = setup(tmp_path, requests=reqs)
    ex._surveyed = True  # the opening's get_cart surveyed at 22:00; not part of this test
    got = collect(ex, session, {r[1] for r in reqs})
    for rid in sorted(got):
        ex.ledger.add(got[rid])
    assert ex.run(got["R-001"]).status == "done"
    assert ex.run(got["R-002"]).note.startswith("Duplicate of R-001")
    return fake, session, ex, got


def test_score_rise_shared_with_a_declined_duplicate_is_not_reported_done(tmp_path):
    fake, session, ex, got = _seed2_mechanism(tmp_path)
    before = fake.score
    out = ex.run(got["R-003"])
    assert fake.score > before  # the delivery scored ... for R-002, as the fake credits the oldest
    assert "R-003" not in fake.reports  # no report at all: neither done nor failed
    assert not fake.false_done
    assert out.status == "skipped" and "R-002" in out.note
    assert ex.ledger.get("R-003").status == "skipped"
    assert decisions(session, "report_skipped_ambiguous") == [
        {"request": "R-003", "other": "R-002", "room": "room-314", "item": "water-bottle"}]
    assert [e["args"]["where"] for e in calls(fake, "place") if e["ok"]][-1] == "room-314"


def test_a_named_guest_order_chained_on_a_skipped_one_is_not_reported_either(tmp_path):
    # Seed 2's R-063: Ms Nygaard (room-314, known only after asking the clerk) orders water after
    # R-014 was left unreported; the fake credits her delivery to R-014.
    fake, session, ex, got = _seed2_mechanism(
        tmp_path, extra=[("23:30:00", "R-004", "Ms Nygaard would like a water bottle.")])
    assert ex.run(got["R-003"]).status == "skipped"
    out = ex.run(got["R-004"])
    assert out.status == "skipped"
    assert set(fake.reports) == {"R-001", "R-002"} and not fake.false_done
    assert decisions(session, "report_skipped_ambiguous")[-1] == {
        "request": "R-004", "other": "R-002", "room": "room-314", "item": "water-bottle"}


def test_an_earlier_order_still_waiting_makes_the_rise_ambiguous(tmp_path):
    reqs = [("22:01:00", "R-001", WATER), ("22:20:00", "R-002", WATER)]
    fake, session, ex = setup(tmp_path, requests=reqs)
    ex._surveyed = True
    got = collect(ex, session, {"R-001", "R-002"})
    ex.ledger.add(got["R-001"])
    ex.ledger.add(got["R-002"])
    out = ex.run(got["R-002"])  # R-001 still waits in the queue; the fake credits it
    assert out.status == "skipped" and "R-002" not in fake.reports and not fake.false_done
    assert ex.run(got["R-001"]).status == "done"  # its own run: nothing earlier, reported as before
    assert fake.reports == {"R-001": "done"} and not fake.false_done


def test_no_ambiguity_reports_done_as_before(tmp_path):
    # Earlier orders for another item in the same room, the same item to another room, and a done
    # one for the same room and item leave the rise unambiguous.
    reqs = [("22:01:00", "R-001", WATER), ("22:02:00", "R-002", "314 wants a pillow."),
            ("22:03:00", "R-003", "319 wants a water bottle."), ("22:30:00", "R-004", WATER)]
    fake, session, ex = setup(tmp_path, requests=reqs)
    ex._surveyed = True
    got = collect(ex, session, {r[1] for r in reqs})
    for rid in sorted(got):
        ex.ledger.add(got[rid])
    assert ex.run(got["R-001"]).status == "done"
    ex.ledger.set_status("R-002", "failed")
    ex.ledger.set_status("R-003", "failed")
    out = ex.run(got["R-004"])
    assert out.status == "done", out
    assert fake.reports["R-004"] == "done" and not fake.false_done
    assert not decisions(session, "report_skipped_ambiguous")


def test_a_later_declined_duplicate_does_not_block_the_original(tmp_path):
    reqs = [("22:01:00", "R-001", WATER), ("22:03:00", "R-002", WATER)]
    fake, session, ex = setup(tmp_path, requests=reqs)
    ex._surveyed = True
    got = collect(ex, session, {"R-001", "R-002"})
    ex.ledger.add(got["R-001"])
    ex.ledger.add(got["R-002"])
    assert ex.run(got["R-002"]).note.startswith("Duplicate of R-001")
    assert ex.run(got["R-001"]).status == "done"
    assert fake.reports == {"R-001": "done", "R-002": "declined"} and not fake.false_done


def test_a_named_guests_lost_item_counts_by_the_room_the_clerk_gave(tmp_path):
    # The lost-item flow asks the clerk but does not write the room into the ledger.
    _fake, session, ex = setup(tmp_path, requests=[])
    ex.ledger.add(_task("R-001", kind=Kind.LOST_ITEM, item="glasses"))
    now = _task("R-002", kind=Kind.LOST_ITEM, room=None, item="reading-glasses", guest="Mr Berg")
    ex.ledger.add(now)
    assert ex._open_twin(now) is None  # the room is not known yet
    ex.guest_rooms["Mr Berg"] = "room-314"
    assert ex._open_twin(now).request == "R-001"
    assert decisions(session, "report_skipped_ambiguous") == [
        {"request": "R-002", "other": "R-001", "room": "room-314", "item": "reading-glasses"}]


def test_failures_are_still_reported_failed(tmp_path):
    # Only "done" waits on the ambiguity check; a failed delivery is reported failed as before.
    fake, session, ex, got = _seed2_mechanism(tmp_path)
    out = ex._finish(got["R-003"], "failed", "out of stock", ex.state.score)
    assert out.status == "failed" and fake.reports["R-003"] == "failed"
    assert not decisions(session, "report_skipped_ambiguous")


# --- the night that showed it ---------------------------------------------------------------------


def test_offline_seed_2_night_has_no_false_done(tmp_path):
    fake = FakeWybe(**offline_scenario(2))
    client = WybeClient(settings(tmp_path), transport=httpx.MockTransport(fake.handler), sleep=lambda s: None)
    run_shift(client, mode="practice", seed=2, params=load_params(), sim_end="06:00:00")
    assert fake.false_done == [] and not fake.unsafe
