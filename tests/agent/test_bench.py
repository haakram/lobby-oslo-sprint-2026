"""Benchmark and parameter search against the offline fake (no network)."""

import inspect
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
