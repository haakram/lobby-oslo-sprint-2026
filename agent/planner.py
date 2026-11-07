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
    # bags/noise/spill: Task 13 hypotheses (bags: the false "done" cost 35); a follow-up earns
    # nothing itself, so it ranks by its tiny cost (it is mostly a report).
    return {"amenity": 20, "message": 20, "tray": 33, "room_check": 32, "lost_item": 40,
            "bags": 35, "noise": 25, "spill": 25, "followup": VALUE_FLOOR}


def _cart_stock() -> dict[str, int]:
    return {"towel": 2, "water-bottle": 2, "phone-charger": 1, "toiletry-kit": 1, "pillow": 1}


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


def _stops(task: Task, state: RobotState, hotel: Hotel) -> list[str] | None:
    """Ordered places to visit before the action is done; None if impossible."""
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
            place = hotel.stock_location("wet-floor-sign")
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


def estimate_seconds(task: Task, state: RobotState, hotel: Hotel, params: Params) -> float:
    stops = _stops(task, state, hotel)
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


def choose_next(tasks: list[Task], state: RobotState, hotel: Hotel, params: Params) -> Task | None:
    now = clock_to_seconds(state.clock)
    best: tuple | None = None
    pick: Task | None = None
    for idx, t in enumerate(tasks):
        secs = estimate_seconds(t, state, hotel, params)
        ratio = estimate_value(t, int(now + secs), params) / max(secs, 1.0)
        key = (t.kind is Kind.UNKNOWN, -ratio, clock_to_seconds(t.arrived), idx)
        if best is None or key < best:
            best, pick = key, t
    return pick


def opening_plan(params: Params) -> list[str]:
    return ["get_cart", "stock_cart"] if params.use_cart else []
