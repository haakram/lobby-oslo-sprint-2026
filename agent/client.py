"""HTTP client for the Wybe Night Shift server: auth, X-Shift, retries, rate limit, run log v1."""

import json
import math
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx

from agent.config import Settings
from agent.guard import check_mode

BACKOFF = (0.5, 1, 2)
RETRY_AFTER_MAX_S = 30.0  # a 429's Retry-After is honoured up to this
STATE_FIELDS = ("clock", "location", "score", "battery", "hands", "cart")


def _retry_after(value: str | None) -> float | None:
    """Seconds from a Retry-After header (delay-seconds form), clamped; None when absent or odd."""
    try:
        seconds = float(value) if value is not None else None
    except ValueError:
        return None
    if seconds is None or math.isnan(seconds):
        return None
    return min(max(seconds, 0.0), RETRY_AFTER_MAX_S)


class ShiftEnded(Exception):
    """HTTP 409, or a reply whose result says shift_over."""


class WybeError(Exception):
    """Transport trouble that survived the retries, or an unusable reply."""


@dataclass
class Reply:
    ok: bool
    clock: str | None
    result: Any
    events: list[dict] = field(default_factory=list)
    status: int = 200


class RateLimiter:
    """Thread-safe: consecutive wait() returns are at least 1/rps seconds apart."""

    def __init__(self, rps: float):
        self._interval = 1.0 / rps if rps > 0 else 0.0
        self._lock = threading.Lock()
        self._next = 0.0

    def wait(self) -> None:
        with self._lock:
            now = time.monotonic()
            slot = max(now, self._next)
            self._next = slot + self._interval
        delay = slot - now
        if delay > 0:
            time.sleep(delay)


class WybeClient:
    def __init__(
        self,
        settings: Settings,
        *,
        transport: httpx.BaseTransport | None = None,
        limiter: RateLimiter | None = None,
        sleep: Callable[[float], None] = time.sleep,
    ):
        self.settings = settings
        self.limiter = limiter or RateLimiter(settings.max_rps)
        self._sleep = sleep
        self._http = httpx.Client(transport=transport, timeout=30.0)

    def _post(self, cmd: str, args: dict | None, shift_id: str | None) -> tuple[Reply, float]:
        if cmd == "start_shift":
            # Lowest layer: no path may send a start without an explicit, allowed mode.
            check_mode((args or {}).get("mode"), armed=self.settings.final_armed)
        body: dict[str, Any] = {"cmd": cmd}
        if args:
            body["args"] = args
        headers = {
            "Authorization": f"Bearer {self.settings.key}",
            "User-Agent": self.settings.user_agent,
            "Content-Type": "application/json",
        }
        if shift_id:
            headers["X-Shift"] = shift_id
        last = "unknown error"
        wait: float | None = None  # a 429's Retry-After replaces the next backoff step
        for attempt in range(len(BACKOFF) + 1):
            if attempt:
                self._sleep(BACKOFF[attempt - 1] if wait is None else wait)
            wait = None
            self.limiter.wait()
            started = time.monotonic()
            try:
                resp = self._http.post(self.settings.url, json=body, headers=headers)
            except httpx.TransportError as exc:
                last = f"transport error: {type(exc).__name__}"
                continue
            latency = (time.monotonic() - started) * 1000
            if resp.status_code == 409:
                raise ShiftEnded(resp.text[:200])
            if resp.status_code >= 500 or (resp.status_code == 403 and "1010" in resp.text):
                last = f"HTTP {resp.status_code}"
                continue
            if resp.status_code == 429:  # too fast: back off (Retry-After if given) and retry
                last = "HTTP 429"
                wait = _retry_after(resp.headers.get("Retry-After"))
                continue
            if resp.status_code >= 400:
                raise WybeError(f"HTTP {resp.status_code}: {resp.text[:200]}")
            return self._parse(resp), latency
        raise WybeError(f"{cmd} failed after {len(BACKOFF)} retries ({last})")

    @staticmethod
    def _parse(resp: httpx.Response) -> Reply:
        try:
            data = resp.json()
        except ValueError as exc:
            raise WybeError(f"non-JSON reply: {resp.text[:200]}") from exc
        if not isinstance(data, dict):
            raise WybeError(f"unexpected reply: {str(data)[:200]}")
        events = data.get("events")
        return Reply(
            ok=bool(data.get("ok")),
            clock=data.get("clock"),
            result=data.get("result"),
            events=[e for e in events if isinstance(e, dict)] if isinstance(events, list) else [],
            status=resp.status_code,
        )

    def call(self, cmd: str, args: dict | None = None) -> Reply:
        """Pre-shift command (no X-Shift header)."""
        return self._post(cmd, args, None)[0]

    def start_shift(self, mode: str, seed: int | None = None) -> "ShiftSession":
        check_mode(mode, armed=self.settings.final_armed)
        args: dict[str, Any] = {"mode": mode}
        if seed is not None:
            args["seed"] = seed
        reply = self.call("start_shift", args)
        result = reply.result
        if not reply.ok or not isinstance(result, dict) or not result.get("shift"):
            raise WybeError(f"start_shift refused: {str(result)[:200]}")
        return ShiftSession(self, str(result["shift"]), mode, seed)


class ShiftSession:
    def __init__(self, client: WybeClient, shift_id: str, mode: str, seed: int | None):
        self._client = client
        self.shift_id = shift_id
        self.mode = mode
        self.seed = seed
        runs_dir = Path(client.settings.runs_dir)
        runs_dir.mkdir(parents=True, exist_ok=True)
        self.log_path = runs_dir / f"{shift_id}.jsonl"
        self._log_lock = threading.Lock()
        self._write({"type": "start", "shift": shift_id, "mode": mode, "seed": seed})

    def _write(self, entry: dict) -> None:
        line = json.dumps({"v": 1, "t": time.time(), **entry}, default=str)
        with self._log_lock, self.log_path.open("a", encoding="utf-8") as fh:
            fh.write(line + "\n")

    def cmd(self, name: str, **args: Any) -> Reply:
        try:
            reply, latency = self._client._post(name, args or None, self.shift_id)
        except ShiftEnded as exc:
            self._write(self._call_entry(name, args, False, None, str(exc), [], 0.0, 409))
            raise
        self._write(
            self._call_entry(
                name, args, reply.ok, reply.clock, reply.result, reply.events, latency, reply.status
            )
        )
        if isinstance(reply.result, dict) and reply.result.get("shift_over") is True:
            raise ShiftEnded(str(reply.result.get("reason", "shift over")))
        return reply

    @staticmethod
    def _call_entry(cmd, args, ok, clock, result, events, latency, status) -> dict:
        return {
            "type": "call",
            "cmd": cmd,
            "args": args,
            "ok": ok,
            "clock": clock,
            "result": result,
            "events": events,
            "latency_ms": round(latency, 1),
            "status": status,
        }

    def log_decision(self, kind: str, data: dict) -> None:
        self._write({"type": "decision", "kind": kind, "data": data})

    def log_state(self, state: dict) -> None:
        self._write({"type": "state", **{k: state.get(k) for k in STATE_FIELDS}})

    def log_end(self, result: dict) -> None:
        self._write(
            {
                "type": "end",
                "score": result.get("score"),
                "requests_served": result.get("requests_served"),
                "reason": result.get("reason"),
            }
        )
