"""The evidence ledger: one row per live Night Shift practice shift, computed from the run logs.

Review round 3, item C1 (data and domain reviews): every agent number in the docs and on screen must come from a
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
  ``boardtune``, ``hotelrules`` (the hotel-rules cost experiment) (``BOARD_CHECKOUTS``); or
- any checkout on a board branch (``…/board-…``, e.g. ``hamad/board-lottery2``), so a new board
  checkout is caught without a new name here; or
- any checkout whose working tree differs from its commit (tracked files changed against HEAD, by
  ``git status --untracked-files=no``, read when the ledger runs), so the commit is not what played.
A night is an ``experiment`` when its log's ``start`` line says so: the flags in force carry
``score_blind: true`` (the score-blind runs on ``hamad/blind``: the agent never reads the score, so every
"done" it says is its own judgement). Experiments are kept like board tests (in ledger.csv, out of builds.csv
and every build figure, in the all-nights figure only when complete) and get their own printed line.
When the ``start`` line carries the code version (``build: {commit, dirty}``, newer agents), that commit wins
over the two inferences below (``commit_source=start_line``), and ``dirty: true`` makes a build night a
board test: the commit is not what played, decided when the night ran, not when the ledger runs.
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
- ``done_after_rise`` / ``done_own`` (round 4, data and domain reviews): what each "done" rested on. After the
  rise: a score the robot saw between the request's last ``task_start`` and its report was higher than the
  score before it, so the simulator's referee had confirmed the work before the robot said "done" (the
  agent's ``_deliver``/``message`` flows read that rise). Own judgement: no rise during the task; the robot
  said "done" from what it saw. ``done_own_credited`` of those were credited; ``done_room_check`` /
  ``done_spill`` (and ``…_credited``) split them by the task's kind. ``done_basis_unknown``: no
  ``task_start`` line for the request (the earliest logs). The app's ``doneBasis``
  (src/features/nightshift/conduct.ts) runs the same rule on the night on screen.
- ``declines_credited`` / ``declines_not_credited``: ``report … declined`` calls whose score went up /
  did not go up between the last score seen before the report and the first one after it
  (``declines_pending``: no score after it, e.g. a log that stops there).
- ``room_checks_done`` / ``room_checks_contradicted`` / ``done_own_holds_log`` (review round 6, the data and domain
  reviews): the card's self-contradiction rule (``selfContradictions`` in src/features/nightshift/conduct.ts) over
  every night, not only the demo night. A room check reported "done" is contradicted when the robot had placed a
  non-sign item "inside" that room earlier the same night (the server's reply said "inside"), its last bare look
  in the room (else its report note) reads "nobody is here", "empty" or "tidy", and the look's objects do not list
  that item (209 on the demo night: bags placed 01:29, "Nobody is here. The room is tidy." 03:47).
  ``room_checks_contradicted_credited``: of those, how many the simulator credited anyway (the simulator removes
  delivered bags from the room, so its room-check credit cannot see them). ``done_own_holds_log``: own-judgement
  "done" that were credited and that no contradiction disputes (the card's ``ownAgainstLog``). ``contradicted``:
  the requests, ``R-049:209``.
- ``blind_checks`` / ``blind_said_no`` (score-blind nights only): the agent's ``blind_check`` decisions, and how
  many of them observed the work as not done (``observed: false``). Zero "no" means the robot's own check never
  disagreed on those nights: the score was not needed there, which says nothing yet about how well the check
  catches a failure (round 5, data and domain reviews).
- Distinct claims (printed, and ``distinct_own`` in ledger.json; round 5, data review): the final branch's
  own-judgement "done" counted once per (seed, request), since its builds replay the same deterministic
  seeds; a claim is credited only when every report of it was. With a Wilson 95 % interval, as is the demo
  night's own-judgement figure (``public/runs/demo.jsonl``). A claim holds against the robot's own log when it was
  credited and no report of it was contradicted (``holds_log``, with its own interval; review round 6).
- The dress rehearsal (``rehearsal`` in ledger.json; review round 6): the build that plays at 12:00
  (``REHEARSAL_BUILD``) on the ten seeds no build had played (``REHEARSAL_SEEDS``, the same as scripts/forecast.py):
  own-judgement "done" credited and holding against its own log, room checks contradicted and on how many nights.
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
    python3 scripts/ledger.py --faults-from real.md    # also the fault bed's per-type table (hamad/faults)
    python3 scripts/ledger.py --bundle docs/runs/logs  # copy the logs behind the build-level figures, with a manifest
    python3 scripts/ledger.py --root docs/runs/logs --check  # rebuild those figures from the copies alone

``docs/runs/summary.txt`` holds the printed summary (every figure README and DEMO quote), so ``--check`` also
catches a figure that moved.

The log bundle (review round 7, data review: "can anyone regenerate your ledger?"). The default roots are checkouts on
one laptop; ``docs/runs/logs/`` holds a committed copy of the 28 logs the build-level figures rest on: the final
branch's last four builds' complete nights (18, the demo night among them) and the dress rehearsal (10).
``manifest.csv`` lists each with what a log alone cannot say, taken from the full ledger when the bundle was written:
the start time from ``live_runs.jsonl`` (``t``, ``started``), the checkout, the night's ``kind``, its ``commit`` and
``commit_source``; then its line count, size and SHA-256 (``SHA256SUMS`` has the same digests for
``shasum -a 256 -c``). A root holding a ``manifest.csv`` is read as a bundle: every listed log is checked against its
digest and read by the same rules as above (a stamped commit still wins). With ``--check`` it compares what the 28 logs
rebuild with the committed files: ``builds.csv``'s rows for their commits, the summary's build-level lines (the final
branch's split, distinct claims, holding against its own log and room checks; the rehearsal; the demo night) and
``ledger.json``'s ``distinct_own``, ``room_checks_final`` and ``rehearsal``. Figures over all nights (the all-nights
precision, the best night anywhere) need every log and are not in the bundle. scripts/check.sh runs that check.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
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
SUMMARY_TXT = REPO / "docs" / "runs" / "summary.txt"
FAULT_TABLE_MD = REPO / "docs" / "runs" / "fault-bed-real.md"
FAULT_BED_JSON = REPO / "src" / "features" / "nightshift" / "data" / "fault-bed.json"
DEMO_LOG = REPO / "public" / "runs" / "demo.jsonl"
# The log bundle (docs/runs/logs, see the docstring): its manifest, its digests, and what --check compares.
BUNDLE_MANIFEST = "manifest.csv"
BUNDLE_SUMS = "SHA256SUMS"
MANIFEST_COLUMNS = ["shift", "seed", "t", "started", "checkout", "kind", "commit", "commit_source", "lines", "bytes",
                    "sha256"]
BUILD_LINES = ("done split, final branch's", "distinct own-judgement claims", "  holding against",
               "  room checks contradicted", "dress rehearsal", "demo night")
BUILD_JSON = ("distinct_own", "room_checks_final", "rehearsal")

# Seed-specific board experiments, not builds (see the docstring): their nights are kind=board-test.
BOARD_CHECKOUTS = frozenset({"lottery", "lawet", "wetoff", "lafinal", "boardtune", "hotelrules"})  # hotelrules: the hotel-rules cost experiment (NS_HOTEL_RULES=1)
BOARD_BRANCH = re.compile(r"(^|/)board-")
BUILD, BOARD_TEST, EXPERIMENT = "build", "board-test", "experiment"
# The final branch's last four builds (hamad/final, the README's "18 nights"): the done split is also
# printed over their complete build nights. A list, not a rule: a later build is added here by hand.
FINAL_BUILDS = ("d4e445c", "cb72845", "8eac151", "c3801e0")
# The dress rehearsal (Sun 05:02): the build that plays at 12:00 on ten seeds no build had played. The seeds are
# scripts/forecast.py's REHEARSAL_SEEDS; 013f90d has the same agent code but played tuned seeds, so it is not here.
REHEARSAL_BUILD = "8de9ffc"
REHEARSAL_SEEDS = (22, 34, 53, 55, 67, 70, 78, 83, 86, 93)

# The card's self-contradiction rule (conduct.ts `selfContradictions`): a finding that calls the room empty.
EMPTY_FINDING = re.compile(r"nobody is here|\bempty\b|\btidy\b", re.I)
INSIDE = re.compile(r"\binside\b", re.I)
SIGN_ITEM = re.compile(r"wet-floor-sign")


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
    done_after_rise: int | None = None
    done_own: int | None = None
    done_own_credited: int | None = None
    done_room_check: int | None = None
    done_room_check_credited: int | None = None
    done_spill: int | None = None
    done_spill_credited: int | None = None
    done_basis_unknown: int | None = None
    room_checks_done: int | None = None
    room_checks_contradicted: int | None = None
    room_checks_contradicted_credited: int | None = None
    done_own_holds_log: int | None = None
    contradicted: str = ""
    blind_checks: int | None = None
    blind_said_no: int | None = None
    t: float = field(default=0.0, repr=False)
    # (request, credited, contradicted) for every "done" said on the robot's own judgement: the distinct-claim count.
    own_claims: list = field(default_factory=list, repr=False)
    # (request, contradicted, credited) for every room check reported "done", whatever it rested on.
    room_check_claims: list = field(default_factory=list, repr=False)


HIDDEN = ("t", "own_claims", "room_check_claims")
COLUMNS = [f for f in Night.__dataclass_fields__ if f not in HIDDEN]


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


def start_line(lines: list[dict]) -> dict:
    return next((line for line in lines if line.get("type") == "start"), {})


def score_blind(lines: list[dict]) -> bool:
    flags = start_line(lines).get("flags")
    return isinstance(flags, dict) and flags.get("score_blind") is True


def read_night(lines: list[dict]) -> dict:
    """The per-night columns from one run log (lines already parsed). A score-blind night's "done" are all
    the robot's own judgement: the agent never read the score, whatever the log recorded of it."""
    blind = score_blind(lines)
    requests: set[str] = set()
    done_reports = done_credited = failed = calls = refused = drops = lost = 0
    declines: list[int] = []  # index of each declined report
    last_clock = ""
    min_battery: float | None = None
    end: dict | None = None
    last_score: int | None = None
    scores: list[tuple[int, int]] = []  # (index, score) in order
    basis = {"after_rise": 0, "own": 0, "own_credited": 0, "room_check": 0, "room_check_credited": 0, "spill": 0,
             "spill_credited": 0, "unknown": 0}
    open_tasks: dict[str, list] = {}  # request -> [kind, rose since its task_start]
    own_claims: list[tuple[str, bool, bool]] = []
    blind_checks = blind_said_no = 0
    # The self-contradiction rule (conduct.ts `selfContradictions`), in the same pass.
    task_rooms: dict[str, tuple] = {}  # request -> (kind, room) from its last task_start
    placed: dict[str, list[str]] = {}  # "room-209" -> items placed inside it tonight (no signs)
    looks: dict[str, tuple[list[str], str | None]] = {}  # place -> (objects, description) of the last bare look
    room_check_claims: list[tuple[str, bool, bool]] = []
    contradicted: list[str] = []
    own_holds_log = 0
    for index, line in enumerate(lines):
        kind = line.get("type")
        if line.get("clock"):
            last_clock = str(line["clock"])
        score = score_of(line)
        if score is not None:
            if last_score is not None and score < last_score:
                drops += 1
                lost += last_score - score
            if last_score is not None and score > last_score and not blind:
                for task in open_tasks.values():
                    task[1] = True
            last_score = score
            scores.append((index, score))
        if kind == "state" and isinstance(line.get("battery"), (int, float)):
            battery = float(line["battery"])
            min_battery = battery if min_battery is None else min(min_battery, battery)
        if kind == "end":
            end = line
        if kind == "decision" and line.get("kind") in ("task_start", "task_done", "task_failed"):
            request = (line.get("data") or {}).get("request")
            if isinstance(request, str):
                if line["kind"] == "task_start":
                    open_tasks[request] = [(line.get("data") or {}).get("kind"), False]
                    task_rooms[request] = ((line.get("data") or {}).get("kind"), (line.get("data") or {}).get("room"))
                else:
                    open_tasks.pop(request, None)
        if kind == "decision" and line.get("kind") == "blind_check":
            blind_checks += 1
            blind_said_no += (line.get("data") or {}).get("observed") is False
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
        if cmd == "place" and line.get("ok"):
            item, where = args.get("item"), args.get("where")
            reply = line.get("result") if isinstance(line.get("result"), str) else ""
            if (isinstance(item, str) and item and isinstance(where, str) and where.startswith("room-")
                    and INSIDE.search(reply) and not SIGN_ITEM.search(item)):
                items = placed.setdefault(where, [])
                if item not in items:
                    items.append(item)
        if cmd == "look" and line.get("ok") and not args.get("at") and isinstance(line.get("result"), dict):
            result = line["result"]
            at = result.get("location")
            if isinstance(at, str) and at:
                objects = [o if isinstance(o, str) else (o.get("name") if isinstance(o, dict) and isinstance(o.get("name"), str) else "")
                           for o in (result.get("objects") if isinstance(result.get("objects"), list) else [])]
                description = result.get("description") if isinstance(result.get("description"), str) else None
                looks[at] = (objects, description)
        if cmd == "report" and line.get("ok"):
            outcome = args.get("outcome")
            if outcome == "done":
                done_reports += 1
                thanked = "thanks" in str(line.get("result", "")).lower()
                done_credited += thanked
                request = str(args.get("request"))
                disputed = False
                kind_room = task_rooms.get(request)
                if kind_room and kind_room[0] == "room_check" and isinstance(kind_room[1], str) and kind_room[1]:
                    room = kind_room[1]
                    items = placed.get(room, [])
                    look = looks.get(room)
                    note = args.get("note") if isinstance(args.get("note"), str) else None
                    finding = look[1] if look and look[1] is not None else note
                    seen = look[0] if look else []
                    disputed = bool(items) and bool(EMPTY_FINDING.search(finding or "")) and any(i not in seen for i in items)
                    room_check_claims.append((request, disputed, bool(thanked)))
                    if disputed:
                        contradicted.append(f"{request}:{room[5:] if room.startswith('room-') else room}")
                task = open_tasks.get(request)
                if task is None:
                    basis["unknown"] += 1
                elif task[1]:
                    basis["after_rise"] += 1
                else:
                    basis["own"] += 1
                    basis["own_credited"] += thanked
                    own_holds_log += bool(thanked) and not disputed
                    own_claims.append((request, bool(thanked), disputed))
                    if task[0] in ("room_check", "spill"):
                        basis[task[0]] += 1
                        basis[f"{task[0]}_credited"] += thanked
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
        **{f"done_{key}" if key != "unknown" else "done_basis_unknown": value for key, value in basis.items()},
        "room_checks_done": len(room_check_claims),
        "room_checks_contradicted": sum(1 for _, disputed, _ in room_check_claims if disputed),
        "room_checks_contradicted_credited": sum(1 for _, disputed, credited in room_check_claims if disputed and credited),
        "done_own_holds_log": own_holds_log,
        "contradicted": " ".join(contradicted),
        "blind_checks": blind_checks if blind else None,
        "blind_said_no": blind_said_no if blind else None,
        "own_claims": own_claims,
        "room_check_claims": room_check_claims,
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
            try:
                where = str(log.relative_to(home))
            except ValueError:
                where = str(log)
            read_into(night, read_jsonl(log), where)
        nights.append(night)
    nights.sort(key=lambda night: night.t)
    return nights


def read_into(night: Night, lines: list[dict], log: str) -> None:
    """A night's columns from its log, then what its start line says (the seed, a stamped commit, a dirty tree, a
    score-blind run), which wins over what was inferred from the checkout."""
    for key, value in read_night(lines).items():
        setattr(night, key, value)
    night.log = log
    start = start_line(lines)
    if night.seed is None and isinstance(start.get("seed"), int):
        night.seed = start["seed"]
    stamp = start.get("build")
    if isinstance(stamp, dict) and isinstance(stamp.get("commit"), str) and stamp["commit"]:
        night.commit, night.commit_source = stamp["commit"][:7], "start_line"
        if stamp.get("dirty") is True and night.kind == BUILD:
            night.kind = BOARD_TEST
    if score_blind(lines):
        night.kind = EXPERIMENT


def bundle_nights(nights: list[Night]) -> list[Night]:
    """The nights behind the build-level figures: the final branch's last four builds' complete nights, the dress
    rehearsal and the demo night (one of the first), by wall time."""
    final = [n for n in nights if n.log and n.complete and n.kind == BUILD and n.commit in FINAL_BUILDS]
    demo = DEMO_LOG.is_file() and start_line(read_jsonl(DEMO_LOG)).get("shift")
    chosen = {n.shift: n for n in [*final, *rehearsal_nights(nights), *(n for n in nights if n.log and n.shift == demo)]}
    return sorted(chosen.values(), key=lambda n: n.t)


def write_bundle(nights: list[Night], out: Path) -> list[Night]:
    """Copy the logs behind the build-level figures into `out`, with manifest.csv and SHA256SUMS (see the docstring)."""
    out.mkdir(parents=True, exist_ok=True)
    manifest = io.StringIO()
    writer = csv.writer(manifest, lineterminator="\n")
    writer.writerow(MANIFEST_COLUMNS)
    sums = []
    chosen = bundle_nights(nights)
    for n in chosen:
        source = Path(n.log) if Path(n.log).is_absolute() else Path.home() / n.log
        data = source.read_bytes()
        (out / f"{n.shift}.jsonl").write_bytes(data)
        digest = hashlib.sha256(data).hexdigest()
        writer.writerow([n.shift, "" if n.seed is None else n.seed, repr(n.t), n.started, n.checkout, n.kind, n.commit,
                         n.commit_source, data.count(b"\n"), len(data), digest])
        sums.append(f"{digest}  {n.shift}.jsonl\n")
    (out / BUNDLE_MANIFEST).write_text(manifest.getvalue(), encoding="utf-8")
    (out / BUNDLE_SUMS).write_text("".join(sums), encoding="utf-8")
    return chosen


def collect_bundle(root: Path) -> tuple[list[Night], list[str]]:
    """The nights of a log bundle: every log its manifest lists, checked against its SHA-256 and read by the same
    rules as a checkout's (read_into). Also returns what did not check out (a missing, changed or unlisted log)."""
    with (root / BUNDLE_MANIFEST).open(encoding="utf-8", newline="") as fh:
        rows = list(csv.DictReader(fh))
    listed = {row["shift"] for row in rows}
    problems = [f"not in the manifest: {path.name}" for path in sorted(root.glob("w2-*.jsonl")) if path.stem not in listed]
    nights: list[Night] = []
    for row in rows:
        path = root / f"{row['shift']}.jsonl"
        if not path.is_file():
            problems.append(f"missing: {path.name}")
            continue
        if hashlib.sha256(path.read_bytes()).hexdigest() != row["sha256"]:
            problems.append(f"SHA-256 differs from the manifest: {path.name}")
            continue
        night = Night(shift=row["shift"], started=row["started"], seed=int(row["seed"]) if row["seed"] else None,
                      checkout=row["checkout"], kind=row["kind"], commit=row["commit"],
                      commit_source=row["commit_source"], t=float(row["t"]))
        try:
            where = str(path.relative_to(REPO))
        except ValueError:
            where = str(path)
        read_into(night, read_jsonl(path), where)
        nights.append(night)
    nights.sort(key=lambda night: night.t)
    return nights, problems


def bundle_figures(nights: list[Night]) -> tuple[dict[str, str], list[str], dict]:
    """What a bundle rebuilds: builds.csv's rows by commit, the summary's build-level lines, ledger.json's sections."""
    rows = builds_csv(nights).splitlines()[1:]
    lines = [line for line in summary(nights).splitlines() if line.startswith(BUILD_LINES)]
    doc = json.loads(ledger_json(nights))
    return {row.split(",", 1)[0]: row for row in rows}, lines, {key: doc[key] for key in BUILD_JSON}


def check_bundle(root: Path, check: bool) -> int:
    """Print what the bundle's logs rebuild; with `check`, compare it with the committed files (exit 1 on a difference)."""
    nights, problems = collect_bundle(root)
    rows, lines, sections = bundle_figures(nights)
    if not check:
        sys.stdout.write("".join(f"{line}\n" for line in lines) + "".join(f"{row}\n" for row in rows.values()))
        for problem in problems:
            print(problem, file=sys.stderr)
        return 1 if problems else 0
    committed_rows = {row.split(",", 1)[0]: row for row in BUILDS_CSV.read_text(encoding="utf-8").splitlines()[1:]}
    for commit, row in rows.items():
        if committed_rows.get(commit) != row:
            problems.append(f"builds.csv row {commit} differs:\n  logs:      {row}\n  committed: {committed_rows.get(commit)}")
    committed_lines = [line for line in SUMMARY_TXT.read_text(encoding="utf-8").splitlines() if line.startswith(BUILD_LINES)]
    if lines != committed_lines:
        problems.append("summary.txt build-level lines differ:\n" + "\n".join(f"  logs:      {line}" for line in lines)
                        + "\n" + "\n".join(f"  committed: {line}" for line in committed_lines))
    committed_doc = json.loads(LEDGER_JSON.read_text(encoding="utf-8"))
    for key, value in sections.items():
        if committed_doc.get(key) != value:
            problems.append(f"ledger.json {key} differs")
    for problem in problems:
        print(problem, file=sys.stderr)
    if not problems:
        print(f"{len(nights)} logs match their SHA-256; they rebuild builds.csv's {len(rows)} rows "
              f"({', '.join(rows)}), the summary's {len(lines)} build-level lines and ledger.json's "
              f"{', '.join(sections)}")
    return 1 if problems else 0


def ledger_csv(nights: list[Night]) -> str:
    out = io.StringIO()
    writer = csv.DictWriter(out, fieldnames=COLUMNS, lineterminator="\n")
    writer.writeheader()
    for night in nights:
        row = asdict(night)
        for hidden in HIDDEN:
            row.pop(hidden)
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
                     "declines_not_credited", "done_after_rise", "done_own", "done_own_credited", "done_own_holds_log",
                     "room_checks_done", "room_checks_contradicted"])
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
            sum(n.done_after_rise or 0 for n in group),
            sum(n.done_own or 0 for n in group),
            sum(n.done_own_credited or 0 for n in group),
            sum(n.done_own_holds_log or 0 for n in group),
            sum(n.room_checks_done or 0 for n in group),
            sum(n.room_checks_contradicted or 0 for n in group),
        ])
    return out.getvalue()


def counted(nights: list[Night]) -> list[Night]:
    """The nights the all-nights figure counts: logged build nights, and board tests only when complete."""
    return [n for n in nights if n.log and (n.kind == BUILD or n.complete)]


def precision(nights: list[Night]) -> tuple[int, int, int]:
    """(nights, credited, reported) "done" over the nights that reported at least one, as the card counts."""
    with_done = [n for n in nights if (n.done_reports or 0) > 0]
    return len(with_done), sum(n.done_credited or 0 for n in with_done), sum(n.done_reports or 0 for n in with_done)


def basis_split(nights: list[Night]) -> dict[str, int]:
    """The done split summed over `nights`: after the rise, own judgement (credited), by kind, unknown."""
    keys = ["done_reports", "done_credited", "done_after_rise", "done_own", "done_own_credited", "done_room_check",
            "done_room_check_credited", "done_spill", "done_spill_credited", "done_basis_unknown"]
    return {key: sum(getattr(n, key) or 0 for n in nights) for key in keys}


def basis_text(label: str, nights: list[Night]) -> str:
    s = basis_split(nights)
    own = f"{s['done_own_credited']} of {s['done_own']}"
    if s["done_own"]:
        own += f" ({100 * s['done_own_credited'] / s['done_own']:.1f} %)"
    other = s["done_own"] - s["done_room_check"] - s["done_spill"]
    other_credited = s["done_own_credited"] - s["done_room_check_credited"] - s["done_spill_credited"]
    return (f"{label} ({len(nights)} nights): {s['done_reports']} 'done'; {s['done_after_rise']} after the score rose; "
            f"own judgement {own}: room checks {s['done_room_check_credited']} of {s['done_room_check']}, "
            f"spills {s['done_spill_credited']} of {s['done_spill']}, other {other_credited} of {other}"
            + (f"; basis unknown {s['done_basis_unknown']}" if s["done_basis_unknown"] else ""))


def wilson(successes: int, n: int, z: float = 1.959964) -> tuple[float, float]:
    """The Wilson score interval for successes of n (95 % by default): honest at small n and at 100 %."""
    if n == 0:
        return (0.0, 1.0)
    p = successes / n
    denom = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = z * ((p * (1 - p) / n + z * z / (4 * n * n)) ** 0.5) / denom
    return (max(0.0, centre - half), min(1.0, centre + half))


def distinct_own(nights: list[Night]) -> dict:
    """The robot's own-judgement "done" over `nights`, counted once per (seed, request), not once per replay
    (round 5, data review: four near-identical builds on the same deterministic seeds repeat the same
    claims). A distinct claim counts as credited only when every report of it was credited. It holds against the
    robot's own log (review round 6) when it was credited and no report of it was contradicted (the self-contradiction
    rule above)."""
    claims: dict[tuple, bool] = {}
    disputed: dict[tuple, bool] = {}
    reports = 0
    for night in nights:
        for request, credited, contradicted in night.own_claims:
            reports += 1
            key = (night.seed, request)
            claims[key] = claims.get(key, True) and credited
            disputed[key] = disputed.get(key, False) or contradicted
    credited = sum(claims.values())
    holds = sum(1 for key, ok in claims.items() if ok and not disputed[key])
    low, high = wilson(credited, len(claims))
    log_low, log_high = wilson(holds, len(claims))
    missed = sorted(f"{seed}/{request}" for (seed, request), ok in claims.items() if not ok)
    against = sorted(f"{seed}/{request}" for (seed, request), bad in disputed.items() if bad)
    return {"nights": len(nights), "reports": reports, "claims": len(claims), "credited": credited,
            "ci95": [round(low, 4), round(high, 4)], "missed": missed,
            "holds_log": holds, "ci95_log": [round(log_low, 4), round(log_high, 4)], "contradicted": against}


def room_checks(nights: list[Night]) -> dict:
    """Room checks reported "done" over `nights` and how many the robot's own log contradicts: per report, and
    once per (seed, request) (a distinct check is contradicted when any report of it was); `contradicted_credited`:
    of the contradicted reports, how many the simulator credited anyway; `nights_firing`: nights with at least one."""
    distinct: dict[tuple, bool] = {}
    reports = contradicted = credited = 0
    for night in nights:
        for request, disputed, thanked in night.room_check_claims:
            reports += 1
            contradicted += disputed
            credited += disputed and thanked
            key = (night.seed, request)
            distinct[key] = distinct.get(key, False) or disputed
    return {"nights": len(nights), "nights_firing": sum(1 for n in nights if n.room_checks_contradicted),
            "reports": reports, "contradicted": contradicted, "contradicted_credited": credited,
            "distinct": len(distinct), "distinct_contradicted": sum(distinct.values())}


def rehearsal_nights(nights: list[Night]) -> list[Night]:
    """The dress rehearsal: REHEARSAL_BUILD's complete build nights on REHEARSAL_SEEDS, in seed order."""
    found = [n for n in nights if n.log and n.complete and n.kind == BUILD and n.commit == REHEARSAL_BUILD
             and n.seed in REHEARSAL_SEEDS]
    return sorted(found, key=lambda n: n.seed or 0)


def rehearsal(nights: list[Night]) -> dict:
    """The rehearsal's own-judgement "done" against the simulator and against the robot's own log, and its room checks."""
    group = rehearsal_nights(nights)
    s = basis_split(group)
    holds = sum(n.done_own_holds_log or 0 for n in group)
    low, high = wilson(holds, s["done_own"])
    return {"build": REHEARSAL_BUILD, "seeds": [n.seed for n in group], "nights": len(group),
            "own": s["done_own"], "own_credited": s["done_own_credited"], "own_holds_log": holds,
            "ci95_log": [round(low, 4), round(high, 4)], "room_checks": room_checks(group)}


def ci_text(ci: list[float] | tuple[float, float], credited: int, n: int) -> str:
    """"92-99.7 %": whole per cent, one decimal where a whole number would round up to 100 % with a miss."""
    low, high = 100 * ci[0], 100 * ci[1]
    top = f"{high:.1f}" if credited < n and round(high) >= 100 else f"{high:.0f}"
    return f"{low:.0f}-{top} %"


def ledger_json(nights: list[Night]) -> str:
    keep = ["shift", "started", "seed", "commit", "kind", "complete", "score", "done_reports", "done_credited",
            "declines_credited", "declines_not_credited", "done_after_rise", "done_own", "done_own_credited",
            "done_room_check", "done_room_check_credited", "done_spill", "done_spill_credited", "done_own_holds_log",
            "room_checks_done", "room_checks_contradicted"]
    rows = []
    for n in counted(nights):
        row = {k: getattr(n, k) for k in keep}
        if n.kind == EXPERIMENT:
            row["blind_checks"], row["blind_said_no"] = n.blind_checks, n.blind_said_no
        rows.append(row)
    final = [n for n in nights if n.log and n.complete and n.kind == BUILD and n.commit in FINAL_BUILDS]
    doc = {
        "_doc": "Generated by scripts/ledger.py from the live run logs; do not edit. One row per live "
                "practice shift whose log was found, board tests (kind=board-test) only when complete "
                "(docs/runs/ledger.csv has every live start).",
        "live_starts": len(nights),
        "latest_start": max((n.started for n in nights), default=None),
        # The final branch's own-judgement "done" as distinct (seed, request) claims with a Wilson 95 % interval.
        "distinct_own": {"scope": "final branch's last four builds", "commits": list(FINAL_BUILDS), **distinct_own(final)},
        # Their room checks against the robot's own log (the self-contradiction rule), and the dress rehearsal's.
        "room_checks_final": room_checks(final),
        "rehearsal": rehearsal(nights),
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
    parser.add_argument("--faults-from", type=Path, help="the fault bed's per-type table (hamad/faults temp/faults/real.md)")
    parser.add_argument("--bundle", type=Path, help="copy the logs behind the build-level figures into DIR, with a manifest")
    args = parser.parse_args(argv)
    roots = [p.expanduser().resolve() for p in args.root] if args.root else default_roots()
    if len(roots) == 1 and (roots[0] / BUNDLE_MANIFEST).is_file():
        return check_bundle(roots[0], args.check)
    nights = collect(roots)
    if args.bundle:
        chosen = write_bundle(nights, args.bundle.expanduser().resolve())
        print(f"wrote {len(chosen)} logs, {BUNDLE_MANIFEST} and {BUNDLE_SUMS} to {args.bundle}")
        return 0
    outputs = {LEDGER_CSV: ledger_csv(nights), BUILDS_CSV: builds_csv(nights), LEDGER_JSON: ledger_json(nights)}
    if args.fidelity_from:
        table = args.fidelity_from.read_text(encoding="utf-8")
        outputs[FIDELITY_CSV] = fidelity_csv(table, nights)
        outputs[FIDELITY_TXT] = table
    if args.faults_from:
        table = args.faults_from.read_text(encoding="utf-8")
        outputs[FAULT_TABLE_MD] = table
        outputs[FAULT_BED_JSON] = fault_bed_json(table, json.loads(FAULT_BED_JSON.read_text(encoding="utf-8")))
    outputs[SUMMARY_TXT] = summary(nights)
    if args.check:
        stale = [p for p, text in outputs.items() if not p.is_file() or p.read_text(encoding="utf-8") != text]
        for path in stale:
            print(f"out of date: {path.relative_to(REPO)}", file=sys.stderr)
        return 1 if stale else 0
    for path, text in outputs.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    sys.stdout.write(outputs[SUMMARY_TXT])
    for path in outputs:
        print(f"wrote {path.relative_to(REPO)}")
    return 0


def summary(nights: list[Night]) -> str:
    """The printed summary, also written to docs/runs/summary.txt: every figure README and DEMO quote."""
    out: list[str] = []
    say = out.append
    logged = [n for n in nights if n.log]
    complete = [n for n in logged if n.complete]
    board = [n for n in nights if n.kind == BOARD_TEST]
    experiments = [n for n in nights if n.kind == EXPERIMENT]
    say(f"{len(nights)} live starts, {len(logged)} with a log, {len(complete)} complete nights; "
          f"{len(board)} board tests ({sum(1 for n in board if n.complete)} complete); "
          f"{len(experiments)} score-blind experiments ({sum(1 for n in experiments if n.complete)} complete)")
    count, credited, reports = precision(counted(nights))
    if reports:
        say(f"all nights (the card's figure): {credited} of {reports} 'done' credited over {count} nights "
              f"({100 * credited / reports:.1f} %)")
    final = [n for n in complete if n.kind == BUILD and n.commit in FINAL_BUILDS]
    if final:
        say("done split, " + basis_text("final branch's last four builds", final))
        d = distinct_own(final)
        say(f"distinct own-judgement claims, final branch's last four builds: {d['credited']} of {d['claims']} "
              f"(95 % CI {ci_text(d['ci95'], d['credited'], d['claims'])}; {d['reports']} reports counting replays; "
              f"missed: {', '.join(d['missed']) or 'none'})")
        say(f"  holding against the robot's own log: {d['holds_log']} of {d['claims']} "
              f"(95 % CI {ci_text(d['ci95_log'], d['holds_log'], d['claims'])}; contradicted: {', '.join(d['contradicted']) or 'none'})")
        r = room_checks(final)
        say(f"  room checks contradicted by the robot's own log: {r['distinct_contradicted']} of {r['distinct']} distinct "
              f"({r['contradicted']} of {r['reports']} reports, {r['contradicted_credited']} of them credited by the simulator; "
              f"on {r['nights_firing']} of {r['nights']} nights)")
    reh = rehearsal(nights)
    if reh["nights"]:
        r = reh["room_checks"]
        say(f"dress rehearsal ({reh['build']}, {reh['nights']} nights, seeds {' '.join(map(str, reh['seeds']))}): own judgement "
              f"{reh['own_credited']} of {reh['own']} credited by the simulator, {reh['own_holds_log']} of {reh['own']} hold against "
              f"its own log (95 % CI {ci_text(reh['ci95_log'], reh['own_holds_log'], reh['own'])}); room checks contradicted "
              f"{r['contradicted']} of {r['reports']}, credited by the simulator {r['contradicted_credited']} of {r['contradicted']}, "
              f"on {r['nights_firing']} of {r['nights']} nights")
    every = [n for n in nights if n.log and n.complete]
    r = room_checks(every)
    if r["reports"]:
        say(f"every complete live night ({r['nights']}, board tests and experiments included): room checks contradicted "
              f"{r['contradicted']} of {r['reports']} reports ({r['contradicted_credited']} credited by the simulator), "
              f"on {r['nights_firing']} of {r['nights']} nights")
    say("done split, " + basis_text("all nights the card counts", [n for n in counted(nights) if (n.done_reports or 0) > 0]))
    blind = [n for n in experiments if n.log]
    if blind:
        s = basis_split(blind)
        rate = f" ({100 * s['done_credited'] / s['done_reports']:.1f} %)" if s["done_reports"] else ""
        say(f"score-blind experiment ({len(blind)} nights, {sum(1 for n in blind if n.complete)} complete; seeds "
              f"{' '.join(str(n.seed) for n in blind)}; scores {' '.join(str(n.score) for n in blind)}): "
              f"{s['done_credited']} of {s['done_reports']} 'done' credited{rate}, "
              f"false done {s['done_reports'] - s['done_credited']}; the robot's own check said no "
              f"{sum(n.blind_said_no or 0 for n in blind)} of {sum(n.blind_checks or 0 for n in blind)} times")
    demo = DEMO_LOG.is_file() and start_line(read_jsonl(DEMO_LOG)).get("shift")
    night = next((n for n in nights if n.shift == demo), None)
    if night and night.done_own:
        ci = wilson(night.done_own_credited or 0, night.done_own)
        say(f"demo night ({demo[:11]}, seed {night.seed}): own judgement {night.done_own_credited} of {night.done_own} "
              f"credited (95 % CI {ci_text(ci, night.done_own_credited or 0, night.done_own)}), {night.done_own_holds_log} of "
              f"{night.done_own} hold against its own log (contradicted: {night.contradicted or 'none'})")
    builds = [n for n in complete if n.kind == BUILD and n.score is not None]
    if builds:
        best = max(builds, key=lambda n: n.score or 0)
        say(f"best build night: {best.score} (seed {best.seed}, {best.commit or 'commit unknown'})")
    best_any = max((n for n in complete if n.score is not None), key=lambda n: n.score or 0, default=None)
    if best_any:
        say(f"best live night anywhere: {best_any.score} (seed {best_any.seed}, {best_any.kind}, {best_any.checkout})")
    return "\n".join(out) + "\n"


FAULT_ROW = re.compile(r"^\| ([a-z_.]+) \| (blind|sighted) \| (.*)\|\s*$")
FAULT_CELL = re.compile(r"(\d+) / (\d+) / (\d+) / (\d+)(?: \(\+(\d+) lost\))?")


def fault_table(table: str) -> list[dict]:
    """The fault bed's per-type table (``temp/faults/real.md`` on hamad/faults: "hit / caught / missed / repaired"
    per rate) as rows: type, mode, rate, hit, caught, missed, repaired, lost."""
    rows = []
    for raw in table.splitlines():
        match = FAULT_ROW.match(raw)
        if not match:
            continue
        cells = [cell.strip() for cell in match.group(3).split("|")]
        for rate, cell in zip((0.05, 0.15, 0.3), cells[:3]):
            numbers = FAULT_CELL.match(cell)
            if not numbers:
                continue
            hit, caught, missed, repaired, lost = (int(v) if v else 0 for v in numbers.groups())
            rows.append({"type": match.group(1), "mode": match.group(2), "rate": rate, "hit": hit, "caught": caught,
                         "missed": missed, "repaired": repaired, "lost": lost})
    return rows


def fault_bed_json(table: str, current: dict) -> str:
    """data/fault-bed.json with its ``types`` rows from the per-type table (the card computes the catch rate from
    them, src/features/nightshift/ledger.ts `catchRate`); the hand-copied headline fields are kept."""
    doc = {key: value for key, value in current.items() if key not in ("types", "_types_doc")}
    doc["_types_doc"] = ("types: scripts/ledger.py --faults-from (hamad/faults temp/faults/real.md, copied to "
                         "docs/runs/fault-bed-real.md). Per fault type, mode and rate: requests hit (the last fault on a "
                         "request counts), caught (not reported done, not creditable), missed (a false done), repaired "
                         "(a later attempt succeeded and was reported done), lost (creditable, not reported done).")
    head = json.dumps(doc, ensure_ascii=False, indent=1)
    rows = ",\n".join("  " + json.dumps(row, ensure_ascii=False) for row in fault_table(table))
    return head[:-2] + ',\n "types": [\n' + rows + "\n ]\n}\n"  # one row per line: 78 rows stay readable


if __name__ == "__main__":
    raise SystemExit(main())
