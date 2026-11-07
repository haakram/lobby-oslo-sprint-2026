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
SECONDARY_SCANS = ("lobby-bar", "front-desk", "lobby")  # sofas and counters, then the lobby
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


def _door_sign(ex: Executor, room: str) -> bool:
    """Look at the door before any knock or keycard: True on a Do Not Disturb sign (logged for the
    dashboard). A door that can't be seen raises: acting on an unseen sign would be a gamble."""
    door = ex.cmd("look", at=room)
    text = str(door.result)
    if DND in text.lower():
        ex.ledger.note_dnd(room, ex.state.clock)
        ex.room_status(room, "ikke_forstyrr", "door_sign", "Do Not Disturb sign")
        return True
    if not door.ok:
        raise ActionFailed(f"could not see the door of {room}: {text}")
    return False


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


def _deliver(ex: Executor, room: str, item: str, count: int = 1) -> Result:
    """Knock, place all `count`, then accept only a score rise after the last place as proof."""
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
    ex.gather(task.item, task.count)
    return _deliver(ex, task.room, task.item, task.count)


def tray(ex: Executor, task: Task) -> Result:
    ex.cart_needed = True  # the tray rides only in the cart: never let go of it for the stairs
    try:
        return _tray(ex, task)
    finally:
        ex.cart_needed = False


def _tray(ex: Executor, task: Task) -> Result:
    _corridor(ex, task.room)
    _refuse_known_dnd(ex, task.room, task.request)
    item = task.item or f"tray-{task.room.removeprefix('room-')}"
    if not ex.state.carrying(item):
        if not ex.get_cart():
            raise ActionFailed("could not get the cart for the tray")
        ex.go(ex.hotel.special.get("kitchen", "kitchen-pass"))
        ok, text = ex.pick(item)
        if not ok and task.guest:  # H-named: the tray may carry the guest's name, not the room's
            from agent.flows_extra import find_object, objects_here

            alt = find_object(objects_here(ex.look()), ("tray",), task.room, task.guest, exact=True)
            if alt and alt != item:
                item = alt
                ok, text = ex.pick(item)
        if not ok:
            raise ActionFailed(f"could not pick {item}: {text}")
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
    reply = ex.cmd("use", item="keycard", on=room)
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
    name = carried[0] if carried else _find(ex, item, task.area_hint)
    return _deliver(ex, room, name)  # under the name it was picked up as


def _ask_room(ex: Executor, guest: str | None) -> str:
    """The clerk knows guests' rooms; asked once per name per shift (the answer is cached)."""
    if not guest:
        raise ActionFailed("no room and no guest name in the request")
    if guest not in ex.guest_rooms:
        ex.go(ex.hotel.special.get("clerk", "front-desk"))
        reply = ex.cmd("ask", person="clerk", question=f"Which room is {guest} in?")
        answer = reply.result.get("answer") if isinstance(reply.result, dict) else reply.result
        m = re.search(r"room[\s-]?(\d{3})", str(answer), re.IGNORECASE)
        ex.guest_rooms[guest] = f"room-{m[1]}" if reply.ok and m else None
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


def _pick_found(ex: Executor, item: str, near: list[str] = ()) -> str | None:
    """Pick item where a scan revealed it (now or earlier); the name it was picked as, or None.
    Of several matches (toy-2, toy-3), the one lying where the hint points goes first."""
    names = [f for f in ex.found if same_item(item, f)]
    names.sort(key=lambda f: ex.found[f] not in near)
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


def _find(ex: Executor, item: str, hint: str | None) -> str:
    primary, secondary = scan_candidates(ex.hotel, hint)
    if name := _pick_found(ex, item, primary):
        return name
    scans = 0
    for group in (primary, secondary):
        try:
            order, _ = best_tour(ex.hotel, ex.state.location, group, with_cart=ex.state.has_cart)
        except NoRoute:
            order = group
        for place in order:
            if scans >= ex.max_scans:
                break
            try:
                ex.go(place)
            except ActionFailed as exc:
                ex.log("scan_skip", place=place, reason=str(exc))
                continue
            ex.scan()
            scans += 1
            if name := _pick_found(ex, item, primary):
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
