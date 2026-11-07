"""Shift loop and CLI against the offline fake (no network)."""

import json

import httpx
import pytest

from agent.__main__ import main
from agent.agent import make_client, run_shift
from agent.client import WybeClient
from agent.config import Settings
from tests.fakes.fake_wybe import FakeWybe


def settings(tmp_path, **kw) -> Settings:
    base = {
        "url": "https://nightshift.test/",
        "key": "test-key",
        "anthropic_key": None,
        "budget_usd": 30.0,
        "max_rps": 1000.0,
        "final_armed": False,
        "runs_dir": tmp_path / "runs",
    }
    base.update(kw)
    return Settings(**base)


def client_for(tmp_path, handler) -> WybeClient:
    return WybeClient(
        settings(tmp_path), transport=httpx.MockTransport(handler), sleep=lambda s: None
    )


def test_full_shift_scores_and_never_false_reports(tmp_path):
    fake = FakeWybe()
    result = run_shift(client_for(tmp_path, fake.handler), seed=1, sim_end="23:30:00")
    assert result["score"] >= 100
    assert fake.score >= 100
    assert fake.false_done == []
    assert not fake.unsafe
    assert set(result) == {"shift", "seed", "score", "requests_served", "reason"}
    lines = [json.loads(x) for x in (tmp_path / "runs" / f"{result['shift']}.jsonl").read_text().splitlines()]
    assert lines[0]["type"] == "start" and lines[-1]["type"] == "end"
    assert sum(1 for x in lines if x["type"] == "end") == 1


def test_loop_survives_one_transport_error(tmp_path):
    fake = FakeWybe()
    calls = {"n": 0}

    def flaky(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if 40 <= calls["n"] <= 43:  # one command fails all of its 4 attempts
            raise httpx.ConnectError("boom")
        return fake.handler(request)

    result = run_shift(client_for(tmp_path, flaky), seed=1, sim_end="23:30:00")
    assert result["score"] >= 100
    assert fake.false_done == []
    lines = [json.loads(x) for x in (tmp_path / "runs" / f"{result['shift']}.jsonl").read_text().splitlines()]
    assert any(x["type"] == "decision" and x["kind"] == "wybe_error" for x in lines)
    assert lines[-1]["type"] == "end"


def test_end_line_written_when_the_loop_dies(tmp_path):
    class Boom(Exception):
        pass

    class ExplodingBrain:
        enabled = True

        def classify(self, *a):
            raise Boom

    fake2 = FakeWybe(requests=[("22:03:30", "R-001", "do the strange thing please")])
    client = client_for(tmp_path, fake2.handler)
    with pytest.raises(Boom):
        run_shift(client, seed=1, sim_end="23:30:00", brain=ExplodingBrain())
    ends = [
        json.loads(line)
        for p in (tmp_path / "runs").glob("*.jsonl")
        for line in p.read_text().splitlines()
        if json.loads(line)["type"] == "end"
    ]
    assert len(ends) == 1


def test_unknown_request_classified_once_by_brain(tmp_path):
    fake = FakeWybe(requests=[("22:03:30", "R-001", "do the strange thing please")])
    seen = []

    class CountingBrain:
        enabled = True

        def classify(self, rid, text, arrived):
            seen.append(rid)

    run_shift(client_for(tmp_path, fake.handler), seed=1, sim_end="22:40:00", brain=CountingBrain())
    assert seen == ["R-001"]
    assert fake.reports == {"R-001": "failed"}


def test_stop_event_ends_shift(tmp_path):
    import threading

    fake = FakeWybe()
    stop = threading.Event()
    stop.set()
    result = run_shift(client_for(tmp_path, fake.handler), seed=1, stop=stop)
    assert result["reason"] == "stopped"


def test_final_refused_by_cli_outside_window(tmp_path, monkeypatch, capsys):
    monkeypatch.delenv("FINAL_ARMED", raising=False)
    monkeypatch.chdir(tmp_path)
    calls = []

    def factory(settings, *, live):
        def forbidden(request):
            calls.append(request)
            raise AssertionError("the locked final must make no request")

        return client_for(tmp_path, forbidden)

    code = main(["final"], client_factory=factory)
    out = capsys.readouterr()
    assert code != 0
    assert "locked" in (out.out + out.err).lower()
    assert calls == []


def test_offline_run_via_cli_makes_no_live_log(tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("FINAL_ARMED", raising=False)
    assert main(["run", "--seed", "1", "--sim-end", "22:30:00"]) == 0
    assert not (tmp_path / "temp" / "live_runs.jsonl").exists()
    assert "score" in capsys.readouterr().out


def test_make_client_live_counts_starts(tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    fake = FakeWybe()
    import agent.agent as mod

    monkeypatch.setattr(mod, "_live_transport", lambda: httpx.MockTransport(fake.handler))
    client = make_client(settings(tmp_path), live=True)
    client.start_shift("practice", seed=1)
    client.start_shift("practice", seed=2)
    lines = [json.loads(x) for x in (tmp_path / "temp" / "live_runs.jsonl").read_text().splitlines()]
    assert [x["seed"] for x in lines] == [1, 2]
    assert set(lines[0]) == {"t", "shift", "mode", "seed"}
    out = capsys.readouterr().out
    assert "live practice shifts used: 0" in out and "live practice shifts used: 1" in out


def test_route_command(capsys):
    assert main(["route", "front-desk", "room-319"]) == 0
    assert "front-desk" in capsys.readouterr().out
