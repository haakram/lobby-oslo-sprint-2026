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
_CORRIDORS = ["corridor-1a", "corridor-1b", "corridor-1c"] + [f"corridor-{f}{c}" for f in (2, 3)
                                                             for c in "abcd"]
_WET_EDGES = [("corridor-3a", "corridor-3b"), ("elevator-3", "corridor-3a"),
              ("corridor-3d", "corridor-3a")]
_KIND_WEIGHTS = [("amenity", 0.45), ("message", 0.15), ("tray", 0.15), ("check", 0.15),
                 ("lost", 0.10)]
# After ~00:13 the live seed-1 night added new types (wybe-api.md § 12): of its 56 later requests,
# about 9 noise, 8 follow-ups, 8 named guests, 4 bags and 3 spills.
LATE_START = "00:13:00"
_LATE_WEIGHTS = [("amenity", 0.17), ("message", 0.08), ("tray", 0.10), ("check", 0.06), ("lost", 0.05),
                 ("noise", 0.16), ("followup", 0.14), ("named", 0.14), ("bags", 0.07), ("spill", 0.05)]
_GUEST_NAMES = ["Mr Aas", "Ms Kvam", "Dr Engen", "Mx Haugen", "Ms Vik", "Mr Nguyen", "Mx Dahl", "Ms Nygaard"]
_LOST = [("wallet", "the kitchen pass", "kitchen-pass"), ("child's toy", "the lobby bar", "lobby-bar"),
         ("glasses", "the ground floor corridor", "corridor-1b")]
_FOLLOW = "Front desk passed on a call from {}: the guest says the {} they ordered an hour ago never came."
_BAGS = "Take the bags at the desk up to {}. The room is empty, the guest checks in later."
_BATHROBE = 'A man in a bathrobe stops the robot: "I\'m locked out of {}. Can you let me in?"'


def _hms(sec: float) -> str:
    sec = int(sec) % 86400
    return f"{sec // 3600:02d}:{sec % 3600 // 60:02d}:{sec % 60:02d}"


def offline_scenario(seed: int, end_clock: str = OFFLINE_END) -> dict:
    """FakeWybe kwargs for one generated night modelled on the real seed-1 night.

    A quiet start (first request ~22:03), then the rate rises from about one per 25 minutes to one
    per 4-5 minutes. Types and rooms follow seed 1's mix: from 00:13 on also noise complaints,
    follow-ups, named guests, bags and spills (the texts of § 12), a few duplicates and one man in a
    bathrobe. Phrasings are the ones the rule parser handles, plus at most one rare variant.
    """
    rng = random.Random(seed * 7919 + 13)
    end_s = clock_to_seconds(end_clock)
    late_s = clock_to_seconds(LATE_START)
    t = clock_to_seconds("22:03:30") + rng.randint(-60, 60)
    requests: list[tuple[str, str, str]] = []
    lost = 0
    rare_at = rng.randint(4, 12)
    rooms = rng.sample(_ROOMS, 4)
    dnd = {f"room-{r}" for r in rooms[:2]}
    free = [r for r in _ROOMS if r not in rooms]
    guests = {name: f"room-{r}" for name, r in zip(_GUEST_NAMES, rng.sample(free, len(_GUEST_NAMES)),
                                                   strict=True)}
    hidden = {"glasses": rng.choice(["corridor-1a", "corridor-1b", "corridor-1c"])}
    orders: list[tuple[str, str]] = []  # (room, item) of amenity requests, for real follow-ups
    while t < end_s - 600:
        n = len(requests) + 1
        kinds, weights = zip(*(_LATE_WEIGHTS if t >= late_s else _KIND_WEIGHTS), strict=True)
        kind = rng.choices(kinds, weights)[0]
        if kind == "lost" and lost >= 2:
            kind = "amenity"
        room = rng.choice(_ROOMS)
        if n == rare_at:
            text = f"Could you bring two towels to {room}?"  # the one rare phrasing
        elif kind == "amenity":
            item = rng.choice(_ITEMS)
            text = f"{room} wants a {item}."
            orders.append((room, item))
        elif kind == "noise":
            text = f"Complaint about noise near {room}."
        elif kind == "followup":  # mostly false claims; now and then a real order of ours
            real = orders and rng.random() < 0.3
            fr, item = rng.choice(orders) if real else (room, rng.choice(_ITEMS))
            text = _FOLLOW.format(fr, item)
        elif kind == "named":
            name = rng.choice(_GUEST_NAMES)
            text = rng.choice([f"{name} would like a {rng.choice(_ITEMS)}.",
                               f"Room service for {name} is waiting at the kitchen pass.",
                               f"Let {name} know breakfast starts at seven."])
        elif kind == "bags":
            room = rng.choice([r for r in free if f"room-{r}" not in guests.values()])
            text = _BAGS.format(room)
        elif kind == "spill":
            text = f"Someone mentioned a spill on floor {rng.choice([1, 2, 3])}."
        elif kind == "message":
            text = f"Tell the guest in {room} {rng.choice(_MESSAGES)}."
        elif kind == "tray":
            text = f"Bring the tray from the kitchen pass to {room}."
            if t >= late_s and rng.random() < 0.15:  # [hyp] a duplicate 30 s later, as R-055/R-056
                requests.append((_hms(t), f"R-{n:03d}", text))
                n, t = n + 1, t + 30
        elif kind == "check":
            text = f"Check if {room} is empty and tidy, report back."
        elif t >= late_s:
            lost += 1
            what, hint, place = rng.choice(_LOST)
            text = f"Guest in {room} lost a {what}, maybe {hint}."
            hidden[what.split()[-1]] = place
        else:
            lost += 1
            text = f"Guest in {room} lost glasses, maybe the ground floor corridor."
        requests.append((_hms(t), f"R-{n:03d}", text))
        # gap shrinks from ~25 min to ~4.5 min as the night goes on
        progress = min(1.0, (t - clock_to_seconds("22:00:00")) / 7200.0)
        gap_min = 25.0 - 20.5 * progress
        t += gap_min * 60 * rng.uniform(0.7, 1.3)
    wet = rng.choice(_WET_EDGES)
    bathrobe_at = _hms(rng.randint(late_s, max(late_s, end_s - 1800)))
    corridor = rng.choice(["corridor-1a", "corridor-2a", "corridor-3a"])
    return {
        "requests": requests,
        "dnd_rooms": dnd,
        "absent_rooms": {f"room-{r}" for r in rooms[2:]},
        "wet": {frozenset(wet)},
        "hidden": hidden,
        "guests": guests,
        "spill_spots": {f: rng.choice([c for c in _CORRIDORS if c.startswith(f"corridor-{f}")])
                        for f in (1, 2, 3)},
        "people_events": [(bathrobe_at, corridor, _BATHROBE.format(rng.choice(_ROOMS)))],
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
