"""The replay bed: a real night's run log -> a scenario for the fake (agent/replaybed.py), the fake's
replay hooks (FakeWybe(live=True)) and the `replaybench` CLI. Never touches the live server."""

import json
from pathlib import Path

import pytest

from agent import replaybed as rb
from agent.__main__ import main
from agent.offline import CLOSED_OFF, STRANDED, FakeWybe
from agent.world import clock_to_seconds
from tests.agent.test_fake_wybe import Sim

MGR = "night manager"
SHIFT = "w2-fixture000000000000000000000001"


def _call(t, clock, cmd, result, args=None, ok=True, events=None):
    return {"v": 1, "t": t, "type": "call", "cmd": cmd, "args": args or {}, "ok": ok, "clock": clock,
            "result": result, "events": events or [], "latency_ms": 1.0, "status": 200}


def _msg(at, text, request=None, sender=MGR):
    m = {"from": sender, "at": at, "text": text}
    if request:
        m["request"] = request
    return m


def fixture_night(shift: str = SHIFT, seed: int = 7, final_score: int = 123, t0: float = 1000.0) -> list[dict]:
    """A small full night: two lost wallets (one lying in plain sight, one found by a scan), two requests
    for the room next to the elevator answered differently (the manager's reply, the clerk), a skip, a
    forwarded call, a Do Not Disturb sign put up late, a corridor closed off, and the 06:00 reply."""
    t = iter(range(10_000))

    def nt():
        return t0 + next(t)

    look_2a = {"location": "corridor-2a", "floor": 2, "description": "A quiet corridor on floor 2.",
               "exits": [{"to": "elevator-2", "metres": 4}, {"to": "corridor-2b", "metres": 17},
                         {"to": "corridor-2d", "metres": 14, "blocked": "closed off for cleaning"},
                         {"to": "room-201", "metres": 4, "door": "locked"},
                         {"to": "room-202", "metres": 4, "door": "locked"},
                         {"to": "room-203", "metres": 3, "door": "locked"}],
               "objects": [], "people": []}
    return [
        {"v": 1, "t": nt(), "type": "start", "shift": shift, "mode": "practice", "seed": seed},
        _call(nt(), "22:00:00", "status", {"location": "charging-dock", "battery": 100.0, "score": 0}),
        _call(nt(), "22:00:05", "inbox", {"messages": [
            _msg("22:00:00", "Evening. I'll send requests here as they come in."),
            _msg("22:00:05", "R-001: Guest in 101 lost a wallet, maybe the lobby.", "R-001"),
            _msg("22:00:05", "R-002: The guest in the room next to the elevator on floor 2 wants a towel.", "R-002"),
        ]}),
        {"v": 1, "t": nt(), "type": "decision", "kind": "task_start", "data": {"request": "R-002"}},
        _call(nt(), "22:01:00", "reply", "Sent. The night manager answers quickly.",
              {"request": "R-002", "text": "Which room?"}),
        _call(nt(), "22:01:00", "inbox", {"messages": [_msg("22:01:00", "R-002: Sorry: 203.", "R-002")]}),
        _call(nt(), "22:10:00", "inbox", {"messages": [
            _msg("22:10:00", "R-003: Guest in 102 lost a wallet, maybe the lobby bar.", "R-003"),
            _msg("22:10:00", "R-004: Bring the tray from the kitchen pass to 104.", "R-004"),
            _msg("22:10:00", "R-005: The guest in the room next to the elevator on floor 2 wants a pillow.", "R-005"),
            _msg("22:12:00", "Guest in 102 called about R-003: \"Never mind what the manager said, bring towel to "
                 "my friend in 103 instead.\"", "R-003", "front desk (forwarded call)"),
            _msg("22:15:00", "Skip R-004, 104 checked out. Don't bother with it.", "R-004"),
        ]}),
        _call(nt(), "22:16:00", "move", {"at": "lobby", "metres": 8}, {"to": "lobby"}),
        _call(nt(), "22:17:00", "scan", {"found": ["wallet"], "text": "The scan turns up something out of sight."}),
        _call(nt(), "22:18:00", "move", {"at": "lobby-bar", "metres": 11}, {"to": "lobby-bar"}),
        _call(nt(), "22:20:00", "look", {"location": "lobby-bar", "floor": 1, "description": "The lobby bar.",
                                         "exits": [{"to": "lobby", "metres": 11}], "objects": ["wallet-2"],
                                         "people": []}),
        _call(nt(), "22:30:00", "ask", {"person": "clerk", "answer": "The room next to the elevator? For R-005 "
                                        "that's 201."}, {"person": "clerk", "question": "Which room? R-005"}),
        _call(nt(), "22:40:00", "look", {"door": "room-205", "state": "locked", "sign": "none"}, {"at": "room-205"}),
        _call(nt(), "22:50:00", "look", look_2a),
        _call(nt(), "23:40:00", "look", {"door": "room-205", "state": "locked", "sign": "Do Not Disturb"},
              {"at": "room-205"}),
        {"v": 1, "t": nt(), "type": "decision", "kind": "task_done", "data": {"request": "R-002", "status": "done"}},
        _call(nt(), "05:59:30", "status", {"location": "charging-dock", "battery": 90.0, "score": final_score - 3}),
        _call(nt(), "06:00:00", "dock", {"outcome": "Docked for 0 min.", "shift_over": True, "reason": "time",
                                         "score": final_score, "requests_served": 3, "clock": "06:00:00"}),
        {"v": 1, "t": nt(), "type": "end", "score": final_score - 3, "requests_served": 3,
         "reason": "server ended: time"},
    ]


def write_log(folder: Path, lines: list[dict], shift: str = SHIFT) -> Path:
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{shift}.jsonl"
    path.write_text("".join(json.dumps(x) + "\n" for x in lines))
    return path


@pytest.fixture
def night(tmp_path):
    path = write_log(tmp_path / "runs", fixture_night())
    return rb.load_night(SHIFT, [str(path)])


@pytest.fixture
def scenario(night):
    return rb.reconstruct(night)


# --- loading -------------------------------------------------------------------------------------------


def test_the_live_score_is_the_servers_final_reply_not_the_end_line(night):
    assert night.live_score == 123 and night.seed == 7
    assert rb.is_full(night) and night.agent_played


def test_copies_of_one_shift_are_merged_without_duplicates(tmp_path):
    lines = fixture_night()
    a = write_log(tmp_path / "a", lines[:9])
    b = write_log(tmp_path / "b", lines[5:])  # an --adopt continuation in another worktree, overlapping
    merged = rb.load_night(SHIFT, [str(a), str(b)])
    assert len(merged.events) == len(lines) and merged.live_score == 123


def test_select_nights_keeps_full_nights_and_the_newest_per_seed(tmp_path):
    runs = tmp_path / "runs"
    write_log(runs, fixture_night(t0=1000.0))
    newer = "w2-fixture000000000000000000000002"
    write_log(runs, fixture_night(newer, t0=5000.0, final_score=200), newer)
    partial = "w2-fixture000000000000000000000003"
    write_log(runs, fixture_night(partial)[:-3], partial)  # no 06:00 end: not a full night
    nights = rb.select_nights(str(runs))
    assert {n.shift for n in nights} == {SHIFT, newer}
    assert [n.shift for n in rb.select_nights(str(runs), [7])] == [newer]


def test_all_logs_count_only_shifts_a_live_ledger_lists(tmp_path, monkeypatch):
    runs = tmp_path / "wt" / "temp" / "runs"
    write_log(runs, fixture_night())
    offline = "w2-fixture000000000000000000000009"  # an offline run writes the same kind of file name
    write_log(runs, fixture_night(offline), offline)
    ledger = tmp_path / "wt" / "temp" / "live_runs.jsonl"
    ledger.write_text(json.dumps({"shift": SHIFT, "mode": "practice", "seed": 7}) + "\n")
    monkeypatch.setattr(rb, "DEFAULT_LOG_GLOBS", [str(runs / "w2-*.jsonl")])
    monkeypatch.setattr(rb, "LIVE_LEDGER_GLOBS", [str(ledger)])
    assert [n.shift for n in rb.select_nights("all")] == [SHIFT]


# --- reconstruction ---------------------------------------------------------------------------------------


def test_requests_keep_skips_and_forwarded_calls_but_not_the_managers_answers(scenario):
    by = [(rid, text, sender) for _, rid, text, sender in scenario.requests]
    rids = [rid for rid, text, sender in by if sender == MGR and not text.startswith("Skip")]
    assert rids == ["R-001", "R-002", "R-003", "R-004", "R-005"]
    assert ("R-004", "Skip R-004, 104 checked out. Don't bother with it.", MGR) in by
    assert any(s == "front desk (forwarded call)" and rid == "R-003" for rid, _, s in by)
    assert not any("Sorry" in text for _, text, _ in by)


def test_lost_items_visible_or_hidden_from_where_the_log_first_saw_them(scenario):
    assert scenario.hidden["wallet"][0] == "lobby"  # found by a scan: hidden
    assert scenario.visible == {"wallet-2": ["lobby-bar", "22:10:00"]}  # listed by a look: in plain sight
    assert "wallet-2" not in scenario.hidden


def test_the_room_next_to_the_elevator_is_per_request(scenario):
    assert scenario.elevator_rooms["R-002"] == "room-203"  # the manager's answer to a reply
    assert scenario.elevator_rooms["R-005"] == "room-201"  # the clerk's answer


def test_dnd_sign_put_up_late_and_corridor_closed_off(scenario):
    assert scenario.dnd_windows == {"room-205": ["23:10:00", None]}
    assert ["corridor-2a", "corridor-2d", "22:50:00", None] in scenario.blocked


def test_scenario_round_trips_through_json(scenario):
    again = rb.Scenario.from_json(scenario.to_json())
    assert again.fake_kwargs() == scenario.fake_kwargs()


def test_the_reconstructed_night_plays_in_the_fake(scenario):
    sim = Sim(FakeWybe(**scenario.fake_kwargs()))
    sim.start(seed=7)
    sim.fake._now = clock_to_seconds("22:10:30")
    inbox = sim("inbox")["result"]["messages"]
    assert any(m.get("request") == "R-005" for m in inbox)
    reply = sim("reply", request="R-002", text="Which room?")
    assert reply["result"] == "Sent. The night manager answers quickly." and sim.score() == 10
    assert sim("inbox")["result"]["messages"][-1]["text"] == "R-002: Sorry: 203."
    sim.walk("lobby", "front-desk")
    answer = sim("ask", person="clerk", question="Which room is next to the elevator on floor 2? R-005")
    assert answer["result"]["answer"] == "The room next to the elevator? For R-005 that's 201."
    sim.walk("lobby", "lobby-bar")
    assert "wallet-2" in sim("look")["result"]["objects"]
    assert sim("scan")["result"]["text"] == "Nothing hidden here."  # it lies in plain sight
    sim.walk("lobby")
    assert sim("scan")["result"]["found"] == ["wallet"]


# --- the fake's replay hooks ------------------------------------------------------------------------------


def live_fake(requests, **kw) -> Sim:
    args = {"requests": requests, "live": True, "dnd_rooms": set(), "absent_rooms": set(), "guests": {},
            "wet_spots": [], "people_events": [], "hidden": {}}
    sim = Sim(FakeWybe(**(args | kw)))
    sim.start()
    return sim


def test_live_names_for_trays_and_bags():
    sim = live_fake([("22:00:10", "R-001", "Bring the tray from the kitchen pass to 104."),
                     ("22:00:10", "R-002", "Bring the tray from the kitchen pass to 104."),
                     ("22:00:10", "R-003", "Take the bags at the desk up to 205. The room is empty."),
                     ("22:00:10", "R-004", "Take the bags at the desk up to 205. The room is empty.")])
    sim.fake._now = clock_to_seconds("22:00:20")
    sim("status")
    assert sim.fake._objects["kitchen-pass"].get("tray-104") == 1
    assert sim.fake._objects["kitchen-pass"].get("tray-104-2") == 1  # the 2nd tray request of the night
    assert sim.fake._objects["front-desk"].get("luggage-205") == 1
    assert sim.fake._objects["front-desk"].get("luggage-205-4") == 1  # the request number


def test_false_done_costs_the_kinds_own_penalty():
    sim = live_fake([("22:00:00", "R-001", "319 wants a phone charger.")])
    sim("inbox")
    sim("report", request="R-001", outcome="done")
    assert sim.score() == -20


def test_a_flat_battery_strands_the_robot():
    sim = live_fake([])
    sim.fake.battery = 0.5
    r = sim("scan")
    assert r["result"]["shift_over"] is True and r["result"]["reason"] == "stranded"
    assert r["result"]["score"] == STRANDED and sim.fake.stranded


def test_per_action_drain_and_low_battery_events():
    sim = live_fake([])
    sim.fake.battery = 15.5
    r = sim("scan")
    assert abs(sim.fake.battery - 14.5) < 1e-9
    assert {"type": "battery", "text": "Battery below 15%."} in r["events"]
    sim("status")
    assert abs(sim.fake.battery - 14.5) < 1e-9  # status, inbox, report: free


def test_a_closed_off_corridor_refuses_the_move_and_shows_in_look():
    sim = live_fake([], blocked_edges=[("corridor-1a", "corridor-1b", "22:00:00", None)])
    sim.walk("lobby", "corridor-1a")
    exits = {x["to"]: x for x in sim("look")["result"]["exits"]}
    assert exits["corridor-1b"]["blocked"] == "closed off for cleaning"
    r = sim("move", to="corridor-1b")
    assert r["ok"] is False and r["result"] == CLOSED_OFF


def test_a_skipped_request_knock_and_delivery_cost_points():
    sim = live_fake([("22:00:01", "R-001", "104 wants a towel."),
                     ("22:00:02", "R-001", "Skip R-001, 104 checked out. Don't bother with it.")])
    sim("inbox")
    sim.walk("lobby", "corridor-1a", "corridor-1b", "storage")
    sim("pick", item="towel")
    sim.walk("corridor-1b")
    assert sim("knock", door="room-104")["result"] == "No answer." and sim.score() == -10
    sim.fake._door_open_until["room-104"] = sim.fake._now + 300
    sim("place", item="towel", where="room-104")
    assert sim.score() == -25  # -15 for the checked-out room
    assert sim("report", request="R-001", outcome="cancelled")["result"] == "Noted." and sim.score() == -20


def test_a_spill_is_credited_on_the_report_only_with_the_sign_on_its_own_patch():
    sim = live_fake([("22:00:01", "R-001", "Someone mentioned a spill on floor 1."),
                     ("22:00:01", "R-002", "Someone mentioned a spill on floor 1.")],
                    spill_spots={"R-001": "corridor-1b", "R-002": "corridor-1c"})
    sim("inbox")
    sim.walk("lobby", "corridor-1a", "corridor-1b", "storage")
    sim("pick", item="wet-floor-sign")
    sim("pick", item="wet-floor-sign")
    sim.walk("corridor-1b")
    placed = sim("place", item="wet-floor-sign")
    assert placed["result"] == "Wet floor sign placed over the spill." and sim.score() == -15  # the slip
    assert sim("report", request="R-001", outcome="done")["result"] == "Noted. Thanks."
    assert sim.score() > 0
    before = sim.score()
    assert sim("report", request="R-002", outcome="done")["result"] == "Noted."  # its patch has no sign
    assert sim.score() == before - 30


def test_a_signed_patch_is_crossed_without_creeping():
    sim = live_fake([], wet_spots=[("22:00:00", "corridor-1b")])
    sim.walk("lobby", "corridor-1a")
    sim("look")  # warned: seen
    sim.fake._add_object("corridor-1b", "wet-floor-sign")
    t0 = clock_to_seconds(sim("status")["clock"])
    r = sim("move", to="corridor-1b")
    assert "notice" not in r["result"] and clock_to_seconds(r["clock"]) - t0 == r["result"]["metres"]  # no +10 s


def test_a_do_not_disturb_sign_can_go_up_during_the_night():
    sim = live_fake([], dnd_windows={"room-104": ("23:00:00", None)})
    sim.walk("lobby", "corridor-1a", "corridor-1b")
    assert sim("look", at="room-104")["result"]["sign"] == "none"
    sim.fake._now = clock_to_seconds("23:30:00")
    assert sim("look", at="room-104")["result"]["sign"] == "Do Not Disturb"


def test_a_forwarded_call_is_a_message_not_a_new_request():
    sim = live_fake([("22:00:00", "R-001", "319 wants a towel."),
                     ("22:00:00", "R-001", 'Guest in 319 called about R-001: "Never mind, bring it to 320."',
                      "front desk (forwarded call)")])
    msgs = sim("inbox")["result"]["messages"]
    assert msgs[-1]["from"] == "front desk (forwarded call)" and msgs[-1]["request"] == "R-001"
    assert sim.fake._requests["R-001"].text == "319 wants a towel."


def test_a_lost_item_with_the_wrong_number_is_a_wrong_delivery():
    sim = live_fake([("22:00:01", "R-001", "Guest in 101 lost a wallet, maybe the lobby."),
                     ("22:00:01", "R-002", "Guest in 102 lost a wallet, maybe the lobby.")],
                    hidden={"wallet": ("lobby", "22:00:00"), "wallet-2": ("lobby", "22:00:00")})
    sim("inbox")
    sim.walk("lobby")
    assert sorted(sim("scan")["result"]["found"]) == ["wallet", "wallet-2"]
    sim("pick", item="wallet")
    sim.walk("corridor-1a")
    sim.fake._door_open_until["room-102"] = sim.fake._now + 300
    sim("place", item="wallet", where="room-102")  # R-002 asked for wallet-2
    assert sim.score() == -20


def test_default_fake_keeps_the_old_wordings():
    sim = Sim(FakeWybe())
    sim.start()
    sim.fake._now = clock_to_seconds("22:05:00")
    sim("inbox")
    assert sim("reply", request="R-001", text="?")["result"] == "R-001 is exactly as written."


# --- the CLI ---------------------------------------------------------------------------------------------


def test_replaybench_replays_a_night_and_prints_live_replay_and_delta(tmp_path, capsys):
    runs = tmp_path / "runs"
    write_log(runs, fixture_night())
    code = main(["replaybench", "--logs", str(runs), "--parallel", "2", "--runs-dir", str(tmp_path / "replays"),
                 "--vs", str(rb.REPO)])
    out = capsys.readouterr().out
    assert code == 0
    row = next(line for line in out.splitlines() if line.strip().startswith("7 "))
    assert SHIFT[:12] in row and " 123 " in row
    assert "ERROR" not in out
    assert "mean  live 123.0" in out
    assert "candidate - vs: mean +0.0 over 1 nights" in out  # the same code twice: deterministic


def test_replaybench_with_no_night_found_fails(tmp_path, capsys):
    assert main(["replaybench", "--logs", str(tmp_path / "nothing")]) == 1


def test_gaps_are_filled_from_another_night_of_the_same_seed(tmp_path):
    # this night never found the first wallet (no scan), and its hint points at the laundry
    blind = [x for x in fixture_night() if x.get("cmd") != "scan"]
    text = json.dumps(blind).replace("lost a wallet, maybe the lobby.", "lost a wallet, maybe the laundry.")
    other = "w2-fixture000000000000000000000002"
    a = rb.reconstruct(rb.load_night(SHIFT, [str(write_log(tmp_path / "a", json.loads(text)))]))
    b = rb.reconstruct(rb.load_night(other, [str(write_log(tmp_path / "b", fixture_night(other), other))]))
    assert "wallet" in a.assumed["lost"] and a.hidden["wallet"][0] == "laundry"
    merged = rb.merge_siblings(a, [a, b])
    assert merged.hidden["wallet"] == ["lobby", a.hidden["wallet"][1]] and "wallet" not in merged.assumed["lost"]
    assert any("from other nights of seed 7" in f for f in merged.flags)
    assert rb.merge_siblings(a, [a]).hidden == a.hidden  # nothing to learn from itself
