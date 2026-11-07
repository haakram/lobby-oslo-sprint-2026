"""A room seen Do-Not-Disturb is not visited again within DND_MEMORY_S (batching design § 3.3)."""

from agent.flows import DND_MEMORY_S
from agent.tasks import Ledger
from tests.agent.test_executor import next_task, setup

FIRST = ("23:00:00", "R-100", "208 wants a water bottle.")
SECOND = ("23:10:00", "R-101", "208 wants a pillow.")  # different text: not a duplicate
OTHER_ROOM = ("23:12:00", "R-102", "319 wants a phone charger.")
NAMED = ("23:14:00", "R-103", "Ms Kvam would like a pillow.")
CHECK = ("23:16:00", "R-104", "Check if 208 is empty and tidy, report back.")
BUSY = ("move", "navigate", "pick", "knock", "look", "place", "use")


def _after_first(tmp_path, *more, **kw):
    fake, session, ex = setup(tmp_path, requests=[FIRST, *more], dnd_rooms={"room-208"}, **kw)
    assert ex.run(next_task(ex, session, "R-100")).status == "failed"
    return fake, session, ex


def _run_and_spent(fake, session, ex, rid):
    task = next_task(ex, session, rid)  # waiting for it to arrive is not part of the run
    start = len(fake.log)
    out = ex.run(task)
    return out, [e["cmd"] for e in fake.log[start:] if e["cmd"] in BUSY]


def test_dnd_seen_once_next_request_fails_fast(tmp_path):
    fake, session, ex = _after_first(tmp_path, SECOND)
    assert "room-208" in ex.ledger.dnd
    out, spent = _run_and_spent(fake, session, ex, "R-101")
    assert out.status == "failed" and "Do Not Disturb sign on room-208 (seen" in out.note
    assert spent == [] and fake.reports["R-101"] == "failed" and not fake.unsafe


def test_other_room_unaffected(tmp_path):
    fake, session, ex = _after_first(tmp_path, OTHER_ROOM)
    out, spent = _run_and_spent(fake, session, ex, "R-102")
    assert out.status == "done" and spent


def test_memory_window_and_midnight():
    ledger = Ledger()
    ledger.note_dnd("room-208", "23:50:00")
    assert ledger.dnd_seen("room-208", "00:10:00", DND_MEMORY_S) == "23:50:00"  # across midnight
    assert ledger.dnd_seen("room-208", "08:30:00", DND_MEMORY_S) is None  # more than 8 h later
    assert ledger.dnd_seen("room-209", "00:10:00", DND_MEMORY_S) is None


def test_named_guest_resolving_to_dnd_room_fails_fast(tmp_path):
    fake, session, ex = _after_first(tmp_path, NAMED, guests={"Ms Kvam": "room-208"})
    out, spent = _run_and_spent(fake, session, ex, "R-103")
    assert out.status == "failed" and "Do Not Disturb" in out.note
    assert not {"pick", "knock", "place", "look"} & set(spent)  # only the clerk question is asked


def test_room_check_on_known_dnd_room_fails_fast(tmp_path):
    fake, session, ex = _after_first(tmp_path, CHECK)
    out, spent = _run_and_spent(fake, session, ex, "R-104")
    assert out.status == "failed" and "Do Not Disturb" in out.note
    assert spent == []
