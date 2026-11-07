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


def _base_values() -> dict[str, float]:
    # bags/noise/spill: Task 13 hypotheses (bags: the false "done" cost 35); a follow-up earns
    # nothing itself, so it ranks by its tiny cost (it is mostly a report).
    return {"amenity": 20, "message": 20, "tray": 33, "room_check": 32, "lost_item": 40,
            "bags": 35, "noise": 25, "spill": 25, "followup": VALUE_FLOOR}


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
    decay_per_min: float = 1.0
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
        for key, default in (("base_values", _base_values), ("action_seconds", _action_seconds)):
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


def estimate_value(task: Task, now_s: int, params: Params) -> float:
    """Value if the task is finished at sim second `now_s` (waiting time decays the base)."""
    base = params.base_values.get(task.kind.value, VALUE_FLOOR)
    waited_min = max(0.0, now_s - clock_to_seconds(task.arrived)) / 60.0
    return max(VALUE_FLOOR, base - params.decay_per_min * waited_min)


def choose_next(tasks: list[Task], state: RobotState, hotel: Hotel, params: Params, *,
                movable_signs: Sequence[str] = ()) -> Task | None:
    """Shortest task first. Every request loses about a point a minute while it waits, whatever
    its kind, so the order that minimises the sum of waits (shortest processing time first) loses
    the fewest points; the old value-per-second order ran a 10-minute lost-item search ahead of
    three 2-minute deliveries and let decayed requests starve (live seed 6: a tray waited 86 min).
    Params.order = "ratio" keeps the old rule."""
    now = clock_to_seconds(state.clock)
    best: tuple | None = None
    pick: Task | None = None
    for idx, t in enumerate(tasks):
        secs = estimate_seconds(t, state, hotel, params, movable_signs=movable_signs)
        if params.order == "ratio":
            rank = -estimate_value(t, int(now + secs), params) / max(secs, 1.0)
        else:
            rank = secs
        key = (t.kind is Kind.UNKNOWN, rank, clock_to_seconds(t.arrived), idx)
        if best is None or key < best:
            best, pick = key, t
    return pick


def opening_plan(params: Params) -> list[str]:
    return ["get_cart", "stock_cart"] if params.use_cart else []
