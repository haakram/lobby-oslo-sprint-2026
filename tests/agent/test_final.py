"""The final's own conditions, offline (Task 18 C2, I4): starts that fail or time out, a process
restart, and ten real `run_shift` threads on one client, one limiter and injected outages.

The final lock is satisfied only by injecting the clock: `check_mode` keeps its full logic and gets
an in-window `now`, both in the client (lowest layer) and in the CLI. Never by real time."""

import json
import threading
import time
from datetime import datetime
from functools import partial

import httpx
import pytest

from agent.agent import FinalStarter, run_shift
from agent.client import RateLimiter, WybeClient, WybeError
from agent.config import Settings
from agent.guard import OSLO, check_mode
from tests.fakes.multi_wybe import MultiFakeWybe

IN_WINDOW = datetime(2026, 11, 8, 12, 5, tzinfo=OSLO)
ONE_REQUEST = {"requests": [("22:03:30", "R-001", "319 wants a phone charger.")]}


def _arm(monkeypatch):
    """Inject the final's clock at both lock layers; the armed flag comes from Settings/env."""
    monkeypatch.setattr("agent.client.check_mode", partial(check_mode, now=IN_WINDOW))
    monkeypatch.setattr("agent.__main__._now", lambda: IN_WINDOW)


def _settings(tmp_path, **kw) -> Settings:
    base = {"url": "https://nightshift.test/", "key": "test-key", "anthropic_key": None,
            "budget_usd": 30.0, "max_rps": 1000.0, "final_armed": True, "runs_dir": tmp_path / "runs"}
    base.update(kw)
    return Settings(**base)


def _client(tmp_path, router, **kw) -> WybeClient:
    return WybeClient(_settings(tmp_path), transport=httpx.MockTransport(router.handler),
                      sleep=lambda s: None, **kw)


def _log(tmp_path, shift_id):
    return [json.loads(x) for x in (tmp_path / "runs" / f"{shift_id}.jsonl").read_text().splitlines()]


# --- C2: start resilience ---------------------------------------------------------------------------


def test_final_start_is_locked_at_the_lowest_layer_without_the_injected_clock(tmp_path):
    from agent.guard import FinalModeLocked

    router = MultiFakeWybe()
    with pytest.raises(FinalModeLocked):
        FinalStarter(_client(tmp_path, router), limit=1).session()
    assert router.final_starts == 0 and not router.fakes


def test_start_is_retried_with_backoff_until_it_succeeds(tmp_path, monkeypatch):
    _arm(monkeypatch)
    router = MultiFakeWybe(fail_starts=6)  # the first start_shift fails all 4 attempts; the next works
    sleeps = []
    starter = FinalStarter(_client(tmp_path, router), limit=10, sleep=sleeps.append)
    session = starter.session()
    assert session is not None and session.mode == "final"
    assert router.final_starts == 1 and router.order == [session.shift_id]
    assert sleeps and sleeps[0] >= 1


def test_ambiguous_start_adopts_the_shift_the_server_created(tmp_path, monkeypatch):
    _arm(monkeypatch)
    router = MultiFakeWybe(timeout_starts=1)  # the shift exists, the reply never came
    starter = FinalStarter(_client(tmp_path, router), limit=10, sleep=lambda s: None)
    session = starter.session()
    assert session.shift_id == router.order[0]
    assert router.final_starts == 1 and len(router.fakes) == 1  # no second final shift
    assert "shifts" in router.pre_calls
    kinds = [x.get("kind") for x in _log(tmp_path, session.shift_id) if x["type"] == "decision"]
    assert "adopted_shift" in kinds


def test_restart_adopts_live_finals_counts_ended_ones_and_starts_only_the_rest(tmp_path, monkeypatch):
    _arm(monkeypatch)
    router = MultiFakeWybe()
    live = {router.orphan(), router.orphan()}
    router.orphan(ended=True)
    router.orphan("practice")  # a practice shift never counts
    starter = FinalStarter(_client(tmp_path, router), limit=4, sleep=lambda s: None)
    assert set(starter.live) == live and starter.ended == 1 and starter.remaining == 1
    sessions = [starter.session() for _ in range(4)]
    ids = [s.shift_id for s in sessions if s is not None]
    assert set(ids[:2]) == live and len(ids) == 3 and sessions[3] is None
    assert router.final_starts == 4  # 3 before this process + 1 now: never more than the limit


def test_start_gives_up_after_the_retry_budget(tmp_path, monkeypatch):
    _arm(monkeypatch)
    router = MultiFakeWybe(fail_starts=10**6)
    now = {"t": 0.0}

    def sleep(s):
        now["t"] += s

    starter = FinalStarter(_client(tmp_path, router), limit=10, retry_s=120.0,
                           sleep=sleep, clock=lambda: now["t"])
    with pytest.raises(WybeError, match="start"):
        starter.session()
    assert now["t"] >= 120 and router.final_starts == 0


def test_final_cli_prints_each_start_and_end_and_starts_only_the_missing(tmp_path, monkeypatch, capsys):
    import agent.__main__ as cli

    _arm(monkeypatch)
    monkeypatch.setenv("FINAL_ARMED", "1")
    monkeypatch.setenv("WYBE_NIGHTSHIFT_KEY", "test-key")  # a dummy: the fake wants some bearer
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(cli, "FINAL_SHIFTS", 3)
    monkeypatch.setattr(cli, "FINAL_REAL_TIME_S", 1.0)
    router = MultiFakeWybe(fake_kw=ONE_REQUEST)
    orphan = router.orphan()
    made = []

    def factory(settings, *, live):
        assert live is True and settings.final_armed is True
        made.append(WybeClient(settings, transport=httpx.MockTransport(router.handler), sleep=lambda s: None))
        return made[-1]

    assert cli.main(["final"], client_factory=factory) == 0
    out = capsys.readouterr().out
    assert len(made) == 1 and router.final_starts == 3  # one adopted, two started
    assert out.count(" started") == 2 and out.count(" adopted") == 1 and out.count("ended  score") == 3
    assert out.index("ended  score") < out.index("summary")
    assert all(f._ended for f in router.fakes.values()) and orphan in router.fakes
    assert "score" in out


# --- I4: the final topology, end to end ------------------------------------------------------------


def test_ten_final_shifts_share_one_client_and_limiter_and_none_ends_early(tmp_path, monkeypatch):
    import agent.agent as mod

    _arm(monkeypatch)
    monkeypatch.setattr(mod, "MAX_CONSECUTIVE_ERRORS", 5)  # practice would stop at 5 strikes
    n, rps, limit_s = 10, 200.0, 3.0
    # shift #3 meets 32 straight 503s: 8 WybeErrors in a row, more than the (lowered) practice cap
    router = MultiFakeWybe(fake_kw=ONE_REQUEST, error_bursts={3: (5, 32)})
    client = WybeClient(_settings(tmp_path), transport=httpx.MockTransport(router.handler),
                        limiter=RateLimiter(rps), sleep=lambda s: None)
    starter = FinalStarter(client, limit=n, sleep=lambda s: None)
    results: list[dict | None] = [None] * n
    stop = threading.Event()

    def work(i):
        session = starter.session()
        results[i] = run_shift(client, session=session, brain=None, real_time_limit_s=limit_s,
                               stop=stop, sleep=lambda s: None)

    started = time.monotonic()
    threads = [threading.Thread(target=work, args=(i,)) for i in range(n)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=60)
    elapsed = time.monotonic() - started
    assert not any(t.is_alive() for t in threads)
    assert len(router.fakes) == n and router.final_starts == n
    assert [r["reason"] for r in results] == ["real time limit"] * n  # nobody gave up
    calls = [x for x in router.requests if x[2] not in ("start_shift", "shifts")]
    assert len(calls) <= rps * elapsed + n and elapsed >= (len(calls) - 1) / rps  # the shared limiter held
    for sid, fake in router.fakes.items():
        assert fake._ended and fake.log[-1]["cmd"] == "end_shift"
        assert {e["x_shift"] for e in fake.log if e["cmd"] != "start_shift"} == {sid}
        lines = _log(tmp_path, sid)
        assert lines[0] == {**lines[0], "type": "start", "shift": sid, "mode": "final"}
        assert lines[-1]["type"] == "end" and lines[-1]["reason"] == "real time limit"
        assert sum(1 for x in lines if x["type"] == "end") == 1
        assert sum(1 for x in lines if x["type"] == "call") == len(fake.log) - 1  # only its own calls
    noisy = router.order[3]
    streaks = [x["data"]["streak"] for x in _log(tmp_path, noisy)
               if x["type"] == "decision" and x["kind"] == "wybe_error"]
    assert max(streaks) > mod.MAX_CONSECUTIVE_ERRORS


# --- fix round 1 ------------------------------------------------------------------------------------


def test_restart_with_an_ambiguous_start_never_exceeds_the_limit(tmp_path, monkeypatch):
    _arm(monkeypatch)
    router = MultiFakeWybe(timeout_starts=1)
    for _ in range(3):
        router.orphan(ended=True)  # a crashed earlier run played three
    starter = FinalStarter(_client(tmp_path, router), limit=4, sleep=lambda s: None)
    assert starter.remaining == 1
    first = starter.session()  # the start creates #4, the reply is lost, the retry adopts #4
    assert first is not None and first.shift_id == router.order[3]
    assert starter.session() is None  # the listing now holds 4 finals: no fifth, ever
    assert router.final_starts == 4 and len(router.fakes) == 4


def test_stop_during_start_backoff_makes_no_further_start(tmp_path, monkeypatch):
    _arm(monkeypatch)
    router = MultiFakeWybe(fail_starts=10**6)
    stop = threading.Event()

    def ctrl_c_during_backoff(seconds):
        stop.set()

    starter = FinalStarter(_client(tmp_path, router), limit=10, sleep=ctrl_c_during_backoff, stop=stop)
    assert starter.session() is None
    assert sum(1 for r in router.requests if r[2] == "start_shift") == 1


def _dead_pid() -> int:
    import os

    for pid in range(99990, 1000, -1):
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            return pid
        except PermissionError:
            continue
    raise AssertionError("no free pid found")


def _cli_final(tmp_path, monkeypatch, n=1, limit_s=0.5):
    import agent.__main__ as cli

    _arm(monkeypatch)
    monkeypatch.setenv("FINAL_ARMED", "1")
    monkeypatch.setenv("WYBE_NIGHTSHIFT_KEY", "test-key")
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(cli, "FINAL_SHIFTS", n)
    monkeypatch.setattr(cli, "FINAL_REAL_TIME_S", limit_s)
    router = MultiFakeWybe(fake_kw=ONE_REQUEST)

    def factory(settings, *, live):
        return WybeClient(settings, transport=httpx.MockTransport(router.handler), sleep=lambda s: None)

    return cli, router, factory


def test_final_refuses_when_another_live_final_process_holds_the_lock(tmp_path, monkeypatch, capsys):
    import os

    cli, router, factory = _cli_final(tmp_path, monkeypatch)
    lock = tmp_path / "temp" / "final.lock"
    lock.parent.mkdir()
    lock.write_text(str(os.getppid()))  # a live process that is not us
    assert cli.main(["final"], client_factory=factory) == 2
    err = capsys.readouterr().err
    assert "final.lock" in err and str(os.getppid()) in err
    assert router.final_starts == 0 and not router.requests
    assert lock.read_text() == str(os.getppid())


def test_final_takes_over_a_stale_lock_and_removes_it_on_exit(tmp_path, monkeypatch):
    cli, router, factory = _cli_final(tmp_path, monkeypatch)
    lock = tmp_path / "temp" / "final.lock"
    lock.parent.mkdir()
    lock.write_text(str(_dead_pid()))
    assert cli.main(["final"], client_factory=factory) == 0
    assert router.final_starts == 1 and not lock.exists()


def test_final_loads_params_and_the_hotel_before_any_start(tmp_path, monkeypatch, capsys):
    import agent.agent as mod

    cli, router, factory = _cli_final(tmp_path, monkeypatch)

    def broken():
        raise RuntimeError("params_best.json is garbage")

    monkeypatch.setattr(mod, "load_params", broken)
    assert cli.main(["final"], client_factory=factory) == 2
    assert "params" in capsys.readouterr().err.lower()
    assert router.final_starts == 0 and not (tmp_path / "temp" / "final.lock").exists()
