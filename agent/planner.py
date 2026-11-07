"""Task planner: estimate value and sim-seconds per task and pick the best next one."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field

from agent.routing import NoRoute, route_seconds
from agent.tasks import Kind, Task
from agent.world import Hotel, RobotState, clock_to_seconds

VALUE_FLOOR = 5.0
UNREACHABLE_S = 1.0e6


def _base_values() -> dict[str, float]:
    return {"amenity": 20, "message": 20, "tray": 33, "room_check": 32, "lost_item": 40}


def _cart_stock() -> dict[str, int]:
    return {"towel": 2, "water-bottle": 3, "phone-charger": 2, "toiletry-kit": 2, "pillow": 2}


def _action_seconds() -> dict[str, float]:
    return {"amenity": 25, "message": 20, "tray": 25, "room_check": 50, "lost_item": 145}


@dataclass
class Params:
    base_values: dict[str, float] = field(default_factory=_base_values)
    decay_per_min: float = 1.0
    cart_stock: dict[str, int] = field(default_factory=_cart_stock)
    use_cart: bool = True
    max_scans: int = 6
    action_seconds: dict[str, float] = field(default_factory=_action_seconds)

    def to_json(self) -> str:
        return json.dumps(asdict(self), sort_keys=True)

    @classmethod
    def from_json(cls, s: str) -> Params:
        return cls(**json.loads(s))


def _stops(task: Task, state: RobotState, hotel: Hotel) -> list[str] | None:
    """Ordered places to visit before the action is done; None if impossible."""
    stops: list[str] = []
    if task.kind is Kind.TRAY and not state.has_cart:
        stops.append("laundry")
    if task.kind is Kind.AMENITY and task.item and not state.carrying(task.item):
        place = hotel.stock_location(task.item)
        if place is None:
            return None
        stops.append(place)
    if task.kind is Kind.TRAY:
        stops.append("kitchen-pass")
    if task.kind is Kind.ROOM_CHECK and not state.carrying("keycard"):
        stops.append("front-desk")
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


def estimate_seconds(task: Task, state: RobotState, hotel: Hotel, params: Params) -> float:
    stops = _stops(task, state, hotel)
    if stops is None:
        return UNREACHABLE_S
    cart = state.has_cart
    here, total = state.location, 0.0
    for i, stop in enumerate(stops):
        # a tray trip to the laundry is how the robot gets the cart
        with_cart = cart or (task.kind is Kind.TRAY and i > 0)
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


def choose_next(tasks: list[Task], state: RobotState, hotel: Hotel, params: Params) -> Task | None:
    now = clock_to_seconds(state.clock)
    best: tuple | None = None
    pick: Task | None = None
    for idx, t in enumerate(tasks):
        secs = estimate_seconds(t, state, hotel, params)
        ratio = estimate_value(t, int(now + secs), params) / secs
        key = (t.kind is Kind.UNKNOWN, -ratio, clock_to_seconds(t.arrived), idx)
        if best is None or key < best:
            best, pick = key, t
    return pick


def opening_plan(params: Params) -> list[str]:
    return ["get_cart", "stock_cart"] if params.use_cart else []
