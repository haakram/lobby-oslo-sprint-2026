"""Benchmark and parameter search: many shifts, scored like the final (mean, worst night dropped).

`tune` is offline only: it searches planner settings on generated fake-server nights and never
builds a live client. Live shifts are only for `bench --live` (validation).
"""

from __future__ import annotations

import inspect
import random
import threading
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field, replace
from pathlib import Path

from agent.agent import load_params, run_shift
from agent.client import WybeClient
from agent.planner import Params
from agent.world import clock_to_seconds

OFFLINE_END = "02:00:00"
# The winner goes to a candidate file; params_best.json (auto-loaded by load_params) is only created
# deliberately, after live validation.
DEFAULT_OUT = Path("agent/data/params_candidate.json")
CART_CAPACITY = 8

ClientFactory = Callable[..., WybeClient]


@dataclass
class BenchResult:
    scores: dict[int, int]
    params: Params
    errors: dict[int, str] = field(default_factory=dict)  # seed -> exception type of a crashed night
    mean: float = field(init=False)
    mean_drop_worst: float = field(init=False)

    def __post_init__(self) -> None:
        vals = sorted(self.scores.values())
        self.mean = sum(vals) / len(vals) if vals else 0.0
        kept = vals[1:] if len(vals) > 1 else vals  # the final drops the worst night
        self.mean_drop_worst = sum(kept) / len(kept) if kept else 0.0


def parse_seeds(spec: str) -> list[int]:
    """'1-3,7' -> [1, 2, 3, 7]."""
    out: list[int] = []
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        lo, _, hi = part.partition("-")
        out.extend(range(int(lo), int(hi or lo) + 1))
    return out


def _make(factory: ClientFactory, seed: int) -> WybeClient:
    try:
        takes_seed = len(inspect.signature(factory).parameters) >= 1
    except (TypeError, ValueError):
        takes_seed = False
    return factory(seed) if takes_seed else factory()


def run_bench(
    client_factory: ClientFactory,
    seeds: list[int],
    *,
    parallel: int = 5,
    params: Params | None = None,
    sim_end: str | None = OFFLINE_END,
) -> BenchResult:
    """One shift per seed, `parallel` at a time. A crashed shift scores 0.

    The factory may take the seed (offline: one fresh fake per night) or nothing (live: one
    client, so its RateLimiter is shared by every thread).
    """
    used = params or load_params()
    scores: dict[int, int] = {}
    lock = threading.Lock()
    errors: dict[int, str] = {}

    def work(seed: int) -> None:
        try:
            result = run_shift(
                _make(client_factory, seed), mode="practice", seed=seed, params=used, sim_end=sim_end
            )
            score = int(result.get("score") or 0)
        except Exception as exc:  # noqa: BLE001 - one dead night must not sink the benchmark
            score = 0
            print(f"seed {seed}: crashed with {type(exc).__name__}: {str(exc)[:120]}", flush=True)
            with lock:
                errors[seed] = type(exc).__name__
        with lock:
            scores[seed] = score

    with ThreadPoolExecutor(max_workers=max(1, parallel)) as pool:
        list(pool.map(work, seeds))
    return BenchResult(scores={s: scores[s] for s in seeds}, params=used, errors=errors)


# --- generated nights ---------------------------------------------------------------------------------

_ROOMS = (
    [f"{n}" for n in range(101, 109)]
    + [f"{n}" for n in range(201, 215)]
    + [f"{n}" for n in range(311, 325)]
)
_ITEMS = ["phone charger", "water bottle", "toiletry kit", "pillow", "towel"]
_MESSAGES = ["the taxi is here", "breakfast is ready", "the car has arrived"]
_WET_EDGES = [("corridor-3a", "corridor-3b"), ("elevator-3", "corridor-3a"),
              ("corridor-3d", "corridor-3a")]
_KIND_WEIGHTS = [("amenity", 0.45), ("message", 0.15), ("tray", 0.15), ("check", 0.15),
                 ("lost", 0.10)]


def _hms(sec: float) -> str:
    sec = int(sec) % 86400
    return f"{sec // 3600:02d}:{sec % 3600 // 60:02d}:{sec % 60:02d}"


def offline_scenario(seed: int, end_clock: str = OFFLINE_END) -> dict:
    """FakeWybe kwargs for one generated night modelled on the real seed-1 night.

    A quiet start (first request ~22:03), then the rate rises from about one per 25 minutes to one
    per 4-5 minutes. Types and rooms follow seed 1's mix. Phrasings are the ones the rule parser
    handles, plus at most one rare variant.
    """
    rng = random.Random(seed * 7919 + 13)
    end_s = clock_to_seconds(end_clock)
    t = clock_to_seconds("22:03:30") + rng.randint(-60, 60)
    kinds, weights = zip(*_KIND_WEIGHTS, strict=True)
    requests: list[tuple[str, str, str]] = []
    lost = 0
    rare_at = rng.randint(4, 12)
    while t < end_s - 600:
        n = len(requests) + 1
        kind = rng.choices(kinds, weights)[0]
        if kind == "lost" and lost >= 2:
            kind = "amenity"
        room = rng.choice(_ROOMS)
        if n == rare_at:
            text = f"Could you bring two towels to {room}?"  # the one rare phrasing
        elif kind == "amenity":
            item = rng.choice(_ITEMS)
            text = f"{room} wants a {item}."
        elif kind == "message":
            text = f"Tell the guest in {room} {rng.choice(_MESSAGES)}."
        elif kind == "tray":
            text = f"Bring the tray from the kitchen pass to {room}."
        elif kind == "check":
            text = f"Check if {room} is empty and tidy, report back."
        else:
            lost += 1
            text = f"Guest in {room} lost glasses, maybe the ground floor corridor."
        requests.append((_hms(t), f"R-{n:03d}", text))
        # gap shrinks from ~25 min to ~4.5 min as the night goes on
        progress = min(1.0, (t - clock_to_seconds("22:00:00")) / 7200.0)
        gap_min = 25.0 - 20.5 * progress
        t += gap_min * 60 * rng.uniform(0.7, 1.3)
    rooms = rng.sample(_ROOMS, 4)
    wet = rng.choice(_WET_EDGES)
    return {
        "requests": requests,
        "dnd_rooms": {f"room-{r}" for r in rooms[:2]},
        "absent_rooms": {f"room-{r}" for r in rooms[2:]},
        "wet": {frozenset(wet)},
        "hidden": {"glasses": rng.choice(["corridor-1a", "corridor-1b", "corridor-1c"])},
        "end_clock": end_clock,
    }


# --- parameter search ---------------------------------------------------------------------------------

_CART_ITEMS = ["towel", "water-bottle", "phone-charger", "toiletry-kit", "pillow"]


def _random_stock(rng: random.Random) -> dict[str, int]:
    """0-4 per item, total at most cart capacity - 1 (one slot stays free for a tray)."""
    stock = {i: rng.randint(0, 4) for i in _CART_ITEMS}
    while sum(stock.values()) > CART_CAPACITY - 1:
        stock[rng.choice([i for i, n in stock.items() if n > 0])] -= 1
    return stock


def _random_params(rng: random.Random, base: Params) -> Params:
    return replace(
        base,
        cart_stock=_random_stock(rng),
        decay_per_min=round(rng.uniform(0.5, 2.0), 2),
        use_cart=rng.random() < 0.8,
        max_scans=rng.randint(3, 8),
    )


def tune(
    client_factory: ClientFactory,
    seeds: list[int],
    *,
    trials: int = 12,
    parallel: int = 5,
    base: Params | None = None,
    rng_seed: int = 0,
    out_path: Path = DEFAULT_OUT,
) -> tuple[Params, list[BenchResult]]:
    """Random search; the baseline (`base`) is result 0. Keeps the best mean-with-worst-dropped."""
    base = base or Params()
    rng = random.Random(rng_seed)
    candidates = [base] + [_random_params(rng, base) for _ in range(trials)]
    results: list[BenchResult] = []
    for i, p in enumerate(candidates):
        r = run_bench(client_factory, seeds, parallel=parallel, params=p)
        results.append(r)
        print(f"trial {i}: mean {r.mean:.1f}  mean_drop_worst {r.mean_drop_worst:.1f}", flush=True)
    best = max(results, key=lambda r: r.mean_drop_worst)  # ties keep the earliest (the baseline)
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(best.params.to_json() + "\n")
    return best.params, results
