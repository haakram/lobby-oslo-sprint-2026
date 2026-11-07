"""Many FakeWybe worlds behind one transport, routed by X-Shift: the final's topology, offline.

Every `start_shift` creates a fresh FakeWybe; a call with an X-Shift header goes to that shift's
world; `shifts` and `whoami` answer across all of them. Failure injection for the final's tests:

    MultiFakeWybe(fail_starts=6)        # the first 6 start_shift POSTs answer 503
    MultiFakeWybe(timeout_starts=1)     # the next start creates the shift, then the reply times out
    MultiFakeWybe(error_bursts={2: (5, 120)})  # shift #2 (0-based): after 5 calls, 120 replies of 503
"""

from __future__ import annotations

import json
import threading
import time

import httpx

from agent.offline import ENDED, FakeWybe

_HEADERS = {"authorization": "Bearer test-key", "content-type": "application/json"}


class MultiFakeWybe:
    def __init__(
        self,
        *,
        fake_kw: dict | None = None,
        fail_starts: int = 0,
        timeout_starts: int = 0,
        error_bursts: dict[int, tuple[int, int]] | None = None,
    ):
        self.fake_kw = dict(fake_kw or {})
        self.fail_starts = fail_starts
        self.timeout_starts = timeout_starts
        self.error_bursts = dict(error_bursts or {})
        self.fakes: dict[str, FakeWybe] = {}
        self.order: list[str] = []  # shift ids in start order
        self.requests: list[tuple[float, str | None, str | None]] = []  # (monotonic, x_shift, cmd)
        self.pre_calls: list[str] = []  # commands sent without X-Shift (shifts, whoami, ...)
        self._starts = 0
        self._counts: dict[str, int] = {}
        self._lock = threading.RLock()

    # --- transport ----------------------------------------------------------------------------------

    def handler(self, request: httpx.Request) -> httpx.Response:
        try:
            payload = json.loads(request.content or b"null")
        except ValueError:
            payload = None
        cmd = payload.get("cmd") if isinstance(payload, dict) else None
        xs = request.headers.get("x-shift")
        with self._lock:
            self.requests.append((time.monotonic(), xs, cmd))
            if cmd == "start_shift":
                return self._start(request)
            if xs is None:
                self.pre_calls.append(cmd)
                return self._pre_shift(cmd)
            fake = self.fakes.get(xs)
            if fake is None:
                return httpx.Response(409, json=_body(False, ENDED))
            self._counts[xs] = self._counts.get(xs, 0) + 1
            after, n = self.error_bursts.get(self.order.index(xs), (None, 0))
            if after is not None and after < self._counts[xs] <= after + n:
                return httpx.Response(503, text="busy")
        return fake.handler(request)

    def _start(self, request: httpx.Request) -> httpx.Response:
        self._starts += 1
        if self._starts <= self.fail_starts:
            return httpx.Response(503, text="busy")
        fake = FakeWybe(**self.fake_kw)
        resp = fake.handler(request)
        body = resp.json()
        if body.get("ok") and isinstance(body.get("result"), dict):
            sid = body["result"]["shift"]
            self.fakes[sid] = fake
            self.order.append(sid)
        if self._starts <= self.fail_starts + self.timeout_starts:
            raise httpx.ReadTimeout("the reply never came", request=request)  # the shift exists
        return resp

    def _pre_shift(self, cmd: str | None) -> httpx.Response:
        if cmd == "shifts":
            history = [dict(h) for f in self.fakes.values() for h in f._history]
            return httpx.Response(200, json=_body(True, {"shifts": history}))
        if cmd == "whoami":
            live = sum(1 for f in self.fakes.values() if not f._ended)
            return httpx.Response(200, json=_body(True, {"team": "Fettero", "live_shifts": live,
                                                         "shifts_played": len(self.fakes)}))
        return httpx.Response(200, json=_body(False, "The robot is off duty. Start a shift first."))

    # --- scenario helpers -----------------------------------------------------------------------------

    def orphan(self, mode: str = "final", *, ended: bool = False) -> str:
        """A shift started outside this process (a crashed run): live, or already ended."""
        with self._lock:
            fake = FakeWybe(**self.fake_kw)
            req = httpx.Request("POST", "https://nightshift.test/", headers=_HEADERS,
                                json={"cmd": "start_shift", "args": {"mode": mode}})
            sid = fake.handler(req).json()["result"]["shift"]
            self.fakes[sid] = fake
            self.order.append(sid)
            if ended:
                fake.handler(httpx.Request("POST", "https://nightshift.test/",
                                           headers={**_HEADERS, "x-shift": sid},
                                           json={"cmd": "end_shift"}))
            return sid

    @property
    def final_starts(self) -> int:
        return sum(f.final_starts for f in self.fakes.values())


def _body(ok: bool, result) -> dict:
    return {"ok": ok, "clock": None, "result": result, "events": [], "note": None}
