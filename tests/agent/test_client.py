import json
import threading
import time

import httpx
import pytest

from agent.client import RateLimiter, ShiftEnded, WybeClient, WybeError
from agent.config import Settings
from agent.guard import FinalModeLocked


def make_settings(tmp_path, **kw):
    base = {
        "url": "https://nightshift.test/",
        "key": "k123",
        "anthropic_key": None,
        "budget_usd": 30.0,
        "max_rps": 1000.0,
        "final_armed": False,
        "runs_dir": tmp_path / "runs",
    }
    base.update(kw)
    return Settings(**base)


def ok_reply(result=None, **extra):
    body = {"ok": True, "clock": "22:00:01", "result": result or "fine", "events": [], "note": None}
    body.update(extra)
    return httpx.Response(200, json=body)


START = {"shift": "w2-abc", "mode": "practice", "clock": "22:00:00", "seed": 1}


def recording_handler(requests, replies=None):
    def handler(request):
        requests.append(request)
        body = json.loads(request.content)
        if body["cmd"] == "start_shift":
            return ok_reply(START)
        return replies(request) if replies else ok_reply()

    return handler


def make_client(tmp_path, handler, **kw):
    return WybeClient(
        make_settings(tmp_path),
        transport=httpx.MockTransport(handler),
        sleep=lambda s: None,
        **kw,
    )


def test_sends_auth_ua_and_xshift(tmp_path):
    reqs = []
    client = make_client(tmp_path, recording_handler(reqs))
    session = client.start_shift("practice", seed=1)
    session.cmd("status")
    r = reqs[1]
    assert r.headers["Authorization"] == "Bearer k123"
    assert r.headers["User-Agent"] == "TeamFettero-agent/1.0"
    assert r.headers["X-Shift"] == "w2-abc"
    assert json.loads(r.content) == {"cmd": "status"}
    assert "x-shift" not in reqs[0].headers


def test_start_shift_body(tmp_path):
    reqs = []
    client = make_client(tmp_path, recording_handler(reqs))
    session = client.start_shift("practice", seed=1)
    assert json.loads(reqs[0].content) == {
        "cmd": "start_shift",
        "args": {"mode": "practice", "seed": 1},
    }
    assert session.shift_id == "w2-abc"
    assert session.mode == "practice"
    assert session.seed == 1
    assert session.log_path.exists()


def test_final_blocked_before_any_request(tmp_path):
    reqs = []
    client = make_client(tmp_path, recording_handler(reqs))
    with pytest.raises(FinalModeLocked):
        client.start_shift("final")
    assert len(reqs) == 0


def test_409_raises_shift_ended(tmp_path):
    def replies(request):
        return httpx.Response(409, text="That shift has already ended. Start a new one.")

    client = make_client(tmp_path, recording_handler([], replies))
    session = client.start_shift("practice", seed=1)
    with pytest.raises(ShiftEnded):
        session.cmd("status")


def test_shift_over_result_raises_shift_ended(tmp_path):
    def replies(request):
        return ok_reply({"shift_over": True, "reason": "ended", "score": 5})

    client = make_client(tmp_path, recording_handler([], replies))
    session = client.start_shift("practice", seed=1)
    with pytest.raises(ShiftEnded):
        session.cmd("end_shift")


def test_ok_false_is_not_retried(tmp_path):
    reqs = []

    def replies(request):
        return httpx.Response(
            200, json={"ok": False, "clock": "22:00:02", "result": "No towel here.", "events": []}
        )

    client = make_client(tmp_path, recording_handler(reqs, replies))
    session = client.start_shift("practice", seed=1)
    reply = session.cmd("pick", item="towel")
    assert reply.ok is False and reply.result == "No towel here."
    assert len(reqs) == 2


def test_retries_transient_errors(tmp_path):
    state = {"n": 0}

    def replies(request):
        state["n"] += 1
        if state["n"] == 1:
            raise httpx.ConnectTimeout("slow", request=request)
        if state["n"] == 2:
            return httpx.Response(503, text="busy")
        return ok_reply("fine")

    client = make_client(tmp_path, recording_handler([], replies))
    session = client.start_shift("practice", seed=1)
    assert session.cmd("status").ok is True
    assert state["n"] == 3


def test_four_failures_raise_wybe_error(tmp_path):
    state = {"n": 0}

    def replies(request):
        state["n"] += 1
        return httpx.Response(503, text="busy")

    client = make_client(tmp_path, recording_handler([], replies))
    session = client.start_shift("practice", seed=1)
    with pytest.raises(WybeError) as exc:
        session.cmd("status")
    assert "k123" not in str(exc.value)
    assert state["n"] == 4


def test_cloudflare_1010_retried_other_403_not(tmp_path):
    state = {"n": 0}

    def replies(request):
        state["n"] += 1
        if state["n"] == 1:
            return httpx.Response(403, text="error code: 1010")
        return ok_reply()

    client = make_client(tmp_path, recording_handler([], replies))
    session = client.start_shift("practice", seed=1)
    assert session.cmd("status").ok
    assert state["n"] == 2

    def forbidden(request):
        return httpx.Response(403, text="forbidden")

    client2 = make_client(tmp_path, recording_handler([], forbidden))
    s2 = client2.start_shift("practice", seed=1)
    with pytest.raises(WybeError):
        s2.cmd("status")


def test_backoff_delays(tmp_path):
    delays = []
    client = WybeClient(
        make_settings(tmp_path),
        transport=httpx.MockTransport(
            recording_handler([], lambda r: httpx.Response(500, text="x"))
        ),
        sleep=delays.append,
    )
    session = client.start_shift("practice", seed=1)
    with pytest.raises(WybeError):
        session.cmd("status")
    assert delays == [0.5, 1, 2]


def test_log_redacts_and_is_v1(tmp_path):
    client = make_client(tmp_path, recording_handler([]))
    session = client.start_shift("practice", seed=1)
    session.cmd("status")
    session.cmd("look")
    text = session.log_path.read_text()
    lines = [json.loads(line) for line in text.splitlines()]
    assert all(entry["v"] == 1 and isinstance(entry["t"], float) for entry in lines)
    assert "k123" not in text
    assert [entry["type"] for entry in lines] == ["start", "call", "call"]
    call = lines[1]
    assert {"cmd", "args", "ok", "clock", "result", "events", "latency_ms", "status"} <= set(call)
    assert lines[0]["shift"] == "w2-abc"


def test_log_helpers(tmp_path):
    client = make_client(tmp_path, recording_handler([]))
    session = client.start_shift("practice", seed=1)
    session.log_decision("plan", {"x": 1})
    session.log_state({"clock": "22:01:00", "location": "lobby", "score": 0, "battery": 90,
                       "hands": [], "cart": [], "extra": "dropped"})
    session.log_end({"score": 232, "requests_served": 10, "reason": "ended"})
    lines = [json.loads(x) for x in session.log_path.read_text().splitlines()]
    assert [x["type"] for x in lines] == ["start", "decision", "state", "end"]
    assert lines[1]["kind"] == "plan" and lines[1]["data"] == {"x": 1}
    assert "extra" not in lines[2] and lines[2]["location"] == "lobby"
    assert lines[3]["score"] == 232 and lines[3]["reason"] == "ended"


def test_pre_shift_call_has_no_xshift(tmp_path):
    reqs = []
    client = make_client(tmp_path, recording_handler(reqs))
    reply = client.call("whoami")
    assert reply.ok
    assert "x-shift" not in reqs[0].headers


def test_rate_limiter_is_shared_across_threads():
    limiter = RateLimiter(20)
    start = time.monotonic()
    threads = [threading.Thread(target=lambda: [limiter.wait() for _ in range(5)]) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert time.monotonic() - start >= 0.9
