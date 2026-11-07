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
        ("Tell room 319 that Ms Smith lost her glasses", Kind.MESSAGE,
         {"room": "room-319", "message": "Ms Smith lost her glasses"}),
        ("Tell the guest in 319 the tray is ready.", Kind.MESSAGE,
         {"room": "room-319", "message": "the tray is ready"}),
        ("Breakfast at 7 for 205, bring water", A,
         {"room": "room-205", "item": "water-bottle", "count": 1}),
        ("Two fresh towels for 212", A, {"room": "room-212", "item": "towel", "count": 2}),
        ("Take the towel from 105 to 206", A, {"room": "room-206", "item": "towel"}),
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


# --- Task 13: every request text from the live seed-1 night (wybe-api.md § 12) -------------------

FOLLOW = "Front desk passed on a call from {}: the guest says the {} they ordered an hour ago never came."
BAGS_TEXT = "Take the bags at the desk up to {}. The room is empty, the guest checks in later."


@pytest.mark.parametrize(
    "text,kind,fields",
    [
        (BAGS_TEXT.format(206), Kind.BAGS, {"room": "room-206", "item": None}),
        (BAGS_TEXT.format(204), Kind.BAGS, {"room": "room-204"}),
        (FOLLOW.format(319, "water bottle"), Kind.FOLLOWUP, {"room": "room-319", "item": "water-bottle"}),
        (FOLLOW.format(317, "pillow"), Kind.FOLLOWUP, {"room": "room-317", "item": "pillow"}),
        (FOLLOW.format(321, "phone charger"), Kind.FOLLOWUP, {"room": "room-321", "item": "phone-charger"}),
        ("Complaint about noise near 201.", Kind.NOISE, {"room": "room-201", "item": None}),
        ("R-063: Complaint about noise near 103.", Kind.NOISE, {"room": "room-103"}),
        ("Mr Aas would like a pillow.", A, {"room": None, "guest": "Mr Aas", "item": "pillow", "count": 1}),
        ("Ms Kvam would like a water bottle.", A, {"room": None, "guest": "Ms Kvam", "item": "water-bottle"}),
        ("Mr Nguyen would like a toiletry kit.", A, {"room": None, "guest": "Mr Nguyen", "item": "toiletry-kit"}),
        ("Room service for Dr Engen is waiting at the kitchen pass.", Kind.TRAY,
         {"room": None, "guest": "Dr Engen", "item": None}),
        ("Room service for Ms Vik is waiting at the kitchen pass.", Kind.TRAY, {"room": None, "guest": "Ms Vik"}),
        ("Let Mx Haugen know their wake-up call is set for half past six.", Kind.MESSAGE,
         {"room": None, "guest": "Mx Haugen", "message": "their wake-up call is set for half past six"}),
        ("Let Ms Vik know breakfast starts at seven.", Kind.MESSAGE,
         {"room": None, "guest": "Ms Vik", "message": "breakfast starts at seven"}),
        ("Someone mentioned a spill on floor 3.", Kind.SPILL, {"room": None, "floor": 3}),
        ("Someone mentioned a spill on floor 1.", Kind.SPILL, {"floor": 1}),
        ("Mx Dahl lost a child's toy earlier tonight, probably somewhere around near the kitchen.",
         Kind.LOST_ITEM, {"room": None, "guest": "Mx Dahl", "item": "toy", "area_hint": "near the kitchen"}),
        ("Guest in 208 lost a wallet, maybe the kitchen pass.", Kind.LOST_ITEM,
         {"room": "room-208", "item": "wallet", "area_hint": "kitchen pass"}),
        ("Guest in 319 lost a child's toy, maybe the lobby bar.", Kind.LOST_ITEM,
         {"room": "room-319", "item": "toy", "area_hint": "lobby bar"}),
        ("Tell the guest in 211 their wake-up call is set for half past six.", Kind.MESSAGE,
         {"room": "room-211", "message": "their wake-up call is set for half past six"}),
        ("Tell the guest in 319 a parcel arrived for them at the desk.", Kind.MESSAGE,
         {"room": "room-319", "message": "a parcel arrived for them at the desk"}),
        ("323 wants two water bottles.", A, {"room": "room-323", "item": "water-bottle", "count": 2}),
        ("Check if 206 is empty and tidy, report back.", Kind.ROOM_CHECK, {"room": "room-206"}),
        ("Bring the tray from the kitchen pass to 322.", Kind.TRAY, {"room": "room-322", "item": "tray-322"}),
    ],
)
def test_parses_live_night_requests(text, kind, fields):
    t = parse_request("R-013", text, "00:13:37")
    assert t.kind == kind, t
    for k, v in fields.items():
        assert getattr(t, k) == v, (k, getattr(t, k))


def test_task_has_a_floor_field_defaulting_to_none():
    assert parse_request("R-1", "205 wants a pillow.", "t").floor is None


# --- the request ledger (follow-ups and duplicates) --------------------------------------------------

TRAY_322 = "Bring the tray from the kitchen pass to 322."


def test_ledger_duplicate_same_text_same_room_within_ten_minutes():
    from agent.tasks import Ledger

    led = Ledger()
    a = parse_request("R-055", f"R-055: {TRAY_322}", "05:01:49")
    b = parse_request("R-056", f"R-056: {TRAY_322}", "05:02:19")
    c = parse_request("R-070", TRAY_322, "05:20:00")
    d = parse_request("R-071", "Bring the tray from the kitchen pass to 323.", "05:02:30")
    for t in (a, b, c, d):
        led.add(t)
    assert led.duplicate_of(a) is None
    assert led.duplicate_of(b) == "R-055"
    assert led.duplicate_of(c) is None  # more than 10 minutes after both
    assert led.duplicate_of(d) is None  # another room


def test_ledger_duplicate_across_midnight():
    from agent.tasks import Ledger

    led = Ledger()
    a = parse_request("R-1", "Complaint about noise near 201.", "23:58:00")
    b = parse_request("R-2", "Complaint about noise near 201.", "00:03:00")
    led.add(a)
    led.add(b)
    assert led.duplicate_of(b) == "R-1"


def test_ledger_original_for_a_follow_up():
    from agent.tasks import Ledger

    led = Ledger()
    order = parse_request("R-037", "Ms Kvam would like a water bottle.", "02:56:34")
    other = parse_request("R-030", "202 wants a pillow.", "02:20:11")
    follow = parse_request("R-049", FOLLOW.format(202, "water bottle"), "04:29:15")
    for t in (other, order, follow):
        led.add(t)
    assert led.original_for(follow) is None  # Ms Kvam's room is not known yet
    led.set_room("R-037", "room-202")
    assert led.original_for(follow).request == "R-037"
    assert led.original_for(follow).status == "pending"
    led.set_status("R-037", "done")
    assert led.get("R-037").status == "done"


def test_ledger_original_for_a_named_guest_order_by_the_known_guest_room():
    from agent.tasks import Ledger

    led = Ledger()
    order = parse_request("R-037", "Ms Kvam would like a water bottle.", "02:56:34")
    follow = parse_request("R-049", FOLLOW.format(202, "water"), "04:29:15")
    for t in (order, follow):
        led.add(t)
    assert led.unknown_guests(follow, {}) == ["Ms Kvam"]  # worth one question to the clerk
    assert led.original_for(follow, {"Ms Kvam": None}) is None  # the clerk did not know
    assert led.unknown_guests(follow, {"Ms Kvam": None}) == []  # asked once, not again
    assert led.original_for(follow, {"Ms Kvam": "room-202"}).request == "R-037"
    assert led.original_for(follow, {"Ms Kvam": "room-203"}) is None


def test_ledger_counts_served_requests():
    from agent.tasks import Ledger

    led = Ledger()
    for rid in ("R-1", "R-2", "R-3"):
        led.add(parse_request(rid, "205 wants a pillow.", "23:00:00"))
    led.set_status("R-1", "done")
    led.set_status("R-2", "failed")
    assert led.served() == 1


def test_ledger_add_is_idempotent_and_keeps_status():
    from agent.tasks import Ledger

    led = Ledger()
    t = parse_request("R-1", "205 wants a pillow.", "23:00:00")
    led.add(t)
    led.set_status("R-1", "failed")
    led.add(t)
    assert led.get("R-1").status == "failed" and len(led.entries) == 1


def test_room_messages_win_over_the_new_patterns():
    t = parse_request("R-1", "Tell the guest in 319 the noise has stopped.", "t")
    assert t.kind is Kind.MESSAGE and t.message == "the noise has stopped"
