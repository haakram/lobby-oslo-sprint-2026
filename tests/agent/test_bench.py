"""Benchmark and parameter search against the offline fake (no network)."""

import inspect
import itertools
import json
from dataclasses import replace
from pathlib import Path

import httpx
import pytest

from agent import bench
from agent.__main__ import main
from agent.bench import BenchResult, offline_scenario, run_bench, tune
from agent.client import WybeClient
from agent.config import Settings
from agent.offline import FakeWybe
from agent.planner import Params
from agent.tasks import Kind, parse_request
from agent.world import clock_to_seconds


def factory_for(tmp_path):
    def make(seed: int) -> WybeClient:
        fake = FakeWybe(**offline_scenario(seed))
        s = Settings(
            url="https://nightshift.test/", key="offline", anthropic_key=None, budget_usd=30.0,
            max_rps=1000.0, final_armed=False, runs_dir=tmp_path / "runs",
        )
        return WybeClient(s, transport=httpx.MockTransport(fake.handler), sleep=lambda x: None)

    return make


def test_mean_drop_worst():
    r = BenchResult(scores={1: 100, 2: 50, 3: 80}, params=Params())
    assert round(r.mean, 2) == 76.67
    assert r.mean_drop_worst == 90.0


def test_mean_drop_worst_single_score():
    assert BenchResult(scores={1: 70}, params=Params()).mean_drop_worst == 70.0


def test_offline_scenario_deterministic_and_parseable():
    a, b = offline_scenario(3), offline_scenario(3)
    assert a == b
    assert a != offline_scenario(4)
    reqs = a["requests"]
    assert len(reqs) >= 15
    secs = [clock_to_seconds(t) for t, _, _ in reqs]
    assert secs == sorted(secs) and secs[0] >= clock_to_seconds("22:00:00")
    kinds = [parse_request(rid, text, t).kind for t, rid, text in reqs]
    assert Kind.UNKNOWN not in kinds
    assert {Kind.AMENITY, Kind.TRAY, Kind.MESSAGE} <= set(kinds)
    FakeWybe(**a)  # accepted by the fake


def test_bench_runs_all_seeds_in_parallel(tmp_path):
    res = run_bench(factory_for(tmp_path), [1, 2, 3], parallel=3, sim_end="23:00:00")
    assert set(res.scores) == {1, 2, 3}
    assert all(s > 0 for s in res.scores.values())
    assert len(list((tmp_path / "runs").glob("*.jsonl"))) == 3  # each seed its own shift


def test_bench_one_seed_error_scores_zero(tmp_path):
    good = factory_for(tmp_path)

    def make(seed: int):
        if seed == 2:
            raise RuntimeError("boom")
        return good(seed)

    res = run_bench(make, [1, 2], parallel=2, sim_end="22:30:00")
    assert res.scores[2] == 0


def test_factory_without_seed_argument_is_accepted(tmp_path):
    good = factory_for(tmp_path)
    res = run_bench(lambda: good(1), [1], parallel=1, sim_end="22:30:00")
    assert 1 in res.scores


def test_tune_writes_best_params(tmp_path):
    out = tmp_path / "best.json"
    best, results = tune(factory_for(tmp_path), [1, 2], trials=2, parallel=2, out_path=out)
    assert len(results) == 3  # the baseline plus 2 trials
    assert Params.from_json(out.read_text()) == best
    top = max(r.mean_drop_worst for r in results)
    assert next(r for r in results if r.params == best).mean_drop_worst == top
    assert 0 <= best.max_scans - 3 <= 5 and 0.5 <= best.decay_per_min <= 2.0
    assert all(0 <= v <= 4 for v in best.cart_stock.values())


def test_tune_has_no_live_option_and_never_builds_a_live_client():
    assert "live" not in inspect.signature(tune).parameters
    assert not hasattr(bench, "make_live_client")


def test_cli_tune_and_bench_offline(tmp_path, capsys):
    out = tmp_path / "p.json"
    assert main(["tune", "--seeds", "1-2", "--trials", "1", "--out", str(out)]) == 0
    assert json.loads(out.read_text())["max_scans"] >= 3
    assert main(["bench", "--seeds", "1-2", "--parallel", "2", "--sim-end", "22:30:00"]) == 0
    assert "mean_drop_worst" in capsys.readouterr().out


def test_cli_tune_rejects_live():
    with pytest.raises(SystemExit):
        main(["tune", "--live"])


def test_parse_seeds():
    assert bench.parse_seeds("1-3,7") == [1, 2, 3, 7]
    assert replace(Params(), max_scans=4).max_scans == 4


def test_tune_default_output_is_not_the_auto_loaded_file():
    import inspect as _i

    from agent.agent import PARAMS_FILE

    default = _i.signature(tune).parameters["out_path"].default
    assert default.name == "params_candidate.json"
    assert default.resolve() != PARAMS_FILE.resolve()
    assert Path(bench.DEFAULT_OUT).name != PARAMS_FILE.name


def test_load_params_falls_back_to_defaults_without_best_file(tmp_path, monkeypatch):
    import agent.agent as mod

    monkeypatch.setattr(mod, "PARAMS_FILE", tmp_path / "params_best.json")
    assert mod.load_params() == Params()


def test_tuned_cart_stock_always_leaves_a_slot_for_trays():
    import random

    rng = random.Random(5)
    for _ in range(300):
        stock = bench._random_stock(rng)
        assert sum(stock.values()) <= 7 and all(0 <= v <= 4 for v in stock.values())


def test_tune_candidates_respect_cart_capacity(tmp_path):
    _, results = tune(factory_for(tmp_path), [1], trials=4, parallel=1, out_path=tmp_path / "c.json")
    assert all(sum(r.params.cart_stock.values()) <= 7 for r in results[1:])


def test_crashed_night_is_recorded_and_printed(tmp_path, capsys):
    def make(seed: int):
        raise ValueError("bad factory")

    res = run_bench(make, [1], parallel=1)
    assert res.scores == {1: 0} and res.errors == {1: "ValueError"}
    assert "ValueError" in capsys.readouterr().out


NEW_KINDS = {Kind.BAGS, Kind.NOISE, Kind.FOLLOWUP, Kind.SPILL}


def test_offline_scenario_has_the_live_types_after_midnight():
    after, before, named = set(), set(), 0
    for seed in range(1, 6):
        sc = offline_scenario(seed)
        for t, rid, text in sc["requests"]:
            task = parse_request(rid, text, t)
            assert task.kind is not Kind.UNKNOWN, text
            late = clock_to_seconds(t) >= clock_to_seconds("00:13:00")
            (after if late else before).add(task.kind)
            if task.guest and task.room is None and task.kind is not Kind.LOST_ITEM:
                named += 1
                assert task.guest in sc["guests"], task.guest
        assert sc["people_events"] and sc["spill_spots"]
        FakeWybe(**sc)
    assert NEW_KINDS <= after
    assert not NEW_KINDS & before  # the recon never saw them before ~00:13
    assert named >= 3


# --- Task 15: calibrated nights (calibration-spec.md) ---------------------------------------------------


def test_bench_and_tune_default_to_a_full_night_ending_06(monkeypatch, capsys):
    assert bench.OFFLINE_END == "06:00:00"
    assert inspect.signature(run_bench).parameters["sim_end"].default == "06:00:00"
    seen = {}

    def fake_bench(factory, seeds, *, parallel=5, params=None, sim_end="bad", max_calls=None):
        seen["sim_end"] = sim_end
        return BenchResult(scores={s: 1 for s in seeds}, capped_scores={s: 1 for s in seeds}, params=params or Params())

    monkeypatch.setattr(bench, "run_bench", fake_bench)
    assert main(["bench", "--seeds", "1-2"]) == 0
    assert seen["sim_end"] == "06:00:00"
    capsys.readouterr()


def test_offline_scenario_seed_1_is_the_live_replay():
    from agent.offline import (
        DEFAULT_ABSENT,
        DEFAULT_DND,
        DEFAULT_GUESTS,
        DEFAULT_HIDDEN,
        DEFAULT_PEOPLE,
        DEFAULT_WET_SPOTS,
        LIVE_REQUESTS,
    )

    sc = offline_scenario(1)
    assert sc["requests"] == list(LIVE_REQUESTS) and len(sc["requests"]) == 68
    assert sc["dnd_rooms"] == DEFAULT_DND and sc["absent_rooms"] == DEFAULT_ABSENT
    assert sc["guests"] == DEFAULT_GUESTS and sc["hidden"] == DEFAULT_HIDDEN
    assert sc["wet_spots"] == DEFAULT_WET_SPOTS and sc["people_events"] == DEFAULT_PEOPLE
    assert [t for t, _, _ in sc["people_events"]] == ["03:01:00", "04:04:00"]
    assert sc["end_clock"] == "06:00:00" and sc.get("hotel") is None
    assert offline_scenario(1, "02:00:00")["end_clock"] == "02:00:00"
    FakeWybe(**sc)


def _kinds(sc):
    return [(t, parse_request(rid, text, t)) for t, rid, text in sc["requests"]]


def test_generated_nights_match_the_live_rate_and_mix():
    from agent.offline import DEFAULT_ABSENT, DEFAULT_GUESTS

    seeds = range(2, 32)
    counts, hourly, dnd, real_follow, follow, named, same_sec, short_gap, gaps = [], [0] * 8, 0, 0, 0, 0, 0, 0, 0
    texts: list[str] = []
    for seed in seeds:
        sc = offline_scenario(seed)
        assert sc["dnd_rooms"] == {"room-208", "room-209"} and sc["absent_rooms"] == DEFAULT_ABSENT
        assert sc["guests"] == DEFAULT_GUESTS and sc["end_clock"] == "06:00:00"
        assert [p for _, p in sc["wet_spots"]] == ["corridor-3a", "corridor-2b", "corridor-2d", "corridor-2c",
                                                   "corridor-1b"]
        assert len(sc["people_events"]) == 2 and all(p == "corridor-2a" for _, p, _ in sc["people_events"])
        tasks = _kinds(sc)
        counts.append(len(tasks))
        secs = [clock_to_seconds(t) for t, _ in tasks]
        assert secs == sorted(secs) and clock_to_seconds("22:02:30") <= secs[0] <= clock_to_seconds("22:04:30")
        assert secs[1] - secs[0] >= 20 * 60  # a quiet opening, as live (41 min)
        for s in secs:
            hourly[(s - clock_to_seconds("22:00:00")) // 3600] += 1
        for a, b in itertools.pairwise(secs):
            gaps += 1
            same_sec += b == a
            short_gap += b - a <= 60
        orders = set()
        for t, task in tasks:
            assert task.kind is not Kind.UNKNOWN, task.text
            texts.append(task.text)
            if task.room in ("room-208", "room-209"):
                dnd += 1
            if task.kind in (Kind.ROOM_CHECK, Kind.BAGS):
                assert task.room in DEFAULT_ABSENT, task.text
            if task.kind is Kind.AMENITY and task.room:
                orders.add((task.room, task.item))
            if task.kind is Kind.FOLLOWUP:
                follow += 1
                real_follow += (task.room, task.item) in orders
            if task.guest:
                named += 1
                assert task.guest in DEFAULT_GUESTS
        FakeWybe(**sc)
    n = sum(counts)
    assert 58 <= n / len(counts) <= 78, counts  # ~68 a night, 8.5/h
    assert all(45 <= c <= 95 for c in counts), counts
    live = [4, 8, 6, 11, 10, 5, 10, 14]
    for h, (got, want) in enumerate(zip(hourly, live, strict=True)):
        assert 0.6 * want <= got / len(counts) <= 1.4 * want, (h, got / len(counts), want)
    assert 0.06 <= dnd / n <= 0.15  # the two DND rooms take ~10 % of the requests
    assert 0.02 <= same_sec / gaps <= 0.08 and 0.08 <= short_gap / gaps <= 0.24  # live: 4.5 %, 12 % (n=67)
    assert follow / n >= 0.08 and real_follow / follow <= 0.3  # 8 of 9 live claims were false
    assert 0.07 <= named / n <= 0.20
    joined = " ".join(texts)
    assert "towel" not in joined and "breakfast is ready" not in joined and "car has arrived" not in joined
    for phrase in ("the taxi is here", "breakfast starts at seven", "wake-up call is set for half past six",
                   "a parcel arrived for them at the desk", "their car is parked in bay four",
                   "wants two water bottles", "lost a child's toy", "lost a wallet", "Room service for",
                   "earlier tonight, probably somewhere around"):
        assert phrase in joined, phrase


def test_generated_lost_items_are_half_findable_with_numbered_ids():
    findable = unfindable = 0
    for seed in range(2, 22):
        sc = offline_scenario(seed)
        lost = [task for _, task in _kinds(sc) if task.kind is Kind.LOST_ITEM]
        ids = {k.split("-")[0] if not k.startswith("toy-") else "toy" for k in sc["hidden"]}
        for task in lost:
            base = task.item if task.item in ("glasses", "wallet", "toy") else "toy"
            if base in ids:
                findable += 1
            else:
                unfindable += 1
        for k, place in sc["hidden"].items():
            spot = place if isinstance(place, str) else place[0]
            assert spot in ("corridor-1a", "corridor-1b", "corridor-1c", "kitchen-pass", "lobby-bar"), (k, place)
    assert findable and unfindable


def test_seed_2_hotel_is_the_observed_floor_1_layout():
    sc = offline_scenario(2)
    hotel = sc["hotel"]
    metres = {frozenset((e["a"], e["b"])): e["m"] for e in hotel["edges"]}
    want = {("charging-dock", "lobby"): 6, ("lobby", "front-desk"): 6, ("lobby", "elevator-1"): 10,
            ("lobby", "corridor-1a"): 12, ("corridor-1a", "corridor-1b"): 16, ("corridor-1b", "corridor-1c"): 18,
            ("corridor-1a", "staff-room"): 5, ("corridor-1b", "storage"): 4, ("corridor-1b", "laundry"): 6}
    for (a, b), m in want.items():
        assert metres[frozenset((a, b))] == m, (a, b)
    assert hotel["stock"]["storage"] == {"pillow": 5, "toiletry-kit": 6, "phone-charger": 4, "wet-floor-sign": 3}
    assert hotel["stock"]["laundry"] == {"cart": 1, "towel": 8, "water-bottle": 8}
    assert hotel["stock"]["front-desk"] == {"keycard": 2}
    assert offline_scenario(2) == sc
    fake = FakeWybe(**sc)
    assert fake._adj["charging-dock"]["lobby"]["m"] == 6


def test_other_seeds_vary_metres_and_shuffle_stock_deterministically():
    import json

    from agent.world import DEFAULT_MAP

    base = json.loads(DEFAULT_MAP.read_text())
    base_m = {frozenset((e["a"], e["b"])): e for e in base["edges"]}
    totals = {}
    for items in base["stock"].values():
        for item, n in items.items():
            totals[item] = totals.get(item, 0) + n
    seen = set()
    for seed in (3, 4, 5, 17):
        hotel = offline_scenario(seed)["hotel"]
        assert hotel["nodes"] == base["nodes"]
        got = {frozenset((e["a"], e["b"])): e for e in hotel["edges"]}
        assert got.keys() == base_m.keys()  # same topology
        changed = 0
        for key, e in got.items():
            b = base_m[key]
            assert e.get("door") == b.get("door") and e.get("stairs") == b.get("stairs")
            assert 1 <= e["m"] and 0.55 * b["m"] <= e["m"] <= 1.45 * b["m"], (key, e["m"], b["m"])
            changed += e["m"] != b["m"]
        assert changed >= len(got) // 3
        seen.add(tuple(sorted(hotel["stock"]["storage"].items())))
        got_totals = {}
        for items in hotel["stock"].values():
            for item, n in items.items():
                got_totals[item] = got_totals.get(item, 0) + n
        assert got_totals == totals
        assert hotel["stock"]["laundry"]["cart"] == 1 and hotel["stock"]["front-desk"] == {"keycard": 2}
        assert set(hotel["stock"]) == {"storage", "laundry", "front-desk"}
        assert offline_scenario(seed)["hotel"] == hotel
    assert len(seen) >= 2  # the shelves differ between seeds


# --- variant 20: the manager's "Skip R-NNN" in the offline nights ---------------------------------------


def test_offline_nights_carry_the_managers_skips():
    one = offline_scenario(1)["skips"]
    assert [(t, s[:9]) for t, _, s in one] == [
        ("22:57:58", "Skip R-00"), ("01:42:32", "Skip R-02"), ("03:22:24", "Skip R-03"),
        ("03:46:48", "Skip R-04"), ("04:54:02", "Skip R-05")]  # [obs] the scout's seed-1 runs
    total = 0
    for seed in range(2, 32):
        sc = offline_scenario(seed)
        assert sc == offline_scenario(seed)  # deterministic
        by_id = {rid: (t, text) for t, rid, text in sc["requests"]}
        for at, rid, text in sc["skips"]:
            assert rid == "skip"
            target = text.split()[1].rstrip(",")
            arrived, req = by_id[target]
            assert not req.startswith(("Front desk passed on", "Complaint about noise"))
            assert 8 * 60 <= clock_to_seconds(at) - clock_to_seconds(arrived) <= 30 * 60
        total += len(sc["skips"])
        FakeWybe(**sc)
    assert 0.5 <= total / 30 <= 3  # [obs] 0-5 a night, ~1.4 on average (a lower bound)
