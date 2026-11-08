"""Call counting and the per-shift call cap emulated offline (no network)."""

import json
import threading

import httpx

from agent.__main__ import main
from agent.bench import default_max_calls, offline_scenario, run_bench
from agent.client import ShiftEnded, WybeClient
from agent.config import Settings
from agent.offline import FakeWybe
from tests.agent.test_bench import factory_for

START = {"shift": "w2-abc", "mode": "practice", "clock": "22:00:00", "seed": 1}


def scripted_client(tmp_path, scores):
    """A client whose status replies carry scores[i] and clock 22:00:<i>; one reply per call."""
    n = {"i": 0}

    def handler(request):
        body = json.loads(request.content)
        if body["cmd"] == "start_shift":
            return httpx.Response(200, json={"ok": True, "clock": "22:00:00", "result": START, "events": []})
        i = n["i"]
        n["i"] += 1
        return httpx.Response(
            200,
            json={"ok": True, "clock": f"22:00:{i + 1:02d}", "result": {"score": scores[i]}, "events": []},
        )

    s = Settings(url="https://nightshift.test/", key="k", anthropic_key=None, budget_usd=30.0,
                 max_rps=1000.0, final_armed=False, runs_dir=tmp_path / "runs")
    return WybeClient(s, transport=httpx.MockTransport(handler), sleep=lambda x: None)


def test_counter_increments_per_call(tmp_path):
    session = scripted_client(tmp_path, [1, 2, 3]).start_shift("practice", 1)
    assert session.calls == 0
    for _ in range(3):
        session.cmd("status")
    assert session.calls == 3


def test_snapshot_at_cap_is_score_at_nth_call(tmp_path):
    session = scripted_client(tmp_path, [10, 20, 30, 40]).start_shift("practice", 1)
    session.call_cap = 3
    for _ in range(4):
        session.cmd("status")
    assert session.at_cap == (30, "22:00:03")


def test_cap_zero_means_unlimited(tmp_path):
    session = scripted_client(tmp_path, [1, 2]).start_shift("practice", 1)
    for _ in range(2):
        session.cmd("status")
    assert session.at_cap is None


def test_default_cap_is_1320_at_5_rps():
    assert default_max_calls(5) == 1320


def test_the_default_rate_gives_a_final_shift_a_cap_past_any_night_s_pace(monkeypatch):
    from agent.config import load_settings

    monkeypatch.delenv("NIGHTSHIFT_MAX_RPS", raising=False)
    rps = load_settings(()).max_rps
    assert rps == 16.0 and default_max_calls(rps) == 4224
    # the richest live practice nights ran ~1,700-2,000 calls: a final shift capped at 4,224 projects
    # under its cap all night, so the pace projection never switches navigate on there
    assert default_max_calls(rps) > 2 * 2000


def test_bench_reports_capped_score_and_clock(tmp_path):
    full = run_bench(factory_for(tmp_path), [1], parallel=1, sim_end="23:00:00")
    assert full.calls[1] > 40 and full.capped_scores[1] == full.scores[1]  # unlimited: capped == final
    cap = full.calls[1] // 2
    res = run_bench(factory_for(tmp_path), [1], parallel=1, sim_end="23:00:00", max_calls=cap)
    assert res.calls[1] == full.calls[1]  # the cap only measures; the agent behaves the same
    assert res.scores[1] == full.scores[1]
    assert res.capped_scores[1] <= res.scores[1]
    assert "22:00:00" <= res.cap_clocks[1] <= "23:00:00"
    assert res.cap_clocks[1] < "23:00:00"
    assert res.mean_drop_worst_capped == res.capped_scores[1]


def test_cap_not_reached_uses_final_score(tmp_path):
    res = run_bench(factory_for(tmp_path), [1], parallel=1, sim_end="22:30:00", max_calls=10**6)
    assert res.capped_scores[1] == res.scores[1]


def test_cli_max_calls(tmp_path, capsys, monkeypatch):
    monkeypatch.setenv("NIGHTSHIFT_MAX_RPS", "5")
    args = ["bench", "--seeds", "1", "--parallel", "1", "--sim-end", "22:30:00"]
    assert main(args + ["--max-calls", "0"]) == 0
    out = capsys.readouterr().out
    assert "calls" in out and "capped" in out
    assert main(args) == 0
    assert "cap 1320" in capsys.readouterr().out


def test_tune_can_optimise_capped_score(tmp_path):
    out = tmp_path / "p.json"
    assert main(["tune", "--seeds", "1", "--trials", "1", "--out", str(out), "--optimise-capped",
                 "--max-calls", "50"]) == 0
    assert out.exists()


def test_shared_client_parallel_keeps_each_seeds_numbers(tmp_path):
    """--live shape: ONE client for every thread. One fake per seed behind a router."""
    fakes: dict[str, FakeWybe] = {}
    by_seed: dict[int, FakeWybe] = {}
    lock = threading.Lock()

    def handler(request):
        body = json.loads(request.content)
        if body["cmd"] == "start_shift":
            seed = body["args"]["seed"]
            with lock:
                fake = by_seed[seed] = FakeWybe(**offline_scenario(seed))
            resp = fake.handler(request)
            fakes[json.loads(resp.content)["result"]["shift"]] = fake
            return resp
        return fakes[request.headers["X-Shift"]].handler(request)

    s = Settings(url="https://nightshift.test/", key="offline", anthropic_key=None, budget_usd=30.0,
                 max_rps=1000.0, final_armed=False, runs_dir=tmp_path / "runs")
    shared = WybeClient(s, transport=httpx.MockTransport(handler), sleep=lambda x: None)
    seeds = [1, 2, 3]
    solo = {sd: run_bench(factory_for(tmp_path), [sd], parallel=1, sim_end="23:00:00", max_calls=50)
            for sd in seeds}
    res = run_bench(lambda: shared, seeds, parallel=3, sim_end="23:00:00", max_calls=50)
    for sd in seeds:
        assert res.scores[sd] == solo[sd].scores[sd]
        assert res.calls[sd] == solo[sd].calls[sd]
        assert res.capped_scores[sd] == solo[sd].capped_scores[sd]
        assert res.cap_clocks[sd] == solo[sd].cap_clocks[sd]
    assert not hasattr(shared.start_shift, "__wrapped__") and shared.start_shift.__func__ is WybeClient.start_shift


def test_snapshot_taken_when_nth_call_is_the_409(tmp_path):
    def handler(request):
        if json.loads(request.content)["cmd"] == "start_shift":
            return httpx.Response(200, json={"ok": True, "clock": "22:00:00", "result": START, "events": []})
        if request.headers.get("X-Shift") and getattr(handler, "n", 0) >= 1:
            return httpx.Response(409, text="shift over")
        handler.n = 1
        return httpx.Response(200, json={"ok": True, "clock": "22:00:01", "result": {"score": 7}, "events": []})

    s = Settings(url="https://nightshift.test/", key="k", anthropic_key=None, budget_usd=30.0,
                 max_rps=1000.0, final_armed=False, runs_dir=tmp_path / "runs")
    session = WybeClient(s, transport=httpx.MockTransport(handler), sleep=lambda x: None).start_shift("practice", 1)
    session.call_cap = 2
    session.cmd("status")
    try:
        session.cmd("status")
    except ShiftEnded:
        pass
    assert session.at_cap == (7, None)
