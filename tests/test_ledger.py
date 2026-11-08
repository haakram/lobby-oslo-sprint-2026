"""scripts/ledger.py: the evidence ledger computed from live run logs (jury round 3, item C1)."""

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
