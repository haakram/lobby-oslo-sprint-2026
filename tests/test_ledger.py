"""scripts/ledger.py: the evidence ledger computed from live run logs (review round 3, item C1)."""

from __future__ import annotations

import csv
import importlib.util
import io
import json
import sys
from pathlib import Path

SPEC = importlib.util.spec_from_file_location("ledger", Path(__file__).resolve().parent.parent / "scripts" / "ledger.py")
ledger = importlib.util.module_from_spec(SPEC)
sys.modules["ledger"] = ledger  # dataclasses look their module up by name
SPEC.loader.exec_module(ledger)


def call(cmd: str, args: dict | None = None, result: object = None, clock: str = "23:00:00", ok: bool = True) -> dict:
    return {"v": 1, "type": "call", "cmd": cmd, "args": args or {}, "ok": ok, "clock": clock, "result": result}


def state(score: int, clock: str = "23:00:00", battery: float = 50.0) -> dict:
    return {"v": 1, "type": "state", "clock": clock, "score": score, "battery": battery}


NIGHT = [
    {"v": 1, "type": "start", "shift": "w2-" + "a" * 32, "mode": "practice", "seed": 16},
    call("inbox", result={"messages": [{"from": "night manager", "text": "R-001: pillow", "request": "R-001"},
                                       {"from": "night manager", "text": "R-002: water never came", "request": "R-002"},
                                       {"from": "night manager", "text": "R-003: spill", "request": "R-003"}]}),
    state(100),
    call("report", {"request": "R-001", "outcome": "done", "note": "placed"}, "Noted. Thanks."),
    state(140, battery=40.0),
    call("report", {"request": "R-002", "outcome": "declined", "note": "No water order on record"}, "Noted."),
    state(145),
    call("report", {"request": "R-003", "outcome": "declined", "note": "No new wet patch"}, "Noted."),
    call("status", result={"score": 145}),
    call("report", {"request": "R-004", "outcome": "done", "note": "placed"}, "Noted."),
    state(120),
    call("move", {"to": "nowhere"}, "No such place.", ok=False),
    {"v": 1, "type": "end", "score": 120, "requests_served": 2, "reason": "server ended: time"},
]


def test_read_night_counts_done_credit_and_declines_by_the_score() -> None:
    row = ledger.read_night(NIGHT)
    assert row["complete"] is True
    assert row["score"] == 120 and row["served"] == 2 and row["requests"] == 3
    assert (row["done_reports"], row["done_credited"], row["done_not_credited"]) == (2, 1, 1)
    assert (row["declines"], row["declines_credited"], row["declines_not_credited"], row["declines_pending"]) == (2, 1, 1, 0)
    assert (row["calls"], row["calls_refused"]) == (7, 1)
    assert (row["score_drops"], row["points_lost"]) == (1, 25)
    assert row["min_battery"] == 40.0


def test_a_log_that_stops_after_a_decline_leaves_it_pending_and_incomplete() -> None:
    row = ledger.read_night(NIGHT[:6])
    assert row["complete"] is False and row["end_reason"] == "no end line"
    assert row["declines_pending"] == 1 and row["score"] == 140


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(r) + "\n" for r in rows), encoding="utf-8")


def test_collect_keeps_only_live_shifts_and_joins_the_replay_commit_map(tmp_path: Path) -> None:
    live, offline, unlogged = "w2-" + "a" * 32, "w2-" + "b" * 32, "w2-" + "c" * 32
    root = tmp_path / "checkout"
    write_jsonl(root / "temp" / "live_runs.jsonl", [
        {"t": 1794096422.7, "shift": live, "mode": "practice", "seed": 16},
        {"t": 1794096400.0, "shift": unlogged, "mode": "practice", "seed": 5, "note": "probe"},
    ])
    write_jsonl(root / "temp" / "runs" / f"{live}.jsonl", NIGHT)
    write_jsonl(root / "temp" / "runs" / f"{offline}.jsonl", NIGHT)  # the offline fake: not in live_runs
    (root / "agent" / "data").mkdir(parents=True)
    (root / "agent" / "data" / "replay_codes.json").write_text(json.dumps({"_doc": "", live[:12]: {"commit": "cb72845"}}))

    nights = ledger.collect([root])
    assert [n.shift for n in nights] == [unlogged, live]  # by wall time; the offline log is not a live night
    by = {n.shift: n for n in nights}
    assert by[live].commit == "cb72845" and by[live].commit_source == "replay_codes"
    assert by[live].started == "2026-11-08T01:07:02+01:00"
    assert by[unlogged].log == "" and by[unlogged].score is None and by[unlogged].note == "probe"

    rows = list(csv.DictReader(io.StringIO(ledger.ledger_csv(nights))))
    assert rows[1]["done_credited"] == "1" and rows[0]["score"] == ""
    assert [n["shift"] for n in json.loads(ledger.ledger_json(nights))["nights"]] == [live]
    builds = list(csv.DictReader(io.StringIO(ledger.builds_csv(nights))))
    assert builds[0]["commit"] == "cb72845" and builds[0]["nights"] == "1" and builds[0]["best_score"] == "120"


def test_fidelity_table_becomes_csv_rows_joined_to_the_ledger() -> None:
    night = ledger.Night(shift="w2-3eb205e431f7cf93fdfb9ccdea98efe1", started="2026-11-07T19:30:18+01:00", seed=1,
                         checkout="score")
    table = (
        "seed  shift           live  replay   delta   delta%  flags  code\n"
        "   1  w2-3eb205e43    1534    1512     -22    -1.4%      2  eb4a440\n"
        "  23  w2-28db193c7    1960    1687    -273   -13.9%     13  512a8a1  STRANDED\n"
        "   1  w2-95461e83a     581       -       -        -     28    (no commit known for this night (x.json))\n"
        "mean  live 2010.7  replay 1993.4  delta -17.3  mean abs error 61.0 (3.2 %)\n"
    )
    rows = list(csv.DictReader(io.StringIO(ledger.fidelity_csv(table, [night]))))
    assert len(rows) == 3
    assert rows[0] == {"shift": night.shift, "started": night.started, "seed": "1", "live_score": "1534",
                       "replay_score": "1512", "delta": "-22", "delta_pct": "-1.4", "replayed_by": "eb4a440", "note": ""}
    assert rows[1]["note"] == "STRANDED" and rows[1]["shift"] == "w2-28db193c7"
    assert rows[2]["replay_score"] == "" and rows[2]["note"] == "no commit known for this night (x.json)"


def test_board_test_checkouts_stay_in_the_ledger_but_out_of_builds_and_count_only_complete(tmp_path: Path) -> None:
    build_night, board_night, board_cut = "w2-" + "d" * 32, "w2-" + "e" * 32, "w2-" + "f" * 32
    final = tmp_path / "final"
    write_jsonl(final / "temp" / "live_runs.jsonl", [{"t": 1794096422.7, "shift": build_night, "seed": 16}])
    write_jsonl(final / "temp" / "runs" / f"{build_night}.jsonl", NIGHT)
    lottery = tmp_path / "lottery"  # a named board checkout: seed-specific, not a build
    write_jsonl(lottery / "temp" / "live_runs.jsonl", [
        {"t": 1794096500.0, "shift": board_night, "seed": 10},
        {"t": 1794096600.0, "shift": board_cut, "seed": 10},
    ])
    write_jsonl(lottery / "temp" / "runs" / f"{board_night}.jsonl", NIGHT)
    write_jsonl(lottery / "temp" / "runs" / f"{board_cut}.jsonl", NIGHT[:6])  # stopped early: no end line
    for root in (final, lottery):
        (root / "agent" / "data").mkdir(parents=True)
    (final / "agent" / "data" / "replay_codes.json").write_text(json.dumps({
        build_night[:12]: {"commit": "8eac151"}, board_night[:12]: {"commit": "8eac151"}, board_cut[:12]: {"commit": "8eac151"},
    }))

    nights = ledger.collect([final, lottery])
    assert {n.shift: n.kind for n in nights} == {build_night: "build", board_night: "board-test", board_cut: "board-test"}
    rows = {r["shift"]: r for r in csv.DictReader(io.StringIO(ledger.ledger_csv(nights)))}
    assert rows[board_night]["kind"] == "board-test" and rows[build_night]["kind"] == "build"
    # builds.csv: the commit's row holds only the build night, though the board tests carry the same commit.
    builds = list(csv.DictReader(io.StringIO(ledger.builds_csv(nights))))
    assert [(b["commit"], b["nights"]) for b in builds] == [("8eac151", "1")]
    # The card's nights: the build night and the complete board test; the cut-off board test is left out.
    counted = json.loads(ledger.ledger_json(nights))["nights"]
    assert [(n["shift"], n["kind"]) for n in counted] == [(build_night, "build"), (board_night, "board-test")]
    assert ledger.precision(ledger.counted(nights)) == (2, 2, 4)


def test_a_checkout_whose_tracked_files_differ_from_its_commit_is_a_board_test(tmp_path: Path) -> None:
    import subprocess

    repo = tmp_path / "wave"
    repo.mkdir()
    git = ["git", "-C", str(repo), "-c", "user.name=t", "-c", "user.email=t@example.invalid"]
    subprocess.run([*git, "init", "-q"], check=True)
    (repo / "price.py").write_text("WET = True\n")
    subprocess.run([*git, "add", "price.py"], check=True)
    subprocess.run([*git, "commit", "-q", "-m", "build"], check=True)
    (repo / "notes.txt").write_text("untracked is not code that ran\n")
    assert ledger.kind_of(repo) == "build"
    (repo / "price.py").write_text("WET = False\n")
    assert ledger.kind_of(repo) == "board-test"
    assert ledger.kind_of(tmp_path / "lafinal") == "board-test"  # named, whatever its tree
    (repo / "price.py").write_text("WET = True\n")
    subprocess.run([*git, "switch", "-q", "-c", "hamad/board-lottery2"], check=True)
    assert ledger.kind_of(repo) == "board-test"  # a board branch, under any checkout name


def decision(kind: str, request: str, task: str | None = None) -> dict:
    data = {"request": request} if task is None else {"request": request, "kind": task}
    return {"v": 1, "type": "decision", "kind": kind, "data": data}


def test_done_is_split_by_what_it_rested_on_a_rise_during_the_task_or_the_robots_own_judgement() -> None:
    night = [
        state(100),
        decision("task_start", "R-001", "amenity"),
        state(90),  # a slip cost points first; the rise after it still counts
        call("place", {"item": "pillow", "where": "room-101"}, "Placed pillow inside room-101."),
        state(110),
        call("report", {"request": "R-001", "outcome": "done", "note": "placed"}, "Noted. Thanks."),
        decision("task_done", "R-001"),
        decision("task_start", "R-002", "room_check"),
        call("report", {"request": "R-002", "outcome": "done", "note": "looked inside"}, "Noted. Thanks."),
        decision("task_done", "R-002"),
        state(140),  # the server's credit for R-002 arrives after the report: not a rise R-003 rests on
        decision("task_start", "R-003", "spill"),
        call("report", {"request": "R-003", "outcome": "done", "note": "sign placed"}, "Noted."),
        decision("task_failed", "R-003"),
        call("report", {"request": "R-004", "outcome": "done", "note": "no task_start"}, "Noted. Thanks."),
    ]
    row = ledger.read_night(night)
    assert row["done_reports"] == 4 and row["done_after_rise"] == 1
    assert (row["done_own"], row["done_own_credited"]) == (2, 1)
    assert (row["done_room_check"], row["done_room_check_credited"]) == (1, 1)
    assert (row["done_spill"], row["done_spill_credited"]) == (1, 0)
    assert row["done_basis_unknown"] == 1
    nights = [ledger.Night(shift="w2-" + "a" * 32, started="", seed=1, checkout="x", **{
        k: v for k, v in row.items() if k in ledger.Night.__dataclass_fields__})]
    split = ledger.basis_split(nights)
    assert (split["done_own"], split["done_own_credited"], split["done_after_rise"]) == (2, 1, 1)
    assert "own judgement 1 of 2 (50.0 %): room checks 1 of 1, spills 0 of 1" in ledger.basis_text("t", nights)


def test_a_score_blind_night_is_an_experiment_its_done_all_own_judgement_and_a_stamped_commit_wins(tmp_path: Path) -> None:
    blind, dirty = "w2-" + "1" * 32, "w2-" + "2" * 32
    root = tmp_path / "blind"
    write_jsonl(root / "temp" / "live_runs.jsonl", [{"t": 1794096422.7, "shift": blind, "seed": 16},
                                                     {"t": 1794096500.0, "shift": dirty, "seed": 10}])
    night = [
        {"v": 1, "type": "start", "shift": blind, "mode": "practice", "seed": 16,
         "build": {"commit": "ec84142abcde", "dirty": True}, "flags": {"score_blind": True}},
        state(100),
        decision("task_start", "R-001", "amenity"),
        state(130),  # the score rose, but a blind agent never read it
        call("report", {"request": "R-001", "outcome": "done", "note": "placed"}, "Noted. Thanks."),
        decision("task_done", "R-001"),
        {"v": 1, "type": "end", "score": 130, "reason": "server ended: time"},
    ]
    write_jsonl(root / "temp" / "runs" / f"{blind}.jsonl", night)
    stamped = [{**night[0], "shift": dirty, "flags": {"score_blind": False}}, *night[1:]]
    write_jsonl(root / "temp" / "runs" / f"{dirty}.jsonl", stamped)
    (root / "agent" / "data").mkdir(parents=True)

    by = {n.shift: n for n in ledger.collect([root])}
    assert by[blind].kind == "experiment" and (by[blind].done_own, by[blind].done_after_rise) == (1, 0)
    assert by[blind].commit == "ec84142" and by[blind].commit_source == "start_line"
    assert by[dirty].kind == "board-test" and by[dirty].done_after_rise == 1  # dirty stamp: not a build
    assert list(csv.DictReader(io.StringIO(ledger.builds_csv(list(by.values()))))) == []


def test_distinct_claims_count_a_replayed_seed_once_with_a_wilson_interval() -> None:
    def night(seed: int, claims: list[tuple[str, bool, bool]]) -> object:
        return ledger.Night(shift=f"w2-{seed:032x}", started="", seed=seed, checkout="x", own_claims=claims)

    nights = [night(23, [("R-001", True, False), ("R-037", False, False)]),
              night(23, [("R-001", True, True), ("R-037", False, False)]),  # the replay's R-001 was contradicted
              night(10, [("R-001", True, False)])]
    d = ledger.distinct_own(nights)
    assert (d["reports"], d["claims"], d["credited"], d["missed"]) == (5, 3, 2, ["23/R-037"])
    # Against the robot's own log: a claim holds only when credited and never contradicted in any replay.
    assert (d["holds_log"], d["contradicted"]) == (1, ["23/R-001"])
    # The data review's figures: 64 of 65 distinct claims, 95 % 92-99.7 %; 54 of 65 against the own log, 72-90 %;
    # the demo night's 9 of 9, 70-100 %.
    assert ledger.ci_text(ledger.wilson(64, 65), 64, 65) == "92-99.7 %"
    assert ledger.ci_text(ledger.wilson(54, 65), 54, 65) == "72-90 %"
    assert ledger.ci_text(ledger.wilson(9, 9), 9, 9) == "70-100 %"
    assert ledger.wilson(0, 0) == (0.0, 1.0)


def look(location: str, description: str, objects: list | None = None, clock: str = "03:47:00") -> dict:
    return call("look", {}, {"location": location, "description": description, "objects": objects or [], "people": []}, clock)


def test_a_room_reported_empty_after_the_robot_put_bags_inside_it_is_contradicted_by_its_own_log() -> None:
    """The card's selfContradictions (conduct.ts) over a night: 209 is the demo night's case."""
    night = [
        state(100),
        decision("task_start", "R-021", "luggage"),
        call("place", {"item": "luggage-209", "where": "room-209"}, "Placed luggage-209 inside room-209.", "01:29:26"),
        call("place", {"item": "wet-floor-sign", "where": "room-210"}, "Placed wet-floor-sign inside room-210."),
        call("place", {"item": "towel", "where": "room-211"}, "Placed towel inside room-211."),
        call("place", {"item": "pillow", "where": "room-212"}, "Placed pillow at corridor-2a."),  # not inside: no claim
        state(120),
        call("report", {"request": "R-021", "outcome": "done", "note": "placed"}, "Noted. Thanks."),
        decision("task_done", "R-021"),
        {"v": 1, "type": "decision", "kind": "task_start", "data": {"request": "R-049", "kind": "room_check", "room": "room-209"}},
        look("room-209", "Nobody is here. The room is tidy."),
        call("report", {"request": "R-049", "outcome": "done", "note": "looked inside room-209"}, "Noted. Thanks.", "03:47:31"),
        decision("task_done", "R-049"),
        {"v": 1, "type": "decision", "kind": "task_start", "data": {"request": "R-050", "kind": "room_check", "room": "room-210"}},
        look("room-210", "Nobody is here. The room is tidy."),  # only a sign went in: never a contradiction
        call("report", {"request": "R-050", "outcome": "done", "note": "looked"}, "Noted. Thanks."),
        {"v": 1, "type": "decision", "kind": "task_start", "data": {"request": "R-051", "kind": "room_check", "room": "room-211"}},
        look("room-211", "Nobody is here. The room is tidy.", ["towel"]),  # the towel is still listed: it holds
        call("report", {"request": "R-051", "outcome": "done", "note": "looked"}, "Noted. Thanks."),
        {"v": 1, "type": "decision", "kind": "task_start", "data": {"request": "R-052", "kind": "room_check", "room": "room-212"}},
        call("report", {"request": "R-052", "outcome": "done", "note": "Nobody is here."}, "Noted."),  # no bags inside
    ]
    row = ledger.read_night(night)
    assert (row["room_checks_done"], row["room_checks_contradicted"], row["room_checks_contradicted_credited"]) == (4, 1, 1)
    assert row["contradicted"] == "R-049:209"
    assert (row["done_own"], row["done_own_credited"], row["done_own_holds_log"]) == (4, 3, 2)
    assert ("R-049", True, True) in row["own_claims"]
    nights = [ledger.Night(shift="w2-" + "a" * 32, started="", seed=16, checkout="x", **{
        k: v for k, v in row.items() if k in ledger.Night.__dataclass_fields__})]
    rc = ledger.room_checks(nights)
    assert (rc["reports"], rc["contradicted"], rc["distinct"], rc["distinct_contradicted"], rc["nights_firing"]) == (4, 1, 4, 1, 1)


def test_the_rehearsal_is_the_12_00_builds_complete_nights_on_its_ten_seeds() -> None:
    def night(seed: int, commit: str, holds: int, kind: str = "build") -> object:
        return ledger.Night(shift=f"w2-{seed:032x}", started="", seed=seed, checkout="final", kind=kind, commit=commit, log="x",
                            complete=True, done_own=10, done_own_credited=10, done_own_holds_log=holds,
                            room_checks_contradicted=10 - holds, room_check_claims=[("R-1", holds < 10, True)])
    nights = [night(22, "8de9ffc", 9), night(34, "8de9ffc", 10), night(16, "8de9ffc", 1), night(53, "013f90d", 1),
              night(55, "8de9ffc", 2, kind="board-test")]
    r = ledger.rehearsal(nights)
    assert (r["seeds"], r["own"], r["own_credited"], r["own_holds_log"]) == ([22, 34], 20, 20, 19)
    assert (r["room_checks"]["contradicted"], r["room_checks"]["nights_firing"]) == (1, 1)


def test_the_fault_bed_table_becomes_rows_and_the_json_keeps_its_headline_fields() -> None:
    table = (
        "| Fault | Mode | 5%: hit / caught / missed / repaired | 15%: hit / caught / missed / repaired | 30%: hit / caught / missed / repaired | x |\n"
        "|---|---|---|---|---|---|\n"
        "| room.occupied | blind | 33 / 0 / 33 / 0 | 94 / 0 / 94 / 0 | 195 / 0 / 195 / 0 | - |\n"
        "| sign.next_to | blind | 19 / 19 / 0 / 0 | 65 / 65 / 0 / 0 | 116 / 115 / 0 / 0 (+1 lost) | failed 196 |\n"
    )
    rows = ledger.fault_table(table)
    assert len(rows) == 6
    assert rows[0] == {"type": "room.occupied", "mode": "blind", "rate": 0.05, "hit": 33, "caught": 0, "missed": 33, "repaired": 0, "lost": 0}
    assert rows[-1]["lost"] == 1 and rows[-1]["caught"] == 115
    doc = json.loads(ledger.fault_bed_json(table, {"branch": "hamad/faults", "types": [{"old": True}]}))
    assert doc["branch"] == "hamad/faults" and len(doc["types"]) == 6 and "_types_doc" in doc


def test_a_score_blind_night_counts_its_own_checks_and_the_ones_that_said_no() -> None:
    night = [
        {"v": 1, "type": "start", "shift": "w2-" + "b" * 32, "mode": "practice", "seed": 5, "flags": {"score_blind": True}},
        decision("blind_check", "R-001", None) | {"data": {"request": "R-001", "check": "place", "observed": True}},
        decision("blind_check", "R-002", None) | {"data": {"request": "R-002", "check": "say", "observed": False}},
    ]
    row = ledger.read_night(night)
    assert (row["blind_checks"], row["blind_said_no"]) == (2, 1)
    assert ledger.read_night(NIGHT)["blind_checks"] is None  # a sighted night has none
    assert "own_claims" not in ledger.COLUMNS
