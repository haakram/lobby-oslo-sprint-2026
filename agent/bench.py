"""Benchmark and parameter search: many shifts, scored like the final (mean, worst night dropped).

`tune` is offline only: it searches planner settings on generated fake-server nights and never
builds a live client. Live shifts are only for `bench --live` (validation).
"""

from __future__ import annotations

import inspect
import json
import math
import random
import re
import threading
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field, replace
from pathlib import Path

from agent.agent import load_params, run_shift
from agent.client import WybeClient
from agent.offline import (
    DEFAULT_ABSENT,
    DEFAULT_DND,
    DEFAULT_GUESTS,
    DEFAULT_HIDDEN,
    DEFAULT_PEOPLE,
    DEFAULT_SPILL_SPOTS,
    DEFAULT_WET_SPOTS,
    LIVE_REQUESTS,
)
from agent.planner import Params
from agent.world import DEFAULT_MAP, clock_to_seconds

OFFLINE_END = "06:00:00"  # [obs] the server ends the shift at 06:00
# The winner goes to a candidate file; params_best.json (auto-loaded by load_params) is only created
# deliberately, after live validation.
DEFAULT_OUT = Path("agent/data/params_candidate.json")
CART_CAPACITY = 8

ClientFactory = Callable[..., WybeClient]


def default_max_calls(rps: float) -> int:
    """Calls one final shift gets: 10 shifts share the limiter and stop after 44 real minutes."""
    return int(44 * 60 * rps / 10)


@dataclass
class BenchResult:
    scores: dict[int, int]
    params: Params
    errors: dict[int, str] = field(default_factory=dict)  # seed -> exception type of a crashed night
    mean: float = field(init=False)
    mean_drop_worst: float = field(init=False)
    calls: dict[int, int] = field(default_factory=dict)  # seed -> calls the night used
    capped_scores: dict[int, int] = field(default_factory=dict)  # score when calls reached max_calls
    cap_clocks: dict[int, str] = field(default_factory=dict)  # sim clock at the cap
    mean_capped: float = field(init=False)
    mean_drop_worst_capped: float = field(init=False)
    requests: dict[int, int] = field(default_factory=dict)  # seed -> requests the agent received
    served: dict[int, int] = field(default_factory=dict)  # seed -> requests served (reported done)
    min_battery: dict[int, float | None] = field(default_factory=dict)  # lowest battery seen; 0 = stranded
    dock_calls: dict[int, int] = field(default_factory=dict)  # seed -> dock commands sent

    def __post_init__(self) -> None:
        vals = sorted(self.scores.values())
        self.mean = sum(vals) / len(vals) if vals else 0.0
        kept = vals[1:] if len(vals) > 1 else vals  # the final drops the worst night
        self.mean_drop_worst = sum(kept) / len(kept) if kept else 0.0
        cv = sorted(self.capped_scores.values())
        self.mean_capped = sum(cv) / len(cv) if cv else 0.0
        ck = cv[1:] if len(cv) > 1 else cv
        self.mean_drop_worst_capped = sum(ck) / len(ck) if ck else 0.0


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


def _arity(factory: ClientFactory) -> int:
    try:
        return len(inspect.signature(factory).parameters)
    except (TypeError, ValueError):
        return 0


def _make(factory: ClientFactory, seed: int, hourly_scale: float = 1.0) -> WybeClient:
    n = _arity(factory)
    if n >= 2:
        return factory(seed, hourly_scale)
    return factory(seed) if n >= 1 else factory()


def run_bench(
    client_factory: ClientFactory,
    seeds: list[int],
    *,
    parallel: int = 5,
    params: Params | None = None,
    sim_end: str | None = OFFLINE_END,
    max_calls: int = 0,
    hourly_scale: float = 1.0,
) -> BenchResult:
    """One shift per seed, `parallel` at a time. A crashed shift scores 0.

    The factory may take the seed and the hourly scale (offline: one fresh fake per night, see
    offline_scenario), the seed only, or nothing (live: one client, so its RateLimiter is shared by
    every thread). A scale other than 1.0 needs the two-argument form.
    """
    if hourly_scale != 1.0 and _arity(client_factory) < 2:
        raise ValueError("hourly_scale needs a client factory that takes (seed, hourly_scale)")
    used = params or load_params()
    scores: dict[int, int] = {}
    lock = threading.Lock()
    errors: dict[int, str] = {}
    calls: dict[int, int] = {}
    capped: dict[int, int] = {}
    cap_clocks: dict[int, str] = {}
    requests: dict[int, int] = {}
    served: dict[int, int] = {}
    min_battery: dict[int, float | None] = {}
    dock_calls: dict[int, int] = {}

    def work(seed: int) -> None:
        result: dict = {}
        try:
            client = _make(client_factory, seed, hourly_scale)
            result = run_shift(
                client, mode="practice", seed=seed, params=used, sim_end=sim_end, call_cap=max_calls
            )
            score = int(result.get("score") or 0)
        except Exception as exc:  # noqa: BLE001 - one dead night must not sink the benchmark
            score = 0
            print(f"seed {seed}: crashed with {type(exc).__name__}: {str(exc)[:120]}", flush=True)
            with lock:
                errors[seed] = type(exc).__name__
        at_cap = result.get("at_cap")
        with lock:
            scores[seed] = score
            calls[seed] = int(result.get("calls") or 0)
            capped[seed] = int(at_cap[0] or 0) if at_cap else score  # cap not reached: the full score
            if at_cap and at_cap[1]:
                cap_clocks[seed] = at_cap[1]
            requests[seed] = int(result.get("requests") or 0)
            served[seed] = int(result.get("requests_served") or 0)
            min_battery[seed] = result.get("min_battery")
            dock_calls[seed] = int(result.get("dock_calls") or 0)

    with ThreadPoolExecutor(max_workers=max(1, parallel)) as pool:
        list(pool.map(work, seeds))
    return BenchResult(
        scores={s: scores[s] for s in seeds}, params=used, errors=errors, calls=calls,
        capped_scores={s: capped[s] for s in seeds}, cap_clocks=cap_clocks,
        requests=requests, served=served, min_battery=min_battery, dock_calls=dock_calls,
    )


# --- generated nights ---------------------------------------------------------------------------------
# Seed 1 is the live night replayed (agent/offline.py defaults). Other seeds are drawn from what that
# night measured (calibration-spec.md § 1): [obs] values below are measured there, [hyp] are defaults.

_HOURLY = [4, 8, 6, 11, 10, 5, 10, 14]  # [obs] requests per sim hour from 22:00 (68 a night, ~8.5/h)
_HOUR_JITTER = 0.3  # [hyp] +-30 % on each hour's count (spec § 4)
_P_SAME_SECOND = 0.045  # [obs] 3 of 67 gaps were 0 s; uniform draws within each hour already give
# ~18 % of gaps <= 60 s (live 12 %), so no more bursts are added
LATE_START = "00:13:00"  # [obs] the new request types start with R-013 at 00:13
_EARLY_WEIGHTS = [("amenity", 50), ("lost", 17), ("tray", 17), ("message", 8), ("check", 8)]  # [obs] n=12
_LATE_WEIGHTS = [  # [obs] n=56
    ("followup", 16), ("noise", 14), ("tray", 12.5), ("amenity", 5.4), ("named_amenity", 7),
    ("message", 11), ("bags", 7), ("lost", 7), ("check", 7), ("spill", 5), ("named_tray", 3.6),
    ("named_message", 3.6),
]
_ITEM_WEIGHTS = [("phone charger", 4), ("water bottle", 10), ("toiletry kit", 2), ("pillow", 6)]  # [obs] no towel
_MESSAGE_WEIGHTS = [("the taxi is here", 3), ("breakfast starts at seven", 2),  # [obs] the live five
                    ("their wake-up call is set for half past six", 2),
                    ("a parcel arrived for them at the desk", 1), ("their car is parked in bay four", 1)]
_NAMED_MESSAGES = ["their wake-up call is set for half past six", "breakfast starts at seven"]  # [obs]
_ROOM_WEIGHTS = [7, 4, 3, 3, 3, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1]  # [obs] 319 x7, 208 x6, 323 x4 ... over 23 rooms
_DND_WEIGHT = 5  # [obs] room 208 took 6 of ~48 room-named guest requests
_EMPTY_ROOMS = sorted(r.removeprefix("room-") for r in DEFAULT_ABSENT)  # [obs] checks and bags go here
_P_REAL_FOLLOWUP = 0.11  # [obs] 1 of 9 "never came" claims matched an earlier order
_P_LOST_FOUND = 0.5  # [hyp] 3 of 6 lost items were never found (spec § 4)
_P_TRAY_TWIN = 0.1  # [obs] R-055/R-056: the same tray request again 30 s later
_P_RARE_COUNT = 0.15  # [obs] one "323 wants two water bottles." late in the night
_SPILL_FLOOR_WEIGHTS = [(1, 1), (2, 1), (3, 2)]  # [obs] floors 3, 1, 3
_LOST_HINTS = {  # item -> [(hint text, hiding place)]
    "wallet": [("the kitchen pass", "kitchen-pass")],
    "child's toy": [("the lobby bar", "lobby-bar"), ("near the kitchen", "kitchen-pass"),
                    ("the ground floor corridor", "corridor-1a")],
    "glasses": [("the ground floor corridor", "corridor-1b")],
}
_FOLLOW = "Front desk passed on a call from {}: the guest says the {} they ordered an hour ago never came."
_BAGS = "Take the bags at the desk up to {}. The room is empty, the guest checks in later."
_WET_JITTER_S = 15 * 60  # [hyp] the five spots keep their places; their clocks move +-15 min
_PEOPLE_JITTER_S = 20 * 60
# The manager's "Skip R-NNN, <room> checked out. Don't bother with it." (the fake sends it only while
# the request is unreported). Seed 1: the five skips the scout's slow seed-1 runs saw, at their clocks.
SEED1_SKIPS = [("22:57:58", "R-002", "317"), ("01:42:32", "R-027", "319"),  # [obs]
               ("03:22:24", "R-039", "206"), ("03:46:48", "R-040", "211"), ("04:54:02", "R-050", "204")]
# Skips per night: the most any live run of seeds 1-12 saw ([obs] a lower bound: a request served in
# time never shows its skip), one drawn per generated seed.
_SKIPS_PER_NIGHT = [5, 0, 1, 1, 3, 1, 0, 0, 2, 3, 0, 0]
_SKIP_DELAY_S = (8 * 60 + 23, 29 * 60 + 24)  # [obs] 16 live skips: 8:23 to 29:24 after the request
_NO_SKIP = ("Front desk passed on", "Complaint about noise")  # [obs] none of the 16 was either kind
SKIP_TEXT = "Skip {}, {} checked out. Don't bother with it."  # [obs] "that one" when there is no room

# [obs] Practice seed 2 (live map check): the same floor-1 topology and names, other metres and shelves.
SEED2_FLOOR1_METRES = {
    ("charging-dock", "lobby"): 6, ("lobby", "front-desk"): 6, ("lobby", "elevator-1"): 10,
    ("lobby", "corridor-1a"): 12, ("corridor-1a", "corridor-1b"): 16, ("corridor-1b", "corridor-1c"): 18,
    ("corridor-1a", "staff-room"): 5, ("corridor-1b", "storage"): 4, ("corridor-1b", "laundry"): 6,
}
SEED2_STOCK = {
    "storage": {"pillow": 5, "toiletry-kit": 6, "phone-charger": 4, "wet-floor-sign": 3},
    "laundry": {"cart": 1, "towel": 8, "water-bottle": 8},
    "front-desk": {"keycard": 2},
}
_METRES_JITTER = 0.4  # [hyp] other seeds: every edge +-40 %
_FIXED_STOCK = {"cart", "keycard"}  # the cart stays in the laundry, keycards at the desk


def _hms(sec: float) -> str:
    sec = int(sec) % 86400
    return f"{sec // 3600:02d}:{sec % 3600 // 60:02d}:{sec % 60:02d}"


def _pick(rng: random.Random, weighted: list[tuple]) -> object:
    items, weights = zip(*weighted, strict=True)
    return rng.choices(items, weights)[0]


def hotel_for_seed(seed: int, rng: random.Random | None = None) -> dict | None:
    """The map the fake plays for `seed`: None (the seed-1 file) for 1; seed 2 as observed on floor 1,
    floors 2-3 jittered; other seeds jitter every edge +-40 % and shuffle the shelves."""
    if seed == 1:
        return None
    rng = rng or random.Random(seed * 104729 + 7)
    data = json.loads(Path(DEFAULT_MAP).read_text())
    nodes = data["nodes"]
    for e in data["edges"]:
        observed = SEED2_FLOOR1_METRES.get((e["a"], e["b"])) or SEED2_FLOOR1_METRES.get((e["b"], e["a"]))
        floor1 = nodes[e["a"]]["floor"] == 1 and nodes[e["b"]]["floor"] == 1
        if seed == 2 and observed is not None:
            e["m"] = observed
        elif seed == 2 and floor1:
            continue  # [hyp] floor-1 door metres were not read on seed 2: keep seed 1's
        else:
            lo, hi = math.ceil(e["m"] * (1 - _METRES_JITTER)), math.floor(e["m"] * (1 + _METRES_JITTER))
            e["m"] = max(1, min(hi, max(lo, round(e["m"] * rng.uniform(1 - _METRES_JITTER, 1 + _METRES_JITTER)))))
    if seed == 2:
        data["stock"] = {place: dict(items) for place, items in SEED2_STOCK.items()}
        return data
    stock = {place: {i: n for i, n in items.items() if i in _FIXED_STOCK} for place, items in data["stock"].items()}
    loose = [(i, n) for place in ("storage", "laundry") for i, n in data["stock"].get(place, {}).items()
             if i not in _FIXED_STOCK]
    for item, n in loose:
        stock.setdefault(rng.choice(["storage", "laundry"]), {})[item] = n
    data["stock"] = {place: items for place, items in stock.items() if items}
    return data


def _arrivals(rng: random.Random, end_s: int, hourly_scale: float = 1.0) -> list[int]:
    """Arrival clocks (sim seconds) for one night: the live hourly counts (x hourly_scale) jittered, a
    quiet opening, then same-second pairs."""
    night = clock_to_seconds("22:00:00")
    times: list[int] = []
    for hour, want in enumerate(_HOURLY):
        want = want * hourly_scale
        n = max(1 if hour == 0 else 0, round(want * rng.uniform(1 - _HOUR_JITTER, 1 + _HOUR_JITTER)))
        if hour == 0:  # [obs] 22:03 and then nothing until ~22:45
            times.append(clock_to_seconds("22:03:30") + rng.randint(-60, 60))
            times += [night + rng.randint(40 * 60, 3600 - 1) for _ in range(n - 1)]
        else:
            times += [night + hour * 3600 + rng.randint(0, 3599) for _ in range(n)]
    times.sort()
    for i in range(2, len(times)):
        if rng.random() < _P_SAME_SECOND:
            times[i] = times[i - 1]
    return [t for t in times if t < end_s - 120]


def skip_specs(seed: int, requests: list[tuple[str, str, str]], end_s: int) -> list[tuple[str, str, str]]:
    """The night's "Skip R-NNN" messages as request specs. Seed 1: the observed five. Other seeds: a
    count from _SKIPS_PER_NIGHT, on requests other than follow-ups and noise ([hyp] picked uniformly),
    8-29 min after each. Own random stream: the night's requests are the same with or without skips."""
    if seed == 1:
        return [(clock, "skip", SKIP_TEXT.format(rid, room)) for clock, rid, room in SEED1_SKIPS]
    rng = random.Random(seed * 6151 + 3)
    want = rng.choice(_SKIPS_PER_NIGHT)
    pool = [r for r in requests if not r[2].startswith(_NO_SKIP)
            and clock_to_seconds(r[0]) + _SKIP_DELAY_S[1] < end_s]
    out = []
    for clock, rid, text in sorted(rng.sample(pool, min(want, len(pool))), key=lambda r: r[1]):
        room = m.group(1) if (m := re.search(r"\b(\d{3})\b", text)) else "that one"
        at = clock_to_seconds(clock) + rng.randint(*_SKIP_DELAY_S)
        out.append((_hms(at), "skip", SKIP_TEXT.format(rid, room)))
    return out


def offline_scenario(seed: int, end_clock: str = OFFLINE_END, hourly_scale: float = 1.0) -> dict:
    """FakeWybe kwargs for one night. Seed 1 is the live night replayed exactly; other seeds are
    generated to its measured rate, burstiness, kind mix by hour, room concentration (the DND rooms take
    ~10 %), false-follow-up and named-guest shares, with the five wet spots and two bathrobe events
    jittered in time and a per-seed map (metres, shelves). Deterministic per seed.

    `hourly_scale` multiplies every hour's request count before the jitter (1.3: ~88 requests, as rich
    as live seeds 10/16/23 with 82-85); seed 1, the live replay, ignores it."""
    if seed == 1:
        return {
            "requests": list(LIVE_REQUESTS), "dnd_rooms": set(DEFAULT_DND), "absent_rooms": set(DEFAULT_ABSENT),
            "wet": set(), "hidden": dict(DEFAULT_HIDDEN), "guests": dict(DEFAULT_GUESTS),
            "spill_spots": dict(DEFAULT_SPILL_SPOTS), "wet_spots": list(DEFAULT_WET_SPOTS),
            "people_events": list(DEFAULT_PEOPLE), "end_clock": end_clock, "hotel": None,
            "skips": skip_specs(1, LIVE_REQUESTS, clock_to_seconds(end_clock)),
        }
    rng = random.Random(seed * 7919 + 13)
    end_s = clock_to_seconds(end_clock)
    late_s = clock_to_seconds(LATE_START)
    guests = dict(DEFAULT_GUESTS)
    names = list(guests)
    occupied = sorted(r.removeprefix("room-") for r in guests.values())
    rng.shuffle(occupied)
    room_pool = list(zip(occupied, _ROOM_WEIGHTS, strict=True)) + [("208", _DND_WEIGHT)]
    noise_pool = room_pool + [("209", 1)] + [(r, 0.5) for r in _EMPTY_ROOMS]
    hidden: dict[str, str | tuple[str, str]] = {}
    lost_count: dict[str, int] = {}
    orders: list[tuple[str, str]] = []  # (room, item) of amenity requests, for real follow-ups
    requests: list[tuple[str, str, str]] = []
    rare_done = False
    not_before = 0  # a twin tray request 30 s after its original keeps the order

    def item_id(what: str) -> str:
        base = what.split()[-1]  # "child's toy" -> toy
        lost_count[base] = lost_count.get(base, 0) + 1
        return base if lost_count[base] == 1 else f"{base}-{lost_count[base]}"

    for t in _arrivals(rng, end_s, hourly_scale):
        t = max(t, not_before)
        late = t >= late_s
        kind = _pick(rng, _LATE_WEIGHTS if late else _EARLY_WEIGHTS)
        room = _pick(rng, room_pool)
        n = len(requests) + 1
        twin = None
        if kind == "amenity":
            item = _pick(rng, _ITEM_WEIGHTS)
            if late and not rare_done and rng.random() < _P_RARE_COUNT:
                text, rare_done = f"{room} wants two water bottles.", True
                orders.append((room, "water bottle"))
            else:
                text = f"{room} wants a {item}."
                orders.append((room, item))
        elif kind == "named_amenity":
            text = f"{rng.choice(names)} would like a {_pick(rng, _ITEM_WEIGHTS)}."
        elif kind == "named_tray":
            text = f"Room service for {rng.choice(names)} is waiting at the kitchen pass."
        elif kind == "named_message":
            text = f"Let {rng.choice(names)} know {rng.choice(_NAMED_MESSAGES)}."
        elif kind == "message":
            text = f"Tell the guest in {room} {_pick(rng, _MESSAGE_WEIGHTS)}."
        elif kind == "tray":
            text = f"Bring the tray from the kitchen pass to {room}."
            if late and rng.random() < _P_TRAY_TWIN:
                twin = text
        elif kind == "check":
            text = f"Check if {rng.choice(_EMPTY_ROOMS)} is empty and tidy, report back."
        elif kind == "bags":
            text = _BAGS.format(rng.choice(_EMPTY_ROOMS))
        elif kind == "noise":
            text = f"Complaint about noise near {_pick(rng, noise_pool)}."
        elif kind == "spill":
            text = f"Someone mentioned a spill on floor {_pick(rng, _SPILL_FLOOR_WEIGHTS)}."
        elif kind == "followup":
            if orders and rng.random() < _P_REAL_FOLLOWUP:
                fr, item = rng.choice(orders)
            else:
                fr, item = room, _pick(rng, _ITEM_WEIGHTS)
            text = _FOLLOW.format(fr, item)
        else:  # lost: with a room, or (1 in 3 late) by name
            what = rng.choice(["child's toy", "wallet"] if late else ["glasses", "glasses", "child's toy"])
            hint, place = rng.choice(_LOST_HINTS[what])
            if place.startswith("corridor-1"):
                place = rng.choice(["corridor-1a", "corridor-1b", "corridor-1c"])
            if late and rng.random() < 1 / 3:
                text = f"{rng.choice(names)} lost {what if what == 'glasses' else 'a ' + what} earlier tonight, " \
                       f"probably somewhere around {hint}."
            else:
                text = f"Guest in {room} lost {what if what == 'glasses' else 'a ' + what}, maybe {hint}."
            if rng.random() < _P_LOST_FOUND:
                hidden[item_id(what)] = place
        requests.append((_hms(t), f"R-{n:03d}", text))
        if twin:
            requests.append((_hms(t + 30), f"R-{n + 1:03d}", twin))
            not_before = t + 30
    wet_spots = [(_hms(clock_to_seconds(c) + rng.randint(-_WET_JITTER_S, _WET_JITTER_S)), place)
                 for c, place in DEFAULT_WET_SPOTS]
    people = [(_hms(clock_to_seconds(c) + rng.randint(-_PEOPLE_JITTER_S, _PEOPLE_JITTER_S)), place, text)
              for c, place, text in DEFAULT_PEOPLE]
    return {
        "requests": requests,
        "dnd_rooms": set(DEFAULT_DND),
        "absent_rooms": set(DEFAULT_ABSENT),
        "wet": set(),
        "hidden": hidden,
        "guests": guests,
        "spill_spots": dict(DEFAULT_SPILL_SPOTS),
        "wet_spots": wet_spots,
        "people_events": people,
        "end_clock": end_clock,
        "hotel": hotel_for_seed(seed, rng),
        "skips": skip_specs(seed, requests, end_s),  # own random stream: after everything else
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


def _objective(capped: bool) -> Callable[[BenchResult], float]:
    return (lambda r: r.mean_drop_worst_capped) if capped else (lambda r: r.mean_drop_worst)


def tune(
    client_factory: ClientFactory,
    seeds: list[int],
    *,
    trials: int = 12,
    parallel: int = 5,
    base: Params | None = None,
    rng_seed: int = 0,
    out_path: Path = DEFAULT_OUT,
    max_calls: int = 0,
    capped: bool = False,
    hourly_scale: float = 1.0,
) -> tuple[Params, list[BenchResult]]:
    """Random search; the baseline (`base`) is result 0. Keeps the best mean-with-worst-dropped."""
    base = base or Params()
    rng = random.Random(rng_seed)
    candidates = [base] + [_random_params(rng, base) for _ in range(trials)]
    results: list[BenchResult] = []
    for i, p in enumerate(candidates):
        r = run_bench(client_factory, seeds, parallel=parallel, params=p, max_calls=max_calls,
                      hourly_scale=hourly_scale)
        results.append(r)
        print(f"trial {i}: mean {r.mean:.1f}  mean_drop_worst {r.mean_drop_worst:.1f}"
              f"  capped {r.mean_drop_worst_capped:.1f}", flush=True)
    best = max(results, key=_objective(capped))  # ties keep the earliest (the baseline)
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(best.params.to_json() + "\n")
    return best.params, results
