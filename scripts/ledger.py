"""The evidence ledger: one row per live Night Shift practice shift, computed from the run logs.

Jury round 3, item C1 (the data juror, the Wybe juror): every agent number in the docs and on screen must come from a
file anyone can regenerate, not from hand-assembled tables. This script reads every live start the
agent logged (``temp/live_runs.jsonl`` in each checkout) and every run log it can find
(``temp/runs/*.jsonl``), and writes:

- ``docs/runs/ledger.csv``: one row per live start (logged or not), sorted by wall time, each with its
  ``kind`` (``build`` or ``board-test``, below);
- ``docs/runs/builds.csv``: one row per commit that played complete live nights as a build (mean, best,
  seeds); board tests are left out;
- ``src/features/nightshift/data/ledger.json``: the nights the app's judgement card counts, the fields
  it needs for its cross-night precision line;
- with ``--fidelity-from FILE``: ``docs/runs/replay-fidelity.csv`` and ``docs/runs/replay-fidelity.txt``
  from the replay bed's printed fidelity table (``python -m agent replaybench --fidelity`` on
  ``hamad/replaybed``: each live night replayed offline by the commit that played it). The bed's
  reward model is fitted on these same nights, so this error is in-sample: it shows the bed can
  reproduce a night, not that it ranks a changed policy right.

Only shifts listed in a ``live_runs.jsonl`` count as live; logs from the offline fake server are left
out. Read-only on the logs; it never calls the Wybe server.

Builds and board tests (``kind``). A night is a ``board-test`` when it was started from a checkout that
is a seed-specific board experiment, not a build of the agent:
- the named board checkouts under ~/oslo-wt: ``lottery``, ``lawet``, ``wetoff``, ``lafinal``,
  ``boardtune`` (``BOARD_CHECKOUTS``); or
- any checkout on a board branch (``…/board-…``, e.g. ``hamad/board-lottery2``), so a new board
  checkout is caught without a new name here; or
- any checkout whose working tree differs from its commit (tracked files changed against HEAD, by
  ``git status --untracked-files=no``, read when the ledger runs), so the commit is not what played.
Every other night is a ``build`` night. Board tests:
- stay in ledger.csv, marked ``kind=board-test`` (the best live score anywhere is one of them);
- are left out of builds.csv's per-commit rows, out of the judgement card's same-build figure and out
  of every "final build" figure: their commit, inferred from the checkout's HEAD, is not a build;
- count in the all-nights credited-"done" figure only when they are complete nights (the server ended
  them at 06:00): ledger.json holds complete board tests and leaves the rest out. Build nights count
  there when their log was found, complete or not.
The all-nights figure (the card's "Alle N live-netter med logg"): credited over reported "done", over
the ledger.json nights that reported at least one "done"; printed by this script.

How each column is computed (the same rules as the app, src/features/nightshift):
- ``done_reports``: ``report`` calls with outcome ``done`` that the server accepted (ok).
- ``done_credited``: those the server answered with its verified reply ("Noted. Thanks.").
- ``declines_credited`` / ``declines_not_credited``: ``report … declined`` calls whose score went up /
  did not go up between the last score seen before the report and the first one after it
  (``declines_pending``: no score after it, e.g. a log that stops there).
- ``score``: the ``end`` line's score, else the last score seen (``complete`` says which).
- ``commit``: from ``agent/data/replay_codes.json`` (the replay bed's map of who played which night)
  when listed there (``commit_source=replay_codes``); otherwise the checkout's first-parent HEAD at the
  start time, from ``git log --before`` (``commit_source=worktree_head``, an inference: uncommitted
  changes or a branch switch would not show).

Usage::

    python3 scripts/ledger.py                       # default roots: ~/oslo-wt/* and ~/Oslo_Sprint_26
    python3 scripts/ledger.py --root DIR [--root DIR]  # other checkouts
    python3 scripts/ledger.py --check               # exit 1 if the committed files are out of date
    python3 scripts/ledger.py --fidelity-from out.txt  # also the replay bed's fidelity table as CSV
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import subprocess
import sys
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

REPO = Path(__file__).resolve().parent.parent
OSLO = ZoneInfo("Europe/Oslo")
LEDGER_CSV = REPO / "docs" / "runs" / "ledger.csv"
BUILDS_CSV = REPO / "docs" / "runs" / "builds.csv"
LEDGER_JSON = REPO / "src" / "features" / "nightshift" / "data" / "ledger.json"
FIDELITY_CSV = REPO / "docs" / "runs" / "replay-fidelity.csv"
FIDELITY_TXT = REPO / "docs" / "runs" / "replay-fidelity.txt"

# Seed-specific board experiments, not builds (see the docstring): their nights are kind=board-test.
BOARD_CHECKOUTS = frozenset({"lottery", "lawet", "wetoff", "lafinal", "boardtune"})
BOARD_BRANCH = re.compile(r"(^|/)board-")
BUILD, BOARD_TEST = "build", "board-test"


def default_roots() -> list[Path]:
    home = Path.home()
    roots = sorted(p for p in (home / "oslo-wt").glob("*") if (p / "temp").is_dir())
    main = home / "Oslo_Sprint_26"
    return roots + ([main] if (main / "temp").is_dir() else [])


@dataclass
class Night:
    shift: str
    started: str  # ISO 8601, Europe/Oslo
    seed: int | None
    checkout: str
    kind: str = BUILD  # build | board-test
    note: str = ""
    commit: str = ""
    commit_source: str = ""
    log: str = ""  # path of the log read, relative to the home folder; "" when no log was found
    complete: bool = False
    end_reason: str = ""
    last_clock: str = ""
    score: int | None = None
    served: int | None = None
    requests: int | None = None
    done_reports: int | None = None
    done_credited: int | None = None
    done_not_credited: int | None = None
    declines: int | None = None
    declines_credited: int | None = None
    declines_not_credited: int | None = None
    declines_pending: int | None = None
    failed_reports: int | None = None
    calls: int | None = None
    calls_refused: int | None = None
    score_drops: int | None = None
    points_lost: int | None = None
    min_battery: float | None = None
    t: float = field(default=0.0, repr=False)


COLUMNS = [f for f in Night.__dataclass_fields__ if f != "t"]


def read_jsonl(path: Path) -> list[dict]:
    rows = []
    with path.open(encoding="utf-8") as fh:
        for raw in fh:
            raw = raw.strip()
            if not raw:
                continue
            try:
                value = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if isinstance(value, dict):
                rows.append(value)
    return rows


def score_of(line: dict) -> int | None:
    if line.get("type") == "state" and isinstance(line.get("score"), (int, float)):
        return int(line["score"])
    result = line.get("result")
    if line.get("type") == "call" and isinstance(result, dict) and isinstance(result.get("score"), (int, float)):
        return int(result["score"])
    return None


def read_night(lines: list[dict]) -> dict:
    """The per-night columns from one run log (lines already parsed)."""
    requests: set[str] = set()
    done_reports = done_credited = failed = calls = refused = drops = lost = 0
    declines: list[int] = []  # index of each declined report
    last_clock = ""
    min_battery: float | None = None
    end: dict | None = None
    last_score: int | None = None
    scores: list[tuple[int, int]] = []  # (index, score) in order
    for index, line in enumerate(lines):
        kind = line.get("type")
        if line.get("clock"):
            last_clock = str(line["clock"])
        score = score_of(line)
        if score is not None:
            if last_score is not None and score < last_score:
                drops += 1
                lost += last_score - score
            last_score = score
            scores.append((index, score))
        if kind == "state" and isinstance(line.get("battery"), (int, float)):
            battery = float(line["battery"])
            min_battery = battery if min_battery is None else min(min_battery, battery)
        if kind == "end":
            end = line
        if kind == "decision" and line.get("kind") == "request":
            request = (line.get("data") or {}).get("request")
            if isinstance(request, str):
                requests.add(request)
        if kind != "call":
            continue
        calls += 1
        if line.get("ok") is False:
            refused += 1
        cmd = line.get("cmd")
        args = line.get("args") if isinstance(line.get("args"), dict) else {}
        if cmd == "inbox" and isinstance(line.get("result"), dict):
            for message in line["result"].get("messages") or []:
                if isinstance(message, dict) and isinstance(message.get("request"), str):
                    requests.add(message["request"])
        if cmd == "report" and line.get("ok"):
            outcome = args.get("outcome")
            if outcome == "done":
                done_reports += 1
                if "thanks" in str(line.get("result", "")).lower():
                    done_credited += 1
            elif outcome == "declined":
                declines.append(index)
            elif outcome == "failed":
                failed += 1

    credited = not_credited = pending = 0
    for index in declines:
        before = next((s for i, s in reversed(scores) if i < index), None)
        after = next((s for i, s in scores if i > index), None)
        if before is None or after is None:
            pending += 1
        elif after > before:
            credited += 1
        else:
            not_credited += 1

    reason = str(end.get("reason", "")) if end else ""
    return {
        "complete": end is not None and reason == "server ended: time",
        "end_reason": reason if end else "no end line",
        "last_clock": last_clock,
        "score": int(end["score"]) if end and isinstance(end.get("score"), (int, float)) else last_score,
        "served": end.get("requests_served") if end else None,
        "requests": len(requests),
        "done_reports": done_reports,
        "done_credited": done_credited,
        "done_not_credited": done_reports - done_credited,
        "declines": len(declines),
        "declines_credited": credited,
        "declines_not_credited": not_credited,
        "declines_pending": pending,
        "failed_reports": failed,
        "calls": calls,
        "calls_refused": refused,
        "score_drops": drops,
        "points_lost": lost,
        "min_battery": round(min_battery, 1) if min_battery is not None else None,
    }


def commit_map(roots: list[Path]) -> dict[str, str]:
    """Shift-id prefix -> commit, the union of every checkout's replay bed map."""
    found: dict[str, str] = {}
    for root in roots:
        path = root / "agent" / "data" / "replay_codes.json"
        if not path.is_file():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        for key, value in data.items():
            commit = value.get("commit") if isinstance(value, dict) else value
            if key.startswith("w2-") and isinstance(commit, str):
                found.setdefault(key, commit)
    return found


def head_at(checkout: Path, t: float) -> str:
    try:
        out = subprocess.run(
            ["git", "-C", str(checkout), "log", "-1", "--first-parent", f"--before=@{int(t)}", "--format=%h"],
            capture_output=True, text=True, timeout=20, check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return ""
    return out.stdout.strip()[:7]


def tree_differs(checkout: Path) -> bool:
    """True when tracked files in the checkout differ from its HEAD (untracked files are not code that ran)."""
    try:
        out = subprocess.run(
            ["git", "-C", str(checkout), "status", "--porcelain", "--untracked-files=no"],
            capture_output=True, text=True, timeout=20, check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return False
    return out.returncode == 0 and bool(out.stdout.strip())


def branch_of(checkout: Path) -> str:
    try:
        out = subprocess.run(
            ["git", "-C", str(checkout), "rev-parse", "--abbrev-ref", "HEAD"],
            capture_output=True, text=True, timeout=20, check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return ""
    return out.stdout.strip() if out.returncode == 0 else ""


def kind_of(checkout: Path) -> str:
    board = checkout.name in BOARD_CHECKOUTS or BOARD_BRANCH.search(branch_of(checkout)) or tree_differs(checkout)
    return BOARD_TEST if board else BUILD


def collect(roots: list[Path]) -> list[Night]:
    home = Path.home()
    starts: dict[str, tuple[float, dict, Path]] = {}
    for root in roots:
        path = root / "temp" / "live_runs.jsonl"
        if not path.is_file():
            continue
        for entry in read_jsonl(path):
            shift, t = entry.get("shift"), entry.get("t")
            if not isinstance(shift, str) or not isinstance(t, (int, float)):
                continue
            if shift not in starts or t < starts[shift][0]:
                starts[shift] = (float(t), entry, root)

    # Every log per shift; the longest wins when two checkouts hold a copy.
    logs: dict[str, Path] = {}
    for root in roots:
        for path in (root / "temp" / "runs").glob("w2-*.jsonl"):
            shift = path.stem
            if shift not in logs or path.stat().st_size > logs[shift].stat().st_size:
                logs[shift] = path

    codes = commit_map(roots)
    kinds = {root: kind_of(root) for root in {root for _, _, root in starts.values()}}
    nights: list[Night] = []
    for shift, (t, entry, root) in starts.items():
        night = Night(
            shift=shift,
            started=datetime.fromtimestamp(t, OSLO).isoformat(timespec="seconds"),
            seed=entry.get("seed") if isinstance(entry.get("seed"), int) else None,
            checkout=root.name,
            kind=kinds[root],
            note=str(entry.get("note") or ""),
            t=t,
        )
        commit = next((c for key, c in codes.items() if shift.startswith(key)), None)
        if commit:
            night.commit, night.commit_source = commit[:7], "replay_codes"
        elif root.parent.name == "oslo-wt":
            head = head_at(root, t)
            if head:
                night.commit, night.commit_source = head, "worktree_head"
        log = logs.get(shift)
        if log is not None:
            lines = read_jsonl(log)
            for key, value in read_night(lines).items():
                setattr(night, key, value)
            try:
                night.log = str(log.relative_to(home))
            except ValueError:
                night.log = str(log)
            start = next((line for line in lines if line.get("type") == "start"), None)
            if night.seed is None and start and isinstance(start.get("seed"), int):
                night.seed = start["seed"]
        nights.append(night)
    nights.sort(key=lambda night: night.t)
    return nights


def ledger_csv(nights: list[Night]) -> str:
    out = io.StringIO()
    writer = csv.DictWriter(out, fieldnames=COLUMNS, lineterminator="\n")
    writer.writeheader()
    for night in nights:
        row = asdict(night)
        row.pop("t")
        writer.writerow({k: ("" if v is None else v) for k, v in row.items()})
    return out.getvalue()


def builds_csv(nights: list[Night]) -> str:
    by_commit: dict[str, list[Night]] = defaultdict(list)
    for night in nights:
        if night.kind == BUILD and night.complete and night.commit and night.score is not None:
            by_commit[night.commit].append(night)
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\n")
    writer.writerow(["commit", "commit_source", "first_start", "nights", "mean_score", "best_score", "best_seed",
                     "seeds", "scores", "done_reports", "done_credited", "declines_credited",
                     "declines_not_credited"])
    for commit, group in sorted(by_commit.items(), key=lambda item: min(n.t for n in item[1])):
        best = max(group, key=lambda n: n.score or 0)
        writer.writerow([
            commit,
            "/".join(sorted({n.commit_source for n in group})),
            min(group, key=lambda n: n.t).started,
            len(group),
            round(sum(n.score or 0 for n in group) / len(group), 1),
            best.score,
            best.seed,
            " ".join(str(n.seed) for n in group),
            " ".join(str(n.score) for n in group),
            sum(n.done_reports or 0 for n in group),
            sum(n.done_credited or 0 for n in group),
            sum(n.declines_credited or 0 for n in group),
            sum(n.declines_not_credited or 0 for n in group),
        ])
    return out.getvalue()


def counted(nights: list[Night]) -> list[Night]:
    """The nights the all-nights figure counts: logged build nights, and board tests only when complete."""
    return [n for n in nights if n.log and (n.kind == BUILD or n.complete)]


def precision(nights: list[Night]) -> tuple[int, int, int]:
    """(nights, credited, reported) "done" over the nights that reported at least one, as the card counts."""
    with_done = [n for n in nights if (n.done_reports or 0) > 0]
    return len(with_done), sum(n.done_credited or 0 for n in with_done), sum(n.done_reports or 0 for n in with_done)


def ledger_json(nights: list[Night]) -> str:
    keep = ["shift", "started", "seed", "commit", "kind", "complete", "score", "done_reports", "done_credited",
            "declines_credited", "declines_not_credited"]
    rows = [{k: asdict(n)[k] for k in keep} for n in counted(nights)]
    doc = {
        "_doc": "Generated by scripts/ledger.py from the live run logs; do not edit. One row per live "
                "practice shift whose log was found, board tests (kind=board-test) only when complete "
                "(docs/runs/ledger.csv has every live start).",
        "nights": rows,
    }
    return json.dumps(doc, ensure_ascii=False, indent=1) + "\n"


def fidelity_csv(table: str, nights: list[Night]) -> str:
    """The replay bed's fidelity table (one line per night, then a ``mean`` line) as CSV rows, each joined
    to the ledger by its shift-id prefix. Nights the bed could not replay keep its note."""
    by_prefix = {night.shift[:12]: night for night in nights}
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\n")
    writer.writerow(["shift", "started", "seed", "live_score", "replay_score", "delta", "delta_pct", "replayed_by",
                     "note"])
    for raw in table.splitlines():
        parts = raw.split()
        if len(parts) < 4 or not parts[1].startswith("w2-"):
            continue
        night = by_prefix.get(parts[1])
        seed, live, replay = parts[0], parts[2], parts[3]
        if replay == "-":
            note = raw[raw.index("(") + 1:raw.rindex(")")].strip() if "(" in raw and ")" in raw else ""
            row = ["", "", "", "", note]
        else:
            delta, pct, code = parts[4], parts[5].rstrip("%"), parts[7]
            note = " ".join(parts[8:])
            row = [replay, delta.lstrip("+"), pct.lstrip("+"), code, note]
        writer.writerow([night.shift if night else parts[1], night.started if night else "", seed, live, *row])
    return out.getvalue()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--root", action="append", type=Path, help="a checkout with temp/live_runs.jsonl")
    parser.add_argument("--check", action="store_true", help="exit 1 if the committed files differ")
    parser.add_argument("--fidelity-from", type=Path, help="the printed output of replaybench --fidelity")
    args = parser.parse_args(argv)
    roots = [p.expanduser().resolve() for p in args.root] if args.root else default_roots()
    nights = collect(roots)
    outputs = {LEDGER_CSV: ledger_csv(nights), BUILDS_CSV: builds_csv(nights), LEDGER_JSON: ledger_json(nights)}
    if args.fidelity_from:
        table = args.fidelity_from.read_text(encoding="utf-8")
        outputs[FIDELITY_CSV] = fidelity_csv(table, nights)
        outputs[FIDELITY_TXT] = table
    if args.check:
        stale = [p for p, text in outputs.items() if not p.is_file() or p.read_text(encoding="utf-8") != text]
        for path in stale:
            print(f"out of date: {path.relative_to(REPO)}", file=sys.stderr)
        return 1 if stale else 0
    for path, text in outputs.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    logged = [n for n in nights if n.log]
    complete = [n for n in logged if n.complete]
    board = [n for n in nights if n.kind == BOARD_TEST]
    print(f"{len(nights)} live starts, {len(logged)} with a log, {len(complete)} complete nights; "
          f"{len(board)} board tests ({sum(1 for n in board if n.complete)} complete)")
    count, credited, reports = precision(counted(nights))
    if reports:
        print(f"all nights (the card's figure): {credited} of {reports} 'done' credited over {count} nights "
              f"({100 * credited / reports:.1f} %)")
    builds = [n for n in complete if n.kind == BUILD and n.score is not None]
    if builds:
        best = max(builds, key=lambda n: n.score or 0)
        print(f"best build night: {best.score} (seed {best.seed}, {best.commit or 'commit unknown'})")
    best_any = max((n for n in complete if n.score is not None), key=lambda n: n.score or 0, default=None)
    if best_any:
        print(f"best live night anywhere: {best_any.score} (seed {best_any.seed}, {best_any.kind}, {best_any.checkout})")
    for path in outputs:
        print(f"wrote {path.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
