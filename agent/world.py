"""Hotel graph and robot state."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

DEFAULT_MAP = Path(__file__).parent / "data" / "hotel_seed1.json"


@dataclass
class Edge:
    a: str
    b: str
    metres: float
    door: bool = False
    stairs: bool = False


def clock_to_seconds(clock: str) -> int:
    """'22:00:00' -> 79200; times before 12:00 are after midnight (+24 h)."""
    h, m, s = (int(p) for p in clock.split(":"))
    secs = h * 3600 + m * 60 + s
    return secs + 86400 if h < 12 else secs


class Hotel:
    def __init__(self, data: dict):
        self.nodes: dict[str, dict] = {k: dict(v) for k, v in data["nodes"].items()}
        self.stock: dict[str, dict[str, int]] = data.get("stock", {})
        self.special: dict[str, str] = data.get("special", {})
        self._adj: dict[str, dict[str, Edge]] = {}
        self._wet: set[frozenset[str]] = set()
        for e in data["edges"]:
            self._add_edge(Edge(e["a"], e["b"], e["m"], bool(e.get("door")), bool(e.get("stairs"))))

    @classmethod
    def load(cls, path: Path | None = None) -> Hotel:
        return cls(json.loads(Path(path or DEFAULT_MAP).read_text()))

    def _add_edge(self, e: Edge) -> None:
        self._adj.setdefault(e.a, {})[e.b] = e
        self._adj.setdefault(e.b, {})[e.a] = Edge(e.b, e.a, e.metres, e.door, e.stairs)

    def floor(self, node: str) -> int:
        return self.nodes[node]["floor"]

    def neighbors(self, node: str) -> list[Edge]:
        return list(self._adj.get(node, {}).values())

    def room_corridor(self, room: str) -> str:
        for e in self.neighbors(room):
            if self.nodes[e.b]["kind"] == "corridor":
                return e.b
        raise KeyError(f"no corridor for {room}")

    def mark_wet(self, a: str, b: str) -> None:
        self._wet.add(frozenset((a, b)))

    def is_wet(self, a: str, b: str) -> bool:
        return frozenset((a, b)) in self._wet

    def update_from_look(self, location: str, look: dict) -> None:
        floor = look.get("floor", self.nodes[location]["floor"] if location in self.nodes else 0)
        if location not in self.nodes:
            self.nodes[location] = {"floor": floor, "kind": "room", "x": 0.0, "z": 0.0}
        floor = self.nodes[location]["floor"]
        for ex in look.get("exits", []):
            to = ex["to"]
            if to not in self.nodes:
                self.nodes[to] = {"floor": floor, "kind": "room", "x": 0.0, "z": 0.0}
            door = bool(ex.get("door")) and ex.get("door") != "open"
            known = self._adj.get(location, {}).get(to)
            if known is None:
                self._add_edge(Edge(location, to, float(ex["metres"]), door, bool(ex.get("stairs"))))
            if "wet" in str(ex.get("warning", "")).lower():
                self.mark_wet(location, to)

    def stock_location(self, item: str) -> str | None:
        for place, items in self.stock.items():
            if items.get(item, 0) > 0:
                return place
        return None

    def elevators(self) -> list[str]:
        return sorted(n for n, v in self.nodes.items() if v["kind"] == "elevator")


@dataclass
class RobotState:
    location: str = "charging-dock"
    battery: float = 100.0
    hands: list[str] = field(default_factory=list)
    cart: list[str] | None = None
    score: int = 0
    docked: bool = False
    clock: str = "22:00:00"

    @property
    def has_cart(self) -> bool:
        return self.cart is not None

    def update_from_status(self, status: dict) -> None:
        for key in ("location", "battery", "score", "docked", "clock"):
            if key in status:
                setattr(self, key, status[key])
        if "hands" in status:
            self.hands = list(status["hands"])
        if "cart" in status:
            self.cart = None if status["cart"] is None else list(status["cart"])

    def carrying(self, item: str) -> bool:
        return item in self.hands or item in (self.cart or [])
