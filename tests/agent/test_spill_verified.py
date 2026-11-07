"""Task 6: a spill is reported done only when it can be verified, and a sign is moved when out of stock.

Live: six spill reports with the sign not on the NEW wet patch answered "Noted." and cost -30 each;
the verified ones (+43, +63) had the sign standing on the newly wet spot. Another team (61 shifts): a
patch first seen wet after the message is the right one 95-98 % of the time, one already wet before
it only 12 of 30 times; moving a sign off an older, already-credited spill cost nothing after 25
game-minutes (spills never dry). Storage holds 3 signs; rich nights have 5-7 spills.
"""

import pytest

from agent.agent import _read_inbox, run_shift
from agent.executor import ActionFailed, OutOfStock
from agent.planner import Params, choose_next, estimate_seconds
from agent.tasks import Kind, Task
from agent.world import Hotel, RobotState
from tests.agent.test_agent import client_for
from tests.agent.test_executor import calls, decisions, map_file, next_task, setup, solo
from tests.fakes.fake_wybe import FakeWybe

SPILL = "Someone mentioned a spill on floor {}."


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


def test_only_an_old_patch_gets_the_sign_when_the_floor_shows_no_new_one(tmp_path):
    # 3a is wet from the start and the robot crossed it for R-001; R-002's spill lands on the same,
    # already wet place. Live seeds 2, 4 and 8: such a sign was credited ("Noted. Thanks." +56..+65)
    # with the place wet 81-319 min before the message; declining it lost those points.
    requests = [("22:03:30", "R-001", "319 wants a phone charger."),
                ("22:30:00", "R-002", SPILL.format(3))]
    fake, session, ex = setup(tmp_path, requests=requests, spill_spots={3: "corridor-3a"},
                              wet_spots=[("22:00:00", "corridor-3a")])
    assert ex.run(next_task(ex, session, "R-001")).status == "done"
    assert "corridor-3a" in ex.hotel.wet_spots()
    task = next_task(ex, session, "R-002")
    assert ex.wet_first_seen["corridor-3a"] < ex_seconds(task.arrived)  # old by the message's clock
    out = ex.run(task)
    assert out.status == "done", out
    assert sign_moves(fake)[-1] == ("place", "corridor-3a")
    assert fake.reports["R-002"] == "done" and not fake.false_done and "R-002" in ex.verified


def test_of_several_old_patches_the_newest_gets_the_sign(tmp_path):
    # Live seeds 1 (R-065) and 5 (R-052): with two old patches on the floor the one first seen wet last
    # was this spill's; the older one answered "Noted." (-30).
    requests = [("22:03:30", "R-001", "319 wants a phone charger."),
                ("23:30:00", "R-002", "319 wants a towel."),
                ("23:50:00", "R-003", SPILL.format(3))]
    fake, session, ex = setup(tmp_path, requests=requests, spill_spots={3: "corridor-3c"},
                              wet_spots=[("22:00:00", "corridor-3a"), ("23:00:00", "corridor-3c")])
    assert ex.run(next_task(ex, session, "R-001")).status == "done"
    assert ex.run(next_task(ex, session, "R-002")).status == "done"
    assert ex.wet_first_seen["corridor-3a"] < ex.wet_first_seen["corridor-3c"]
    out = ex.run(next_task(ex, session, "R-003"))
    assert out.status == "done", out
    assert sign_moves(fake)[-1] == ("place", "corridor-3c")
    assert fake.reports["R-003"] == "done" and not fake.false_done


def test_out_of_signs_an_old_patch_is_declined_and_no_credited_sign_moved(tmp_path):
    # Moving a credited sign is for a new patch only: for an old one (a guess) the fetch is not made.
    requests = [("22:01:00", "R-001", SPILL.format(2)), ("22:03:30", "R-002", "319 wants a phone charger."),
                ("22:30:00", "R-003", SPILL.format(3))]
    fake, session, ex = setup(tmp_path, requests=requests, spill_spots={2: "corridor-2b", 3: "corridor-3a"},
                              wet_spots=[("22:00:00", "corridor-3a")],
                              hotel_path=map_file(tmp_path, signs_in_storage(1)))
    assert ex.run(next_task(ex, session, "R-001")).status == "done"
    assert ex.run(next_task(ex, session, "R-002")).status == "done"
    assert ex.movable_signs() == ["corridor-2b"]
    picks = len(calls(fake, "pick"))
    out = ex.run(next_task(ex, session, "R-003"))
    assert out.status == "declined" and "corridor-3a" in out.note and "stock" in out.note, out
    assert len(calls(fake, "pick")) == picks and ex.signs_placed == {"corridor-2b": "R-001"}


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


def test_a_patch_first_seen_wet_after_the_message_but_before_the_read_counts_as_new(tmp_path):
    # Old = first seen wet before the request's message arrived (its `at` clock). Reads lag the
    # message (up to ~17 sim-min live): a patch the robot sees in that gap is this spill's (another
    # team: 95-98 % right), so it gets the sign.
    fake, _session, ex = setup(tmp_path, requests=[("22:00:05", "R-001", SPILL.format(1))],
                               spill_spots={1: "corridor-1b"}, wet_spots=[])
    ex.go("storage")  # past corridor-1a, whose look shows 1b wet: after the message, before any read
    assert "corridor-1b" in ex.hotel.wet_spots() and fake._unread
    (task,) = read_tasks(ex, 1)
    out = ex.run(task)
    assert out.status == "done", out
    assert sign_moves(fake)[-1] == ("place", "corridor-1b") and not fake.false_done
    assert ex.wet_first_seen["corridor-1b"] >= ex_seconds(task.arrived)


def test_wet_spots_are_stamped_with_the_clock_they_were_first_seen_at_across_midnight(tmp_path):
    _fake, _session, ex = setup(tmp_path, requests=[])
    ex.state.clock = "23:59:50"
    ex.hotel.mark_wet("corridor-1a", "corridor-1b")
    ex.stamp_wet()
    ex.state.clock = "00:00:10"
    ex.hotel.mark_wet("corridor-1a", "corridor-1b")  # already stamped: unchanged
    ex.hotel.mark_wet("corridor-1b", "corridor-1c")
    ex.stamp_wet()
    assert ex.wet_first_seen["corridor-1b"] < ex.wet_first_seen["corridor-1c"]
    assert ex.wet_first_seen["corridor-1c"] - ex.wet_first_seen["corridor-1b"] == 20


def ex_seconds(clock):
    from agent.executor import night_seconds
    return night_seconds(clock)


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


def test_a_verified_spill_done_stays_on_after_a_later_miss(tmp_path):
    # Replay seed 7: R-009 and R-012 verified, then R-049's sign on another request's patch answered
    # "Noted."; switching spill_done (and with it every sign move) off for the night lost R-060 and
    # R-071 (+56, +62). A proven rule stays proven: the miss was that report's patch.
    requests = [("22:01:00", "R-001", SPILL.format(3)), ("22:01:00", "R-002", SPILL.format(2)),
                ("22:01:00", "R-003", SPILL.format(1))]
    fake, _session, ex = setup(tmp_path, requests=requests, wet_spots=[],
                              wet={frozenset({"elevator-2", "corridor-2a"})},
                              spill_spots={3: "corridor-3c", 2: None, 1: "corridor-1b"})
    first, second, third = read_tasks(ex, 3)
    assert ex.run(first).status == "done" and "R-001" in ex.verified
    ex.experiments["spill_done"] = True  # proven on the report, as live (this fake credits the place)
    out = ex.run(second)
    assert out.status == "done" and "R-002" not in ex.verified and fake.false_done == ["R-002"]
    assert ex.experiments["spill_done"] is True and ex.experiment("spill_done")
    assert ex.movable_signs() == ["corridor-3c"]  # R-001's credited sign may still be moved
    out = ex.run(third)
    assert out.status == "done" and "R-003" in ex.verified, out


def test_an_experiment_never_verified_still_ends_on_its_first_miss(tmp_path):
    fake, _session, ex, task = solo(tmp_path, SPILL.format(2), wet_spots=[],
                                    wet={frozenset({"elevator-2", "corridor-2a"})}, spill_spots={2: None})
    ex.experiments["spill_done"] = None
    assert ex.run(task).status == "done" and fake.false_done == ["R-001"]
    assert ex.experiments["spill_done"] is False


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


def _one_sign_two_spills(tmp_path):
    requests = [("22:01:00", "R-001", SPILL.format(3)), ("22:01:00", "R-002", SPILL.format(2))]
    fake, session, ex = setup(tmp_path, requests=requests, wet_spots=[],
                              spill_spots={3: "corridor-3c", 2: "corridor-2b"},
                              hotel_path=map_file(tmp_path, signs_in_storage(1)))
    first, second = read_tasks(ex, 2)
    assert ex.run(first).status == "done" and ex.signs_placed == {"corridor-3c": "R-001"}
    return fake, session, ex, second


def test_out_of_signs_and_the_old_sign_out_of_reach_is_declined_and_never_tried_again(tmp_path, monkeypatch):
    fake, session, ex, second = _one_sign_two_spills(tmp_path)
    real = ex.go

    def go(dst, **kw):
        if dst == "corridor-3c":
            raise ActionFailed("could not reach corridor-3c: closed off")
        return real(dst, **kw)

    monkeypatch.setattr(ex, "go", go)
    out = ex.run(second)
    assert out.status == "declined" and "corridor-2b" in out.note, out
    assert ex.signs_placed == {} and fake._objects["corridor-3c"] == {"wet-floor-sign": 1}
    assert [d["place"] for d in decisions(session, "sign_move_failed")] == ["corridor-3c"]


def test_no_sign_is_moved_while_spill_done_is_off(tmp_path):
    # Live the place never raises the score: with spill_done refuted the done report cannot be made,
    # so a credited sign must stay where it is.
    fake, _session, ex, second = _one_sign_two_spills(tmp_path)
    ex.experiments["spill_done"] = False
    assert ex.movable_signs() == []
    moves = len(sign_moves(fake))
    out = ex.run(second)
    assert out.status == "declined" and "sign" in out.note.lower(), out
    assert len(sign_moves(fake)) == moves and ex.signs_placed == {"corridor-3c": "R-001"}


def test_gather_raises_out_of_stock_as_its_own_exception(tmp_path):
    _fake, _session, ex = setup(tmp_path, requests=[], hotel_path=map_file(tmp_path, signs_in_storage(0)))
    with pytest.raises(OutOfStock, match="wet-floor-sign out of stock"):
        ex.gather("wet-floor-sign")


# --- the planner prices an out-of-stock spill with a movable sign --------------------------------


def test_planner_runs_an_out_of_stock_spill_with_a_movable_sign_before_a_longer_task():
    hotel = Hotel.load()
    hotel.stock["storage"]["wet-floor-sign"] = 0
    st = RobotState(location="corridor-3d", clock="22:30:00")
    spill = Task(request="R-2", kind=Kind.SPILL, text="", arrived="22:20:00", floor=3)
    far = Task(request="R-3", kind=Kind.LOST_ITEM, text="", arrived="22:20:00", room="room-101",
               item="glasses", area_hint="lobby-bar")
    assert estimate_seconds(spill, st, hotel, Params()) >= 1e6  # nothing movable: unpriced, last
    assert choose_next([far, spill], st, hotel, Params()) is far
    movable = ["corridor-3c"]
    secs = estimate_seconds(spill, st, hotel, Params(), movable_signs=movable)
    assert secs < estimate_seconds(far, st, hotel, Params(), movable_signs=movable)
    assert choose_next([far, spill], st, hotel, Params(), movable_signs=movable) is spill


def test_shift_loop_gives_the_planner_the_movable_signs(tmp_path, monkeypatch):
    import agent.agent as mod

    seen = []
    real = mod.choose_next

    def spy(tasks, state, hotel, params, **kw):
        seen.append(kw.get("movable_signs"))
        return real(tasks, state, hotel, params, **kw)

    monkeypatch.setattr(mod, "choose_next", spy)
    fake = FakeWybe(requests=[("22:01:00", "R-001", SPILL.format(3)), ("22:20:00", "R-002", SPILL.format(2))],
                    spill_spots={3: "corridor-3c", 2: "corridor-2b"}, wet_spots=[],
                    hotel_path=map_file(tmp_path, signs_in_storage(1)))
    run_shift(client_for(tmp_path, fake.handler), seed=1, sim_end="22:50:00")
    assert ["corridor-3c"] in seen
    assert fake.reports == {"R-001": "done", "R-002": "done"} and not fake.false_done


def test_gather_never_takes_a_sign_standing_on_a_wet_patch(tmp_path):
    fake, _session, ex = setup(tmp_path, requests=[], wet_spots=[])
    fake._add_object("corridor-1a", "wet-floor-sign")  # ours, over an earlier spill; nearer than storage
    ex.hotel.mark_wet("lobby", "corridor-1a")
    ex.hotel.stock["corridor-1a"] = {"wet-floor-sign": 1}
    ex.signs_placed = {"corridor-1a": "R-001"}
    ex.gather("wet-floor-sign")
    assert sign_moves(fake) == [("pick", "storage")]
    assert fake._objects["corridor-1a"] == {"wet-floor-sign": 1}
