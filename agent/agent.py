"""Shift loop: read the inbox, pick the best task, run it, wait when idle, always log the end.

Every request goes into the executor's ledger as it arrives (follow-ups and duplicates are judged
against it), and the executor sees the pending queue (a follow-up may run its waiting original).
World events such as a stranger asking to be let in are handled by the executor as they arrive.
"""

from __future__ import annotations

import json
import threading
import time
from dataclasses import replace
from pathlib import Path

import httpx

from agent import flows
from agent.client import ShiftEnded, ShiftSession, WybeClient, WybeError
from agent.config import Settings
from agent.executor import ActionFailed, Executor
from agent.offline import FakeWybe
from agent.planner import Params, choose_next, opening_plan
from agent.tasks import Kind, Task, parse_request
from agent.world import Hotel, RobotState, clock_to_seconds

PARAMS_FILE = Path(__file__).parent / "data" / "params_best.json"
LIVE_RUNS = Path("temp/live_runs.jsonl")
MAX_CONSECUTIVE_ERRORS = 25
_live_lock = threading.Lock()


def load_params() -> Params:
    if PARAMS_FILE.exists():
        return Params.from_json(PARAMS_FILE.read_text())
    return Params()


def _live_transport() -> httpx.BaseTransport | None:
    return None  # httpx default: the real network


def _live_count() -> int:
    """Live practice starts so far (final starts are not practice shifts)."""
    try:
        lines = LIVE_RUNS.read_text().splitlines()
    except OSError:
        return 0
    count = 0
    for line in lines:
        try:
            count += json.loads(line).get("mode") == "practice"
        except (ValueError, AttributeError):
            continue
    return count


def make_client(settings: Settings, *, live: bool) -> WybeClient:
    """Offline (default): the fake server in-process. Live: the real server; every start counted."""
    if not live:
        fake = FakeWybe()
        offline = replace(settings, key="offline", max_rps=1000.0)  # never the real key, no throttle
        return WybeClient(
            offline, transport=httpx.MockTransport(fake.handler), sleep=lambda s: None
        )
    client = WybeClient(settings, transport=_live_transport())
    real_start = client.start_shift

    def counted_start(mode: str, seed: int | None = None) -> ShiftSession:
        with _live_lock:
            if mode == "practice":
                print(f"live practice shifts used: {_live_count()}", flush=True)
            session = real_start(mode, seed)
            LIVE_RUNS.parent.mkdir(parents=True, exist_ok=True)
            entry = {"t": time.time(), "shift": session.shift_id, "mode": mode, "seed": seed}
            with LIVE_RUNS.open("a", encoding="utf-8") as fh:
                fh.write(json.dumps(entry) + "\n")
        return session

    client.start_shift = counted_start  # type: ignore[method-assign]
    return client


def _read_inbox(ex: Executor, brain, seen: set[str], pending: list[Task]) -> None:
    reply = ex.cmd("inbox")
    ex.inbox_waiting = False
    msgs = reply.result.get("messages") if isinstance(reply.result, dict) else None
    for msg in msgs or []:
        if not isinstance(msg, dict) or not isinstance(msg.get("request"), str):
            continue
        rid = msg["request"]
        if rid in seen:
            continue
        seen.add(rid)
        task = parse_request(rid, str(msg.get("text", "")), str(msg.get("at") or ex.state.clock))
        if task.kind is Kind.UNKNOWN and brain is not None and getattr(brain, "enabled", False):
            better = brain.classify(task.request, task.text, task.arrived)
            if better is not None and better.kind is not Kind.UNKNOWN:
                task = flows.normalize(better)
                ex.log("brain_classified", request=rid, kind=task.kind.value, room=task.room,
                       item=task.item)
        ex.log("request", request=rid, kind=task.kind.value, text=task.text)
        ex.ledger.add(task)
        pending.append(task)


def run_shift(
    client: WybeClient,
    *,
    mode: str = "practice",
    seed: int | None = None,
    params: Params | None = None,
    brain=None,
    sim_end: str | None = None,
    real_time_limit_s: float | None = None,
    stop: threading.Event | None = None,
    call_cap: int = 0,
) -> dict:
    params = params or load_params()
    session = client.start_shift(mode, seed)
    session.call_cap = call_cap or None  # bench: snapshot the score when the shift's calls reach it
    hotel, state = Hotel.load(), RobotState()
    # Claude classifies unknown requests in ONE place (here), so the executor gets no brain.
    ex = Executor(session, hotel, state, max_scans=params.max_scans)
    deadline = time.monotonic() + real_time_limit_s if real_time_limit_s else None
    sim_end_s = clock_to_seconds(sim_end) if sim_end else None
    result: dict = {"shift": session.shift_id, "seed": seed, "score": None,
                    "requests_served": None, "reason": ""}
    pending: list[Task] = []
    ex.queue = pending  # the same list: a follow-up that runs its original removes it here
    seen: set[str] = set()
    errors = 0
    opened = False
    try:
        while True:
            if stop is not None and stop.is_set():
                result["reason"] = "stopped"
                break
            if deadline is not None and time.monotonic() >= deadline:
                result["reason"] = "real time limit"
                break
            try:
                ex.refresh()
                if sim_end_s is not None and clock_to_seconds(state.clock) >= sim_end_s:
                    result["reason"] = "sim end"
                    break
                _read_inbox(ex, brain, seen, pending)
                if not opened:
                    opened = True
                    for step in opening_plan(params):
                        try:
                            if step == "get_cart":
                                ex.get_cart()
                            elif step == "stock_cart":
                                ex.stock_cart(params.cart_stock)
                        except ActionFailed as exc:
                            ex.log("opening_failed", step=step, reason=str(exc))
                    continue
                task = choose_next(pending, state, hotel, params)
                if task is None:
                    ex.wait_for_request()
                else:
                    pending.remove(task)
                    ex.run(task)
                errors = 0
            except ShiftEnded:
                raise
            except WybeError as exc:
                errors += 1
                session.log_decision("wybe_error", {"error": str(exc)[:200], "streak": errors})
                if errors >= MAX_CONSECUTIVE_ERRORS:
                    result["reason"] = "too many errors"
                    break
            except Exception as exc:  # noqa: BLE001 - one odd bug must not kill the shift
                errors += 1
                session.log_decision(
                    "note",
                    {"error": type(exc).__name__, "message": str(exc)[:200], "streak": errors},
                )
                if errors >= MAX_CONSECUTIVE_ERRORS:
                    result["reason"] = "too many errors"
                    break
    except ShiftEnded as exc:
        result["reason"] = f"server ended: {exc}"[:200]
    finally:
        try:
            if not result["reason"].startswith("server ended"):
                _end(ex, session)
        except ShiftEnded:
            pass
        except WybeError as exc:
            session.log_decision("wybe_error", {"error": str(exc)[:200], "during": "end_shift"})
        except Exception as exc:  # noqa: BLE001 - the end line below must still be written
            session.log_decision("end_failed", {"error": type(exc).__name__})
        result["score"] = state.score
        result["calls"] = session.calls
        result["at_cap"] = session.at_cap  # (score, clock) when calls reached call_cap, else None
        result["requests_served"] = ex.ledger.served()  # also originals a follow-up ran or redelivered
        session.log_end(result)
    return result


def _end(ex: Executor, session: ShiftSession) -> None:
    try:
        ex.refresh()  # the last score; end_shift's own reply raises ShiftEnded
    except (WybeError, ShiftEnded):
        pass
    session.cmd("end_shift")
