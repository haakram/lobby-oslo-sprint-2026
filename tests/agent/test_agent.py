"""Shift loop and CLI against the offline fake (no network)."""

import json
from itertools import pairwise

import httpx

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


def test_unexpected_error_does_not_kill_the_shift(tmp_path, monkeypatch):
    import agent.agent as mod

    fake = FakeWybe()
    real = mod.choose_next
    calls = {"n": 0}

    def flaky_choose(*a, **kw):
        calls["n"] += 1
        if calls["n"] == 2:
            raise RuntimeError("planner bug")
        return real(*a, **kw)

    monkeypatch.setattr(mod, "choose_next", flaky_choose)
    result = run_shift(client_for(tmp_path, fake.handler), seed=1, sim_end="23:30:00")
    assert result["score"] >= 100
    lines = [json.loads(x) for x in (tmp_path / "runs" / f"{result['shift']}.jsonl").read_text().splitlines()]
    notes = [x for x in lines if x["type"] == "decision" and x["kind"] == "note"]
    assert notes and notes[0]["data"]["error"] == "RuntimeError"
    assert lines[-1]["type"] == "end"


def test_persistent_unexpected_error_stops_after_cap_and_writes_end(tmp_path, monkeypatch):
    import agent.agent as mod

    def always(*a, **kw):
        raise RuntimeError("stuck")

    monkeypatch.setattr(mod, "choose_next", always)
    fake = FakeWybe()
    result = run_shift(client_for(tmp_path, fake.handler), seed=1, sim_end="23:30:00")
    assert result["reason"] == "too many errors"
    lines = (tmp_path / "runs" / f"{result['shift']}.jsonl").read_text().splitlines()
    assert json.loads(lines[-1])["type"] == "end"


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


def _open_final(monkeypatch, tmp_path, n=3):
    import agent.__main__ as cli

    monkeypatch.setenv("FINAL_ARMED", "1")
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(cli, "check_mode", lambda *a, **kw: None)
    monkeypatch.setattr(cli, "FINAL_SHIFTS", n)
    monkeypatch.setattr(cli, "FINAL_REAL_TIME_S", 7.0)
    return cli


def test_final_threads_share_client_and_survive_one_crash(tmp_path, monkeypatch, capsys):
    import agent.agent as mod

    cli = _open_final(monkeypatch, tmp_path, 3)
    made = []

    def factory(settings, *, live):
        assert live is True
        c = object()
        made.append(c)
        return c

    seen, lock = [], __import__("threading").Lock()

    def fake_run_shift(client, **kw):
        with lock:
            idx = len(seen)
            seen.append((client, kw))
        if idx == 1:
            raise RuntimeError("shift blew up")
        return {"shift": f"s{idx}", "seed": None, "score": 10 * idx, "requests_served": 0,
                "reason": "done"}

    monkeypatch.setattr(mod, "run_shift", fake_run_shift)
    assert main(["final"], client_factory=factory) == 0
    assert len(made) == 1 and len(seen) == 3
    assert all(c is made[0] for c, _ in seen)
    for _, kw in seen:
        assert kw["mode"] == "final" and kw["seed"] is None and kw["real_time_limit_s"] == 7.0
        assert kw["stop"] is not None
    out = capsys.readouterr().out
    assert out.count("shift ") == 3 and "crashed: RuntimeError" in out
    assert cli.FINAL_SHIFTS == 3


def test_final_returns_nonzero_when_every_shift_crashes(tmp_path, monkeypatch, capsys):
    import agent.agent as mod

    _open_final(monkeypatch, tmp_path, 2)

    def boom(client, **kw):
        raise RuntimeError("x")

    monkeypatch.setattr(mod, "run_shift", boom)
    assert main(["final"], client_factory=lambda s, *, live: object()) != 0


def test_final_armed_but_outside_window_is_refused(tmp_path, monkeypatch, capsys):
    from datetime import datetime

    import agent.__main__ as cli
    from agent.guard import OSLO

    monkeypatch.setattr(cli, "_now", lambda: datetime(2026, 11, 7, 15, 0, tzinfo=OSLO))
    monkeypatch.setenv("FINAL_ARMED", "1")
    monkeypatch.chdir(tmp_path)
    calls = []

    def factory(settings, *, live):
        def forbidden(request):
            calls.append(request)
            raise AssertionError("no request allowed")

        return client_for(tmp_path, forbidden)

    code = main(["final"], client_factory=factory)
    out = capsys.readouterr()
    assert code != 0 and "locked" in (out.out + out.err).lower()
    assert calls == []


def test_offline_run_builds_no_brain_unless_asked(tmp_path, monkeypatch):
    import agent.__main__ as cli

    monkeypatch.chdir(tmp_path)
    built = []
    monkeypatch.setattr(cli, "_brain", lambda s: built.append(1) or None)
    assert main(["run", "--seed", "1", "--sim-end", "22:10:00"]) == 0
    assert built == []
    assert main(["run", "--seed", "1", "--sim-end", "22:10:00", "--brain"]) == 0
    assert built == [1]


def test_live_count_counts_only_practice(tmp_path, monkeypatch):
    import agent.agent as mod

    monkeypatch.chdir(tmp_path)
    (tmp_path / "temp").mkdir()
    (tmp_path / "temp" / "live_runs.jsonl").write_text(
        '{"mode": "practice"}\n{"mode": "final"}\n{"mode": "practice"}\n'
    )
    assert mod._live_count() == 2


# --- Task 13 ----------------------------------------------------------------------------------------

FOLLOW = "Front desk passed on a call from {}: the guest says the {} they ordered an hour ago never came."


def _decisions(tmp_path, result, kind):
    path = tmp_path / "runs" / f"{result['shift']}.jsonl"
    lines = [json.loads(x) for x in path.read_text().splitlines()]
    return [x["data"] for x in lines if x["type"] == "decision" and x["kind"] == kind]


def test_follow_up_and_its_order_are_delivered_once_through_the_loop(tmp_path):
    from agent.planner import Params

    fake = FakeWybe(requests=[("22:03:30", "R-001", "104 wants a towel."),
                              ("22:03:31", "R-002", FOLLOW.format(104, "towel"))])
    result = run_shift(client_for(tmp_path, fake.handler), seed=1, sim_end="22:40:00",
                       params=Params(use_cart=False))
    placed = [e for e in fake.log if e["cmd"] == "place" and e["ok"]]
    assert [e["args"] for e in placed] == [{"item": "towel", "where": "room-104"}]
    assert fake.reports == {"R-001": "done", "R-002": "failed"}
    assert not fake.false_done and not fake.wrong_deliveries
    assert _decisions(tmp_path, result, "hypothesis")
    assert result["requests_served"] == 1  # R-001, also when the follow-up ran it
    path = tmp_path / "runs" / f"{result['shift']}.jsonl"
    end = json.loads(path.read_text().splitlines()[-1])
    assert end["type"] == "end" and end["requests_served"] == 1


def test_full_night_with_the_live_request_types(tmp_path):
    fake = FakeWybe()
    result = run_shift(client_for(tmp_path, fake.handler), seed=1, sim_end="00:30:00")
    assert fake.false_done == [] and not fake.unsafe and not fake.wrong_deliveries
    kinds = {r.rid: r.kind for r in fake._requests.values()}
    for rid, kind in kinds.items():
        if kind in ("bags", "noise", "spill") or (kind == "amenity" and rid == "R-008"):
            assert fake.reports.get(rid) == "done", (rid, kind, fake.reports.get(rid))
        if kind == "followup":
            assert fake.reports.get(rid) == "failed", rid
    ids = {d["id"] for d in _decisions(tmp_path, result, "hypothesis")}
    assert {"H-bags", "H-named", "H-followup", "H-noise", "H-spill", "H-duplicate"} <= ids
    assert result["score"] >= 250


# --- Task 18 / C1: the night must fit the final's share of the rate -----------------------------------

FINAL_CALL_BUDGET = 44 * 60 * 5 // 10  # 44 min at 5 req/s shared by 10 shifts


def test_offline_full_night_fits_the_final_call_budget(tmp_path):
    fake = FakeWybe()
    result = run_shift(client_for(tmp_path, fake.handler), seed=1, sim_end="06:00:00")
    assert fake.false_done == [] and not fake.unsafe
    assert result["score"] >= 250
    assert len(fake.log) <= FINAL_CALL_BUDGET, len(fake.log)


def test_loop_reads_the_inbox_only_when_a_message_is_waiting(tmp_path):
    fake = FakeWybe()
    run_shift(client_for(tmp_path, fake.handler), seed=1, sim_end="23:00:00")
    delivered = sum(len(e["result"]["messages"]) for e in fake.log if e["cmd"] == "inbox")
    inbox_calls = sum(1 for e in fake.log if e["cmd"] == "inbox")
    assert delivered >= 6  # the welcome and R-001..R-005
    assert inbox_calls <= delivered + 1, (inbox_calls, delivered)
    cmds = [e["cmd"] for e in fake.log]
    assert "inbox" not in {b for a, b in pairwise(cmds) if a == "scan"}  # not read after idle scans
