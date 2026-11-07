"""Call counting and the per-shift call cap emulated offline (no network)."""

import json

import httpx

from agent.__main__ import main
from agent.bench import default_max_calls, run_bench
from agent.client import WybeClient
from agent.config import Settings
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


def test_cli_max_calls(tmp_path, capsys):
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
