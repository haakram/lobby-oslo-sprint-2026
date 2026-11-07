"""Shift loop: read the inbox, pick the best task, run it, wait when idle, always log the end.

Every request goes into the executor's ledger as it arrives (follow-ups and duplicates are judged
against it), and the executor sees the pending queue (a follow-up may run its waiting original).
World events such as a stranger asking to be let in are handled by the executor as they arrive.
"""

from __future__ import annotations

import json
import threading
import time
from collections.abc import Callable
from dataclasses import replace
from pathlib import Path

import httpx

from agent import flows
from agent.client import ShiftEnded, ShiftSession, WybeClient, WybeError
from agent.config import Settings
from agent.executor import NOTE_MAX, ActionFailed, Executor
from agent.offline import FakeWybe
from agent.planner import Params, choose_next, opening_plan
from agent.tasks import Kind, Task, parse_request, vet_brain_task
from agent.world import Hotel, RobotState, clock_to_seconds

PARAMS_FILE = Path(__file__).parent / "data" / "params_best.json"
LIVE_RUNS = Path("temp/live_runs.jsonl")
MAX_CONSECUTIVE_ERRORS = 25  # practice only: a final shift backs off and keeps trying instead
ERROR_BACKOFF_MAX_S = 30.0
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


def _inbox_waiting(ex: Executor, status: dict) -> bool:
    """Read the inbox only when something is there: an inbox event was seen, status counts unread
    messages, or status was unusable (then the inbox is the only way to know)."""
    if ex.inbox_waiting:
        return True
    unread = status.get("unread_messages") if status else None
    return not isinstance(unread, int) or unread > 0


def _vet_brain(ex: Executor, original: Task, better: Task) -> Task:
    """The Brain's answer is model output: a room check on a noise/complaint text, or on a room the
    hotel map does not have, is rejected (the request stays UNKNOWN and is reported failed)."""
    vetted = vet_brain_task(better)
    reason = None
    if better.kind is Kind.ROOM_CHECK and vetted.kind is not Kind.ROOM_CHECK:
        reason = "room check on a noise or complaint text"
    elif vetted.kind is Kind.ROOM_CHECK and vetted.room not in ex.hotel.nodes:
        reason = f"room check on an unknown room {vetted.room}"
    if reason is not None:
        ex.log("brain_rejected", request=original.request, kind=better.kind.value, room=better.room,
               reason=reason)
        return original
    ex.log("brain_classified", request=original.request, kind=vetted.kind.value, room=vetted.room,
           item=vetted.item)
    return vetted


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
                task = _vet_brain(ex, task, flows.normalize(better))
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
    clock: Callable[[], float] = time.monotonic,
    sleep: Callable[[float], None] | None = None,
) -> dict:
    """One shift from start to the `end` log line. With a real-time limit (the final), an error
    streak never ends the shift: the loop backs off (capped at ERROR_BACKOFF_MAX_S) and keeps
    trying until the limit; a practice shift stops after MAX_CONSECUTIVE_ERRORS."""
    params = params or load_params()
    session = client.start_shift(mode, seed)
    hotel, state = Hotel.load(), RobotState()
    # Claude classifies unknown requests in ONE place (here), so the executor gets no brain.
    ex = Executor(session, hotel, state, max_scans=params.max_scans)
    deadline = clock() + real_time_limit_s if real_time_limit_s else None
    pause = sleep or (stop.wait if stop is not None else time.sleep)

    def out_of_time() -> bool:
        return (stop is not None and stop.is_set()) or (deadline is not None and clock() >= deadline)

    def hold_on(errors: int) -> bool:
        """After an error: True to keep going (after a backoff in the final), False to stop."""
        if deadline is None:
            return errors < MAX_CONSECUTIVE_ERRORS
        delay = min(ERROR_BACKOFF_MAX_S, 2.0 ** (errors - 1))
        delay = min(delay, max(0.0, deadline - clock()))
        if delay > 0:
            pause(delay)
        return True

    sim_end_s = clock_to_seconds(sim_end) if sim_end else None
    result: dict = {"shift": session.shift_id, "seed": seed, "score": None,
                    "requests_served": None, "reason": ""}
    pending: list[Task] = []
    ex.queue = pending  # the same list: a follow-up that runs its original removes it here
    seen: set[str] = set()
    retried: set[str] = set()  # tasks put back once after a mid-task server error
    errors = 0
    opened = False
    try:
        while True:
            task = None
            if stop is not None and stop.is_set():
                result["reason"] = "stopped"
                break
            if deadline is not None and clock() >= deadline:
                result["reason"] = "real time limit"
                break
            try:
                status = ex.refresh()
                if sim_end_s is not None and clock_to_seconds(state.clock) >= sim_end_s:
                    result["reason"] = "sim end"
                    break
                if _inbox_waiting(ex, status):
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
                    ex.wait_for_request(should_stop=out_of_time)
                else:
                    pending.remove(task)
                    ex.run(task)
                errors = 0
            except ShiftEnded:
                raise
            except WybeError as exc:
                errors += 1
                session.log_decision("wybe_error", {"error": str(exc)[:200], "streak": errors})
                if task is not None:
                    _rescue(ex, task, pending, retried, str(exc), time_left=not out_of_time())
                if not hold_on(errors):
                    result["reason"] = "too many errors"
                    break
            except Exception as exc:  # noqa: BLE001 - one odd bug must not kill the shift
                errors += 1
                session.log_decision(
                    "note",
                    {"error": type(exc).__name__, "message": str(exc)[:200], "streak": errors},
                )
                if not hold_on(errors):
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
        result["requests_served"] = ex.ledger.served()  # also originals a follow-up ran or redelivered
        session.log_end(result)
    return result


def _rescue(ex: Executor, task: Task, pending: list[Task], retried: set[str], error: str,
            *, time_left: bool) -> None:
    """A server error in the middle of a task must not lose it: put it back once while time
    remains, else report it failed with the reason (never done: nothing was verified)."""
    entry = ex.ledger.get(task.request)
    if entry is not None and entry.status != "pending":
        return  # the report went through before the error
    if time_left and task.request not in retried:
        retried.add(task.request)
        pending.insert(0, task)
        ex.log("task_requeued", request=task.request, error=error[:200])
        return
    ex.log("task_given_up", request=task.request, error=error[:200], time_left=time_left)
    try:
        reply = ex.cmd("report", request=task.request, outcome="failed",
                       note=f"server error during the task: {error}"[:NOTE_MAX])
        ex.ledger.set_status(task.request, "failed" if reply.ok else "skipped")
    except WybeError as exc:
        ex.log("report_failed", request=task.request, error=str(exc)[:200])


def _end(ex: Executor, session: ShiftSession) -> None:
    try:
        ex.refresh()  # the last score; end_shift's own reply raises ShiftEnded
    except (WybeError, ShiftEnded):
        pass
    session.cmd("end_shift")
