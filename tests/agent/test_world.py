import pytest

from agent.world import Hotel, RobotState, clock_to_seconds


@pytest.fixture
def hotel():
    return Hotel.load()


def test_loads_all_floors(hotel):
    ids = set(hotel.nodes)
    want = {f"room-{n}" for n in (*range(101, 109), *range(201, 215), *range(311, 325))}
    want |= {"elevator-1", "elevator-2", "elevator-3", "stairwell-1", "stairwell-2", "stairwell-3"}
    want |= {"storage", "laundry", "kitchen-pass", "front-desk", "charging-dock"}
    assert want <= ids
    assert hotel.floor("room-319") == 3
    assert hotel.elevators() == ["elevator-1", "elevator-2", "elevator-3"]
    assert hotel.stock_location("towel") == "storage"
    assert hotel.stock_location("nothing") is None


def test_room_corridor(hotel):
    assert hotel.room_corridor("room-319") == "corridor-3c"
    assert hotel.room_corridor("room-104") == "corridor-1b"
    assert hotel.room_corridor("room-212") == "corridor-2d"


def dist(hotel, a, b):
    return next(e for e in hotel.neighbors(a) if e.b == b)


def test_distances(hotel):
    assert dist(hotel, "lobby", "front-desk").metres == 7
    assert dist(hotel, "front-desk", "lobby").metres == 7
    assert dist(hotel, "corridor-3a", "corridor-3b").metres == 16
    e = dist(hotel, "stairwell-1", "stairwell-2")
    assert e.metres == 19 and e.stairs
    assert dist(hotel, "corridor-1b", "storage").door
    assert dist(hotel, "corridor-3c", "room-319").door
    assert not any(e.b == "elevator-2" for e in hotel.neighbors("elevator-1"))


def test_update_from_look_adds_edge_and_wet(hotel):
    hotel.update_from_look(
        "corridor-3a",
        {"exits": [{"to": "corridor-3x", "metres": 9, "warning": "the floor that way looks wet"}]},
    )
    assert dist(hotel, "corridor-3a", "corridor-3x").metres == 9
    assert hotel.floor("corridor-3x") == 3
    assert hotel.is_wet("corridor-3a", "corridor-3x")
    assert not hotel.is_wet("corridor-3x", "corridor-3a")  # wet is the spot you step onto
    assert not hotel.is_wet("corridor-3a", "corridor-3b")


def test_wet_is_per_spot_not_per_edge_and_persists(hotel):
    # Live night 23:44-23:53: slip elevator-3 -> corridor-3a, then 3d -> 3a and 3b -> 3a were
    # "creeps carefully" (already known), so the game keys wetness on the destination spot.
    hotel.mark_wet("elevator-3", "corridor-3a")
    for src in ("elevator-3", "corridor-3b", "corridor-3d"):
        assert hotel.is_wet(src, "corridor-3a")
    assert not hotel.is_wet("corridor-3a", "corridor-3d")  # stepping off it is dry
    assert hotel.is_wet("elevator-3", "corridor-3a")  # never forgotten


def test_clock_to_seconds():
    assert clock_to_seconds("22:00:00") == 79200
    assert clock_to_seconds("01:00:00") == 90000
    assert clock_to_seconds("23:52:20") == 85940


def test_state_from_status():
    s = RobotState()
    s.update_from_status(
        {"location": "storage", "battery": 97.5, "hands": ["towel"], "cart": None,
         "docked": False, "score": 21, "unread_messages": 0}
    )
    assert (s.location, s.battery, s.hands, s.score) == ("storage", 97.5, ["towel"], 21)
    assert not s.has_cart and s.carrying("towel") and not s.carrying("pillow")
    s.update_from_status({"cart": ["tray-104"]})
    assert s.has_cart and s.carrying("tray-104")
