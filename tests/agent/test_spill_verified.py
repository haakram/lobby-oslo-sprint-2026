"""Task 6: a spill is reported done only when it can be verified, and a sign is moved when out of stock.

Live: six spill reports with the sign not on the NEW wet patch answered "Noted." and cost -30 each;
the verified ones (+43, +63) had the sign standing on the newly wet spot. Another team (61 shifts): a
patch first seen wet after the message is the right one 95-98 % of the time, one already wet before
it only 12 of 30 times; moving a sign off an older, already-credited spill cost nothing after 25
game-minutes (spills never dry). Storage holds 3 signs; rich nights have 5-7 spills.
"""

from agent.agent import _read_inbox
from tests.agent.test_executor import calls, decisions, map_file, next_task, setup, solo

SPILL = "Someone mentioned a spill on floor {}."
OLD_PATCH = {frozenset({"elevator-3", "corridor-3a"})}  # wet all night; known before the spill


def sign_moves(fake) -> list[tuple[str, str]]:
    """(cmd, where) of every successful pick or place of a wet-floor sign, following the robot."""
    loc, out = "charging-dock", []
    for e in fake.log:
        if e["cmd"] in ("move", "navigate") and e["ok"]:
            loc = e["result"]["at"]
        elif e["cmd"] in ("pick", "place") and e["args"].get("item") == "wet-floor-sign" and e["ok"]:
            out.append((e["cmd"], e["args"].get("where") or loc))
    return out


def read_tasks(ex, n):
    """Dock until n requests are in, read by the shift loop's own inbox read (which notes, per spill,
    the wet spots known at the read)."""
    seen, pending = set(), []
    for _ in range(12):
        _read_inbox(ex, None, seen, pending)
        if len(pending) >= n:
            return pending
        ex.wait_for_request()
    raise AssertionError(f"only {[t.request for t in pending]} arrived")


def signs_in_storage(n):
    def mutate(data):
        data["stock"]["storage"]["wet-floor-sign"] = n
    return mutate


# --- rule 1: done only with the sign on a new patch -----------------------------------------------


def test_new_patch_is_signed_reported_done_and_remembered(tmp_path):
    fake, _session, ex, task = solo(tmp_path, SPILL.format(3), spill_spots={3: "corridor-3c"}, wet_spots=[])
    out = ex.run(task)
    assert out.status == "done", out
    assert sign_moves(fake)[-1] == ("place", "corridor-3c")
    assert fake.reports == {"R-001": "done"} and not fake.false_done
    assert ex.signs_placed == {"corridor-3c": "R-001"} and "R-001" in ex.verified


def test_only_an_old_patch_is_declined_and_the_sign_kept(tmp_path):
    # 3a is wet all night and the robot crossed it for R-001; the spill of R-002 made no new patch.
    requests = [("22:03:30", "R-001", "319 wants a phone charger."),
                ("22:30:00", "R-002", SPILL.format(3))]
    fake, session, ex = setup(tmp_path, requests=requests, wet=OLD_PATCH, spill_spots={3: None}, wet_spots=[])
    assert ex.run(next_task(ex, session, "R-001")).status == "done"
    assert ex.hotel.is_wet("elevator-3", "corridor-3a")
    before = fake.score
    out = ex.run(next_task(ex, session, "R-002"))
    assert out.status == "declined", out
    assert "corridor-3a" in out.note and "before" in out.note
    assert not [m for m in sign_moves(fake) if m[0] == "place"]  # no sign on the old patch
    assert fake.reports["R-002"] == "declined" and not fake.false_done and fake.score == before


def test_no_wet_patch_at_all_is_declined(tmp_path):
    fake, _session, ex, task = solo(tmp_path, SPILL.format(2), spill_spots={2: None}, wet_spots=[])
    out = ex.run(task)
    assert out.status == "declined" and "corridor-2" in out.note, out
    assert not [m for m in sign_moves(fake) if m[0] == "place"]
    assert fake.reports == {"R-001": "declined"} and not fake.false_done


def test_a_failed_sign_placement_is_declined(tmp_path, monkeypatch):
    fake, _session, ex, task = solo(tmp_path, SPILL.format(3), spill_spots={3: "corridor-3c"}, wet_spots=[])
    real = fake._cmd_place
    monkeypatch.setattr(fake, "_cmd_place", lambda args: (False, "The sign will not stand here.")
                        if args.get("item") == "wet-floor-sign" else real(args))
    out = ex.run(task)
    assert out.status == "declined" and "could not place" in out.note.lower(), out
    assert fake.reports == {"R-001": "declined"} and not fake.false_done
    assert ex.signs_placed == {}


def test_a_patch_first_seen_wet_after_the_request_was_read_counts_as_new(tmp_path):
    # Known wet before this request = the robot's wet set when the request was READ: a patch the robot
    # learnt between the read and the task's start (on another task) is still this spill's.
    fake, _session, ex = setup(tmp_path, requests=[("22:01:00", "R-001", SPILL.format(3))],
                               spill_spots={3: "corridor-3c"}, wet_spots=[])
    (task,) = read_tasks(ex, 1)
    assert ex.wet_at_read == {"R-001": frozenset()}
    ex.hotel.mark_wet("corridor-3b", "corridor-3c")  # learnt after the read
    out = ex.run(task)
    assert out.status == "done", out
    assert sign_moves(fake)[-1] == ("place", "corridor-3c") and not fake.false_done


# --- rule 2: out of signs, the oldest credited sign is moved -------------------------------------


def test_out_of_signs_the_oldest_credited_sign_is_moved_to_the_new_patch(tmp_path):
    # R-003 comes later: its patch (1b, by storage) appears at 22:40, after the stock survey walked past.
    requests = [("22:01:00", "R-001", SPILL.format(3)), ("22:01:00", "R-002", SPILL.format(2)),
                ("22:40:00", "R-003", SPILL.format(1))]
    fake, session, ex = setup(tmp_path, requests=requests, wet_spots=[],
                              spill_spots={3: "corridor-3c", 2: "corridor-2b", 1: "corridor-1b"},
                              hotel_path=map_file(tmp_path, signs_in_storage(2)))
    first, second = read_tasks(ex, 2)
    assert ex.run(first).status == "done" and ex.run(second).status == "done"
    assert ex.signs_placed == {"corridor-3c": "R-001", "corridor-2b": "R-002"}
    (third,) = read_tasks(ex, 1)
    out = ex.run(third)
    assert out.status == "done", out
    moves = sign_moves(fake)
    assert moves[-2:] == [("pick", "corridor-3c"), ("place", "corridor-1b")]  # R-001's, the oldest
    assert fake.reports["R-003"] == "done" and not fake.false_done and "R-003" in ex.verified
    assert ex.signs_placed == {"corridor-2b": "R-002", "corridor-1b": "R-003"}
    assert ex.experiments["sign_move"] is True
    moved = decisions(session, "sign_moved")
    assert moved == [{"request": "R-003", "place": "corridor-3c", "old_request": "R-001"}]


def test_sign_move_switches_off_after_its_first_unverified_report(tmp_path):
    # R-002's new patch (2a) is not the fake's spill: the moved sign's done answers "Noted." and the
    # sign_move experiment is off for the night; R-003 (out of signs) is then declined, nothing moved.
    requests = [("22:01:00", "R-001", SPILL.format(3)), ("22:01:00", "R-002", SPILL.format(2)),
                ("22:01:00", "R-003", SPILL.format(1))]
    fake, _session, ex = setup(tmp_path, requests=requests, wet_spots=[],
                              wet={frozenset({"elevator-2", "corridor-2a"})},
                              spill_spots={3: "corridor-3c", 2: None, 1: "corridor-1b"},
                              hotel_path=map_file(tmp_path, signs_in_storage(1)))
    first, second, third = read_tasks(ex, 3)
    assert ex.run(first).status == "done"
    out = ex.run(second)
    assert out.status == "done" and fake.reports["R-002"] == "done"
    (picked, at), (placed, spot) = sign_moves(fake)[-2:]
    assert (picked, at, placed) == ("pick", "corridor-3c", "place") and spot in ("elevator-2", "corridor-2a")
    assert ex.experiments["sign_move"] is False and "R-002" not in ex.verified
    picks = len(calls(fake, "pick"))
    out = ex.run(third)
    assert out.status == "declined" and "sign" in out.note.lower(), out
    assert len(calls(fake, "pick")) == picks  # nothing picked up, no old sign touched
    assert ex.signs_placed == {spot: "R-002"}


def test_out_of_signs_and_the_old_sign_refused_is_declined_and_never_tried_again(tmp_path, monkeypatch):
    requests = [("22:01:00", "R-001", SPILL.format(3)), ("22:01:00", "R-002", SPILL.format(2))]
    fake, session, ex = setup(tmp_path, requests=requests, wet_spots=[],
                              spill_spots={3: "corridor-3c", 2: "corridor-2b"},
                              hotel_path=map_file(tmp_path, signs_in_storage(1)))
    first, second = read_tasks(ex, 2)
    assert ex.run(first).status == "done"
    real = fake._cmd_pick
    monkeypatch.setattr(fake, "_cmd_pick", lambda args: (False, "The sign is stuck to the floor.")
                        if fake._location == "corridor-3c" else real(args))
    out = ex.run(second)
    assert out.status == "declined" and "corridor-2b" in out.note, out
    assert fake.reports["R-002"] == "declined" and not fake.false_done
    assert ex.signs_placed == {} and fake._objects["corridor-3c"] == {"wet-floor-sign": 1}
    assert [d["place"] for d in decisions(session, "sign_move_failed")] == ["corridor-3c"]


def test_gather_never_takes_a_sign_standing_on_a_wet_patch(tmp_path):
    fake, _session, ex = setup(tmp_path, requests=[], wet_spots=[])
    fake._add_object("corridor-1a", "wet-floor-sign")  # ours, over an earlier spill; nearer than storage
    ex.hotel.mark_wet("lobby", "corridor-1a")
    ex.hotel.stock["corridor-1a"] = {"wet-floor-sign": 1}
    ex.signs_placed = {"corridor-1a": "R-001"}
    ex.gather("wet-floor-sign")
    assert sign_moves(fake) == [("pick", "storage")]
    assert fake._objects["corridor-1a"] == {"wet-floor-sign": 1}
