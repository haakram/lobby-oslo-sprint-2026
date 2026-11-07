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

from agent.executor import ActionFailed, Executor
from agent.routing import NoRoute, best_tour
from agent.tasks import ITEM_ALIASES, Kind, Task
from agent.world import Hotel

Result = tuple[str, Callable[[], None] | None]

DND = "do not disturb"
OCCUPIED_NOTE = "occupied: guest answered; did not enter"
MAX_SCANS_BOUND = 9  # with other requests waiting; alone, the whole ground floor (MAX_SCANS_IDLE)
MAX_SCANS_IDLE = 12
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

    if dup := ex.ledger.duplicate_of(task):
        score = ex.score_now()
        flows_extra.hyp(ex, "H-duplicate", task, f"not redone: same text and room as {dup}", score, score)
        raise ActionFailed(f"duplicate of {dup}")
    if task.kind is Kind.UNKNOWN:
        task = _classify(ex, task)
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
        floor = room_floor(room)
        if retry and "nothing called" in text.lower() and floor is not None:
            ex.hotel.forget_edge(room, ex.state.location)
            ex.log("stale_room_link", room=room, corridor=ex.state.location)
            if ex.explore_floor(floor, room):
                ex.go(_corridor_on_map(ex, room))
                return _door_sign(ex, room, retry=False)
        raise ActionFailed(f"could not see the door of {room}: {text}")
    return False


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


def _knock(ex: Executor, room: str) -> str:
    """'dnd' | 'no_answer' | 'open'. Looks at the door first: a DND door is never knocked on."""
    if _door_sign(ex, room):
        return "dnd"
    reply = ex.cmd("knock", door=room)
    text = str(reply.result)
    if DND in text.lower():
        ex.ledger.note_dnd(room, ex.state.clock)
        ex.room_status(room, "ikke_forstyrr", "knock", text)
        return "dnd"
    if not reply.ok:
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
    before = ex.score_now()
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
    before = ex.score_now()
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


def carried_like(ex: Executor, item: str) -> str | None:
    """The carried item named `item` or `item-<suffix>` (a second tray or bag for a room)."""
    for name in [*ex.state.hands, *(ex.state.cart or [])]:
        if name == item or name.startswith(item + "-"):
            return name
    return None


def pick_for_others(ex: Executor, task: Task, kind: Kind, names: Callable[[Task], str | None],
                    objects: list[str]) -> None:
    """One trip for several: while here, pick what other pending tasks of this kind (room known,
    no DND seen lately) need, while the cart has room. Each task still delivers and verifies on
    its own; it just finds its item carried. Live seed 5: 79 requests, a request waited 165 s on
    average for the robot to be free, at about 1 point a minute."""
    from agent.flows_extra import CART_SLOTS

    for other in list(ex.queue):
        if len(ex.state.cart or []) >= CART_SLOTS - 1:
            return
        if other.kind is not kind or other.request == task.request or not other.room:
            continue
        if ex.ledger.dnd_seen(other.room, ex.state.clock, DND_MEMORY_S):
            continue
        want = names(other)
        if not want or carried_like(ex, want):
            continue
        here = next((o for o in objects if o == want or o.startswith(want + "-")), None)
        if here is None:
            continue
        ok, _text = ex.pick(here)
        if ok:
            objects.remove(here)
            ex.log("picked_for_later", request=other.request, item=here, during=task.request)


def _tray(ex: Executor, task: Task) -> Result:
    _corridor(ex, task.room)
    _refuse_known_dnd(ex, task.room, task.request)
    item = task.item or f"tray-{task.room.removeprefix('room-')}"
    carried = carried_like(ex, item)
    if carried:
        item = carried
    else:
        if not ex.get_cart():
            raise ActionFailed("could not get the cart for the tray")
        ex.go(ex.hotel.special.get("kitchen", "kitchen-pass"))
        ok, text = ex.pick(item)
        from agent.flows_extra import find_object, objects_here

        objects = objects_here(ex.fresh_look())
        if not ok:
            # A second tray for the same room carries a suffix (live: tray-104-7, like luggage).
            alt = next((o for o in objects if o == item or o.startswith(item + "-")), None)
            if alt is None and task.guest:  # H-named: the tray may carry the guest's name
                alt = find_object(objects, ("tray",), task.room, task.guest, exact=True)
            if alt and alt != item:
                item = alt
                ok, text = ex.pick(item)
        if not ok:
            raise ActionFailed(f"could not pick {item}: {text}")
        if item in objects:
            objects.remove(item)
        pick_for_others(ex, task, Kind.TRAY,
                        lambda t: t.item or f"tray-{t.room.removeprefix('room-')}", objects)
    return _deliver(ex, task.room, item)


def message(ex: Executor, task: Task) -> Result:
    _refuse_known_dnd(ex, task.room, task.request)
    _at_open_door(ex, task.room)
    before = ex.score_now()
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
    answer = _knock(ex, room)  # looks at the door first
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
    room = task.room or _ask_room(ex, task.guest)
    _corridor(ex, room)
    _refuse_known_dnd(ex, room, task.request)
    stock = {name for items in ex.hotel.stock.values() for name in items}
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


def _ask_room(ex: Executor, guest: str | None) -> str:
    """The clerk knows guests' rooms; asked once per name per shift (the answer is cached)."""
    if not guest:
        raise ActionFailed("no room and no guest name in the request")
    if guest not in ex.guest_rooms:
        ex.go(ex.hotel.special.get("clerk", "front-desk"))
        question = f"Which room is {guest}?" if guest.startswith("next to") else f"Which room is {guest} in?"
        reply = ex.cmd("ask", person="clerk", question=question)
        answer = reply.result.get("answer") if isinstance(reply.result, dict) else reply.result
        m = re.search(r"room[\s-]?(\d{3})", str(answer), re.IGNORECASE)
        # Live seed 6: asked for Mx Lien, the clerk answered "Ms Lie is in room-213" (another guest):
        # the toy went to the wrong room, -20. The answer must name the guest asked about.
        surname = guest.split()[-1].lower() if not guest.startswith("next to") else None
        named = surname is None or re.search(rf"\b{re.escape(surname)}\b", str(answer), re.IGNORECASE)
        ex.guest_rooms[guest] = f"room-{m[1]}" if reply.ok and m and named else None
        if m and not named:
            ex.log("clerk_named_someone_else", guest=guest, answer=str(answer)[:120])
        ex.log("asked_room", guest=guest, room=ex.guest_rooms[guest], answer=str(answer)[:200])
    if ex.guest_rooms[guest] is None:
        raise ActionFailed(f"the clerk did not know {guest}'s room")
    return ex.guest_rooms[guest]


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
    """Pick item where a scan revealed it (now or earlier); the name it was picked as, or None.
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
    rest = [n for n in secondary if n not in likely]
    for group in (primary, likely, rest):
        try:
            order, _ = best_tour(ex.hotel, ex.state.location, group, with_cart=ex.state.has_cart)
        except NoRoute:
            order = group
        for place in order:
            if scans >= cap:
                break
            try:
                ex.go(place)
            except ActionFailed as exc:
                ex.log("scan_skip", place=place, reason=str(exc))
                continue
            ex.scan()
            scans += 1
            if name := _pick_found(ex, item, primary, request):
                return name
    raise ActionFailed(f"{item} not found after {scans} scans")


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
