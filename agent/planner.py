"""Task planner: estimate value and sim-seconds per task and pick the best next one."""

from __future__ import annotations

import json
import math
from collections.abc import Sequence
from dataclasses import asdict, dataclass, field

from agent.routing import NoRoute, route_seconds
from agent.tasks import Kind, Task
from agent.world import Hotel, RobotState, clock_to_seconds

VALUE_FLOOR = 5.0
UNREACHABLE_S = 1.0e6
SHIFT_START_S = clock_to_seconds("22:00:00")
SHIFT_END_S = clock_to_seconds("06:00:00")  # the server ends the shift at 06:00; nothing pays after it
GROWTH_PER_HOUR = 0.08  # the same request pays ~8 % more per hour of the night (fitted on live pay)
BACKLOG_FACTOR = 1.25  # margin on the summed estimates of a queue (they run short live)
OVERLOAD_DRAIN_PER_MIN = 0.75  # % battery per minute of backlog (the fake drains 0.75 %/min busy)
OVERLOAD_BATTERY_FLOOR = 10.0  # % the backlog must leave in the battery
# Overload order only: a lost-item hunt is planned at 145 s plus the walk, but live hunts took ~9 min
# and found the item ~half the time before the visible-items fix (shorter, and 10 of 12 found on
# seed 41, after it): ranked as at least this long and worth this share of its value.
LOST_ITEM_HUNT_S = 420.0
LOST_ITEM_FOUND_P = 0.7


def _base_values() -> dict[str, float]:
    # bags/noise: Task 13 hypotheses (bags: the false "done" cost 35); spill: measured by two teams
    # (a sign on the new patch pays ~52 fresh, 51.2 at 22:00 in the per-hour fit); a follow-up earns
    # nothing itself, so it ranks by its tiny cost (it is mostly a report).
    return {"amenity": 20, "message": 20, "tray": 33, "room_check": 32, "lost_item": 40,
            "bags": 35, "noise": 25, "spill": 52, "followup": VALUE_FLOOR}


def _decay_by_kind() -> dict[str, float]:
    # points lost per minute of waiting, measured live by two teams over ~1,600 served requests:
    # messages 24 -> 0 after 90 min, trays 39 -> 15 at 45 min, lost items 46 -> 12, spills 52 -> 44 at 22
    return {"message": 0.27, "tray": 0.53, "room_check": 0.53, "spill": 0.36, "lost_item": 0.75,
            "amenity": 0.40, "bags": 0.84, "noise": 0.49, "followup": 0.0}


def _growth_by_kind() -> dict[str, float]:
    # share of the base gained per hour since 22:00: ~8 % for every kind but spills, whose pay is
    # nearly flat (live fit 51.2 + 0.64 per hour)
    return {"amenity": GROWTH_PER_HOUR, "message": GROWTH_PER_HOUR, "tray": GROWTH_PER_HOUR,
            "room_check": GROWTH_PER_HOUR, "lost_item": GROWTH_PER_HOUR, "bags": GROWTH_PER_HOUR,
            "noise": GROWTH_PER_HOUR, "spill": 0.0125, "followup": GROWTH_PER_HOUR}


def _cart_stock() -> dict[str, int]:
    return {"towel": 2, "water-bottle": 2, "phone-charger": 1, "toiletry-kit": 1, "pillow": 1}


# Variant 2 (cart loadout). Amenity items asked per night on 12 distinct live practice seeds
# (1-12, named guests included, follow-ups excluded; 219 items): water 55, towel 49, pillow 42,
# phone charger 38, toiletry kit 35. Per-night means [obs]; the fake (bench) asks no towels.
AMENITY_PRIOR: dict[str, float] = {"water-bottle": 4.6, "towel": 4.1, "pillow": 3.5,
                                   "phone-charger": 3.2, "toiletry-kit": 2.9}
NIGHT_H = 8.0
HANDS = 2
CART_CAPACITY = 8  # live: the 9th item in the cart is refused


def _poisson_tail(lam: float, k: int) -> float:
    """P(N >= k) for N ~ Poisson(lam), k >= 1."""
    term = total = math.exp(-lam)
    for j in range(1, k):
        term *= lam / j
        total += term
    return max(0.0, 1.0 - total)


def loadout_target(slots: int, seen: dict[str, int], hours_in: float,
                   horizon_h: float = 2.0) -> dict[str, int]:
    """How many of each amenity item to carry with `slots` free places. Each item's hourly rate is
    the live prior (one night's worth) updated with tonight's requests so far (Gamma-Poisson:
    (prior + seen) / (8 h + hours in)); the k-th unit of an item is worth P(at least k asked in
    the next `horizon_h` hours), and the slots go to the most valuable units (greedy, which is
    optimal for this separable concave objective). Ties keep AMENITY_PRIOR's order."""
    rates = {i: (p + seen.get(i, 0)) / (NIGHT_H + max(0.0, hours_in)) for i, p in AMENITY_PRIOR.items()}
    order = list(AMENITY_PRIOR)
    target = dict.fromkeys(order, 0)

    def worth(i: str) -> float:
        return _poisson_tail(rates[i] * horizon_h, target[i] + 1)

    for _ in range(max(0, slots)):
        item = max(order, key=lambda i: (worth(i), -order.index(i)))
        if worth(item) <= 0.0:
            break
        target[item] += 1
    return {i: n for i, n in target.items() if n}


def _action_seconds() -> dict[str, float]:
    return {"amenity": 25, "message": 20, "tray": 25, "room_check": 50, "lost_item": 145,
            "bags": 50, "noise": 60, "spill": 150, "followup": 1}


@dataclass
class Params:
    base_values: dict[str, float] = field(default_factory=_base_values)
    decay_per_min: float = 0.5  # fallback for a kind missing from decay_by_kind
    decay_by_kind: dict[str, float] = field(default_factory=_decay_by_kind)
    growth_by_kind: dict[str, float] = field(default_factory=_growth_by_kind)
    cart_stock: dict[str, int] = field(default_factory=_cart_stock)
    use_cart: bool = True
    max_scans: int = 6
    action_seconds: dict[str, float] = field(default_factory=_action_seconds)
    order: str = "spt"  # "spt": shortest task first; "ratio": value per second (the old rule)
    # Variant 2: "mix" stocks loadout_target() at the start and at each restock; "fixed" keeps
    # cart_stock at the start and never restocks (the old behaviour).
    loadout: str = "mix"
    loadout_slots: int = 6  # amenity items carried at most (hands + cart)
    reserve_slots: int = 3  # cart places always left free for trays, bags, keycards, lost items
    restock_min: int = 2  # an idle restock trip only when at least this many items are missing
    loadout_horizon_h: float = 2.0

    def to_json(self) -> str:
        return json.dumps(asdict(self), sort_keys=True)

    @classmethod
    def from_json(cls, s: str) -> Params:
        data = json.loads(s)
        for key, default in (("base_values", _base_values), ("action_seconds", _action_seconds),
                             ("decay_by_kind", _decay_by_kind), ("growth_by_kind", _growth_by_kind)):
            if isinstance(data.get(key), dict):  # older files lack the newer kinds
                data[key] = {**default(), **data[key]}
        return cls(**data)


def cart_place(hotel: Hotel) -> str:
    """Where the cart stands tonight: the learned stock, else the JSON's laundry."""
    return hotel.stock_location("cart") or hotel.special.get("laundry", "laundry")


def _carried_like(state: RobotState, item: str) -> bool:
    return any(n == item or n.startswith(item + "-") for n in [*state.hands, *(state.cart or [])])


def _stops(task: Task, state: RobotState, hotel: Hotel,
           movable_signs: Sequence[str] = ()) -> list[str] | None:
    """Ordered places to visit before the action is done; None if impossible. `movable_signs`: where
    the executor may take a credited wet-floor sign when none is in stock (H-spill, sign_move)."""
    stops: list[str] = []
    if task.kind is Kind.FOLLOWUP:
        return stops  # mostly a report; a waiting original is planned on its own
    if task.room is None and task.guest:
        stops.append(hotel.special.get("clerk", "front-desk"))  # ask the clerk for the room
    if task.kind in (Kind.TRAY, Kind.BAGS) and not state.has_cart:
        stops.append(cart_place(hotel))
    if task.kind is Kind.AMENITY and task.item and not state.carrying(task.item):
        place = hotel.stock_location(task.item)
        if place is None:
            return None
        stops.append(place)
    if task.kind is Kind.TRAY and not _carried_like(state, task.item or f"tray-{(task.room or '')[5:]}"):
        stops.append(hotel.special.get("kitchen", "kitchen-pass"))
    if task.kind is Kind.ROOM_CHECK and not state.carrying("keycard"):
        stops.append(hotel.stock_location("keycard") or hotel.special.get("clerk", "front-desk"))
    if task.kind is Kind.BAGS and not _carried_like(state, f"luggage-{(task.room or '')[5:]}"):
        stops.append(hotel.special.get("clerk", "front-desk"))
    if task.kind is Kind.SPILL:
        if not state.carrying("wet-floor-sign"):
            place = hotel.stock_location("wet-floor-sign") or next(iter(movable_signs), None)
            if place is None:
                return None
            stops.append(place)
        landing = next((e for e in hotel.elevators() if hotel.floor(e) == task.floor), None)
        if landing:
            stops.append(landing)
    if task.kind is Kind.LOST_ITEM:
        hint = (task.area_hint or "").lower()
        found = next((n for n in sorted(hotel.nodes) if n in hint), None)
        if found:
            stops.append(found)
    try:
        if task.room:
            stops.append(hotel.room_corridor(task.room))
    except KeyError:
        return None
    return stops


def estimate_seconds(task: Task, state: RobotState, hotel: Hotel, params: Params, *,
                     movable_signs: Sequence[str] = ()) -> float:
    stops = _stops(task, state, hotel, movable_signs)
    if stops is None:
        return UNREACHABLE_S
    cart = state.has_cart
    here, total = state.location, 0.0
    where_cart = cart_place(hotel)
    for i, stop in enumerate(stops):
        # a tray (or bags) trip to the cart's place is how the robot gets the cart
        with_cart = cart or (task.kind in (Kind.TRAY, Kind.BAGS) and where_cart in stops[:i])
        try:
            total += route_seconds(hotel, here, stop, with_cart=with_cart)
        except NoRoute:
            return UNREACHABLE_S
        here = stop
    return total + params.action_seconds.get(task.kind.value, 30.0)


def _decay(task: Task, params: Params) -> float:
    return params.decay_by_kind.get(task.kind.value, params.decay_per_min)


def estimate_value(task: Task, now_s: int, params: Params) -> float:
    """Value if the task is finished at sim second `now_s` (waiting time decays the base)."""
    base = params.base_values.get(task.kind.value, VALUE_FLOOR)
    waited_min = max(0.0, now_s - clock_to_seconds(task.arrived)) / 60.0
    return max(VALUE_FLOOR, base - _decay(task, params) * waited_min)


def value_at(task: Task, finish_s: float, params: Params) -> float:
    """What the server pays for `task` finished at sim second `finish_s`: the kind's base, grown by
    the kind's share per hour since 22:00 (~8 %; spills ~1 %), less the kind's decay per minute
    waited; at least VALUE_FLOOR, and 0 once the shift is over (06:00)."""
    if finish_s > SHIFT_END_S:
        return 0.0
    base = params.base_values.get(task.kind.value, VALUE_FLOOR)
    hours = max(0.0, finish_s - SHIFT_START_S) / 3600.0
    waited_min = max(0.0, finish_s - clock_to_seconds(task.arrived)) / 60.0
    growth = params.growth_by_kind.get(task.kind.value, GROWTH_PER_HOUR)
    return max(VALUE_FLOOR, base * (1 + growth * hours) - _decay(task, params) * waited_min)


def backlog_seconds(tasks: list[Task], state: RobotState, hotel: Hotel, params: Params, *,
                    movable_signs: Sequence[str] = ()) -> float:
    """BACKLOG_FACTOR x the summed estimates of the tasks that can be priced (an unreachable or
    unpriced one is the flow's to explore, not a known cost)."""
    secs = (estimate_seconds(t, state, hotel, params, movable_signs=movable_signs) for t in tasks)
    return BACKLOG_FACTOR * sum(s for s in secs if s < UNREACHABLE_S)


def overloaded(tasks: list[Task], state: RobotState, hotel: Hotel, params: Params,
               battery: float | None, *, movable_signs: Sequence[str] = ()) -> bool:
    """The queue cannot all be served: its backlog runs past 06:00, or the battery cannot cover it
    (battery - backlog minutes x OVERLOAD_DRAIN_PER_MIN < OVERLOAD_BATTERY_FLOOR). An unknown
    battery (None) skips the battery test; an empty backlog always fits."""
    backlog = backlog_seconds(tasks, state, hotel, params, movable_signs=movable_signs)
    if backlog <= 0:
        return False
    if clock_to_seconds(state.clock) + backlog > SHIFT_END_S:
        return True
    return battery is not None and battery - backlog / 60.0 * OVERLOAD_DRAIN_PER_MIN < OVERLOAD_BATTERY_FLOOR


def _overload_rank(task: Task, secs: float, now: int, params: Params) -> tuple[float, float]:
    """-(value at the finish per robot-second), then seconds. A lost-item hunt counts as at least
    LOST_ITEM_HUNT_S and pays LOST_ITEM_FOUND_P of its value (live hunts take minutes, often fail)."""
    found = 1.0
    if task.kind is Kind.LOST_ITEM:
        secs, found = max(secs, LOST_ITEM_HUNT_S), LOST_ITEM_FOUND_P
    value = value_at(task, now + BACKLOG_FACTOR * secs, params) * found
    return -value / max(secs, 1.0), secs


def choose_next(tasks: list[Task], state: RobotState, hotel: Hotel, params: Params,
                battery: float | None = None, overload: bool | None = None, *,
                movable_signs: Sequence[str] = ()) -> Task | None:
    """Shortest task first while the queue can all be served. Every request loses points while it
    waits, so the order that minimises the sum of waits (shortest processing time first) loses the
    fewest; the old value-per-second order ran a 10-minute lost-item search ahead of three 2-minute
    deliveries and let decayed requests starve (live seed 6: a tray waited 86 min).
    Once the queue is overloaded (see `overloaded`; `overload` passes a mode the caller already
    worked out) not everything will be served, and shortest-first starves long, valuable, slowly
    decaying work (live seed 23: four spills, ~52 points and -0.36/min each, never started behind
    newer 2-3 min deliveries); then the order is value at the finish per robot-second, ties by
    seconds (`_overload_rank`: a lost-item hunt is priced as live hunts go). Unknown kinds go last
    either way. Params.order = "ratio" keeps the old rule. `movable_signs`: where a placed sign
    could be taken from when storage has none (a spill is priced through it, Task 6)."""
    now = clock_to_seconds(state.clock)
    if overload is None:
        overload = params.order != "ratio" and overloaded(tasks, state, hotel, params, battery,
                                                          movable_signs=movable_signs)
    best: tuple | None = None
    pick: Task | None = None
    for idx, t in enumerate(tasks):
        secs = estimate_seconds(t, state, hotel, params, movable_signs=movable_signs)
        if params.order == "ratio":
            rank: tuple = (-estimate_value(t, int(now + secs), params) / max(secs, 1.0),)
        elif overload:
            rank = _overload_rank(t, secs, now, params)
        else:
            rank = (secs,)
        key = (t.kind is Kind.UNKNOWN, *rank, clock_to_seconds(t.arrived), idx)
        if best is None or key < best:
            best, pick = key, t
    return pick


def opening_plan(params: Params) -> list[str]:
    return ["get_cart", "stock_cart"] if params.use_cart else []
