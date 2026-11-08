"""Task 7: lost items lying in plain sight, and the search under load.

Live seed 41 (2026-11-07): six lost-item requests failed after 9-10 scans each while the items were
listed in `look` objects (glasses at corridor-1b, wallet at kitchen-pass): `scan` reports only hidden
things, and `found` was filled only by scans. Now every no-arg look records what could be a lost item,
the hunt looks before it scans, and with two or more tasks waiting it stops after 3 scans."""

from agent.executor import lost_object
from agent.flows import SCAN_CAP_BUSY
from agent.tasks import parse_request
from tests.agent.test_executor import calls, decisions, next_task, scan_places, setup, solo


def _looks_at(fake, place, since=0):
    """No-arg looks the robot made standing at `place`."""
    return [e for e in calls(fake, "look", since)
            if not e["args"] and e["ok"] and e["result"].get("location") == place]


def _placed(fake):
    return [e["args"]["item"] for e in calls(fake, "place") if e["ok"]]


# --- the fake can leave a lost item in the open ----------------------------------------------------


def test_fake_lists_a_visible_lost_item_in_the_look_and_the_scan_does_not_report_it(tmp_path):
    _fake, session, ex = setup(tmp_path, requests=[], hidden={}, visible={"wallet": "kitchen-pass"})
    ex.go("kitchen-pass")
    assert "wallet" in session.cmd("look").result["objects"]
    assert session.cmd("scan").result == "Nothing hidden here."  # live: a scan reports only hidden things
    assert session.cmd("pick", item="wallet").ok


# --- which objects are recorded --------------------------------------------------------------------


def test_lost_object_is_anything_but_stock_fixtures_trays_bags_and_notes():
    for name in ("glasses", "glasses-2", "wallet", "toy", "toy-3", "reading-glasses", "phone"):
        assert lost_object(name), name
    for name in ("towel", "water-bottle", "phone-charger", "toiletry-kit", "pillow", "pillow-2",
                 "towel x8", "glasses x2", "tray-117", "tray-117-4", "luggage-301", "luggage-301-28",
                 "bags-206", "wet-floor-sign", "keycard", "cart", "note", "staff-note", "sticky-note",
                 "manual", "", None, 3):
        assert not lost_object(name), name


def test_stock_and_trays_are_never_recorded(tmp_path):
    fake, session, ex = setup(tmp_path, requests=[], hidden={})
    fake._objects["lobby"] = {"towel": 3, "water-bottle": 1, "phone-charger": 1, "toiletry-kit": 1,
                              "pillow": 1, "pillow-2": 1, "tray-117": 1, "tray-117-4": 1, "luggage-301": 1,
                              "bags-206": 1, "wet-floor-sign": 1, "keycard": 2, "cart": 1, "manual": 1,
                              "glasses": 2, "wallet": 1}
    ex.go("lobby")  # the first visit looks on arrival
    assert _looks_at(fake, "lobby")
    assert ex.found == {"wallet": "lobby"}  # "glasses x2" has a count: stock-like, not one lost thing
    assert decisions(session, "lost_item_seen") == [{"item": "wallet", "at": "lobby"}]


def test_a_look_at_a_door_or_inside_a_guest_room_records_nothing(tmp_path):
    fake, session, ex = setup(tmp_path, rids={"R-004"}, absent_rooms={"room-103"}, hidden={})
    fake._objects["room-103"] = {"wallet": 1}  # a guest's own things are no lost item
    fake._objects["corridor-1a"] = {"toy": 1}
    task = next_task(ex, session, "R-004")
    out = ex.run(task)  # door look, knock, keycard, a look inside
    assert out.status == "done", out
    assert any((e["args"] or {}).get("at") == "room-103" for e in calls(fake, "look"))
    assert any("wallet" in e["result"]["objects"] for e in _looks_at(fake, "room-103"))
    assert "wallet" not in ex.found
    assert ex.found.get("toy") == "corridor-1a"


def test_an_object_that_vanished_from_a_later_look_is_dropped(tmp_path):
    fake, session, ex = setup(tmp_path, requests=[], hidden={}, visible={"glasses": "corridor-1b"})
    ex.go("corridor-1b")
    assert ex.found == {"glasses": "corridor-1b"}
    del fake._objects["corridor-1b"]["glasses"]  # someone took it
    ex.look()
    assert "glasses" not in ex.found
    assert decisions(session, "lost_item_vanished") == [{"item": "glasses", "at": "corridor-1b"}]


def test_a_scanned_item_is_kept_when_a_look_does_not_list_it(tmp_path):
    # hidden things may stay out of sight of a look: only what a look listed is dropped by a look
    fake, _session, ex = setup(tmp_path, requests=[], hidden={"toy": "corridor-1a"})
    ex.go("corridor-1a")
    assert ex.scan() == ["toy"]
    del fake._objects["corridor-1a"]["toy"]
    ex.look()
    assert ex.found == {"toy": "corridor-1a"}


# --- the hunt --------------------------------------------------------------------------------------


def test_an_item_seen_in_an_earlier_look_is_fetched_with_no_scan(tmp_path):
    text = "Guest in 320 lost glasses, maybe the lobby bar."  # the hint is wrong; a look saw them
    fake, _session, ex, task = solo(tmp_path, text, hidden={}, visible={"glasses": "corridor-1b"})
    ex.go("corridor-1b")  # e.g. a tray run went by: the arrival look listed the glasses
    ex.go("lobby")
    since = len(fake.log)
    out = ex.run(task)
    assert out.status == "done", out
    assert not calls(fake, "scan", since)
    assert _placed(fake) == ["glasses"] and not fake.wrong_deliveries


def test_an_item_lying_visible_at_the_hinted_place_is_picked_after_one_look_and_no_scan(tmp_path):
    text = "Guest in 320 lost a wallet, maybe the kitchen pass."
    fake, _session, ex, task = solo(tmp_path, text, hidden={})
    ex.go("kitchen-pass")  # seen once already tonight: no look on arrival next time
    ex.go("lobby")
    fake._add_object("kitchen-pass", "wallet")  # left there since
    since = len(fake.log)
    out = ex.run(task)
    assert out.status == "done", out
    assert len(_looks_at(fake, "kitchen-pass", since)) == 1
    assert not calls(fake, "scan", since)
    assert _placed(fake) == ["wallet"]


def test_a_first_visit_reuses_the_arrival_look_and_scans_only_when_the_item_is_not_listed(tmp_path):
    text = "Guest in 320 lost a wallet, maybe the kitchen pass."
    fake, _session, ex, task = solo(tmp_path, text, hidden={"wallet": "kitchen-pass"})
    since = len(fake.log)
    out = ex.run(task)
    assert out.status == "done", out
    assert len(_looks_at(fake, "kitchen-pass", since)) == 1  # the arrival look, not a second one
    assert scan_places(fake, since) == ["kitchen-pass"]


def test_a_looked_at_item_goes_to_its_numbered_owner(tmp_path):
    texts = ["Guest in 105 lost a wallet, maybe the kitchen pass.",
             "Guest in 213 lost a wallet, maybe the kitchen pass."]
    requests = [(f"22:0{i}:00", f"R-00{i}", t) for i, t in enumerate(texts, 1)]
    fake, session, ex = setup(tmp_path, requests=requests, hidden={},
                              visible={"wallet": "kitchen-pass", "wallet-2": "kitchen-pass"})
    tasks = [next_task(ex, session, f"R-00{i}") for i in (1, 2)]
    for t in tasks:
        ex.ledger.add(t)
    out = ex.run(tasks[1])
    assert out.status == "done", out
    assert _placed(fake) == ["wallet-2"] and not fake.wrong_deliveries
    assert ex.found.get("wallet") == "kitchen-pass"  # still there for the first request


# --- the search under load -------------------------------------------------------------------------


def test_with_two_queued_tasks_the_hunt_stops_after_three_scans(tmp_path):
    text = "Guest in 320 lost a wallet, maybe the ground floor corridor."
    fake, session, ex, task = solo(tmp_path, text, hidden={})
    ex.queue += [parse_request("R-008", "319 wants a pillow.", "22:30:00"),
                 parse_request("R-009", "318 wants a towel.", "22:30:00")]
    since = len(fake.log)
    out = ex.run(task)
    assert SCAN_CAP_BUSY == 3
    assert out.status == "failed" and out.points == 0, out
    assert len(scan_places(fake, since)) == 3
    assert "not found after 3 scans (others waiting)" in out.note
    assert decisions(session, "scan_cap") == [{"request": "R-001", "cap": 3, "queued": 2}]


def test_with_one_queued_task_the_old_cap_stands(tmp_path):
    text = "Guest in 320 lost a wallet, maybe the ground floor corridor."
    fake, session, ex, task = solo(tmp_path, text, hidden={})
    ex.queue.append(parse_request("R-009", "319 wants a pillow.", "22:30:00"))
    since = len(fake.log)
    out = ex.run(task)
    assert out.status == "failed", out
    assert len(scan_places(fake, since)) > SCAN_CAP_BUSY
    assert "others waiting" not in out.note
    assert not decisions(session, "scan_cap")


def test_the_busy_cap_still_finds_an_item_in_the_first_three_places(tmp_path):
    text = "Guest in 320 lost a wallet, maybe the kitchen pass."
    fake, _session, ex, task = solo(tmp_path, text, hidden={"wallet": "kitchen-pass"})
    ex.queue += [parse_request("R-008", "319 wants a pillow.", "22:30:00"),
                 parse_request("R-009", "318 wants a towel.", "22:30:00")]
    since = len(fake.log)
    out = ex.run(task)
    assert out.status == "done", out
    assert scan_places(fake, since) == ["kitchen-pass"]



def test_a_carried_item_a_look_listed_is_still_delivered(tmp_path):
    # a look's objects also land in the map's stock: wallet-2 in hand must not count as stock there
    texts = ["Guest in 105 lost a wallet, maybe the kitchen pass.",
             "Guest in 213 lost a wallet, maybe the kitchen pass."]
    requests = [(f"22:0{i}:00", f"R-00{i}", t) for i, t in enumerate(texts, 1)]
    fake, session, ex = setup(tmp_path, requests=requests, hidden={}, visible={"wallet-2": "kitchen-pass"})
    tasks = [next_task(ex, session, f"R-00{i}") for i in (1, 2)]
    for t in tasks:
        ex.ledger.add(t)
    ex.go("kitchen-pass")
    assert ex.pick_or_cart("wallet-2")[0]  # picked on an earlier try that did not get to deliver it
    since = len(fake.log)
    out = ex.run(tasks[1])
    assert out.status == "done", out
    assert not calls(fake, "scan", since) and _placed(fake) == ["wallet-2"]
