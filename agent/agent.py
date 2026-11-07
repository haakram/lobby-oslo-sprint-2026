"""Shift loop: read the inbox, pick the best task, run it, wait when idle, always log the end.

Every request goes into the executor's ledger as it arrives (follow-ups and duplicates are judged
against it), and the executor sees the pending queue (a follow-up may run its waiting original).
World events such as a stranger asking to be let in are handled by the executor as they arrive.
"""

from __future__ import annotations

import contextlib
import json
import re
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
from agent.tasks import Kind, Task, is_override, parse_request, vet_brain_task
from agent.world import Hotel, RobotState, clock_to_seconds

PARAMS_FILE = Path(__file__).parent / "data" / "params_best.json"
LIVE_RUNS = Path("temp/live_runs.jsonl")
MAX_CONSECUTIVE_ERRORS = 25  # practice, agent bugs: a final shift backs off and keeps trying instead
MAX_SERVER_ERRORS = 60  # practice, server/network errors: back off like the final for ~30 real minutes
ERROR_BACKOFF_MAX_S = 30.0
FINAL_START_RETRY_S = 120.0  # a final start that fails is retried for about this long
START_BACKOFF_MAX_S = 15.0
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


class FinalStarter:
    """Starts the final's shifts: one start in flight at a time, never more than `limit` final
    shifts in total (the ones the server already lists count, so a restarted process starts only
    the missing ones), and never a second shift for a start whose reply was lost: before every
    attempt `shifts` is read and a live final shift no thread has claimed is adopted instead.
    A failed start is retried with backoff for about `retry_s` seconds, unless `stop` is set
    (Ctrl-C): then no further start is attempted. The final lock still guards every real start
    (WybeClient checks it on start_shift)."""

    def __init__(
        self,
        client: WybeClient,
        *,
        limit: int = 10,
        retry_s: float = FINAL_START_RETRY_S,
        sleep: Callable[[float], None] | None = None,
        clock: Callable[[], float] = time.monotonic,
        stop: threading.Event | None = None,
    ):
        self._client = client
        self.limit = limit
        self.retry_s = retry_s
        self._stop = stop
        self._sleep = sleep or (stop.wait if stop is not None else time.sleep)
        self._clock = clock
        self._lock = threading.Lock()
        self.claimed: set[str] = set()  # shift ids a thread of this process is playing
        self.started = 0  # real starts made by this process
        listed = self._retry("list the final shifts", self._shifts) or []
        finals = [s for s in listed if s.get("mode") == "final"]
        self.live = [s["shift"] for s in finals if s.get("status") == "live"]
        self.ended = len(finals) - len(self.live)
        self.remaining = max(0, limit - len(finals))

    def _shifts(self) -> list[dict]:
        reply = self._client.call("shifts")
        shifts = reply.result.get("shifts") if isinstance(reply.result, dict) else None
        if not reply.ok or not isinstance(shifts, list):
            raise WybeError(f"shifts: unusable reply {str(reply.result)[:200]}")
        return [s for s in shifts if isinstance(s, dict) and isinstance(s.get("shift"), str)]

    def _stopped(self) -> bool:
        return self._stop is not None and self._stop.is_set()

    def _retry(self, what: str, fn: Callable[[], object]) -> object:
        deadline: float | None = None
        attempt = 0
        while True:
            if self._stopped():
                return None  # Ctrl-C: nothing more is started
            try:
                return fn()
            except WybeError as exc:
                last = exc
            now = self._clock()
            if deadline is None:
                deadline = now + self.retry_s  # the budget runs from the first failure
            if now >= deadline:
                raise WybeError(f"could not {what} within {self.retry_s:.0f} s: {last}") from last
            self._sleep(min(START_BACKOFF_MAX_S, 2.0 ** attempt))
            attempt += 1

    def session(self) -> ShiftSession | None:
        """A final shift to play: adopted or newly started. None once the limit is used up."""
        return self._retry("start a final shift", self._adopt_or_start)  # type: ignore[return-value]

    def _adopt_or_start(self) -> ShiftSession | None:
        with self._lock:  # one start at a time: an unclaimed live final shift can only be an orphan
            finals = [s for s in self._shifts() if s.get("mode") == "final"]
            for s in finals:
                sid = s["shift"]
                if s.get("status") == "live" and sid not in self.claimed:
                    self.claimed.add(sid)
                    session = ShiftSession(self._client, sid, "final", None)
                    session.log_decision("adopted_shift", {"shift": sid, "started": s.get("started")})
                    return session
            # The listing just fetched is the truth: a start whose reply was lost is in it too,
            # so the count can never pass the limit, whatever this process thinks it started.
            if len(finals) >= self.limit or self.started >= self.remaining:
                return None
            session = self._client.start_shift("final")
            self.started += 1
            self.claimed.add(session.shift_id)
            return session


def _inbox_waiting(ex: Executor, status: dict) -> bool:
    """Read the inbox only when something is there: an inbox event was seen, status counts unread
    messages, or status was unusable (then the inbox is the only way to know)."""
    if ex.inbox_waiting:
        return True
    unread = status.get("unread_messages") if status else None
    return not isinstance(unread, int) or unread > 0


def _vet_brain(ex: Executor, original: Task, better: Task) -> Task:
    """The Brain's answer is model output: a room check on a noise/complaint text, or on a room no
    floor of the hotel map can hold, is rejected (the request stays UNKNOWN and is reported failed).
    A room the map does not know on a floor it does know is accepted: the task's own corridor
    lookup explores that floor when it runs (Task 26). No game call here: this is the inbox read."""
    vetted = vet_brain_task(better)
    reason = None
    if better.kind is Kind.ROOM_CHECK and vetted.kind is not Kind.ROOM_CHECK:
        reason = "room check on a noise or complaint text"
    elif vetted.kind is Kind.ROOM_CHECK and vetted.room not in ex.hotel.nodes:
        floor = flows.room_floor(vetted.room)
        if floor is None or not any(v.get("kind") == "corridor" and v.get("floor") == floor
                                    for v in ex.hotel.nodes.values()):
            reason = f"room check on an unknown room {vetted.room}"
    if reason is not None:
        ex.log("brain_rejected", request=original.request, kind=better.kind.value, room=better.room,
               reason=reason)
        return original
    ex.log("brain_classified", request=original.request, kind=vetted.kind.value, room=vetted.room,
           item=vetted.item)
    return vetted


_SKIP = re.compile(r"^\s*Skip (R-\d+)\b")
_CHECKED_OUT = re.compile(r"(?<!\d)(\d{3}) checked out\b", re.IGNORECASE)  # "309" or "room-309"


def _skip(ex: Executor, rid: str, text: str, seen: set[str], pending: list[Task]) -> None:
    """The manager's "Skip R-NNN, 327 checked out. Don't bother with it.": the request is dropped
    from the queue and marked skipped. Live: a skipped request scores 0 even when done and verified
    (seed 4 R-019), so the trip is pure loss. A running task finishes; the inbox is read between tasks."""
    dropped = [t for t in pending if t.request == rid]
    for task in dropped:
        pending.remove(task)
    seen.add(rid)
    ex.ledger.set_status(rid, "skipped")
    # Live (scout, seed 4 R-019): reporting the skipped request `cancelled` scores +5; a request
    # already reported is refused ("already reported"), which costs nothing.
    reply = ex.cmd("report", request=rid, outcome="cancelled",
                   note="Skipped as instructed: the guest checked out.")
    ex.log("request_skipped", request=rid, text=text[:120], was_queued=bool(dropped),
           reported=reply.ok, reply=str(reply.result)[:80])
    if m := _CHECKED_OUT.search(text):
        _checked_out(ex, f"room-{m[1]}", rid, pending)


def _checked_out(ex: Executor, room: str, rid: str, pending: list[Task]) -> None:
    """Live seed 16: after "Skip R-053, 309 checked out" the robot knocked on 309 for another request
    (-10); every task for a checked-out room is worth 0. The room is remembered (the flows decline a
    later request for it before any knock), and its other queued tasks are dropped and reported
    declined (costs nothing). A task already running finishes; only queued ones are dropped."""
    ex.checked_out.add(room)
    dropped = []
    for task in [t for t in pending if t.room == room and t.request != rid]:
        ex.cmd("report", request=task.request, outcome="declined",
               note=f"Guest checked out (manager's skip of {rid})")
        pending.remove(task)  # after the report: a server error leaves it queued (the flows decline it)
        ex.ledger.set_status(task.request, "declined")
        dropped.append(task.request)
    ex.log("room_checked_out", room=room, request=rid, dropped=dropped)


NIGHT_END_S = clock_to_seconds("06:00:00") + 24 * 3600  # the server ends the shift at 06:00


def _too_late(task: Task, state: RobotState, hotel: Hotel, params: Params) -> bool:
    """True when the task's estimated time runs past 06:00 (clocks after midnight wrap)."""
    try:
        now = clock_to_seconds(state.clock)
    except (ValueError, AttributeError):
        return False
    if now < clock_to_seconds("12:00:00"):
        now += 24 * 3600
    from agent.planner import UNREACHABLE_S, estimate_seconds

    secs = estimate_seconds(task, state, hotel, params)
    if secs >= UNREACHABLE_S:
        return False  # not priced (an unknown room is explored first): let the flow decide
    return now + secs > NIGHT_END_S


def _close_out(ex: Executor, pending: list[Task]) -> None:
    """Nothing left can finish before the day shift: every pending request is reported declined
    (never punished; other teams' notes suggest an unanswered request may cost ~15 at 06:00)."""
    for task in list(pending):
        pending.remove(task)
        try:
            reply = ex.cmd("report", request=task.request, outcome="declined",
                           note="Not reached before the end of the night shift; handing over to the day shift")
            ex.ledger.set_status(task.request, "declined")
            ex.log("closed_out", request=task.request, reply=str(reply.result)[:80])
        except (WybeError, ShiftEnded):
            raise
        except Exception as exc:  # noqa: BLE001 - one odd reply must not stop the close-out
            ex.log("closed_out", request=task.request, error=str(exc)[:120])


def _read_inbox(ex: Executor, brain, seen: set[str], pending: list[Task]) -> None:
    reply = ex.cmd("inbox")
    ex.inbox_waiting = False
    msgs = reply.result.get("messages") if isinstance(reply.result, dict) else None
    for msg in msgs or []:
        if not isinstance(msg, dict) or not isinstance(msg.get("request"), str):
            continue
        rid = msg["request"]
        text = str(msg.get("text", ""))
        sender = str(msg.get("from", "")).lower()
        if rid in seen:  # an answer, a skip or a follow-up on a known request: kept for the flows
            ex.answers.setdefault(rid, []).append(text)
        if (m := _SKIP.match(text)) and "manager" in sender:  # only the manager's inbox instructs
            _skip(ex, m.group(1), text, seen, pending)
            continue
        if rid in seen:
            continue
        seen.add(rid)
        task = parse_request(rid, str(msg.get("text", "")), str(msg.get("at") or ex.state.clock))
        if (task.kind is Kind.UNKNOWN and brain is not None and getattr(brain, "enabled", False)
                and not is_override(task.text)):  # a guest's countermand is never reclassified
            better = brain.classify(task.request, task.text, task.arrived)
            if better is not None and better.kind is not Kind.UNKNOWN:
                task = _vet_brain(ex, task, flows.normalize(better))
        if task.kind is Kind.SPILL:  # a patch wet before this read is not this spill's (H-spill)
            ex.wet_at_read[rid] = frozenset(ex.hotel.wet_spots())
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
    clock: Callable[[], float] = time.monotonic,
    sleep: Callable[[float], None] | None = None,
    session: ShiftSession | None = None,
    hotel: Hotel | None = None,
) -> dict:
    """One shift from start to the `end` log line. With a real-time limit (the final), an error
    streak never ends the shift: the loop backs off (capped at ERROR_BACKOFF_MAX_S) and keeps
    trying until the limit; a practice shift stops after MAX_CONSECUTIVE_ERRORS. A session that
    was started (or adopted) elsewhere, e.g. by FinalStarter, is played instead of a new start.
    Everything that can fail on a bad file is loaded before the start; whatever fails after it
    still ends the shift and writes its `end` line (never a started shift left unplayed)."""
    params = params or load_params()
    hotel = hotel or Hotel.load()
    if session is None:
        session = client.start_shift(mode, seed)
    seed = session.seed
    session.call_cap = call_cap or None  # bench: snapshot the score when the shift's calls reach it
    try:
        state = RobotState()
        # Claude classifies unknown requests in ONE place (here), so the executor gets no brain.
        ex = Executor(session, hotel, state, max_scans=params.max_scans)
        deadline = clock() + real_time_limit_s if real_time_limit_s else None
        pause = sleep or (stop.wait if stop is not None else time.sleep)
        sim_end_s = clock_to_seconds(sim_end) if sim_end else None
    except Exception as exc:  # noqa: BLE001 - the shift has started: end it, don't strand it
        return _abandon(session, seed, f"setup failed: {type(exc).__name__}: {str(exc)[:120]}")

    def out_of_time() -> bool:
        return (stop is not None and stop.is_set()) or (deadline is not None and clock() >= deadline)

    def hold_on(errors: int, *, server: bool = False) -> bool:
        """After an error: True to keep going (after a backoff), False to stop. The final never
        stops. A practice shift stops after MAX_CONSECUTIVE_ERRORS agent bugs at once, and after
        MAX_SERVER_ERRORS server/network errors: the sim clock only moves with actions, so an
        outage costs nothing as long as the shift is still played when the server is back."""
        if deadline is None:
            if not server:
                return errors < MAX_CONSECUTIVE_ERRORS
            if errors >= MAX_SERVER_ERRORS:
                return False
        delay = min(ERROR_BACKOFF_MAX_S, 2.0 ** (errors - 1))
        if deadline is not None:
            delay = min(delay, max(0.0, deadline - clock()))
        if delay > 0:
            pause(delay)
        return True

    result: dict = {"shift": session.shift_id, "seed": seed, "score": None,
                    "requests_served": None, "reason": ""}
    pending: list[Task] = []
    ex.queue = pending  # the same list: a follow-up that runs its original removes it here
    ex.read_inbox = lambda: _read_inbox(ex, brain, seen, pending)
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
                ex.ensure_battery()  # below 25 %: charge at the dock before the next task or wait
                task = choose_next(pending, state, hotel, params)
                if task is not None and _too_late(task, state, hotel, params):
                    _close_out(ex, pending)  # the shortest cannot finish by 06:00: none can
                    task = None
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
                if not hold_on(errors, server=True):
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
        result["calls"] = session.calls
        result["at_cap"] = session.at_cap  # (score, clock) when calls reached call_cap, else None
        result["requests_served"] = ex.ledger.served()  # also originals a follow-up ran or redelivered
        session.log_end(result)
    return result


def _abandon(session: ShiftSession, seed: int | None, reason: str) -> dict:
    """Setup failed after the start: end the shift (best effort) and still write the `end` line."""
    result = {"shift": session.shift_id, "seed": seed, "score": None, "requests_served": None,
              "reason": reason}
    session.log_decision("setup_failed", {"reason": reason})
    with contextlib.suppress(Exception):  # ShiftEnded is the normal outcome; the end line follows anyway
        session.cmd("end_shift")
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
