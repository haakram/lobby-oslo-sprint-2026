"""Measure the demand and service profile behind the robot-minute price (agent/price.py) from the real
nights, and write it to agent/data/lambda_profile.json. Read-only on the run logs; never the live server.

    .venv/bin/python scripts/lambda_profile.py [--out agent/data/lambda_profile.json]

Every figure is seed-weighted: the nights of one seed share one world (same requests, same map), so each
seed's nights are averaged first and the seeds then count equally. Measured, not tuned:

- arrivals per hour 22..05 (all kinds, and spills alone), and the spread over seeds of what is still to
  come from each hour (the stranding margin);
- per task, task_start -> task_done/task_failed: robot minutes (dock minutes inside left out), battery
  spent (dock gains added back), the score's rise; tau = minutes per task, drain = % per busy minute
  (and its spread over the seeds);
- points per robot-minute of the paying tasks, minute-weighted quantiles (the price of the marginal
  minute) and the mean (the cap);
- lost-item hunts: P(found at the k-th place | not found before), k = scans done before the find + 1;
- wet patches met per spill request (unannounced patches exist).
"""

from __future__ import annotations

import argparse
import collections
import json
import re
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agent import replaybed
from agent.world import clock_to_seconds

OUT = Path(__file__).resolve().parent.parent / "agent" / "data" / "lambda_profile.json"
START = clock_to_seconds("22:00:00")
HOURS = 8
QUANTILES = [i / 20 for i in range(21)]
DOCKED = re.compile(r"Docked for (\d+) min", re.IGNORECASE)
HUNT_K = 8  # hunt places measured


def _bin(sec: int) -> int:
    return max(0, min(HOURS - 1, (sec - START) // 3600))


def arrivals(night: replaybed.Night) -> tuple[list[int], list[int]]:
    """Requests (and spills alone) arriving per hour bin: the manager's messages, skips excluded."""
    kinds: dict[str, str] = {}
    at: dict[str, int] = {}
    clk = "22:00:00"
    for e in night.events:
        if e.get("type") == "decision" and e.get("kind") == "request":
            d = e.get("data") or {}
            kinds.setdefault(str(d.get("request")), str(d.get("kind")))
        if e.get("type") != "call":
            continue
        clk = e.get("clock") or clk
        r = e.get("result")
        if e.get("cmd") == "inbox" and isinstance(r, dict):
            for m in r.get("messages") or []:
                if (isinstance(m, dict) and isinstance(m.get("request"), str) and replaybed.MANAGER in str(m.get("from"))
                        and not str(m.get("text", "")).startswith("Skip ")):
                    at.setdefault(m["request"], clock_to_seconds(m.get("at") or clk))
    every, spills = [0] * HOURS, [0] * HOURS
    for rid, sec in at.items():
        every[_bin(sec)] += 1
        spills[_bin(sec)] += kinds.get(rid) == "spill"
    return every, spills


def tasks(night: replaybed.Night) -> list[dict]:
    """One row per task segment: kind, minutes (dock minutes left out), battery spent, points, status,
    and for lost items the scans before the find (found_at) or the scans of a failed hunt."""
    rows: list[dict] = []
    kinds: dict[str, str] = {}
    clk = "22:00:00"
    score = battery = None
    cur: dict | None = None

    def close(status: str) -> None:
        nonlocal cur
        if cur is None:
            return
        cur["minutes"] = max(0.0, (clock_to_seconds(clk) - cur["t0"]) / 60 - cur["dock_min"])
        if battery is not None and cur["b0"] is not None:
            cur["battery"] = max(0.0, cur["b0"] - battery + cur["dock_gain"])
        cur["status"] = status
        cur["end_score"] = score
        rows.append(cur)
        cur = None

    for e in night.events:
        typ = e.get("type")
        if typ == "decision":
            d, k = e.get("data") or {}, e.get("kind")
            if k == "request":
                kinds.setdefault(str(d.get("request")), str(d.get("kind")))
            elif k == "task_start":
                if cur is not None:  # a task started inside another (a follow-up running its original)
                    close("nested")
                cur = {"request": d.get("request"), "kind": d.get("kind"), "t0": clock_to_seconds(clk),
                       "hour": _bin(clock_to_seconds(clk)), "b0": battery, "s0": score, "dock_min": 0.0,
                       "dock_gain": 0.0, "battery": None, "scans": 0, "found_at": None}
            elif k in ("task_done", "task_failed") and cur is not None and d.get("request") == cur["request"]:
                close(str(d.get("status")))
            elif k == "lost_item_seen" and cur is not None and cur["kind"] == "lost_item" and cur["found_at"] is None:
                cur["found_at"] = cur["scans"] + 1
            continue
        if typ != "call":
            continue
        clk = e.get("clock") or clk
        r = e.get("result")
        if isinstance(r, dict):
            if isinstance(r.get("score"), int):
                score = r["score"]
            if isinstance(r.get("battery"), int | float):
                battery = float(r["battery"])
        if cur is None:
            continue
        cmd = e.get("cmd")
        if cmd == "dock" and (m := DOCKED.search(str(r))):
            cur["dock_min"] += int(m[1])
            cur["dock_gain"] += int(m[1])
        if cmd == "scan" and cur["kind"] == "lost_item" and cur["found_at"] is None:
            found = r.get("found") if isinstance(r, dict) else None
            cur["scans"] += 1
            if found:
                cur["found_at"] = cur["scans"]
    # the score's rise over each segment, up to the next task's start (the report's status comes after it)
    for i, row in enumerate(rows):
        nxt = rows[i + 1]["s0"] if i + 1 < len(rows) else row["end_score"]
        row["points"] = (nxt - row["s0"]) if isinstance(nxt, int) and isinstance(row["s0"], int) else None
    return rows


def wet_patches(night: replaybed.Night) -> int:
    """Distinct wet places met (work orders for a wet floor, wet-floor edges)."""
    places: set[str] = set()
    for e in night.events:
        if e.get("type") != "decision":
            continue
        d = e.get("data") or {}
        if e.get("kind") == "work_order" and d.get("type") == "sol" and d.get("place"):
            places.add(str(d["place"]))
        elif e.get("kind") == "wet_floor" and isinstance(d.get("edge"), list):
            places.add(str(d["edge"][-1]))  # [from, to]: the spot is where the robot stepped
    return len(places)


def quantiles(pairs: list[tuple[float, float]]) -> list[float]:
    """Minute-weighted quantiles of points per minute: pairs = (density, minutes)."""
    pairs = sorted(pairs)
    total = sum(w for _, w in pairs)
    out, acc, i = [], 0.0, 0
    for q in QUANTILES:
        while i < len(pairs) - 1 and acc + pairs[i][1] < q * total:
            acc += pairs[i][1]
            i += 1
        out.append(round(pairs[i][0], 3))
    return out


def seed_mean(per_seed: dict[int, list[float]]) -> float:
    return statistics.mean(statistics.mean(v) for v in per_seed.values() if v)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args(argv)
    nights = replaybed.select_nights()
    by_seed: dict[int, list[replaybed.Night]] = collections.defaultdict(list)
    for n in nights:
        by_seed[n.seed].append(n)
    seeds = sorted(by_seed)

    # arrivals: one world per seed, its newest night
    arr = {s: arrivals(max(by_seed[s], key=replaybed.started)) for s in seeds}
    per_hour = [round(statistics.mean(arr[s][0][h] for s in seeds), 3) for h in range(HOURS)]
    spill_hour = [round(statistics.mean(arr[s][1][h] for s in seeds), 3) for h in range(HOURS)]
    left_sd = [round(statistics.pstdev(sum(arr[s][0][h:]) for s in seeds), 3) for h in range(HOURS)]

    # tasks: every night, seed-weighted
    minutes, batt, done_pts = (collections.defaultdict(list) for _ in range(3))
    paying_min, paying_pts = collections.defaultdict(float), collections.defaultdict(float)
    weighted_pairs: list[tuple[float, float]] = []
    reached, found = [collections.defaultdict(float) for _ in range(2)]
    patches, spills = collections.defaultdict(list), collections.defaultdict(list)
    for s in seeds:
        w = 1.0 / len(by_seed[s])
        for n in by_seed[s]:
            rows = [r for r in tasks(n) if r["kind"] not in (None, "followup", "unknown")]
            for r in rows:
                minutes[s].append(r["minutes"])
                if r["battery"] is not None and r["minutes"] > 0:
                    batt[s].append((r["battery"], r["minutes"]))
                if r["status"] == "done" and isinstance(r["points"], int) and r["points"] > 0 and r["minutes"] > 0:
                    done_pts[s].append(r["points"])
                    paying_min[s] += w * r["minutes"]
                    paying_pts[s] += w * r["points"]
                    weighted_pairs.append((r["points"] / max(r["minutes"], 0.25), w * r["minutes"] / len(by_seed[s])))
                if r["kind"] == "lost_item" and r["status"] in ("done", "failed"):
                    last = r["found_at"] if r["found_at"] is not None else r["scans"]
                    for k in range(1, min(HUNT_K, last) + 1):
                        reached[k] += w
                    if r["found_at"] is not None and r["found_at"] <= HUNT_K:
                        found[r["found_at"]] += w
            patches[s].append(wet_patches(n))
            spills[s].append(sum(arrivals(n)[1]))
    tau = seed_mean(minutes)
    drain_by_seed = {s: [sum(b for b, _ in v) / sum(m for _, m in v)] for s, v in batt.items() if v}
    drain = seed_mean(drain_by_seed)
    drain_sd = statistics.pstdev(v[0] for v in drain_by_seed.values())
    value = seed_mean(done_pts)
    cap = statistics.mean(paying_pts[s] / paying_min[s] for s in seeds if paying_min[s])
    hunt = [round(found[k] / reached[k], 3) if reached[k] else 0.0 for k in range(1, HUNT_K + 1)]
    patch_ratio = statistics.mean(statistics.mean(patches[s]) / max(1e-9, statistics.mean(spills[s]))
                                  for s in seeds if statistics.mean(spills[s]) > 0)
    profile = {
        "source": f"{len(nights)} full live nights, {len(seeds)} seeds (seed-weighted); scripts/lambda_profile.py",
        "seeds": seeds,
        "arrivals_per_hour": per_hour,  # 22:00..05:00 bins
        "spills_per_hour": spill_hour,
        "arrivals_left_sd": left_sd,  # sd over seeds of the requests still to come from each hour's start
        "task_minutes": round(tau, 3),  # robot minutes per task started (dock minutes inside left out)
        "drain_per_min": round(drain, 4),  # % battery per busy robot-minute
        "drain_sd": round(drain_sd, 4),  # its sd over the seeds (the stranding margin)
        "value_per_task": round(value, 2),  # mean points of a paying task
        "density_quantiles": quantiles(weighted_pairs),  # points per robot-minute, minute-weighted, q = 0, .05 .. 1
        "density_cap": round(cap, 3),  # points per robot-minute over all paying tasks
        "hunt_find_p": hunt,  # P(found at the k-th place | not found before), k = 1..8
        "hunt_reached": [round(reached[k], 2) for k in range(1, HUNT_K + 1)],
        "patches_per_spill": round(patch_ratio, 3),
    }
    Path(args.out).write_text(json.dumps(profile, indent=1) + "\n")
    print(json.dumps(profile, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
