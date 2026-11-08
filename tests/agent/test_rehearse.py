"""`agent rehearse`: practice seeds through the final's code path, offline (no live calls)."""

import threading
import time
from dataclasses import replace
from pathlib import Path

import httpx
import pytest

from agent.__main__ import main
from agent.bench import default_max_calls, offline_scenario
from agent.client import RateLimiter, WybeClient
from agent.config import Settings
from agent.offline import FakeWybe
from agent.rehearse import Row, Summary, format_summary, rehearse


def _settings(tmp_path: Path, rps: float = 16.0) -> Settings:
    return Settings(url="https://nightshift.test/", key="k", anthropic_key=None, budget_usd=30.0,
                    max_rps=rps, final_armed=False, runs_dir=tmp_path / "runs")


def _factory(tmp_path: Path, made: list):
    def make(settings, *, live):
        fake = FakeWybe(**offline_scenario(len(made) + 1))
        c = WybeClient(replace(settings, key="offline"), transport=httpx.MockTransport(fake.handler),
                       sleep=lambda s: None)
        made.append(c)
        return c
    return make


def test_ten_seeds_run_at_most_four_at_once(tmp_path):
    made: list = []
    now = 0
    peak = 0
    lock = threading.Lock()
    seen_kwargs: list[dict] = []

    def fake_run(client, *, session, **kw):
        nonlocal now, peak
        seen_kwargs.append(kw)
        with lock:
            now += 1
            peak = max(peak, now)
        time.sleep(0.03)
        with lock:
            now -= 1
        return {"shift": session.shift_id, "score": session.seed, "reason": "real time limit"}

    s = rehearse(list(range(1, 11)), _settings(tmp_path), _factory(tmp_path, made), run=fake_run)
    assert peak <= 4 and s.max_active <= 4 and peak >= 2
    assert [r.seed for r in s.rows] == list(range(1, 11))
    assert all(r.score == r.seed for r in s.rows)
    # the final's shape: call cap from the rate, 44 min, own limiter at rps/10
    assert all(k["call_cap"] == default_max_calls(16.0) == 4224 for k in seen_kwargs)
    assert all(k["real_time_limit_s"] == 44 * 60 for k in seen_kwargs)
    assert all(isinstance(c.limiter, RateLimiter) and abs(c.limiter._interval - 1 / 1.6) < 1e-9 for c in made)


def test_real_offline_shifts_complete_through_run_shift(tmp_path):
    s = rehearse([1, 2, 3], _settings(tmp_path, 5000.0), _factory(tmp_path, []), sim_end="22:30:00")
    assert len(s.scores) == 3 and all(r.shift for r in s.rows)
    assert all(r.calls > 0 for r in s.rows)


def test_summary_maths_and_early_stop():
    s = Summary(rows=[Row(1, "a", 100, "real time limit"), Row(2, "b", 50, "real time limit"),
                      Row(3, "c", 150, "real time limit"), Row(4, None, None, "crashed: X")])
    assert s.mean == 100 and s.mean_drop_worst == 125
    assert [r.early for r in s.rows] == [False, False, False, True]
    out = format_summary(s, 4224)
    assert "mean 100.0  mean_drop_worst 125.0" in out and "stopped early: 4" in out


def test_final_mode_refused(tmp_path):
    with pytest.raises(ValueError):
        rehearse([1], _settings(tmp_path), _factory(tmp_path, []), mode="final")
    assert main(["rehearse", "--seeds", "1", "--mode", "final"],
                client_factory=lambda *a, **k: pytest.fail("must not build a client")) == 2
