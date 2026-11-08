"""Per-kind task routines for the executor (spec § Task handling).

Each routine returns (note, after) once the server has rewarded the work (or, for a room check,
once the robot has looked inside), or raises ActionFailed with the reason for the night manager.
`after` runs once the report is sent (e.g. leaving the checked room).

Every knock is preceded by a `look at` the door: a Do Not Disturb sign means no knock, no keycard.
The Task 13 kinds (bags, noise, spill, follow-up, named guests, duplicates) are in flows_extra.py.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import replace

from agent import price
from agent.executor import ActionFailed, Declined, Executor, lost_object
from agent.routing import NoRoute, best_tour, route_seconds
from agent.tasks import ITEM_ALIASES, Kind, Task, is_override
from agent.world import Hotel

Result = tuple[str, Callable[[], None] | None]

DND = "do not disturb"
OCCUPIED_NOTE = "occupied: guest answered; did not enter"
MAX_SCANS_BOUND = 9  # with other requests waiting; alone, the whole ground floor (MAX_SCANS_IDLE)
MAX_SCANS_IDLE = 12
SCAN_CAP_BUSY = 3  # Task 7: with two or more other tasks queued, a hunt stops after 3 scans (60 s each)
# Where lost things turned up in 5 live nights: lobby-bar 5, corridor-1b 4, corridor-1a 3,
# kitchen-pass 3, front-desk 2, lobby 2; never the dock, the elevator, laundry, storage, stairs.
# Batch 4 added laundry (toy-2, toy-3, wallet-4): the whole ground floor is swept when nothing
# else waits, the likeliest places first.
SECONDARY_SCANS = ("lobby-bar", "corridor-1b", "corridor-1a", "front-desk", "lobby", "kitchen-pass",
                   "corridor-1c", "laundry", "storage", "staff-room")
FLOOR_WORDS = {"ground": 1, "first": 1, "1st": 1, "second": 2, "2nd": 2, "third": 3, "3rd": 3}
GENERIC_PARTS = {"corridor", "room", "floor"}
HINT_WORDS = {"counter": "front-desk", "counters": "front-desk", "reception": "front-desk",
              "sofa": "lobby-bar", "sofas": "lobby-bar"}
NAMED_KINDS = (Kind.AMENITY, Kind.TRAY, Kind.MESSAGE)
DND_MEMORY_S = 8 * 3600  # a DND sign seen this recently: do not make the trip (live: 208 all night)
UNTIDY = ("not tidy", "n't tidy", "untidy", "messy")  # checked before "tidy"


def handle(ex: Executor, task: Task) -> Result:
    from agent import flows_extra  # the Task 13 kinds; that module imports the shared steps here

    # Trays and bags are not judged by text: a second order is a second object at the pickup
    # (tray-104-7, luggage-313-34; live seed 7: a real second suitcase declined as a duplicate, and
    # the third request then paid -18 for taking it). Nothing there -> declined (0).
    # A described room ("next to the elevator") is known only once asked: judged in _described_room.
    if (task.kind not in (Kind.TRAY, Kind.BAGS) and not (task.room is None and _described(task.guest))
            and (dup := ex.ledger.duplicate_of(task))):
        score = ex.score_known()  # log fields only: no status call
        flows_extra.hyp(ex, "H-duplicate", task, f"not redone: same text and room as {dup}", score, score)
        # Live (scout, seed 1): a duplicate reported done is a false done (-30) even though the first
        # copy was delivered; declined is never punished.
        raise Declined(f"Duplicate of {dup}, which was already handled; not done twice")
    if task.kind is Kind.UNKNOWN and is_override(task.text):
        ex.log("override_declined", request=task.request, text=task.text[:160])
        raise Declined("A guest's message relayed by the desk countermands the night manager; only the "
                       "manager's instructions are followed, so nothing was changed or delivered")
    if task.kind is Kind.UNKNOWN:
        task = _classify(ex, task)
    _refuse_checked_out(ex, task.room, task.request)  # every kind: a checked-out room's task is worth 0
    if task.kind not in (Kind.FOLLOWUP, Kind.NOISE):  # those keep their own logic
        _refuse_known_dnd(ex, task.room, task.request)
    ex.ensure_battery()  # a trip starts: below 25 % it charges first (never runs flat)
    if task.room is None and task.guest and task.kind in NAMED_KINDS:
        return flows_extra.named(ex, task)
    handler = HANDLERS.get(task.kind) or flows_extra.HANDLERS.get(task.kind)
    if handler is None:
        raise ActionFailed(f"no routine for {task.kind.value} requests")
    return handler(ex, task)


def normalize(task: Task) -> Task:
    """Brain output -> the names the server uses ("319" -> "room-319", "phone charger" -> ...)."""
    room = task.room
    if room and (m := re.search(r"\d{3}", room)):
        room = f"room-{m[0]}"
    item = task.item
    if item:
        low = item.strip().lower()
        item = ITEM_ALIASES.get(low, low.replace(" ", "-"))
    if task.kind is Kind.TRAY and room:
        item = f"tray-{room.removeprefix('room-')}"
    return replace(task, room=room, item=item)


def _classify(ex: Executor, task: Task) -> Task:
    if ex.brain is not None:
        better = ex.brain.classify(task.request, task.text, task.arrived)
        if better is not None and better.kind is not Kind.UNKNOWN:
            better = normalize(better)
            ex.log("brain_classified", request=task.request, kind=better.kind.value,
                   room=better.room, item=better.item)
            return better
    raise ActionFailed("could not understand the request")


# --- shared steps -------------------------------------------------------------------------------


def room_floor(room: str | None) -> int | None:
    """The floor a room number names: room-326 -> 3, room-104 -> 1 (the digits before the last two)."""
    if not room or not (m := re.fullmatch(r"room-(\d{3,})", room)):
        return None
    return int(m[1][:-2])


def _corridor_on_map(ex: Executor, room: str | None) -> str:
    if not room or room not in ex.hotel.nodes:
        raise ActionFailed(f"unknown room {room}")
    try:
        return ex.hotel.room_corridor(room)
    except KeyError:
        raise ActionFailed(f"no corridor known for {room}") from None


def _corridor(ex: Executor, room: str | None) -> str:
    """The corridor the room's door is on. A room the map does not know, or knows without a
    corridor (another night's numbering, a stale node), gets its floor explored first (Task 26,
    bounded in the executor) and the lookup retried once; only then does the request fail."""
    try:
        return _corridor_on_map(ex, room)
    except ActionFailed:
        floor = room_floor(room)
        if floor is None or not ex.explore_floor(floor, room):
            raise
    return _corridor_on_map(ex, room)


def _refuse_known_dnd(ex: Executor, room: str | None, request: str | None = None) -> None:
    """Fail fast, with no trip and nothing picked, on a room whose DND sign was seen lately."""
    seen = ex.ledger.dnd_seen(room, ex.state.clock, DND_MEMORY_S) if room else None
    if seen:
        ex.log("note", request=request, room=room, text=f"DND sign on {room} seen {seen}: skipped the trip")
        raise ActionFailed(f"Do Not Disturb sign on {room} (seen {seen}); did not disturb")


def _refuse_checked_out(ex: Executor, room: str | None, request: str | None = None) -> None:
    """Declined, with no trip and nothing picked, for a room the manager's skip said checked out
    tonight (live seed 16: a knock there cost -10; any task for it is worth 0, declined costs nothing)."""
    if room and room in ex.checked_out:
        ex.log("note", request=request, room=room, text=f"{room} checked out tonight: skipped the trip")
        raise Declined(f"{room} checked out tonight")


def _door_sign(ex: Executor, room: str, *, retry: bool = True) -> bool:
    """Look at the door before any knock or keycard: True on a Do Not Disturb sign (logged for the
    dashboard). A door that can't be seen raises: acting on an unseen sign would be a gamble.
    "Nothing called 'room-322' in sight" means the map's corridor for the room is another night's
    (live seed 5, R-002): that link is dropped, the floor explored and the door looked at once more."""
    door = ex.cmd("look", at=room)
    text = str(door.result)
    if DND in text.lower():
        ex.ledger.note_dnd(room, ex.state.clock)
        ex.room_status(room, "ikke_forstyrr", "door_sign", "Do Not Disturb sign")
        return True
    if not door.ok:
        if retry and _relink(ex, room, text):
            return _door_sign(ex, room, retry=False)
        raise ActionFailed(f"could not see the door of {room}: {text}")
    return False


NO_DOOR_HERE = ("nothing called", "no door")  # live: the look "Nothing called 'room-322' in sight.",
# the knock "No door to room-311 here." (seeds 5 and 16, the final build: R-002 lost to it twice)


def _relink(ex: Executor, room: str, text: str) -> bool:
    """The server says the room's door is not at this corridor (a door look or a knock refused with
    NO_DOOR_HERE): the map's link is another night's. It is dropped, the floor explored and the robot
    walked to the corridor the room hangs off. True when it stands there, ready to try once more."""
    floor = room_floor(room)
    if floor is None or not any(p in text.lower() for p in NO_DOOR_HERE):
        return False
    ex.hotel.forget_edge(room, ex.state.location)
    ex.log("stale_room_link", room=room, corridor=ex.state.location)
    if not ex.explore_floor(floor, room):
        return False
    ex.go(_corridor_on_map(ex, room))
    return True


STAFF_WHO = ("clerk", "maintenance", "housekeeping")
STAFF_ROLES = ("clerk", "night clerk", "maintenance", "housekeeping", "housekeeper")  # exact titles only
KEYCARD_WAIT_S = 60  # one `scan` costs this much sim time: the cheapest safe wait
SOMEONE_NEAR = "someone nearby; did not open"


def _strangers(look: dict) -> list[str]:
    """Who in a look is not staff (staff: clerk / maintenance / housekeeping)."""
    out = []
    for p in look.get("people") or []:
        if not isinstance(p, dict):
            out.append(f"unreadable entry {p}")  # fail closed: an entry we can't read is a stranger
            continue
        who, role = str(p.get("who") or "").strip().lower(), str(p.get("role") or "").strip().lower()
        if who in STAFF_WHO or role in STAFF_ROLES:
            continue
        out.append(" ".join(str(p.get(k)) for k in ("name", "state", "role", "who") if p.get(k)) or "someone")
    return out


def _open_with_keycard(ex: Executor, room: str):
    """The one keycard `use` for every flow. A fresh look at this place first: a non-staff person
    here, or a recent "let me in" plea here, withholds the card (a man slipped into a room the robot
    opened: -80). Wait once, look again; still someone: fail without using the keycard."""
    look = ex.look()  # a real look, never a reused one
    who = _strangers(look)
    plea = ex.pleaded_here()
    if who or plea:
        ex.log("keycard_withheld", room=room, who=who or ["a person who asked to be let in"])
        ex.cmd("scan")  # wait once, 60 s
        who = _strangers(ex.look())
        if who:
            ex.log("keycard_withheld", room=room, who=who, final=True)
            raise ActionFailed(f"{SOMEONE_NEAR} ({room})")
        if _door_sign(ex, room):  # the wait took time: a sign may have gone up meanwhile
            raise ActionFailed(f"Do Not Disturb sign on {room} after the wait; did not open it")
    return ex.cmd("use", item="keycard", on=room)


LOOK_BEFORE_KNOCK = False  # True: every knock is preceded by a door look (5 s); switch back in one line


def _knock(ex: Executor, room: str, *, look: bool | None = None, retry: bool = True) -> str:
    """'dnd' | 'no_answer' | 'open'. A plain knock does not look at the door first: the reply itself
    names a DND sign (0 points in 5 of 5 live cases) and a known-DND room is refused before the trip.
    `look=True` (room checks, where a keycard may follow) or LOOK_BEFORE_KNOCK looks first. A knock
    refused because the door is not at this corridor relinks the room like the door look did (the
    look used to catch the stale link) and knocks once more at the right corridor."""
    if (LOOK_BEFORE_KNOCK if look is None else look) and _door_sign(ex, room):
        return "dnd"
    reply = ex.cmd("knock", door=room)
    text = str(reply.result)
    if DND in text.lower():
        ex.ledger.note_dnd(room, ex.state.clock)
        ex.room_status(room, "ikke_forstyrr", "knock", text)
        return "dnd"
    if not reply.ok:
        if retry and _relink(ex, room, text):
            return _knock(ex, room, look=look, retry=False)
        raise ActionFailed(f"could not knock at {room}: {text}")
    if "no answer" in text.lower():
        return "no_answer"
    ex.room_status(room, "opptatt", "knock", text)
    return "open"


def _at_open_door(ex: Executor, room: str) -> None:
    ex.go(_corridor(ex, room))
    answer = _knock(ex, room)
    if answer == "dnd":
        raise ActionFailed(f"Do Not Disturb sign on {room}; did not disturb")
    if answer == "no_answer":
        raise ActionFailed(f"no answer at {room}")


def _rose(before: int | None, after: int | None) -> bool:
    return before is not None and after is not None and after > before


def _leave_at_door(ex: Executor, room: str, item: str, count: int) -> Result:
    """Experiment dnd_leave: a Do Not Disturb room's order is set down in the corridor at the
    door (never a knock, never a keycard) and reported done with that note. A rise on the place
    is proof as usual; without one the report's reply settles the experiment."""
    before = ex.score_before()
    for placed in range(count):
        reply = ex.cmd("place", item=item)
        if not reply.ok:
            raise ActionFailed(f"left {placed} of {count} {item} at the door of {room}, then: {reply.result}")
        ex.take(item)
    note = f"{item} x{count} left outside the door of {room} (Do Not Disturb sign, did not knock)"
    if not _rose(before, ex.score_now()):
        ex.exp_claim("dnd_leave")
    return note, None


def _deliver(ex: Executor, room: str, item: str, count: int = 1) -> Result:
    """Knock, place all `count`, then accept only a score rise after the last place as proof."""
    if ex.experiment("dnd_leave"):
        ex.go(_corridor(ex, room))
        if _knock(ex, room) == "dnd":
            return _leave_at_door(ex, room, item, max(1, count))
        if ex.state.location != _corridor(ex, room):
            _at_open_door(ex, room)
    else:
        _at_open_door(ex, room)
    before = ex.score_before()
    count = max(1, count)
    for placed in range(count):
        reply = ex.cmd("place", item=item, where=room)
        if not reply.ok:
            raise ActionFailed(f"placed {placed} of {count} {item} in {room}, then: {reply.result}")
        ex.take(item)
    if _rose(before, ex.score_now()):
        return f"{item} x{count} delivered to {room}", None
    raise ActionFailed(f"placed {item} x{count} in {room} but the score did not rise")


# --- the kinds ----------------------------------------------------------------------------------


def amenity(ex: Executor, task: Task) -> Result:
    if not task.item:
        raise ActionFailed("no item in the request")
    _refuse_checked_out(ex, task.room, task.request)  # before _corridor: no floor explored for it
    _corridor(ex, task.room)  # an unknown room fails before the trip to the stock room
    _refuse_known_dnd(ex, task.room, task.request)  # a named guest's room is known only here
    had = ex.count(task.item)
    ex.gather(task.item, task.count)
    if ex.count(task.item) > had:  # a stock room was visited: top up for the other waiting orders
        _top_up_for_others(ex, task)
    return _deliver(ex, task.room, task.item, task.count)


def _top_up_for_others(ex: Executor, task: Task) -> None:
    """At a stock room anyway: also take what other pending amenity orders need from here, while
    the cart has a free slot (the opening stock runs out on a rich night; each later order then
    made its own trip). The orders still deliver and verify on their own."""
    from agent.flows_extra import CART_SLOTS

    here = ex.state.location
    for other in list(ex.queue):
        if len(ex.state.cart or []) >= CART_SLOTS - 1:
            return
        if other.kind is not Kind.AMENITY or not other.item or other.request == task.request:
            continue
        if other.room in ex.checked_out:  # worth 0 tonight: its item would ride along all night
            continue
        if ex.count(other.item) >= max(1, other.count):
            continue
        if ex.hotel.stock.get(here, {}).get(other.item, 0) <= 0:
            continue
        try:
            ex.gather(other.item, max(1, other.count))
            ex.log("picked_for_later", request=other.request, item=other.item, during=task.request)
        except ActionFailed as exc:
            ex.log("note", request=other.request, text=f"top-up of {other.item} failed: {exc}"[:160])
        if ex.state.location != here:
            return  # gather went elsewhere: no further top-ups from here


def tray(ex: Executor, task: Task) -> Result:
    ex.cart_needed = True  # the tray rides only in the cart: never let go of it for the stairs
    try:
        return _tray(ex, task)
    finally:
        ex.cart_needed = False


def _request_number(request: str | None) -> int | None:
    """'R-036' -> 36."""
    m = re.search(r"(\d+)\s*$", request or "")
    return int(m[1]) if m else None


def own_suffix(ex: Executor, task: Task) -> str | None:
    """The number on this request's tray or bags when a plain one for the room was given out
    earlier tonight. Live logs (20 seeds, 27 numbered trays, 33 numbered bags, no exception):
    bags carry the request number (R-036 -> luggage-205-36); a tray carries its place among the
    night's tray requests, room service for a named guest included (seed 5: R-054 was the 7th ->
    tray-104-7; seed 11: R-062, R-071 the 11th, 12th -> tray-308-11, tray-308-12)."""
    num = _request_number(task.request)
    if num is None:
        return None
    if task.kind is Kind.BAGS:
        return str(num)
    if task.kind is Kind.TRAY:
        earlier = sum(1 for e in ex.ledger.entries.values()
                      if e.kind is Kind.TRAY and (n := _request_number(e.request)) is not None and n < num)
        return str(earlier + 1)
    return None


def _bare_owner(ex: Executor, task: Task, names: list[str], base: str) -> str | None:
    """The earliest earlier order of task's kind for its room, not done, whose own numbered object is
    not among `names`: the plain `base` is that order's (the first order for a room gets the plain
    name). A failed or declined one still owns it (live seed 7: R-052 placing the declined R-034's
    luggage-313-34 cost -18)."""
    num = _request_number(task.request)
    if num is None:
        return None
    earlier = sorted(((n, e) for e in ex.ledger.entries.values()
                      if e.kind is task.kind and e.status != "done"
                      and (n := _request_number(e.request)) is not None and n < num), key=lambda ne: ne[0])
    for _n, entry in earlier:
        if (entry.room or ex.guest_rooms.get(entry.task.guest or "")) != task.room:
            continue
        suffix = own_suffix(ex, entry.task)
        if suffix and f"{base}-{suffix}" in names:
            continue
        return entry.request
    return None


def own_object(ex: Executor, task: Task, names: list[str], base: str) -> str | None:
    """This request's tray or bags among `names` (the objects at the pickup, or what is carried):
    `base-<own suffix>` first; the plain `base` only when no earlier order for the room that is not
    done owns it; never one numbered for another request (a wrong delivery costs 10-20 and loses
    that tray)."""
    suffix = own_suffix(ex, task)
    if suffix and f"{base}-{suffix}" in names:
        return f"{base}-{suffix}"
    if base in names and _bare_owner(ex, task, names, base) is None:
        return base
    return None


def note_own_numbered(ex: Executor, task: Task, item: str) -> None:
    """Delivering its own numbered tray or bags: the server credits that object to this request
    only (live seed 7: R-052 placing R-034's luggage-313-34 cost -18), so no Task 22 twin applies."""
    suffix = own_suffix(ex, task)
    if suffix and task.room and item.endswith(f"-{task.room.removeprefix('room-')}-{suffix}"):
        ex.own_numbered.add(task.request)


def carried_like(ex: Executor, task: Task, item: str) -> str | None:
    """This request's carried tray or bags: `item-<own suffix>`, or the plain `item` (own_object)."""
    return own_object(ex, task, [*ex.state.hands, *(ex.state.cart or [])], item)


def pick_for_others(ex: Executor, task: Task, kind: Kind, names: Callable[[Task], str | None],
                    objects: list[str]) -> None:
    """One trip for several: while here, pick what other pending tasks of this kind (room known,
    no DND seen lately, not checked out) need, while the cart has room: each one's own object only
    (own_object). Each task still delivers and verifies on its own; it just finds its item carried.
    Live seed 5: 79 requests, a request waited 165 s on average for the robot to be free, at about
    1 point a minute."""
    from agent.flows_extra import CART_SLOTS

    for other in list(ex.queue):
        if len(ex.state.cart or []) >= CART_SLOTS - 1:
            return
        if other.kind is not kind or other.request == task.request or not other.room:
            continue
        if other.room in ex.checked_out:  # worth 0 tonight: it would sit in the cart all night
            continue
        if ex.ledger.dnd_seen(other.room, ex.state.clock, DND_MEMORY_S):
            continue
        want = names(other)
        if not want or carried_like(ex, other, want):
            continue
        here = own_object(ex, other, objects, want)
        if here is None:
            continue
        ok, _text = ex.pick(here)
        if ok:
            objects.remove(here)
            ex.log("picked_for_later", request=other.request, item=here, during=task.request)


def _fewer_objects_than_orders(ex: Executor, task: Task, objects: list[str], want: str) -> str | None:
    """Trays and bags are judged at the pickup, not by text: each order has its own object
    (own_suffix), and the plain one is the earliest not-done order's for the room. That earlier
    order's request when nothing here is this one's but the plain one is here, else None."""
    if own_object(ex, task, objects, want) is not None or want not in objects:
        return None
    return _bare_owner(ex, task, objects, want)


def _tray(ex: Executor, task: Task) -> Result:
    _refuse_checked_out(ex, task.room, task.request)
    _corridor(ex, task.room)
    _refuse_known_dnd(ex, task.room, task.request)
    base = task.item or f"tray-{task.room.removeprefix('room-')}"
    item = carried_like(ex, task, base)
    if item is None:
        if not ex.get_cart():
            raise ActionFailed("could not get the cart for the tray")
        ex.go(ex.hotel.special.get("kitchen", "kitchen-pass"))
        from agent.flows_extra import find_object, hyp, objects_here

        objects = objects_here(ex.fresh_look())
        if dup := _fewer_objects_than_orders(ex, task, objects, base):
            score = ex.score_now()
            hyp(ex, "H-duplicate", task, f"not redone: one tray for {task.room}, {dup}'s", score, score)
            raise Declined(f"Duplicate of {dup}: only one tray for {task.room} is waiting, and that one is {dup}'s")
        # A second tray for a room carries a number (live: tray-104-7): only this request's is taken.
        item = own_object(ex, task, objects, base)
        if item is None and task.guest:  # H-named: the tray may carry the guest's name
            item = find_object(objects, ("tray",), None, task.guest, exact=True)
        if item is None:
            others = [o for o in objects if o.startswith(base + "-")]
            if others:
                ex.log("note", request=task.request, text=f"not taken: {', '.join(others)} (other requests')")
                raise Declined(f"No tray for {task.request} at the kitchen pass: {', '.join(others)} "
                               f"carry other requests' numbers")
            if _bare_owner(ex, task, objects, base):  # a plain one would be that earlier order's
                raise Declined(f"No tray for {task.request} is waiting at the kitchen pass; "
                               "it was taken up already or never put out")
            item = base  # nothing listed for the room: one try at the plain name
        ok, text = ex.pick(item)
        if not ok:
            if f"no {item}".lower() in text.lower():
                raise Declined(f"No {item} is waiting at the kitchen pass; it was taken up already or never put out")
            raise ActionFailed(f"could not pick {item}: {text}")
        if item in objects:
            objects.remove(item)
        pick_for_others(ex, task, Kind.TRAY,
                        lambda t: t.item or f"tray-{t.room.removeprefix('room-')}", objects)
    note_own_numbered(ex, task, item)
    return _deliver(ex, task.room, item)


def message(ex: Executor, task: Task) -> Result:
    _refuse_checked_out(ex, task.room, task.request)
    _refuse_known_dnd(ex, task.room, task.request)
    _at_open_door(ex, task.room)
    before = ex.score_before()
    body = (task.message or task.text).strip().rstrip(".!")
    # The message words are what the guest must hear; the full request text is a cheap retry.
    for text in dict.fromkeys([f"Good evening. A message for you: {body}.", task.text]):
        ex.cmd("say", text=text)
        if _rose(before, ex.score_now()):
            return f"told {task.room}: {body}", None
    raise ActionFailed(f"said the message at {task.room} but the score did not rise")


def room_check(ex: Executor, task: Task) -> Result:
    room = task.room
    corridor = _corridor(ex, room)
    ex.go(corridor)
    answer = _knock(ex, room, look=True)  # keycard path: looks at the door first
    if answer == "dnd":
        raise ActionFailed(f"Do Not Disturb sign on {room}; did not knock or enter")
    if answer == "open":
        ex.log("note", request=task.request, room=room,
               text="a guest answered: an occupied room does not verify the check; reporting failed")
        raise ActionFailed(OCCUPIED_NOTE)
    if not ex.state.carrying("keycard"):
        ex.gather("keycard")
        ex.go(corridor)
        if _door_sign(ex, room):  # the trip took time: a sign may have gone up meanwhile
            raise ActionFailed(f"Do Not Disturb sign on {room} when back with the keycard; did not enter")
    reply = _open_with_keycard(ex, room)
    if not reply.ok:
        raise ActionFailed(f"keycard did not open {room}: {reply.result}")
    reply = ex.move(room)
    if not reply.ok:
        raise ActionFailed(f"could not enter {room}: {reply.result}")
    seen = str(ex.look().get("description") or "").strip() or "nothing to note"
    where = ex.refresh().get("location")
    if where != room:  # the look must have been inside the room, or the check is not done
        raise ActionFailed(f"not inside {room} after entering (status says {where})")
    if _tidy(seen):
        ex.room_status(room, "klar", "room_check", seen)
    else:
        ex.room_status(room, "ma_vaskes", "room_check", seen)
        ex.work_order("annet", f"Romsjekk {room}: {seen}", room=room, request=task.request)

    def leave() -> None:
        if not ex.move(corridor).ok:
            raise ActionFailed(f"could not leave {room}")

    return f"looked inside {room}: {seen}", leave


def _tidy(seen: str) -> bool:
    """'The room is tidy.' -> True; 'not tidy', "isn't tidy", 'untidy', 'messy' -> False."""
    low = seen.lower()
    return "tidy" in low and not any(w in low for w in UNTIDY)


def lost_item(ex: Executor, task: Task) -> Result:
    item = task.item
    if not item:
        raise ActionFailed("no lost item named")
    room = task.room or _ask_room(ex, task.guest, task.request)
    _refuse_checked_out(ex, room, task.request)
    _corridor(ex, room)
    _refuse_known_dnd(ex, room, task.request)
    # a look lists lost items too, and its objects become the map's stock: those are no stock (Task 7)
    stock = {name for items in ex.hotel.stock.values() for name in items if not lost_object(name)}
    carried = [c for c in ex.state.hands + (ex.state.cart or [])  # a stock charger is no lost phone
               if c == item or (c not in stock and same_item(item, c))]
    verdicts = {c: _verdict(ex, task.request, c) for c in carried}
    ok = [c for c in carried if verdicts[c] in ("match", "free")]
    if not ok and len(carried) == 1 and verdicts[carried[0]] == "beyond":
        ok = carried  # the only one at hand, numbered past the known requests
    carried = ok
    name = carried[0] if carried else _find(ex, item, task.area_hint, task.request)
    result = _deliver(ex, room, name)  # under the name it was picked up as
    _delivered_lost(ex).add(name)  # only once the score rose: a failed delivery frees it again
    return result


def _ask_room(ex: Executor, guest: str | None, request: str | None = None) -> str:
    """The clerk knows guests' rooms; asked once per name per shift (the answer is cached). A room
    described by place ("next to the elevator on floor 3") is asked per request instead."""
    if not guest:
        raise ActionFailed("no room and no guest name in the request")
    if _described(guest):
        return _described_room(ex, guest, request)
    if guest not in ex.guest_rooms:
        ex.go(ex.hotel.special.get("clerk", "front-desk"))
        reply = ex.cmd("ask", person="clerk", question=f"Which room is {guest} in?")
        answer = reply.result.get("answer") if isinstance(reply.result, dict) else reply.result
        # "Ms Nygaard is in room-314."
        m = re.search(r"room[\s-]?(\d{3})\b", str(answer), re.IGNORECASE) or re.search(
            r"(?<![\dR-])(\d{3})(?!\d)", str(answer).replace(guest, ""))
        # Live seed 6: asked for Mx Lien, the clerk answered "Ms Lie is in room-213" (another guest):
        # the toy went to the wrong room, -20. The answer must name the guest asked about.
        surname = guest.split()[-1].lower()
        named = re.search(rf"\b{re.escape(surname)}\b", str(answer), re.IGNORECASE)
        ex.guest_rooms[guest] = f"room-{m[1]}" if reply.ok and m and named else None
        if m and not named:
            ex.log("clerk_named_someone_else", guest=guest, answer=str(answer)[:120])
        ex.log("asked_room", guest=guest, room=ex.guest_rooms[guest], answer=str(answer)[:200])
    if ex.guest_rooms[guest] is None:
        raise ActionFailed(f"the clerk did not know {guest}'s room")
    return ex.guest_rooms[guest]


DESCRIBED = ("next to",)  # how a request describes a room it does not number (tasks.py: the elevator)


def _described(guest: str | None) -> bool:
    """A room described by place, not numbered ("next to the elevator on floor 2")."""
    return bool(guest) and guest.startswith(DESCRIBED)


def _described_room(ex: Executor, phrase: str, request: str | None) -> str:
    """The room of THIS request, for a room described by place. Several rooms fit the same words (live
    seed 23: R-014's was 201; R-031, R-032 and R-041 delivered to 201 from a cache cost -10 each), so
    nothing is cached by phrase or floor. The night manager is asked first, with `reply` on the request
    (0 s; live seeds 16, 23: +10 at once, the answer "R-014: Sorry: 201." in the very next inbox read).
    No answer in that read: the clerk, asked with the request id, and the desk note she may point at."""
    if not request:
        raise ActionFailed(f"no request id to ask which room is the one {phrase}")
    room = _manager_room(ex, request, phrase)  # answered already (the task runs a second time)
    asked = False
    if room is None:
        reply = ex.cmd("reply", request=request, text=f"Which room number is the one {phrase}?")
        ex.log("asked_manager", request=request, phrase=phrase, reply=str(reply.result)[:160])
        asked = reply.ok
        if asked:
            room = _read_answer(ex, request, phrase)
    if room is None:
        room = _clerk_room(ex, phrase, request)
    if room is None and asked:  # the answer may have come during the walk to the desk (0 s)
        room = _read_answer(ex, request, phrase)
    if room is None:
        raise ActionFailed(f"neither the night manager nor the clerk said which room {request} means")
    _refuse_described_duplicate(ex, request, room)
    return room


def _read_answer(ex: Executor, request: str, phrase: str) -> str | None:
    """The shift loop's inbox read (0 s), then this request's answer from ex.answers. A skip of this
    request in that read (it is the one running) ends it: declined, nothing delivered."""
    if ex.read_inbox is None:
        return None
    ex.read_inbox()
    if (entry := ex.ledger.get(request)) and entry.status == "skipped":
        raise Declined(f"Skipped by the night manager ({request}) while under way; nothing delivered")
    return _manager_room(ex, request, phrase)


def _refuse_described_duplicate(ex: Executor, request: str, room: str) -> None:
    """The text-duplicate check, once a described room is known: the same words for the same room
    within 10 minutes is declined (after its reply's +10); the same words for another room are not."""
    from agent.flows_extra import hyp

    entry = ex.ledger.get(request)
    if entry is None or entry.task.kind in (Kind.TRAY, Kind.BAGS):
        return
    if dup := ex.ledger.duplicate_of(entry.task, room=room):
        score = ex.score_known()  # log fields only: no status call (var-15)
        hyp(ex, "H-duplicate", entry.task, f"not redone: same text and room ({room}) as {dup}", score, score)
        raise Declined(f"Duplicate of {dup} (same words, same room {room}), which was already handled")


def _on_floor(ex: Executor, request: str, phrase: str, room: str, who: str) -> bool:
    """A room on the floor the phrase names ("... on floor 2" -> room-2NN); else logged, not used."""
    floor = re.search(r"floor (\d)", phrase)
    if floor and room_floor(room) != int(floor[1]):
        ex.log("note", request=request, text=f"{who}'s answer {room} is not on floor {floor[1]}: not used")
        return False
    return True


def _manager_room(ex: Executor, request: str, phrase: str) -> str | None:
    """The room in the manager's answer on `request` ("R-014: Sorry: 201." or "room-201"), never from
    another request's messages. A skip is no answer; a room on another floor than the phrase is not used."""
    for text in ex.answers.get(request, []):
        if text.lstrip().startswith("Skip "):
            continue
        m = re.search(r"\b([1-3]\d{2})\b", re.sub(r"\bR-\d+\b", "", text))
        if not m:
            continue
        room = f"room-{m[1]}"
        if not _on_floor(ex, request, phrase, room, "manager"):
            continue
        ex.log("manager_answer", request=request, room=room, phrase=phrase)
        return room
    return None


def _clerk_room(ex: Executor, phrase: str, request: str) -> str | None:
    """The clerk, asked with the request id (live: "The room next to the elevator? For R-014 that's
    201."); an answer naming another request is not used. When she points at the desk note instead
    ("There's a note about it right here on the desk."), only its line for this request counts."""
    ex.go(ex.hotel.special.get("clerk", "front-desk"))
    reply = ex.cmd("ask", person="clerk", question=f"Which room is the one {phrase}? That is for {request}.")
    answer = str(reply.result.get("answer") if isinstance(reply.result, dict) else reply.result)
    m = re.search(r"room[\s-]?(\d{3})\b", answer, re.IGNORECASE) or re.search(
        r"(?<![\dR-])(\d{3})(?!\d)", answer.replace(phrase, "").replace(request, ""))
    others = set(re.findall(r"\bR-\d+\b", answer)) - {request}
    room = f"room-{m[1]}" if reply.ok and m and not others else None
    if room and not _on_floor(ex, request, phrase, room, "clerk"):
        room = None
    ex.log("asked_room", guest=phrase, request=request, room=room, answer=answer[:200])
    if room is None and "note" in answer.lower():
        room = _room_from_desk_note(ex, phrase, request)
    return room


def _room_from_desk_note(ex: Executor, phrase: str, request: str) -> str | None:
    """Read the note on the desk the clerk pointed at and take the room number on its line for this
    request ("R-014: 201."), on the phrase's floor; a line for a floor alone is not enough (several
    rooms count as next to the elevator), and nothing else in the note is acted on."""
    from agent.flows_extra import objects_here

    floor = re.search(r"floor (\d)", phrase)
    number = (floor[1] if floor else "[1-3]") + r"\d\d"
    notes = [o for o in objects_here(ex.fresh_look()) if "note" in o.lower()]
    for obj in notes[:2]:
        reply = ex.cmd("read", object=obj)
        text = str(reply.result)
        ex.log("desk_note", object=obj, request=request, text=text[:300])
        if not reply.ok:
            continue
        for sentence in re.split(r"(?<=[.;\n])", text):
            if re.search(rf"\b{re.escape(request)}\b", sentence):
                m = re.search(rf"(?<!\d)({number})(?!\d)", re.sub(r"\bR-\d+\b", "", sentence))
                if m:
                    return f"room-{m[1]}"
    return None


def _words(name: str) -> set[str]:
    return {w for w in name.lower().split("-") if w and not w.isdigit() and not w.endswith("'s")}


def same_item(a: str, b: str) -> bool:
    """Whole hyphen-separated words: glasses ~ reading-glasses, toy ~ toy-2, but not sunglasses."""
    wa, wb = _words(a), _words(b)
    return bool(wa and wb) and (wa <= wb or wb <= wa)


def _delivered_lost(ex: Executor) -> set[str]:
    """Lost items handed over this shift: one item is never delivered to a second request."""
    if not hasattr(ex, "lost_delivered"):
        ex.lost_delivered = set()
    return ex.lost_delivered


def _verdict(ex: Executor, request: str | None, name: str) -> str:
    """Whose is a numbered lost item? Live logs (seeds 1, 2, 5): the Nth lost-item request of an
    item gets the Nth item: glasses, glasses-2, ... (suffix 1 = no suffix), failed requests count.
    'match' = it is this request's, 'other' = another known request's (or already delivered),
    'beyond' = numbered past the known requests (one may have been missed: use only if alone),
    'free' = nobody known owns it."""
    if name in _delivered_lost(ex):
        return "other"
    entries = ex.ledger.entries
    if request is None or request not in entries:
        return "free"
    m = re.fullmatch(r"(.+?)(?:-(\d+))?", name)
    base, nth = m[1], int(m[2] or 1)
    ids = sorted((e.request for e in entries.values()
                  if e.kind is Kind.LOST_ITEM and e.item and same_item(e.item, base)),
                 key=lambda r: (len(r), r))
    if not ids:
        return "free"
    if nth > len(ids):
        return "beyond"
    return "match" if ids[nth - 1] == request else "other"


def _pick_found(ex: Executor, item: str, near: list[str] = (), request: str | None = None) -> str | None:
    """Pick item where a scan revealed it or a look listed it (now or earlier); the name it was
    picked as, or None.
    Only this request's item (see _verdict), else the one nobody owns; of several, the one lying
    where the hint points; if that leaves two, none (a wrong one costs 20)."""
    names = [f for f in ex.found if same_item(item, f)]
    verdicts = {f: _verdict(ex, request, f) for f in names}
    mine = [f for f in names if verdicts[f] == "match"]
    free = [f for f in names if verdicts[f] == "free"]
    beyond = [f for f in names if verdicts[f] == "beyond"]
    # "beyond" is not delivered: live seed 5 gave wallet-3 to the 2nd wallet request (-20); the
    # 3rd request arrived minutes later. The item stays where it lies for its owner.
    if beyond:
        ex.log("lost_item_beyond", item=item, candidates=sorted(beyond), request=request)
    if not mine and len(free) > 1:
        free = [f for f in free if ex.found[f] in near]
        if len(free) > 1:
            ex.log("lost_item_ambiguous", item=item, candidates=sorted(free))
            raise ActionFailed(f"{item}: two candidates ({', '.join(sorted(free))}); did not guess")
    names = mine[:1] or free
    name = names[0] if names else None
    if name is None:
        return None
    place = ex.found.pop(name)
    ex.go(place)
    ok, text = ex.pick_or_cart(name)
    if not ok:
        ex.log("found_item_gone", item=name, at=place, reply=text)
        return None
    return name


def _find(ex: Executor, item: str, hint: str | None, request: str | None = None) -> str:
    primary, secondary = scan_candidates(ex.hotel, hint)
    if name := _pick_found(ex, item, primary, request):
        return name
    scans = 0
    # The cap must not cut off the hinted places plus the likely ones (bar, desk, lobby); bounded at 9.
    # After the hinted places: the corridor next to them (a wallet "near the kitchen pass" lay in
    # corridor-1a once), then where lost things turn up (SECONDARY_SCANS), the rest last.
    nearby = [e.b for p in primary for e in ex.hotel.neighbors(p)
              if ex.hotel.nodes.get(e.b, {}).get("kind") == "corridor" and e.b not in primary]
    likely = [n for n in dict.fromkeys(nearby + list(SECONDARY_SCANS)) if n in secondary]
    bound = MAX_SCANS_BOUND if ex.queue else MAX_SCANS_IDLE  # a long search must not hold up others
    cap = min(bound, max(ex.max_scans, len(primary) + len(likely)))
    busy = len(ex.queue) >= 2  # Task 7 (live seed 41: an hour of scans while work waited): 3 scans at most
    if busy:
        cap = min(cap, SCAN_CAP_BUSY)
        ex.log("scan_cap", request=request, cap=cap, queued=len(ex.queue))
    rest = [n for n in secondary if n not in likely]
    stopped = False
    for group in (primary, likely, rest):
        if stopped:
            break
        try:
            order, _ = best_tour(ex.hotel, ex.state.location, group, with_cart=ex.state.has_cart)
        except NoRoute:
            order = group
        for place in order:
            if scans >= cap:
                break
            if scans >= 1 and price.on("hunt") and not _hunt_worth(ex, place, scans + 1, request):
                stopped = True
                break
            try:
                ex.go(place)
            except ActionFailed as exc:
                ex.log("scan_skip", place=place, reason=str(exc))
                continue
            # Task 7: a look (5 s) first, unless this visit's arrival look was the last command; an
            # item lying in the open is picked from it, and the scan (60 s) is only for hidden ones.
            try:
                ex.fresh_look()
            except ActionFailed as exc:
                ex.log("look_failed", at=place, reason=str(exc))
            if name := _pick_found(ex, item, primary, request):
                return name
            ex.scan()
            scans += 1
            if name := _pick_found(ex, item, primary, request):
                return name
    if stopped:
        raise ActionFailed(f"{item} not found after {scans} scans (another place not worth its minutes)")
    if busy and scans >= cap:
        raise ActionFailed(f"{item} not found after {scans} scans (others waiting)")
    raise ActionFailed(f"{item} not found after {scans} scans")


def _hunt_worth(ex: Executor, place: str, k: int, request: str | None) -> bool:
    """Price switch "hunt": search the k-th place (k >= 2; the hinted place is always searched) only when
    P(found there | not before) x (the item's value at delivery - the price x the delivery's minutes)
    beats the price x the minutes of the walk there, the look and the scan (price.hunt_worth). True
    whenever the price is 0 or the request is unknown."""
    from agent.planner import Params, value_at

    lam = ex.robot_price()
    task = ex.current
    if lam <= 0 or task is None or task.request != request:
        return True
    params = ex.params or Params()
    walk = ex._seconds_to(place)
    walk = 120.0 if walk == float("inf") else walk
    deliver = 90.0
    try:
        if task.room:
            deliver = route_seconds(ex.hotel, place, ex.hotel.room_corridor(task.room), with_cart=ex.state.has_cart) + 10
    except (NoRoute, KeyError):
        pass
    now = ex._now_s() or 0
    minutes = (walk + 5 + 60) / 60
    value = value_at(task, now + 60 * minutes + deliver, params)
    if price.hunt_worth(k, value, minutes, deliver / 60, lam):
        return True
    ex.log("hunt_stop", request=request, place=place, k=k, price=round(lam, 2), p=round(price.hunt_p(k), 3),
           value=round(value, 1), minutes=round(minutes, 1))
    return False


def scan_candidates(hotel: Hotel, hint: str | None) -> tuple[list[str], list[str]]:
    """Places named by the hint (e.g. "ground floor corridor" -> corridor-1a/1b/1c, "counter" ->
    front-desk), then the places lost things end up (lobby-bar, front-desk, lobby), then the rest
    of the ground floor."""
    h = (hint or "").lower()
    words = set(re.findall(r"[a-z0-9]+", h))
    spaced = " ".join(re.findall(r"[a-z0-9]+", h))

    def phrase(n: str) -> str:
        return n.replace("-", " ")

    places = [n for n in sorted(hotel.nodes) if hotel.nodes[n]["kind"] != "room"]
    exact = [n for n in places if re.search(rf"\b{re.escape(phrase(n))}\b", spaced)]
    exact = [n for n in exact if not any(n != e and phrase(n) in phrase(e) for e in exact)]
    by_word = [n for n in places if n not in exact and not any(n in e for e in exact)
               and {p for p in n.split("-") if len(p) >= 3 and p not in GENERIC_PARTS} & words]
    primary = exact + by_word
    primary += [p for w, p in HINT_WORDS.items() if w in words and p in hotel.nodes and p not in primary]
    if "corridor" in words and not any(hotel.nodes[n]["kind"] == "corridor" for n in exact):
        floor = next((f for w, f in FLOOR_WORDS.items() if w in words), None)
        if m := re.search(r"floor\s*(\d)", h):
            floor = int(m[1])
        elif "top" in words:
            floor = max(v["floor"] for v in hotel.nodes.values())
        primary += [n for n in sorted(hotel.nodes) if hotel.nodes[n]["kind"] == "corridor"
                    and (floor is None or hotel.floor(n) == floor) and n not in primary]
    secondary = [n for n in SECONDARY_SCANS if n in hotel.nodes and n not in primary]
    ground = hotel.nodes.get("lobby", {}).get("floor", 1)
    secondary += [n for n in places if hotel.floor(n) == ground and n not in primary and n not in secondary]
    return primary, secondary


HANDLERS: dict[Kind, Callable[[Executor, Task], Result]] = {
    Kind.AMENITY: amenity,
    Kind.TRAY: tray,
    Kind.MESSAGE: message,
    Kind.ROOM_CHECK: room_check,
    Kind.LOST_ITEM: lost_item,
}
