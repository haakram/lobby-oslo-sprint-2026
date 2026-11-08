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
