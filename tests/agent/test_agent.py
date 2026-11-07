"""Shift loop and CLI against the offline fake (no network)."""

import json
from itertools import pairwise

import httpx
import pytest

from agent.__main__ import main
from agent.agent import make_client, run_shift
from agent.client import WybeClient
from agent.config import Settings
from tests.fakes.fake_wybe import TYPES_DEMO_REQUESTS, FakeWybe


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
    assert set(result) == {
        "shift", "seed", "score", "requests_served", "reason", "calls", "at_cap",
    }
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
    """The final's lock, satisfied only by an injected in-window clock at both layers."""
    from datetime import datetime
    from functools import partial

    import agent.__main__ as cli
    from agent.guard import OSLO, check_mode

    in_window = datetime(2026, 11, 8, 12, 5, tzinfo=OSLO)
    monkeypatch.setenv("FINAL_ARMED", "1")
    monkeypatch.setenv("WYBE_NIGHTSHIFT_KEY", "test-key")  # a dummy: the fake wants some bearer
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(cli, "_now", lambda: in_window)
    monkeypatch.setattr("agent.client.check_mode", partial(check_mode, now=in_window))
    monkeypatch.setattr(cli, "FINAL_SHIFTS", n)
    monkeypatch.setattr(cli, "FINAL_REAL_TIME_S", 1.0)
    return cli


def _router_factory(router, made):
    def factory(settings, *, live):
        assert live is True
        made.append(WybeClient(settings, transport=httpx.MockTransport(router.handler), sleep=lambda s: None))
        return made[-1]

    return factory


def test_final_threads_share_client_and_survive_one_crash(tmp_path, monkeypatch, capsys):
    import agent.agent as mod
    from tests.fakes.multi_wybe import MultiFakeWybe

    cli = _open_final(monkeypatch, tmp_path, 3)
    router, made = MultiFakeWybe(), []
    real, seen, lock = mod.run_shift, [], __import__("threading").Lock()

    def fake_run_shift(client, **kw):
        with lock:
            idx = len(seen)
            seen.append((client, kw))
        if idx == 1:
            raise RuntimeError("shift blew up")
        return real(client, **kw)

    monkeypatch.setattr(mod, "run_shift", fake_run_shift)
    assert main(["final"], client_factory=_router_factory(router, made)) == 0
    assert len(made) == 1 and len(seen) == 3
    assert all(c is made[0] for c, _ in seen)
    for _, kw in seen:
        assert kw["session"].mode == "final" and kw["real_time_limit_s"] == 1.0
        assert kw["stop"] is not None
    assert router.final_starts == 3
    out = capsys.readouterr().out
    assert "crashed: RuntimeError" in out and out.count("\nshift ") == 3
    assert cli.FINAL_SHIFTS == 3


def test_final_returns_nonzero_when_every_shift_crashes(tmp_path, monkeypatch, capsys):
    import agent.agent as mod
    from tests.fakes.multi_wybe import MultiFakeWybe

    _open_final(monkeypatch, tmp_path, 2)

    def boom(client, **kw):
        raise RuntimeError("x")

    monkeypatch.setattr(mod, "run_shift", boom)
    assert main(["final"], client_factory=_router_factory(MultiFakeWybe(), [])) != 0


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
    assert fake.reports == {"R-001": "done", "R-002": "declined"}  # live: +5 for the declined second call
    assert not fake.false_done and not fake.wrong_deliveries
    assert _decisions(tmp_path, result, "hypothesis")
    assert result["requests_served"] == 1  # R-001, also when the follow-up ran it
    path = tmp_path / "runs" / f"{result['shift']}.jsonl"
    end = json.loads(path.read_text().splitlines()[-1])
    assert end["type"] == "end" and end["requests_served"] == 1


def test_full_night_with_the_live_request_types(tmp_path):
    fake = FakeWybe(requests=TYPES_DEMO_REQUESTS)  # one of every live type by 23:45 (Task 13's script)
    result = run_shift(client_for(tmp_path, fake.handler), seed=1, sim_end="00:30:00")
    assert fake.false_done == [] and not fake.unsafe and not fake.wrong_deliveries
    kinds = {r.rid: r.kind for r in fake._requests.values()}
    for rid, kind in kinds.items():
        if kind in ("bags", "noise", "spill") or (kind == "amenity" and rid == "R-008"):
            assert fake.reports.get(rid) == "done", (rid, kind, fake.reports.get(rid))
        if kind == "followup":  # declined (+5 live, 6 of 6), the order itself retried under its own id
            assert fake.reports.get(rid) == "declined", rid
    ids = {d["id"] for d in _decisions(tmp_path, result, "hypothesis")}
    assert {"H-bags", "H-named", "H-followup", "H-noise", "H-spill"} <= ids  # a tray duplicate is now judged at the pickup
    assert result["score"] >= 250


# --- Task 18 / C1: the night must fit the final's share of the rate -----------------------------------

FINAL_CALL_BUDGET = 44 * 60 * 5 // 10  # 44 min at 5 req/s shared by 10 shifts


def test_offline_full_night_fits_the_final_call_budget_on_the_17_request_script(tmp_path):
    fake = FakeWybe(requests=TYPES_DEMO_REQUESTS)  # the script it was written on, not the 68
    result = run_shift(client_for(tmp_path, fake.handler), seed=1, sim_end="06:00:00")
    assert fake.false_done == [] and not fake.unsafe
    assert result["score"] >= 250
    assert len(fake.log) <= FINAL_CALL_BUDGET, len(fake.log)


# Task 24 / 2: the calibrated seed-1 night (the 68 live requests, the default fake) was over the
# budget (integration review: 1409 calls). Variant 15 (fewer status calls, docks and wet looks) made
# it fit; the ratchet stops it creeping up, the budget test keeps it under the final's cap.
CALIBRATED_NIGHT_RATCHET = 1500  # +70: the stale-look rule before corridor steps


@pytest.fixture(scope="module")
def calibrated_night(tmp_path_factory):
    fake = FakeWybe()
    result = run_shift(client_for(tmp_path_factory.mktemp("calibrated"), fake.handler), seed=1,
                       sim_end="06:00:00")
    return fake, result


def test_calibrated_seed1_night_calls_stay_under_the_ratchet(calibrated_night):
    fake, result = calibrated_night
    assert fake.false_done == [] and not fake.unsafe
    assert result["calls"] == len(fake.log) - 1  # every shift call, not the start
    assert len(fake.log) <= CALIBRATED_NIGHT_RATCHET, len(fake.log)


def test_calibrated_seed1_night_fits_the_final_call_budget(calibrated_night):
    fake, _ = calibrated_night
    assert len(fake.log) <= FINAL_CALL_BUDGET, len(fake.log)


def test_loop_reads_the_inbox_only_when_a_message_is_waiting(tmp_path):
    fake = FakeWybe(requests=TYPES_DEMO_REQUESTS)  # R-001..R-005 by 23:00 (Task 13's script)
    run_shift(client_for(tmp_path, fake.handler), seed=1, sim_end="23:00:00")
    delivered = sum(len(e["result"]["messages"]) for e in fake.log if e["cmd"] == "inbox")
    inbox_calls = sum(1 for e in fake.log if e["cmd"] == "inbox")
    assert delivered >= 6  # the welcome and R-001..R-005
    assert inbox_calls <= delivered + 1, (inbox_calls, delivered)
    # an idle scan is followed by an inbox read only when its own reply brought the inbox event
    for a, b in pairwise(fake.log):
        if a["cmd"] == "scan" and b["cmd"] == "inbox":
            assert any(ev["type"] == "inbox" for ev in a["events"]), a


# --- Task 18 / I1: a Brain room check never reaches a keycard on a noise text or an unknown room ------


def test_brain_room_check_rejected_for_noise_texts_and_unknown_rooms(tmp_path):
    from agent.tasks import Kind, Task

    texts = {"R-001": "Loud music from 103, can you see whether it is occupied?",
             "R-002": "Have a quick peek at 999 please, the guest left."}
    fake = FakeWybe(requests=[("22:03:30", "R-001", texts["R-001"]), ("22:03:31", "R-002", texts["R-002"])],
                    absent_rooms={"room-103"})

    class CheckingBrain:
        enabled = True

        def classify(self, rid, text, arrived):
            room = "103" if rid == "R-001" else "999"
            return Task(rid, Kind.ROOM_CHECK, text, arrived, room=room)

    result = run_shift(client_for(tmp_path, fake.handler), seed=1, sim_end="22:40:00",
                       brain=CheckingBrain())
    assert fake.reports == {"R-001": "failed", "R-002": "failed"}
    assert not any(e["cmd"] == "use" and (e["args"] or {}).get("item") == "keycard" for e in fake.log)
    assert not fake.unsafe and not fake.false_done
    rejected = _decisions(tmp_path, result, "brain_rejected")
    assert {d["request"] for d in rejected} == {"R-001", "R-002"}
    assert not _decisions(tmp_path, result, "brain_classified")


# --- Task 18 / I2, C3: a mid-task server error loses no task; the final never gives up ---------------


def _failing_place(fake, fail_attempts, on_fail=None):
    """A transport where the first `fail_attempts` POSTs of `place` raise ConnectError (4 attempts
    make one WybeError); on_fail runs on each failure."""
    attempts = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        if json.loads(request.content).get("cmd") == "place":
            attempts["n"] += 1
            if attempts["n"] <= fail_attempts:
                if on_fail:
                    on_fail()
                raise httpx.ConnectError("boom")
        return fake.handler(request)

    return handler


def test_mid_task_wybe_error_requeues_the_task_once(tmp_path):
    fake = FakeWybe(requests=[("22:03:30", "R-001", "319 wants a phone charger.")])
    result = run_shift(client_for(tmp_path, _failing_place(fake, 4)), seed=1, sim_end="22:40:00")
    assert fake.reports == {"R-001": "done"} and not fake.false_done
    requeued = _decisions(tmp_path, result, "task_requeued")
    assert len(requeued) == 1 and requeued[0]["request"] == "R-001"
    assert "place" in requeued[0]["error"]


def test_mid_task_wybe_error_twice_reports_failed_with_the_reason(tmp_path):
    fake = FakeWybe(requests=[("22:03:30", "R-001", "319 wants a phone charger.")])
    result = run_shift(client_for(tmp_path, _failing_place(fake, 10_000)), seed=1, sim_end="22:40:00")
    assert fake.reports == {"R-001": "failed"} and not fake.false_done
    assert len(_decisions(tmp_path, result, "task_requeued")) == 1
    given_up = _decisions(tmp_path, result, "task_given_up")
    assert len(given_up) == 1 and given_up[0]["request"] == "R-001" and "place" in given_up[0]["error"]
    note = next(e["args"]["note"] for e in fake.log if e["cmd"] == "report")
    assert "server error" in note and "place" in note


def test_mid_task_wybe_error_with_no_time_left_reports_failed_at_once(tmp_path):
    fake = FakeWybe(requests=[("22:03:30", "R-001", "319 wants a phone charger.")])
    now = {"t": 0.0}

    def jump():  # the real-time limit passes while the server is down
        now["t"] = 10_000.0

    client = client_for(tmp_path, _failing_place(fake, 4, on_fail=jump))
    result = run_shift(client, seed=1, real_time_limit_s=60.0, clock=lambda: now["t"])
    assert fake.reports == {"R-001": "failed"}
    assert not _decisions(tmp_path, result, "task_requeued")
    assert _decisions(tmp_path, result, "task_given_up")
    assert result["reason"] == "real time limit"


def test_real_time_limit_ends_the_shift_cleanly(tmp_path):
    fake = FakeWybe()
    ticks = {"t": 0.0}

    def clock() -> float:
        ticks["t"] += 1.0
        return ticks["t"]

    result = run_shift(client_for(tmp_path, fake.handler), seed=1, real_time_limit_s=30.0, clock=clock)
    assert result["reason"] == "real time limit"
    assert fake.log[-1]["cmd"] == "end_shift" and fake._ended
    lines = [json.loads(x) for x in (tmp_path / "runs" / f"{result['shift']}.jsonl").read_text().splitlines()]
    assert lines[-1]["type"] == "end" and lines[-1]["reason"] == "real time limit"


def test_with_a_real_time_limit_an_error_streak_backs_off_and_never_ends_the_shift(tmp_path, monkeypatch):
    import agent.agent as mod

    def always(*a, **kw):
        raise RuntimeError("stuck")

    monkeypatch.setattr(mod, "choose_next", always)
    fake = FakeWybe()
    now, sleeps = {"t": 0.0}, []

    def sleep(s: float) -> None:
        sleeps.append(s)
        now["t"] += s

    result = run_shift(client_for(tmp_path, fake.handler), seed=1, real_time_limit_s=2000.0,
                       clock=lambda: now["t"], sleep=sleep)
    assert result["reason"] == "real time limit"
    notes = _decisions(tmp_path, result, "note")
    assert len(notes) > mod.MAX_CONSECUTIVE_ERRORS  # practice would have stopped at the cap
    assert max(sleeps) == 30 and sleeps[:5] == [1, 2, 4, 8, 16]
    assert sum(sleeps) >= 2000 - 30
    assert fake.log[-1]["cmd"] == "end_shift"


def test_setup_failure_after_the_start_still_ends_the_shift(tmp_path, monkeypatch):
    import agent.agent as mod

    def boom(*a, **kw):
        raise RuntimeError("executor cannot be built")

    monkeypatch.setattr(mod, "Executor", boom)
    fake = FakeWybe()
    result = run_shift(client_for(tmp_path, fake.handler), seed=1)
    assert result["reason"].startswith("setup failed") and "RuntimeError" in result["reason"]
    assert fake._ended and fake.log[-1]["cmd"] == "end_shift"
    lines = [json.loads(x) for x in (tmp_path / "runs" / f"{result['shift']}.jsonl").read_text().splitlines()]
    assert lines[-1]["type"] == "end" and lines[-1]["reason"] == result["reason"]


# --- scout: the manager's "Skip R-NNN" drops the request (live: a skipped request scores 0 even when done) ---


def test_manager_skip_drops_the_queued_request(tmp_path):
    # The skip arrives with R-001 (live skips come 8-29 min later): var-2's opening loadout already
    # carries a towel, so a skip 1 s later would be read after the delivery and report "failed".
    fake = FakeWybe(requests=[
        ("22:03:30", "R-001", "104 wants a towel."),
        ("22:03:30", "skip", "Skip R-001, 104 checked out. Don't bother with it."),
        ("22:03:32", "R-002", "106 wants a pillow."),
    ])
    result = run_shift(client_for(tmp_path, fake.handler), seed=1, sim_end="22:40:00")
    assert fake.reports["R-001"] == "cancelled"  # live seed 4 R-019: +5 for the cancelled report
    assert "R-002" in fake.reports
    assert not any(e["cmd"] == "place" and (e["args"] or {}).get("where") == "room-104" for e in fake.log)
    skipped = _decisions(tmp_path, result, "request_skipped")
    assert [d["request"] for d in skipped] == ["R-001"] and skipped[0]["was_queued"] is True
    assert skipped[0]["reported"] is True
    assert result["requests_served"] == 1


# --- variant 20: a skip read mid-task stops the running task (live seed 5 R-040: 9 min of scans after it) ---

LOST_104 = ("22:03:30", "R-001", "Guest in 104 lost glasses, maybe the ground floor corridor.")


def _mid_task_night(skip_at: str) -> FakeWybe:
    return FakeWybe(requests=[LOST_104, ("22:30:00", "R-002", "106 wants a pillow.")], hidden={},
                    skips=[(skip_at, "skip", "Skip R-001, 104 checked out. Don't bother with it.")],
                    end_clock="22:45:00")


def _clock_at(tmp_path, result, kind: str) -> str | None:
    """The sim clock of the last call before the first decision of `kind`."""
    clock = None
    for line in (tmp_path / "runs" / f"{result['shift']}.jsonl").read_text().splitlines():
        x = json.loads(line)
        if x["type"] == "call":
            clock = x.get("clock") or clock
        elif x["type"] == "decision" and x["kind"] == kind:
            return clock
    return None


def test_skip_read_mid_task_stops_the_search_and_reports_cancelled(tmp_path):
    fake = _mid_task_night("22:14:00")  # 10.5 min after the request, during the search
    result = run_shift(client_for(tmp_path, fake.handler), seed=1)
    assert fake.reports == {"R-001": "cancelled", "R-002": "done"}  # +5, and the next request still served
    ends = [d for d in _decisions(tmp_path, result, "task_failed") if d["request"] == "R-001"]
    assert [d["status"] for d in ends] == ["skipped"] and "mid-task" in ends[0]["note"]
    assert "22:14:00" <= _clock_at(tmp_path, result, "task_failed") <= "22:15:30"  # at the next step
    assert fake.false_done == [] and not fake.unsafe


def test_task_younger_than_any_live_skip_reads_no_inbox_mid_task(tmp_path):
    fake = FakeWybe(requests=[LOST_104, ("22:05:00", "R-002", "106 wants a pillow.")], hidden={},
                    end_clock="22:45:00")
    result = run_shift(client_for(tmp_path, fake.handler), seed=1)
    reads = [e["clock"] for e in fake.log if e["cmd"] == "inbox" and e.get("clock")]
    # R-002 waits from 22:05: the search (started 22:03:40) reads it only once 8 min old
    assert not [c for c in reads if "22:03:41" <= c < "22:11:30"]
    assert fake.reports.get("R-002") == "done"
    assert all(d["status"] != "skipped" for d in _decisions(tmp_path, result, "task_failed"))
