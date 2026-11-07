"""Exact shortest routes in sim seconds (Dijkstra) and best-order tours."""

from __future__ import annotations

import heapq
import itertools
from dataclasses import dataclass, field

from agent.world import Hotel

MOVE_S_PER_M = 1.0
DOOR_S = 3.0
STAIRS_S_PER_M = 3.0
ELEVATOR_CALL_S = 45.0
ELEVATOR_RIDE_S = 15.0
WET_KNOWN_S = 10.0

_DOOR_KINDS = ("room", "service")


@dataclass
class Step:
    cmd: str
    args: dict
    seconds: float


@dataclass
class Route:
    steps: list[Step] = field(default_factory=list)
    seconds: float = 0.0
    path: list[str] = field(default_factory=list)


class NoRoute(Exception):
    pass


def _edge_seconds(hotel: Hotel, a: str, b: str, metres: float, door: bool, stairs: bool) -> float:
    if stairs:
        s = metres * STAIRS_S_PER_M
    else:
        s = metres * MOVE_S_PER_M
        if door and (hotel.nodes[a]["kind"] in _DOOR_KINDS or hotel.nodes[b]["kind"] in _DOOR_KINDS):
            s += DOOR_S
    if hotel.is_wet(a, b):
        s += WET_KNOWN_S
    return s


def _hops(hotel: Hotel, node: str, with_cart: bool):
    """Yield (next, seconds, [Step...]) from node."""
    for e in hotel.neighbors(node):
        if e.stairs and with_cart:
            continue
        s = _edge_seconds(hotel, node, e.b, e.metres, e.door, e.stairs)
        yield e.b, s, [Step("move", {"to": e.b}, s)]
    if hotel.nodes.get(node, {}).get("kind") == "elevator":
        for other in hotel.elevators():
            if other != node:
                steps = [
                    Step("call_elevator", {"floor": hotel.floor(other)}, ELEVATOR_CALL_S),
                    Step("move", {"to": other}, ELEVATOR_RIDE_S),
                ]
                yield other, ELEVATOR_CALL_S + ELEVATOR_RIDE_S, steps


def shortest_route(hotel: Hotel, src: str, dst: str, *, with_cart: bool = False) -> Route:
    if src not in hotel.nodes or dst not in hotel.nodes:
        raise NoRoute(f"unknown node: {src if src not in hotel.nodes else dst}")
    if src == dst:
        return Route([], 0.0, [src])
    dist = {src: 0.0}
    prev: dict[str, tuple[str, list[Step]]] = {}
    heap = [(0.0, src)]
    done: set[str] = set()
    while heap:
        d, u = heapq.heappop(heap)
        if u in done:
            continue
        done.add(u)
        if u == dst:
            break
        for v, s, steps in _hops(hotel, u, with_cart):
            nd = d + s
            if nd < dist.get(v, float("inf")):
                dist[v] = nd
                prev[v] = (u, steps)
                heapq.heappush(heap, (nd, v))
    if dst not in done:
        raise NoRoute(f"no route from {src} to {dst}")
    path, chunks, cur = [dst], [], dst
    while cur != src:
        cur, steps = prev[cur]
        path.append(cur)
        chunks.append(steps)
    path.reverse()
    steps = [s for chunk in reversed(chunks) for s in chunk]
    return Route(steps, dist[dst], path)


def _version(hotel: Hotel):
    # Key assumes existing edges are never edited in place (only added or marked wet).
    n_edges = sum(len(v) for v in hotel._adj.values())
    return (frozenset(hotel._wet), n_edges, len(hotel.nodes))


def route_seconds(hotel: Hotel, src: str, dst: str, *, with_cart: bool = False) -> float:
    ver = _version(hotel)
    cache = getattr(hotel, "_route_cache", None)
    if cache is None or cache[0] != ver:
        cache = (ver, {})
        hotel._route_cache = cache
    key = (src, dst, with_cart)
    if key not in cache[1]:
        cache[1][key] = shortest_route(hotel, src, dst, with_cart=with_cart).seconds
    return cache[1][key]


def _tour_cost(hotel, start, order, end, with_cart) -> float:
    pts = [start, *order] + ([end] if end else [])
    return sum(route_seconds(hotel, a, b, with_cart=with_cart) for a, b in itertools.pairwise(pts))


def best_tour(
    hotel: Hotel,
    start: str,
    stops: list[str],
    *,
    with_cart: bool = False,
    end: str | None = None,
) -> tuple[list[str], float]:
    stops = list(dict.fromkeys(stops))

    def cost(order):
        return _tour_cost(hotel, start, order, end, with_cart)

    if len(stops) <= 7:
        best = min(itertools.permutations(stops), key=cost, default=())
        return list(best), cost(best)
    # nearest neighbour then 2-opt
    order, left, cur = [], set(stops), start
    while left:
        nxt = min(left, key=lambda s: route_seconds(hotel, cur, s, with_cart=with_cart))
        order.append(nxt)
        left.remove(nxt)
        cur = nxt
    best_c = cost(order)
    improved = True
    while improved:
        improved = False
        for i in range(len(order) - 1):
            for j in range(i + 1, len(order)):
                cand = order[:i] + order[i : j + 1][::-1] + order[j + 1 :]
                c = cost(cand)
                if c < best_c - 1e-9:
                    order, best_c, improved = cand, c, True
    return order, best_c
