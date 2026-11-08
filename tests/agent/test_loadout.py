"""Variant 2: the cart loadout. The cart starts the night with the items the night most likely needs
(live request mix, updated with tonight's requests), is refilled when idle and topped up at the
shelf, and always keeps cart places free for trays, bags and keycards."""

import httpx

from agent.agent import run_shift
from agent.client import WybeClient
from agent.executor import Executor
from agent.planner import AMENITY_PRIOR, CART_CAPACITY, HANDS, Params, loadout_target
from agent.world import Hotel, RobotState
from tests.agent.test_executor import calls, next_task, settings
from tests.fakes.fake_wybe import FakeWybe

ITEMS = set(AMENITY_PRIOR)


def _setup(tmp_path, requests, params=None, **fake_kw):
    fake = FakeWybe(requests=requests, **fake_kw)
    client = WybeClient(settings(tmp_path), transport=httpx.MockTransport(fake.handler),
                        sleep=lambda s: None)
    session = client.start_shift("practice", seed=1)
    ex = Executor(session, Hotel.load(), RobotState(), params=params or Params())
    session.cmd("inbox")  # the welcome message, read the way the loop does
    ex.inbox_waiting = False
    return fake, session, ex


def _loadout(ex):
    return sorted(c for c in [*ex.state.hands, *(ex.state.cart or [])] if c in ITEMS)


# --- the allocation ----------------------------------------------------------------------------


def test_five_places_take_one_of_each_item_and_a_sixth_goes_to_water():
    assert loadout_target(5, {}, 0.0) == dict.fromkeys(AMENITY_PRIOR, 1)
    six = loadout_target(6, {}, 0.0)
    assert sum(six.values()) == 6 and six["water-bottle"] == 2


def test_tonights_requests_shift_the_loadout():
    plain = loadout_target(6, {}, 3.0)
    pillows = loadout_target(6, {"pillow": 6}, 3.0)
    assert pillows["pillow"] >= 2 and pillows["pillow"] > plain.get("pillow", 0)
    assert pillows["pillow"] > pillows.get("water-bottle", 0)
    assert sum(pillows.values()) == 6


def test_no_places_no_loadout():
    assert loadout_target(0, {}, 0.0) == {}
    assert loadout_target(-3, {"towel": 4}, 2.0) == {}


def test_old_params_files_get_the_loadout_defaults():
    p = Params(decay_per_min=2.5, loadout_slots=5)
    assert Params.from_json(p.to_json()) == p
    old = '{"decay_per_min": 1.0, "max_scans": 6, "use_cart": true}'
    loaded = Params.from_json(old)
    assert loaded.loadout == "mix" and loaded.reserve_slots == 3


# --- the opening and the reserve ----------------------------------------------------------------


def test_opening_loadout_leaves_the_reserved_cart_places_free(tmp_path):
    _fake, _session, ex = _setup(tmp_path, requests=[])
    ex.stock_loadout()
    assert ex.state.has_cart
    assert len(_loadout(ex)) == Params().loadout_slots
    assert CART_CAPACITY - len(ex.state.cart) >= Params().reserve_slots


def test_room_left_counts_free_hands_then_unreserved_cart_places(tmp_path):
    _fake, _session, ex = _setup(tmp_path, requests=[])
    ex.state.hands, ex.state.cart = ["towel", "pillow"], ["keycard", "tray-104", "towel", "pillow", "water-bottle"]
    assert ex.room_left(3) == 0
    ex.state.hands = ["towel"]
    assert ex.room_left(3) == 1
    ex.state.cart = None  # no cart: only the hands
    assert ex.room_left(3) == HANDS - 1


def test_loadout_never_fills_the_reserved_places_even_with_other_things_carried(tmp_path):
    _fake, _session, ex = _setup(tmp_path, requests=[])
    assert ex.get_cart()
    ex.go("front-desk")
    assert ex.pick("keycard")[0]
    ex.stock_cart({"towel": 4})  # an old-style fill: hands + 3 in the cart
    ex.state.cart.append("tray-104")  # as if a tray rode along
    ex.stock_cart(ex.loadout_want(), keep_free=Params().reserve_slots)
    assert CART_CAPACITY - len(ex.state.cart) >= Params().reserve_slots


# --- refills ---------------------------------------------------------------------------------------


def test_idle_restock_refills_what_was_used_and_does_not_repeat(tmp_path):
    fake, session, ex = _setup(tmp_path, requests=[("22:10:00", "R-001", "319 wants a water bottle."),
                                                   ("22:11:00", "R-002", "320 wants a phone charger.")])
    ex.stock_loadout()
    full = _loadout(ex)
    for rid in ("R-001", "R-002"):
        out = ex.run(next_task(ex, session, rid))
        assert out.status == "done", out
    assert len(_loadout(ex)) == len(full) - 2
    since = len(fake.log)
    ex.wait_for_request(max_idle=3)
    picks = [e for e in calls(fake, "pick", since) if e["ok"]]
    assert len(picks) == 2 and len(_loadout(ex)) == len(full)
    assert CART_CAPACITY - len(ex.state.cart) >= Params().reserve_slots
    since = len(fake.log)
    ex.wait_for_request(max_idle=3)  # nothing used since: no second trip
    assert not calls(fake, "pick", since)
    assert not fake.false_done and not fake.unsafe


def test_one_missing_item_is_not_worth_an_idle_trip(tmp_path):
    fake, session, ex = _setup(tmp_path, requests=[("22:10:00", "R-001", "319 wants a water bottle.")])
    ex.stock_loadout()
    assert ex.run(next_task(ex, session, "R-001")).status == "done"
    since = len(fake.log)
    ex.wait_for_request(max_idle=3)
    assert not calls(fake, "pick", since)


def test_fixed_loadout_keeps_the_old_behaviour(tmp_path):
    fake, session, ex = _setup(tmp_path, params=Params(loadout="fixed"),
                               requests=[("22:10:00", "R-001", "319 wants a water bottle."),
                                         ("22:11:00", "R-002", "320 wants a phone charger.")])
    ex.stock_cart(Params().cart_stock)
    for rid in ("R-001", "R-002"):
        assert ex.run(next_task(ex, session, rid)).status == "done"
    since = len(fake.log)
    ex.wait_for_request(max_idle=3)
    assert not calls(fake, "pick", since)  # no restock


def test_a_shelf_trip_tops_up_what_is_shelved_there(tmp_path):
    fake, session, ex = _setup(tmp_path, requests=[("22:10:00", "R-001", "319 wants two towels.")])
    assert ex.get_cart()
    out = ex.run(next_task(ex, session, "R-001"))
    assert out.status == "done", out
    shelf = {i for i, n in ex.hotel.stock.get("storage", {}).items() if i in ITEMS and n > 0}
    assert shelf and any(c in shelf for c in _loadout(ex))  # spares picked at the shelf
    assert CART_CAPACITY - len(ex.state.cart) >= Params().reserve_slots
    assert not fake.false_done


def test_without_params_the_executor_never_restocks(tmp_path):
    fake = FakeWybe(requests=[])
    client = WybeClient(settings(tmp_path), transport=httpx.MockTransport(fake.handler),
                        sleep=lambda s: None)
    ex = Executor(client.start_shift("practice", seed=1), Hotel.load(), RobotState())
    assert not ex.loadout_on() and not ex.restock()


# --- a whole stretch of night ----------------------------------------------------------------------

NIGHT = [
    ("22:03:30", "R-001", "104 wants a towel."),
    ("22:12:00", "R-002", "205 wants a water bottle."),
    ("22:20:00", "R-003", "Bring the tray from the kitchen pass to 319."),
    ("22:22:00", "R-004", "319 wants a pillow."),
    ("22:32:00", "R-005", "106 wants two water bottles."),
    ("22:40:00", "R-006", "Bring the tray from the kitchen pass to 104."),
    ("22:42:00", "R-007", "212 wants a toiletry kit."),
    ("22:50:00", "R-008", "Take the bags at the desk up to 206. The room is empty, the guest checks in later."),
    ("23:00:00", "R-009", "320 wants a phone charger."),
]


def test_loadout_night_serves_everything_and_trays_and_bags_still_fit(tmp_path):
    fake = FakeWybe(requests=NIGHT)
    client = WybeClient(settings(tmp_path), transport=httpx.MockTransport(fake.handler),
                        sleep=lambda s: None)
    result = run_shift(client, seed=1, sim_end="23:40:00", params=Params())
    assert fake.reports == {rid: "done" for _, rid, _ in NIGHT}, fake.reports
    assert result["requests_served"] == len(NIGHT)
    assert not fake.false_done and not fake.unsafe
    assert not [e for e in fake.log if "cart is full" in str(e.get("result")).lower()]
