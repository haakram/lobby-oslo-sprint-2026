"""Hotel graph and robot state."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

DEFAULT_MAP = Path(__file__).parent / "data" / "hotel_seed1.json"
NAMED_KINDS = ("corridor", "elevator", "stairwell", "room")  # "corridor-1a" -> corridor, ...
_COUNT = re.compile(r"^(.*\S)\s+x(\d+)$")  # "towel x8" -> ("towel", 8)


def guess_kind(name: str) -> str:
    """The kind of a place first met in a look: by its name prefix, else a plain "place"."""
    for kind in NAMED_KINDS:
        if name.startswith(kind + "-"):
            return kind
    return "place"


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
        self._wet_spots: dict[str, None] = {}  # spots stepped onto wet, in the order learnt
        self.version = 0  # bumps on every change to edges, nodes or wet spots (routes are cached)
        self._route_cache = None
        for e in data["edges"]:
            self._add_edge(Edge(e["a"], e["b"], e["m"], bool(e.get("door")), bool(e.get("stairs"))))

    @classmethod
    def load(cls, path: Path | None = None) -> Hotel:
        return cls(json.loads(Path(path or DEFAULT_MAP).read_text()))

    def _touch(self) -> None:
        self.version += 1
        self._route_cache = None  # routing caches by (wet spots, edge count, node count): not enough

    def _add_edge(self, e: Edge) -> None:
        self._adj.setdefault(e.a, {})[e.b] = e
        self._adj.setdefault(e.b, {})[e.a] = Edge(e.b, e.a, e.metres, e.door, e.stairs)
        self._touch()

    def set_metres(self, a: str, b: str, metres: float) -> None:
        """A move reply's metres are the truth about that edge (seed 2: other metres, same plan)."""
        e = self._adj.get(a, {}).get(b)
        if e is None or e.metres == metres:
            return
        self._add_edge(Edge(a, b, float(metres), e.door, e.stairs))

    def forget_edge(self, a: str, b: str) -> None:
        ab = self._adj.get(a, {}).pop(b, None)
        ba = self._adj.get(b, {}).pop(a, None)
        if ab is not None or ba is not None:
            self._touch()

    def add_node(self, name: str, floor: int, kind: str | None = None) -> None:
        if name not in self.nodes:
            self.nodes[name] = {"floor": floor, "kind": kind or guess_kind(name), "x": 0.0, "z": 0.0}
            self._touch()

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
        """Moving a -> b is onto a wet floor: the spot b is wet, from every side, for the whole shift
        (live night: after a slip elevator-3 -> corridor-3a, 3d -> 3a and 3b -> 3a only crept)."""
        self._wet.add(frozenset((a, b)))
        if b not in self._wet_spots:
            self._wet_spots[b] = None
            self._touch()

    def is_wet(self, a: str, b: str) -> bool:
        return b in self._wet_spots

    def wet_spots(self) -> list[str]:
        """Every spot known wet this shift, oldest first."""
        return list(self._wet_spots)

    def update_from_look(self, location: str, look: dict, *, authoritative: bool = False) -> None:
        """What a `look` shows is fact: exits update the edges (metres, door; unknown places are
        added with a kind guessed from the name), a wet warning marks that exit's spot wet.
        `authoritative` (a real look at the place, not a single learnt edge): exits the place no
        longer lists are dropped (an empty exit list proves nothing) and the objects seen replace
        this place's stock (items believed here but not seen are 0 now). Guest rooms keep no stock."""
        floor = look.get("floor", self.nodes[location]["floor"] if location in self.nodes else 0)
        self.add_node(location, floor)
        floor = self.nodes[location]["floor"]
        seen: set[str] = set()
        for ex in look.get("exits", []):
            to = ex["to"]
            seen.add(to)
            self.add_node(to, floor)
            door = bool(ex.get("door")) and ex.get("door") != "open"
            stairs = bool(ex.get("stairs"))
            known = self._adj.get(location, {}).get(to)
            if known is None:
                self._add_edge(Edge(location, to, float(ex["metres"]), door, stairs))
            elif (known.metres, known.door) != (float(ex["metres"]), door):
                self._add_edge(Edge(location, to, float(ex["metres"]), door, known.stairs or stairs))
            if "wet" in str(ex.get("warning", "")).lower():
                self.mark_wet(location, to)
        if authoritative and seen:
            for gone in [e.b for e in self.neighbors(location) if e.b not in seen]:
                self.forget_edge(location, gone)
        if authoritative and "objects" in look and self.nodes[location]["kind"] != "room":
            self.set_stock(location, self.parse_objects(look.get("objects") or []))

    @staticmethod
    def parse_objects(objects: list) -> dict[str, int]:
        """["towel x8", "cart", "keycard x2"] -> {"towel": 8, "cart": 1, "keycard": 2}."""
        out: dict[str, int] = {}
        for obj in objects:
            if not isinstance(obj, str) or not obj.strip():
                continue
            m = _COUNT.match(obj.strip())
            name, n = (m[1], int(m[2])) if m else (obj.strip(), 1)
            out[name] = out.get(name, 0) + n
        return out

    def set_stock(self, place: str, items: dict[str, int]) -> None:
        """The looked-at truth about a place: items believed there but not seen are 0 now."""
        old = self.stock.get(place, {})
        self.stock[place] = {**dict.fromkeys(old, 0), **items}

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
