"""The final's guard: the first `status` with no number for `score` (no key, or null) switches the night to
score-blind for the rest of the shift, with one `score_blind_auto` line (executor module doc).

The final hides scores from the public board; if its `status` hid them too, the sighted build's done gates
(a score rise after the place or the say) would report every delivery and message failed. With a score on
every status nothing changes (the byte-identity check is the seed-1 night and the replay bed, see
temp/guard-report.md); these tests pin the switch and what it saves.
"""

import json

import httpx
import pytest

from agent.agent import run_shift
from agent.executor import Executor
from tests.agent.test_agent import client_for
from tests.agent.test_executor import decisions, next_task, setup
from tests.fakes.fake_wybe import FakeWybe

SHORT = "00:30:00"  # the first requests of the default night: deliveries, trays, a message, a room check


@pytest.fixture(autouse=True)
def sighted(monkeypatch):
    monkeypatch.delenv("NS_SCORE_BLIND", raising=False)


def hiding(handler, how: str):
    """The server's replies with the score hidden: `missing` drops the key from every status, `null` sets
    it to null, `final` drops it and also takes the score off the shift_over reply and the thanks off
    every report reply (no feedback at all)."""

    def wrapped(request: httpx.Request) -> httpx.Response:
        resp = handler(request)
        body = json.loads(resp.content)
        cmd = json.loads(request.content or b"{}").get("cmd")
        result = body.get("result")
        if cmd == "status" and isinstance(result, dict):
            if how == "null":
                result["score"] = None
            else:
                result.pop("score", None)
        if how == "final":
            if isinstance(result, dict) and result.get("shift_over"):
                result.pop("score", None)
            if cmd == "report" and isinstance(result, str):
                body["result"] = result.replace(" Thanks.", "")
        return httpx.Response(resp.status_code, json=body)

    return wrapped


def night(tmp_path, how: str | None = None, sim_end: str = SHORT):
    fake = FakeWybe()
    handler = fake.handler if how is None else hiding(fake.handler, how)
    result = run_shift(client_for(tmp_path, handler), seed=1, sim_end=sim_end)
    log = [json.loads(x) for x in (tmp_path / "runs" / f"{result['shift']}.jsonl").read_text().splitlines()]
    return fake, result, log


def kinds_of(log, outcome: str) -> list[str]:
    kind = {x["data"]["request"]: x["data"]["kind"] for x in log
            if x["type"] == "decision" and x["kind"] == "task_start"}
    return [kind[x["data"]["request"]] for x in log if x["type"] == "decision" and x["kind"] == outcome]


def auto_lines(log) -> list[dict]:
    return [x["data"] for x in log if x["type"] == "decision" and x["kind"] == "score_blind_auto"]


def calls_of(fake) -> list:
    return [(e["cmd"], e["args"]) for e in fake.log]


def test_score_on_every_status_never_switches(tmp_path):
    fake, _result, log = night(tmp_path)
    assert auto_lines(log) == []
    assert not any(x["type"] == "decision" and x["kind"] == "blind_check" for x in log)
    assert "amenity" in kinds_of(log, "task_done") and fake.false_done == []


@pytest.mark.parametrize("how", ["missing", "null", "final"])
def test_score_hidden_switches_once_and_still_reports_the_work_done(tmp_path, how):
    fake, _result, log = night(tmp_path, how)
    [auto] = auto_lines(log)
    assert auto["reason"] == ("status had no score" if how != "null" else "status score was None, not a number")
    first_status = next(i for i, x in enumerate(log) if x.get("cmd") == "status")
    assert log[first_status + 1]["kind"] == "score_blind_auto"  # at once, before any request is read
    done = kinds_of(log, "task_done")
    for kind in ("amenity", "tray", "message", "room_check"):
        assert kind in done, (kind, done)
    failed_notes = [x["data"]["note"] for x in log if x["type"] == "decision" and x["kind"] == "task_failed"]
    assert not any("score did not rise" in n for n in failed_notes), failed_notes
    assert fake.false_done == []
    checks = [x["data"] for x in log if x["type"] == "decision" and x["kind"] == "blind_check"]
    assert checks and all(c["observed"] for c in checks)


def test_score_hidden_night_sends_the_calls_of_the_sighted_night(tmp_path):
    # the fake credits what the robot saw, so the blind night must do exactly what the sighted one did,
    # with the same call economy (a status with no score still lets the loop skip a status)
    sighted_fake, _, sighted_log = night(tmp_path / "sighted")
    hidden_fake, _, hidden_log = night(tmp_path / "hidden", "missing")
    assert calls_of(hidden_fake) == calls_of(sighted_fake)
    assert kinds_of(hidden_log, "task_done") == kinds_of(sighted_log, "task_done")
    assert hidden_fake.score == sighted_fake.score


def test_without_the_switch_the_hidden_score_fails_the_deliveries(tmp_path, monkeypatch):
    # the contrast (8de9ffc's behaviour): no switch, and every delivery waits for a rise it never sees
    monkeypatch.setattr(Executor, "switch_score_blind", lambda self, reason: None)
    _fake, _result, log = night(tmp_path, "missing")
    assert auto_lines(log) == []
    assert "amenity" not in kinds_of(log, "task_done") and "message" not in kinds_of(log, "task_done")
    notes = [x["data"]["note"] for x in log if x["type"] == "decision" and x["kind"] == "task_failed"]
    assert any("score did not rise" in n for n in notes)


@pytest.mark.parametrize("how", ["missing", "null"])
def test_hidden_score_reads_as_none_and_nothing_raises(tmp_path, monkeypatch, how):
    fake, session, ex = setup(tmp_path, rids={"R-001"})
    real = fake._cmd_status

    def status(args):
        ok, result = real(args)
        result = {k: v for k, v in result.items() if k != "score"}
        if how == "null":
            result["score"] = None
        return ok, result

    monkeypatch.setattr(fake, "_cmd_status", status)
    out = ex.run(next_task(ex, session, "R-001"))
    assert out.status == "done" and out.points == 0, out
    assert ex.blind and ex.score_hidden and fake.reports == {"R-001": "done"} and fake.false_done == []
    assert ex.score_now() is None
    ex.cmd("look")
    sent = len(fake.log)
    assert ex.score_before() is None and len(fake.log) == sent  # nothing to read: no status call for it
    ex.cmd("say", text="Good evening.")  # not score-neutral: the next "before" asks the server, reads None
    assert ex.score_before() is None and fake.log[-1]["cmd"] == "status"
    assert len(decisions(session, "score_blind_auto")) == 1


def test_a_refutation_made_before_the_switch_stands(tmp_path):
    _fake, _session, ex = setup(tmp_path, rids={"R-001"})
    ex.experiments["spill_done"] = False  # a sighted "Noted." refuted it before the score went away
    ex.switch_score_blind("status had no score")
    ex.switch_score_blind("status had no score")  # once a night
    assert ex.blind and ex.experiment("spill_done") is False and ex.experiment("sign_move") is True
