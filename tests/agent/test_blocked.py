"""Task 25: corridors closed off for cleaning are routed around, and no route goes through a room.

Live evidence (batch 1): seed 3 retried a closed corridor-3b -> corridor-3a 125 times until the
battery died (stranded, -200) although 3b -> 3c -> 3d -> 3a was open; seed 2 walked into closed
corridor-3b twice and routed 3a -> room-321 -> 3d through a locked guest room (a stale seed-1
3d-room-321 edge next to the 3a-room-321 edge a look had shown); seed 5 failed 13 floor-3 requests
on the same stale room link.
"""

import json

import pytest

from agent.executor import GO_ATTEMPTS, ActionFailed
from agent.routing import NoRoute, route_seconds, shortest_route
from agent.world import BLOCK_S, DEFAULT_MAP, Hotel, clock_to_seconds
from tests.agent.test_executor import decisions, setup

CLOSED = "Closed off: a cleaning crew has blocked that corridor."  # the live move refusal, verbatim
FLAG = "closed off for cleaning"  # the live look's exits[].blocked


@pytest.fixture
def hotel():
    return Hotel.load()


def look_3b(blocked=True):
    """The live seed-3 look at corridor-3b (00:24:51), seed-1 room names, no wet warning."""
    to_3a = {"to": "corridor-3a", "metres": 17}
    if blocked:
        to_3a["blocked"] = FLAG
    return {"location": "corridor-3b", "floor": 3, "exits": [
        to_3a, {"to": "corridor-3c", "metres": 17},
        *({"to": f"room-{n}", "metres": 4, "door": "locked"} for n in range(314, 318))]}


# --- the world model: blocked edges ------------------------------------------------------------


def test_a_look_with_a_blocked_exit_blocks_that_edge_both_ways(hotel):
    before = hotel.version
    hotel.update_from_look("corridor-3b", look_3b(), authoritative=True)
    assert hotel.is_blocked("corridor-3b", "corridor-3a") and hotel.is_blocked("corridor-3a", "corridor-3b")
    assert not hotel.is_blocked("corridor-3b", "corridor-3c")
    assert hotel.version > before  # routes are planned again
    # The edge is still known (the detour's other side), only closed.
    assert any(e.b == "corridor-3a" for e in hotel.neighbors("corridor-3b"))


@pytest.mark.parametrize("flag", [FLAG, True, "yes"])
def test_any_truthy_blocked_value_blocks(hotel, flag):
    hotel.update_from_look("corridor-3a", {"floor": 3, "exits": [
        {"to": "corridor-3b", "metres": 16, "blocked": flag}]})
    assert hotel.is_blocked("corridor-3a", "corridor-3b")


@pytest.mark.parametrize("flag", [None, False, ""])
def test_a_falsy_blocked_value_does_not_block(hotel, flag):
    hotel.update_from_look("corridor-3a", {"floor": 3, "exits": [
        {"to": "corridor-3b", "metres": 16, "blocked": flag}]}, authoritative=True)
    assert not hotel.is_blocked("corridor-3a", "corridor-3b")


def test_the_block_clears_when_a_later_look_shows_the_exit_without_the_flag(hotel):
    hotel.update_from_look("corridor-3b", look_3b(), authoritative=True)
    # A single learnt edge (not a real look at the place) proves nothing about the closure.
    hotel.update_from_look("corridor-3b", {"floor": 3, "exits": [{"to": "corridor-3a", "metres": 17}]})
    assert hotel.is_blocked("corridor-3b", "corridor-3a")
    before = hotel.version
    hotel.update_from_look("corridor-3b", look_3b(blocked=False), authoritative=True)
    assert not hotel.is_blocked("corridor-3b", "corridor-3a")
    assert hotel.version > before


def test_a_block_expires_after_30_sim_minutes(hotel):
    assert BLOCK_S == 30 * 60
    t0 = clock_to_seconds("00:24:54")
    hotel.update_from_look("corridor-3b", look_3b(), authoritative=True)
    hotel.expire_blocks(t0)  # the first clock after the look starts its 30 minutes
    hotel.expire_blocks(t0 + BLOCK_S - 1)
    assert hotel.is_blocked("corridor-3b", "corridor-3a")
    before = hotel.version
    hotel.expire_blocks(t0 + BLOCK_S)
    assert not hotel.is_blocked("corridor-3b", "corridor-3a")
    assert hotel.version > before


def test_block_edge_with_an_end_and_a_look_that_still_shows_it_extends_it(hotel):
    t0 = clock_to_seconds("23:08:25")
    hotel.block_edge("corridor-3a", "corridor-3b", t0 + 60)
    hotel.expire_blocks(t0)
    assert hotel.is_blocked("corridor-3b", "corridor-3a")
    hotel.update_from_look("corridor-3b", look_3b(), authoritative=True)  # still closed at t0 + 30
    hotel.expire_blocks(t0 + 30)
    hotel.expire_blocks(t0 + 61)
    assert hotel.is_blocked("corridor-3a", "corridor-3b")  # 30 minutes from the confirming look
    hotel.expire_blocks(t0 + 30 + BLOCK_S)
    assert not hotel.is_blocked("corridor-3a", "corridor-3b")


# --- routing ------------------------------------------------------------------------------------


def test_routing_avoids_a_blocked_edge_and_finds_the_detour(hotel):
    with_cart = shortest_route(hotel, "corridor-3b", "elevator-3", with_cart=True)
    assert with_cart.path == ["corridor-3b", "corridor-3a", "elevator-3"]
    hotel.update_from_look("corridor-3b", look_3b(), authoritative=True)
    r = shortest_route(hotel, "corridor-3b", "elevator-3", with_cart=True)
    assert r.path == ["corridor-3b", "corridor-3c", "corridor-3d", "corridor-3a", "elevator-3"]


def test_blocked_edge_changes_the_cached_route_seconds(hotel):
    direct = route_seconds(hotel, "corridor-3b", "corridor-3a")
    hotel.block_edge("corridor-3b", "corridor-3a")
    assert route_seconds(hotel, "corridor-3b", "corridor-3a") > direct
    hotel.update_from_look("corridor-3b", look_3b(blocked=False), authoritative=True)
    assert route_seconds(hotel, "corridor-3b", "corridor-3a") == 17


def test_only_route_through_a_blocked_edge_raises_no_route(hotel):
    hotel.block_edge("corridor-3b", "corridor-3a")
    hotel.block_edge("corridor-3b", "corridor-3c")
    with pytest.raises(NoRoute):
        shortest_route(hotel, "corridor-3b", "elevator-3")
    with pytest.raises(NoRoute):
        route_seconds(hotel, "corridor-3b", "charging-dock")


def test_a_blocked_elevator_ride_is_not_used(hotel):
    hotel.block_edge("elevator-1", "elevator-3")
    hotel.block_edge("elevator-2", "elevator-3")
    r = shortest_route(hotel, "lobby", "corridor-3a")
    assert "elevator-3" not in r.path and "stairwell-3" in r.path


def _stale_room_map():
    """Seed 2's floor 3: the seed-1 3d-room-321 edge plus a 3a-room-321 edge seen in a look."""
    data = json.loads(DEFAULT_MAP.read_text())
    data["edges"].append({"a": "corridor-3a", "b": "room-321", "m": 4, "door": True})
    return Hotel(data)


def test_route_never_passes_through_a_room():
    hotel = _stale_room_map()
    r = shortest_route(hotel, "corridor-3a", "corridor-3d")
    assert r.path == ["corridor-3a", "corridor-3d"]  # not 3a -> room-321 -> 3d (7 m "shortcut")
    r = shortest_route(hotel, "elevator-3", "room-324")
    assert not any(hotel.nodes[n]["kind"] == "room" for n in r.path[1:-1])
    # A room is still a destination and a start.
    assert shortest_route(hotel, "corridor-3a", "room-321").path == ["corridor-3a", "room-321"]
    assert shortest_route(hotel, "room-321", "corridor-3c").path[0] == "room-321"


def test_a_look_at_a_corridor_relinks_a_room_away_from_its_stale_corridor(hotel):
    """Seed 5: room-321 seed-1-attached to 3d; a look at 3a lists it -> its corridor is 3a."""
    assert hotel.room_corridor("room-321") == "corridor-3d"
    hotel.update_from_look("corridor-3a", {"location": "corridor-3a", "floor": 3, "exits": [
        {"to": "elevator-3", "metres": 4}, {"to": "corridor-3b", "metres": 12, "blocked": FLAG},
        {"to": "corridor-3d", "metres": 15},
        *({"to": f"room-{n}", "metres": 4, "door": "locked"} for n in (321, 322, 323))]},
        authoritative=True)
    assert hotel.room_corridor("room-321") == "corridor-3a"
    assert {e.b for e in hotel.neighbors("room-321")} == {"corridor-3a"}
    assert "room-321" not in {e.b for e in hotel.neighbors("corridor-3d")}
    assert "room-324" in {e.b for e in hotel.neighbors("corridor-3d")}  # rooms not seen stay put
    for dst in ("corridor-3d", "room-324", "stairwell-3"):
        path = shortest_route(hotel, "corridor-3a", dst).path
        assert "room-321" not in path and "room-322" not in path, path


def test_a_single_learnt_room_edge_does_not_relink(hotel):
    """Only a real look at the corridor is proof; a learnt or guessed edge is not."""
    hotel.update_from_look("corridor-3a", {"floor": 3, "exits": [
        {"to": "room-321", "metres": 4, "door": "locked"}]})
    assert {e.b for e in hotel.neighbors("room-321")} == {"corridor-3a", "corridor-3d"}
    assert "room-321" not in shortest_route(hotel, "corridor-3a", "corridor-3d").path


# --- the executor against the fake server ------------------------------------------------------


def close(fake, monkeypatch, a, b, *, in_look=True):
    """The fake refuses a <-> b like the live server ("Closed off: ...") and, with in_look, its
    looks flag that exit `blocked` from both sides. Returns a function that lifts the closure."""
    edge = frozenset((a, b))
    move, look = fake._cmd_move, fake._cmd_look

    def refusing_move(args):
        if frozenset((fake._location, args.get("to"))) == edge:
            fake._spend(3)
            return False, CLOSED
        return move(args)

    def flagged_look(args):
        ok, result = look(args)
        if ok and in_look and not args.get("at") and isinstance(result, dict):
            for ex in result.get("exits", []):
                if frozenset((result["location"], ex["to"])) == edge:
                    ex["blocked"] = FLAG
        return ok, result

    monkeypatch.setattr(fake, "_cmd_move", refusing_move)
    monkeypatch.setattr(fake, "_cmd_look", flagged_look)

    def lift():
        monkeypatch.setattr(fake, "_cmd_move", move)
        monkeypatch.setattr(fake, "_cmd_look", look)

    return lift


def tried(fake, a, b, since=0):
    """(sent, refused) moves from a to b, following the robot through the fake's log."""
    loc, sent, refused = "charging-dock", 0, 0
    for i, e in enumerate(fake.log):
        if e["cmd"] != "move":
            continue
        if i >= since and loc == a and e["args"].get("to") == b:
            sent += 1
            refused += not e["ok"]
        if e["ok"]:
            loc = e["result"]["at"]
    return sent, refused


def refused_moves(fake, since=0):
    return [e for e in fake.log[since:] if e["cmd"] == "move" and not e["ok"]]


def test_a_look_that_shows_the_closure_makes_the_robot_walk_around_it(tmp_path, monkeypatch):
    fake, _, ex = setup(tmp_path, rids={"R-001"})
    close(fake, monkeypatch, "corridor-3a", "corridor-3b")
    ex.go("corridor-3b")
    assert ex.state.location == "corridor-3b"
    assert tried(fake, "corridor-3a", "corridor-3b") == (0, 0)  # seen in the 3a look, never bumped
    assert tried(fake, "corridor-3c", "corridor-3b") == (1, 0)
    assert ex.hotel.is_blocked("corridor-3a", "corridor-3b")
    assert not refused_moves(fake)


def test_seed3_behind_the_closure_the_robot_gets_home_by_the_detour(tmp_path, monkeypatch):
    """Seed 3, 00:24: at corridor-3b, the direct 3b -> 3a edge closed; the dock is reachable by
    3b -> 3c -> 3d -> 3a. No repeated move, the dock reached."""
    fake, _, ex = setup(tmp_path, rids={"R-001"})
    ex.go("corridor-3b")  # open on the way there (the closure starts later)
    close(fake, monkeypatch, "corridor-3a", "corridor-3b")
    ex.look()  # the look at 3b now shows it (live: 00:24:51)
    start = len(fake.log)
    ex.go("charging-dock")
    assert ex.state.location == "charging-dock"
    assert tried(fake, "corridor-3b", "corridor-3a", since=start) == (0, 0)
    assert not refused_moves(fake, since=start)
    assert len([e for e in fake.log[start:] if e["cmd"] == "move"]) < 15


def _closed_after_3a_was_seen(tmp_path, monkeypatch):
    """Live-like: corridor-3a looked at while open (looked at once per shift), then the cleaning
    crew closes 3a <-> 3b; the robot comes back through 3a, so only the move can tell it."""
    fake, session, ex = setup(tmp_path, rids={"R-001"})
    ex.go("corridor-3a")
    ex.go("elevator-3")
    lift = close(fake, monkeypatch, "corridor-3a", "corridor-3b")
    return fake, session, ex, lift


def test_a_move_refused_closed_off_blocks_the_edge_and_replans(tmp_path, monkeypatch):
    fake, session, ex, _ = _closed_after_3a_was_seen(tmp_path, monkeypatch)
    ex.go("corridor-3b")
    assert ex.state.location == "corridor-3b"
    assert tried(fake, "corridor-3a", "corridor-3b") == (1, 1)  # one refusal, never retried
    assert tried(fake, "corridor-3c", "corridor-3b") == (1, 0)  # the detour 3a -> 3d -> 3c -> 3b
    assert ex.hotel.is_blocked("corridor-3a", "corridor-3b")
    replans = [d for d in decisions(session, "replan") if d.get("reason") == "closed off"]
    assert len(replans) == 1
    assert replans[0]["at"] == "corridor-3a" and replans[0]["blocked"] == "corridor-3b"
    start = len(fake.log)
    ex.go("elevator-3")  # the way back knows the closure: no second refusal
    assert ex.state.location == "elevator-3"
    assert not refused_moves(fake, since=start)


def test_closed_off_on_every_way_fails_bounded(tmp_path, monkeypatch):
    fake, _, ex = setup(tmp_path, rids={"R-001"})
    ex.go("corridor-3b")
    close(fake, monkeypatch, "corridor-3b", "corridor-3a")
    close(fake, monkeypatch, "corridor-3b", "corridor-3c")  # the closures stack
    start = len(fake.log)
    with pytest.raises(ActionFailed):
        ex.go("charging-dock")
    assert tried(fake, "corridor-3b", "corridor-3a", since=start) == (1, 1)
    assert tried(fake, "corridor-3b", "corridor-3c", since=start) == (1, 1)
    assert len(refused_moves(fake, since=start)) == 2
    assert len(fake.log) - start < GO_ATTEMPTS


def test_closed_off_without_a_look_flag_is_still_bounded(tmp_path, monkeypatch):
    """Should a look ever show the exit unflagged while moves are refused, the look reopens it;
    each closed move is still tried at most twice per walk, then the walk fails."""
    fake, _, ex = setup(tmp_path, rids={"R-001"})
    ex.go("corridor-3b")
    close(fake, monkeypatch, "corridor-3b", "corridor-3a", in_look=False)
    close(fake, monkeypatch, "corridor-3b", "corridor-3c", in_look=False)
    start = len(fake.log)
    with pytest.raises(ActionFailed):
        ex.go("charging-dock")
    assert tried(fake, "corridor-3b", "corridor-3a", since=start)[1] <= 2
    assert tried(fake, "corridor-3b", "corridor-3c", since=start)[1] <= 2
    assert len(fake.log) - start < GO_ATTEMPTS


def test_a_closure_is_tried_again_once_it_has_expired(tmp_path, monkeypatch):
    fake, _, ex, lift = _closed_after_3a_was_seen(tmp_path, monkeypatch)
    ex.go("corridor-3b")
    assert ex.hotel.is_blocked("corridor-3a", "corridor-3b")
    lift()  # the cleaning crew is done
    start = len(fake.log)
    ex.go("corridor-3a")  # still within 30 minutes: the long way round
    assert tried(fake, "corridor-3b", "corridor-3a", since=start) == (0, 0)
    ex.go("corridor-3b")
    fake._spend(BLOCK_S)
    ex.refresh()  # a reply brings the new clock
    start = len(fake.log)
    ex.go("corridor-3a")
    assert not ex.hotel.is_blocked("corridor-3a", "corridor-3b")
    assert tried(fake, "corridor-3b", "corridor-3a", since=start) == (1, 0)
