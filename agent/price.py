"""One price for a robot-minute, lambda(t, battery, queue): points per minute of robot time.

Bid-price control (Talluri & van Ryzin 1998): robot time is perishable (the night ends at 06:00), so a
minute is worth what the marginal task that still gets served pays per minute. From the profile measured
on the real nights (agent/data/lambda_profile.json, written by scripts/lambda_profile.py):

    D = the queue's backlog + forecast arrivals still to come x minutes per task      (demand, minutes)
    C = the active minutes the time and the battery allow before 06:00                 (capacity, minutes)
        active A and dock Q minutes: A + Q <= T and drain x A - 1 %/min x Q <= battery - floor,
        so C = T when the battery covers the night, else (battery - floor + T) / (drain + 1)
    lambda = 0 when D <= C (light nights, the early night: behaviour unchanged), else the points per
             robot-minute of the marginal task: the (1 - C/D) minute-weighted quantile of the paying
             tasks' points per minute, capped at their mean.

Each use of lambda has its own switch in SWITCHES; all off (the default) leaves the final build's behaviour
byte-identical: overload trigger and ranking (planner), the lost-item hunt stop (flows._find), wet-floor
re-looks (executor._stale_before_corridor) and the charge target and interrupt (executor._charge*).
"""

from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path

from agent.world import clock_to_seconds

PROFILE_FILE = Path(__file__).parent / "data" / "lambda_profile.json"
SWITCHES: dict[str, bool] = {"overload": False, "hunt": False, "wet": False, "charge": False}
SHIFT_START_S = clock_to_seconds("22:00:00")
SHIFT_END_S = clock_to_seconds("06:00:00")
EPS = 0.25  # points per robot-minute: a price above this is overload (the queue cannot all be served)
OVERLOAD_RANK = "net"  # overload order with the price: "net" value - price x minutes; "density" the old order
CHARGE_FORECAST_TARGET = True  # switch "charge": the forced block's target from the forecast (else the old one)
FLOOR = 10.0  # % the capacity keeps in the battery (planner.OVERLOAD_BATTERY_FLOOR)
CHARGE_PER_MIN = 1.0  # % per docked minute [obs]
SLIP_POINTS = 15.0  # an unseen wet patch: -15 and 60 s [obs]; a seen one is crept over in 10 s
SLIP_MIN = (60 - 10) / 60
LOOK_MIN = 5 / 60
LOOK_BATTERY = 0.1  # % per look [obs, energy model]
LOOK_MIN_GAP_S = 60  # never two looks at one approach within a minute (a guard, not a price)
STRAND_Z = 2.054  # one-sided 98 %: the charge margin keeps the per-night stranding risk under ~2 %


@lru_cache(maxsize=4)
def profile(path: str = str(PROFILE_FILE)) -> dict:
    return json.loads(Path(path).read_text())


def on(name: str) -> bool:
    return bool(SWITCHES.get(name))


def _left(now_s: float) -> float:
    return max(0.0, (SHIFT_END_S - now_s) / 60.0)


def arrivals_left(now_s: float, prof: dict | None = None) -> float:
    """Requests still expected before 06:00 less one task's minutes (later ones cannot be served)."""
    prof = prof or profile()
    rates = prof["arrivals_per_hour"]
    stop = SHIFT_END_S - prof["task_minutes"] * 60
    total = 0.0
    for h, rate in enumerate(rates):
        a, b = SHIFT_START_S + 3600 * h, min(SHIFT_START_S + 3600 * (h + 1), stop)
        lo = max(a, now_s)
        if b > lo:
            total += rate * (b - lo) / 3600
    return total


def demand_min(now_s: float, backlog_s: float = 0.0, prof: dict | None = None) -> float:
    prof = prof or profile()
    return max(0.0, backlog_s) / 60 + arrivals_left(now_s, prof) * prof["task_minutes"]


def capacity_min(now_s: float, battery: float | None, prof: dict | None = None) -> float:
    """Active minutes before 06:00: all of them when the battery covers the night (or is unknown), else
    the time-and-battery bound (battery - floor + T) / (drain + charge rate)."""
    return capacity_floor(now_s, battery, FLOOR, prof)


def _quantile(qs: list[float], p: float) -> float:
    p = min(1.0, max(0.0, p))
    x = p * (len(qs) - 1)
    i = int(x)
    if i >= len(qs) - 1:
        return qs[-1]
    return qs[i] + (qs[i + 1] - qs[i]) * (x - i)


def lam(now_s: float, battery: float | None, backlog_s: float = 0.0, *, forecast: bool = True,
        prof: dict | None = None) -> float:
    """Points per robot-minute (see the module docstring). `forecast=False` prices the queue alone."""
    prof = prof or profile()
    demand = demand_min(now_s, backlog_s, prof) if forecast else max(0.0, backlog_s) / 60
    cap = capacity_min(now_s, battery, prof)
    if demand <= 0 or demand <= cap:
        return 0.0
    price = _quantile(prof["density_quantiles"], 1.0 - cap / demand)
    return min(price, prof["density_cap"])


def hunt_p(k: int, prof: dict | None = None) -> float:
    """P(the item turns up at the k-th place of a hunt | not before), k = 1 the hinted place: the measured
    hazard for places 1-2, pooled over places 3+ (single places there are too few to rank)."""
    prof = prof or profile()
    p, reached = prof["hunt_find_p"], prof["hunt_reached"]
    if k <= 2:
        return p[max(0, k - 1)]
    found = sum(pk * rk for pk, rk in zip(p[2:], reached[2:], strict=True))
    return found / max(1e-9, sum(reached[2:]))


def hunt_worth(k: int, value: float, minutes: float, deliver_min: float, price: float,
               prof: dict | None = None) -> bool:
    """Search the k-th place: P(find there) x (value - price x the delivery's minutes) beats price x the
    minutes of the walk, the look and the scan. Always at price 0 (the hunt then ends on its caps only)."""
    if price <= 0:
        return True
    p = hunt_p(k, prof)
    return p * (value - price * deliver_min) >= price * minutes


def patch_rate(now_s: float, corridors: int, prof: dict | None = None) -> float:
    """New wet patches per corridor per minute at `now_s`: spill requests per hour (measured, by hour) x
    patches met per spill request, spread over the hotel's corridors."""
    prof = prof or profile()
    h = int(min(7, max(0, (now_s - SHIFT_START_S) // 3600)))
    return prof["spills_per_hour"][h] * prof["patches_per_spill"] / max(1, corridors) / 60


def look_worth(age_s: float, now_s: float, corridors: int, spill_msgs: int, floor_corridors: int,
               price: float, delay_decay: float, prof: dict | None = None) -> bool:
    """Look before stepping into a corridor when P(a new patch since the last look) x what a slip costs
    (15 points + its lost minute at the price) beats what the look costs (5 s and 0.1 % at the price, plus
    the decay of the work waiting behind it: `delay_decay` points per minute). P = 1 - exp(-rate x age),
    raised by each spill message on that floor since the last look (one new patch somewhere among the
    floor's corridors)."""
    if age_s < LOOK_MIN_GAP_S:
        return False
    p = 1 - math.exp(-patch_rate(now_s, corridors, prof) * age_s / 60)
    if spill_msgs:
        p = 1 - (1 - p) * (1 - 1 / max(1, floor_corridors)) ** spill_msgs
    slip = SLIP_POINTS + price * SLIP_MIN
    cost = price * (LOOK_MIN + LOOK_BATTERY / CHARGE_PER_MIN) + delay_decay * LOOK_MIN
    return p * slip > cost


def capacity_floor(now_s: float, battery: float | None, floor: float, prof: dict | None = None) -> float:
    """capacity_min with another battery floor."""
    prof = prof or profile()
    left = _left(now_s)
    if battery is None:
        return left
    drain = prof["drain_per_min"]
    spare = battery - floor
    if spare >= drain * left:
        return left
    return max(0.0, min(left, (spare + CHARGE_PER_MIN * left) / (drain + CHARGE_PER_MIN)))


def margin(now_s: float, battery: float | None, backlog_s: float, prof: dict | None = None) -> float:
    """% on top of the forecast need, STRAND_Z standard deviations of the drain still to come: the planned
    work W at a drain rate that varies over the seeds (drain_sd), plus, while the night is time-bound,
    more work than forecast (the spread over the seeds of the requests still to come, at most what the
    capacity can still take)."""
    prof = prof or profile()
    drain, tau = prof["drain_per_min"], prof["task_minutes"]
    demand = demand_min(now_s, backlog_s, prof)
    cap = capacity_min(now_s, battery, prof)
    work = min(demand, cap)
    h = int(min(7, max(0, (now_s - SHIFT_START_S) // 3600)))
    share = arrivals_left(now_s, prof) / max(1e-9, arrivals_left(SHIFT_START_S + 3600 * h, prof))
    more = min(prof["arrivals_left_sd"][h] * share * tau, max(0.0, cap - demand))
    return STRAND_Z * math.hypot(prof["drain_sd"] * work, drain * more)


def charge_target(now_s: float, battery: float | None, backlog_s: float, reserve: float,
                  prof: dict | None = None) -> float:
    """The battery a charge should reach: the floor and the stranding margin, plus the drain of the work the
    rest of the night can hold once that charge is done (forecast demand, at most what the time left after
    the charge allows); never below the reserve, at most 100."""
    prof = prof or profile()
    floor = FLOOR + margin(now_s, battery, backlog_s, prof)
    work = min(demand_min(now_s, backlog_s, prof), capacity_floor(now_s, battery, floor, prof))
    target = floor + prof["drain_per_min"] * work
    return max(reserve, min(100.0, target))


def energy_worth(now_s: float, battery: float | None, backlog_s: float, prof: dict | None = None) -> bool:
    """Is another docked minute worth more than the robot-minute it costs? A minute docked gives 1 %, that
    is 1/drain minutes of work later, worth the forecast price (the queue left out); it costs the price
    now (the queue in). Worth nothing once the forecast fits the battery (forecast price 0)."""
    prof = prof or profile()
    later = lam(now_s, battery, 0.0, prof=prof)
    if later <= 0:
        return False
    now = lam(now_s, battery, backlog_s, prof=prof)
    return later * CHARGE_PER_MIN / prof["drain_per_min"] >= now
