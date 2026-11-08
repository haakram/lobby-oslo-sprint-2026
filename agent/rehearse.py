"""Dress rehearsal for the final: practice seeds through the final's own code path, never `final`.

Same as one final shift: `run_shift` with `call_cap = default_max_calls(rps)`, a 44 real-minute
limit and a rate share of `rps / FINAL_SHIFTS` per shift (own limiter per shift). Practice mode
only, at most MAX_CONCURRENT shifts at once (the server's practice limit); the rest queue."""

from __future__ import annotations

import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field

from agent import agent as shift
from agent.bench import default_max_calls
from agent.client import RateLimiter, WybeClient
from agent.config import Settings

MAX_CONCURRENT = 4  # measured: the server allows 4 practice shifts per team at once
FINAL_SHIFTS = 10
REAL_TIME_S = 44 * 60
NATURAL_END = ("real time limit", "sim end", "server ended")


@dataclass
class Row:
    seed: int
    shift: str | None = None
    score: int | float | None = None
    reason: str = ""
    calls: int = 0
    minutes: float = 0.0

    @property
    def early(self) -> bool:
        """Stopped before the night or the 44 minutes ran out (or the server stranded the robot)."""
        return (self.score is None or not self.reason.startswith(NATURAL_END)
                or "stranded" in self.reason)


@dataclass
class Summary:
    rows: list[Row] = field(default_factory=list)
    max_active: int = 0  # most shifts running at the same moment

    @property
    def scores(self) -> list[float]:
        return [r.score for r in self.rows if r.score is not None]

    @property
    def mean(self) -> float:
        s = self.scores
        return sum(s) / len(s) if s else 0.0

    @property
    def mean_drop_worst(self) -> float:
        s = sorted(self.scores)[1:] if len(self.scores) > 1 else self.scores
        return sum(s) / len(s) if s else 0.0


def rehearse(
    seeds: list[int], settings: Settings, factory: Callable[..., WybeClient], *, brain=None,
    mode: str = "practice", real_time_limit_s: float = REAL_TIME_S, sim_end: str | None = None,
    max_concurrent: int = MAX_CONCURRENT, run: Callable[..., dict] = shift.run_shift,
) -> Summary:
    if mode != "practice":
        raise ValueError(f"rehearse runs practice shifts only, not {mode!r}")
    if not 1 <= max_concurrent <= MAX_CONCURRENT:
        raise ValueError(f"max_concurrent must be 1..{MAX_CONCURRENT}")
    cap = default_max_calls(settings.max_rps)
    share = settings.max_rps / FINAL_SHIFTS
    summary = Summary(rows=[Row(seed=s) for s in seeds])
    lock = threading.Lock()
    active = 0
    queue = list(summary.rows)

    def worker() -> None:
        nonlocal active
        while True:
            with lock:
                if not queue:
                    return
                row = queue.pop(0)
                active += 1
                summary.max_active = max(summary.max_active, active)
            began = time.monotonic()
            try:
                client = factory(settings, live=True)  # live=True: the real (counted) practice start
                client.limiter = RateLimiter(share)  # this shift's own share, like the final's
                session = client.start_shift("practice", row.seed)
                row.shift = session.shift_id
                res = run(client, session=session, brain=brain, real_time_limit_s=real_time_limit_s,
                          call_cap=cap, sim_end=sim_end)
                row.score, row.reason = res.get("score"), str(res.get("reason"))
                row.calls = session.calls
            except Exception as exc:  # noqa: BLE001 - one dead shift must not stop the queue
                row.reason = f"crashed: {type(exc).__name__}: {str(exc)[:100]}"
            row.minutes = (time.monotonic() - began) / 60
            with lock:
                active -= 1

    threads = [threading.Thread(target=worker, daemon=True)
               for _ in range(min(max_concurrent, len(seeds)))]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    return summary


def format_summary(s: Summary, cap: int) -> str:
    lines = [f"seed {r.seed}  shift {r.shift}  score {r.score}  calls {r.calls}  "
             f"minutes {r.minutes:.1f}  ({r.reason})" + ("  STOPPED EARLY" if r.early else "")
             for r in s.rows]
    lines.append(f"mean {s.mean:.1f}  mean_drop_worst {s.mean_drop_worst:.1f}  "
                 f"(n={len(s.scores)}, call cap {cap} per shift, max {s.max_active} at once)")
    early = [str(r.seed) for r in s.rows if r.early]
    lines.append("stopped early: " + (", ".join(early) if early else "none"))
    return "\n".join(lines)
