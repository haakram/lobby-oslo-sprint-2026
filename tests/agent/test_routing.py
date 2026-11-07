import itertools
import json

import pytest

from agent.routing import NoRoute, best_tour, route_seconds, shortest_route
from agent.world import DEFAULT_MAP, Hotel

DATA = json.loads(DEFAULT_MAP.read_text())
EDGE = {frozenset((e["a"], e["b"])): e for e in DATA["edges"]}
NODES = DATA["nodes"]


def hop(a, b):
    e = EDGE[frozenset((a, b))]
    if e.get("stairs"):
        return e["m"] * 3.0
    door = e.get("door") and (NODES[a]["kind"] in ("room", "service") or NODES[b]["kind"] in ("room", "service"))
    return e["m"] + (3.0 if door else 0.0)


def total(path):
    return sum(hop(a, b) for a, b in itertools.pairwise(path))


@pytest.fixture
def hotel():
    return Hotel.load()


def test_same_floor_route(hotel):
    r = shortest_route(hotel, "storage", "room-104")
    assert r.path == ["storage", "corridor-1b", "room-104"]
    assert r.seconds == total(r.path) == 15
    assert [s.cmd for s in r.steps] == ["move", "move"]


def test_cross_floor_uses_elevator(hotel):
    r = shortest_route(hotel, "storage", "room-319")
    cmds = [(s.cmd, s.args) for s in r.steps]
    i = cmds.index(("call_elevator", {"floor": 3}))
    assert cmds[i + 1] == ("move", {"to": "elevator-3"})
    p = r.path
    a, b = p.index("elevator-1"), p.index("elevator-3")
    assert b == a + 1
    expected = total(p[: a + 1]) + 60 + total(p[b:])
    assert r.seconds == pytest.approx(expected)
    assert sum(s.seconds for s in r.steps) == pytest.approx(r.seconds)
    # that is the best we can do: stairs alternative is not cheaper
    assert not any("stairwell" in n for n in p)


def test_cart_never_uses_stairs(hotel):
    cart = shortest_route(hotel, "corridor-1c", "corridor-2d", with_cart=True)
    assert not any("stairwell" in n for n in cart.path)
    free = route_seconds(hotel, "corridor-1c", "corridor-2d")
    assert free <= cart.seconds
    assert cart.seconds == pytest.approx(total_with_virtual(cart.path))
    # stairs alternative by hand
    to_s = route_seconds(hotel, "corridor-1c", "stairwell-1", with_cart=True)
    from_s = route_seconds(hotel, "stairwell-2", "corridor-2d", with_cart=True)
    assert to_s < 1e9 and from_s < 1e9
    stairs_alt = hand_dijkstra_stairs(hotel)
    assert free <= stairs_alt + 1e-9


def total_with_virtual(path):
    t = 0.0
    for a, b in itertools.pairwise(path):
        t += 60 if a.startswith("elevator-") and b.startswith("elevator-") else hop(a, b)
    return t


def hand_dijkstra_stairs(hotel):
    r_to = route_seconds(hotel, "corridor-1c", "stairwell-1", with_cart=True)
    r_from = route_seconds(hotel, "stairwell-2", "corridor-2d", with_cart=True)
    return r_to + 19 * 3.0 + r_from


def test_known_wet_floor_costs_10(hotel):
    base = shortest_route(hotel, "corridor-3a", "corridor-3d")
    hotel.mark_wet("corridor-3a", "corridor-3d")
    after = shortest_route(hotel, "corridor-3a", "corridor-3d")
    assert after.seconds in (pytest.approx(base.seconds + 10), pytest.approx(base.seconds))
    assert after.seconds >= base.seconds


def test_wet_invalidates_cache(hotel):
    before = route_seconds(hotel, "corridor-3a", "corridor-3d")
    assert route_seconds(hotel, "corridor-3a", "corridor-3d") == before
    hotel.mark_wet("corridor-3a", "corridor-3d")
    direct = EDGE.get(frozenset(("corridor-3a", "corridor-3d")))
    if direct and total(["corridor-3a", "corridor-3d"]) == before:
        assert route_seconds(hotel, "corridor-3a", "corridor-3d") == before + 10


def test_best_tour_exact_small(hotel):
    start, stops = "corridor-3a", ["room-311", "room-324", "room-316"]
    order, secs = best_tour(hotel, start, stops)
    assert sorted(order) == sorted(stops)

    def cost(perm):
        pts = [start, *perm]
        return sum(route_seconds(hotel, a, b) for a, b in itertools.pairwise(pts))

    best = min(cost(p) for p in itertools.permutations(stops))
    assert secs == pytest.approx(best)
    assert cost(order) == pytest.approx(best)


def test_best_tour_with_end_and_heuristic(hotel):
    stops = [n for n, v in NODES.items() if v["kind"] == "room" and v["floor"] == 1][:9]
    order, secs = best_tour(hotel, "storage", stops, end="storage")
    assert sorted(order) == sorted(stops)
    pts = ["storage", *order, "storage"]
    assert secs == pytest.approx(sum(route_seconds(hotel, a, b) for a, b in itertools.pairwise(pts)))


def test_no_route_raises(hotel):
    hotel.nodes["island"] = {"floor": 1, "kind": "room", "x": 0.0, "z": 0.0}
    with pytest.raises(NoRoute):
        shortest_route(hotel, "storage", "island")
    with pytest.raises(NoRoute):
        route_seconds(hotel, "storage", "nowhere")
