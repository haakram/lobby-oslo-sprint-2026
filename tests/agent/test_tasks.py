import pytest

from agent.tasks import ITEM_ALIASES, Kind, Task, parse_request

A = Kind.AMENITY


@pytest.mark.parametrize(
    "text,kind,fields",
    [
        ("R-001: 319 wants a phone charger.", A, {"room": "room-319", "item": "phone-charger"}),
        ("208 wants a water bottle.", A, {"room": "room-208", "item": "water-bottle"}),
        ("104 wants a toiletry kit.", A, {"room": "room-104", "item": "toiletry-kit"}),
        ("205 wants a pillow.", A, {"room": "room-205", "item": "pillow"}),
        ("Two towels for 212, please.", A, {"room": "room-212", "item": "towel", "count": 2}),
        (
            "Guest in 317 lost glasses, maybe the ground floor corridor.",
            Kind.LOST_ITEM,
            {"room": "room-317", "item": "glasses", "area_hint": "ground floor corridor"},
        ),
        (
            "Ms Nygaard lost glasses earlier tonight, probably somewhere around the ground floor corridor.",
            Kind.LOST_ITEM,
            {"room": None, "guest": "Ms Nygaard", "item": "glasses", "area_hint": "ground floor corridor"},
        ),
        (
            "Tell the guest in 319 the taxi is here.",
            Kind.MESSAGE,
            {"room": "room-319", "message": "the taxi is here"},
        ),
        (
            "Bring the tray from the kitchen pass to 104.",
            Kind.TRAY,
            {"room": "room-104", "item": "tray-104"},
        ),
        ("Check if 103 is empty and tidy, report back.", Kind.ROOM_CHECK, {"room": "room-103"}),
        ("The moon is made of cheese.", Kind.UNKNOWN, {}),
        # variants
        ("Room 212 needs two towels", A, {"room": "room-212", "item": "towel", "count": 2}),
        ("Could someone bring a pillow to 205?", A, {"room": "room-205", "item": "pillow"}),
        ("R-007: Please tell 319 that breakfast starts at 7", Kind.MESSAGE,
         {"room": "room-319", "message": "breakfast starts at 7"}),
        ("Please bring 3 pillows to room 101.", A, {"room": "room-101", "item": "pillow", "count": 3}),
        ("Room 410 would like a charger", A, {"room": "room-410", "item": "phone-charger"}),
        ("Bring a water to 208", A, {"room": "room-208", "item": "water-bottle"}),
        ("Is room 214 empty?", Kind.ROOM_CHECK, {"room": "room-214"}),
    ],
)
def test_parses_seen_requests(text, kind, fields):
    t = parse_request("R-001", text, "t0")
    assert isinstance(t, Task)
    assert t.kind == kind
    assert t.request == "R-001"
    for k, v in fields.items():
        assert getattr(t, k) == v, k


def test_prefix_stripped_and_text_kept():
    t = parse_request("R-002", "R-002: 205 wants a pillow.", "12:00")
    assert t.text == "205 wants a pillow."
    assert t.arrived == "12:00"
    assert t.count == 1


def test_unknown_never_raises():
    for s in ["", "   ", "319", "wants a thing", "Bring a unicorn to 205"]:
        assert parse_request("R-9", s, "t").kind in (Kind.UNKNOWN, Kind.AMENITY)
    assert parse_request("R-9", "Bring a unicorn to 205", "t").kind == Kind.UNKNOWN


def test_aliases():
    assert ITEM_ALIASES["toiletries"] == "toiletry-kit"
    assert ITEM_ALIASES["towels"] == "towel"
