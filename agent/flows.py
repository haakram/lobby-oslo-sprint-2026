"""Per-kind task routines for the executor (spec § Task handling).

Each routine returns (note, after) once the server has rewarded the work (or, for a room check,
once the robot has looked inside), or raises ActionFailed with the reason for the night manager.
`after` runs once the report is sent (e.g. leaving the checked room).
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


def handle(ex: Executor, task: Task) -> Result:
    if task.kind is Kind.UNKNOWN:
        task = _classify(ex, task)
    return HANDLERS[task.kind](ex, task)


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


def _corridor(ex: Executor, room: str | None) -> str:
    if not room or room not in ex.hotel.nodes:
        raise ActionFailed(f"unknown room {room}")
    try:
        return ex.hotel.room_corridor(room)
    except KeyError:
        raise ActionFailed(f"no corridor known for {room}") from None


def _knock(ex: Executor, room: str) -> str:
    """'dnd' | 'no_answer' | 'open'."""
    reply = ex.cmd("knock", door=room)
    text = str(reply.result)
    if DND in text.lower():
        return "dnd"
    if not reply.ok:
        raise ActionFailed(f"could not knock at {room}: {text}")
    return "no_answer" if "no answer" in text.lower() else "open"


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
    """Knock, place, and accept only a score rise as proof (checked after every place)."""
    _at_open_door(ex, room)
    before = ex.score_now()
    for _ in range(max(1, count)):
        reply = ex.cmd("place", item=item, where=room)
        if not reply.ok:
            raise ActionFailed(f"could not place {item} in {room}: {reply.result}")
        ex.take(item)
        after = ex.score_now()
        if _rose(before, after):
            return f"{item} x{count} delivered to {room}", None
        if before is not None and after is not None and after < before:
            raise ActionFailed(f"placed {item} in {room} and the score fell")
    raise ActionFailed(f"placed {item} in {room} but the score did not rise")


# --- the kinds ----------------------------------------------------------------------------------


def amenity(ex: Executor, task: Task) -> Result:
    if not task.item:
        raise ActionFailed("no item in the request")
    _corridor(ex, task.room)  # an unknown room fails before the trip to the stock room
    ex.gather(task.item, task.count)
    return _deliver(ex, task.room, task.item, task.count)


def tray(ex: Executor, task: Task) -> Result:
    _corridor(ex, task.room)
    item = task.item or f"tray-{task.room.removeprefix('room-')}"
    if not ex.state.carrying(item):
        if not ex.get_cart():
            raise ActionFailed("could not get the cart for the tray")
        ex.go(ex.hotel.special.get("kitchen", "kitchen-pass"))
        ok, text = ex.pick(item)
        if not ok:
            raise ActionFailed(f"could not pick {item}: {text}")
    return _deliver(ex, task.room, item)


def message(ex: Executor, task: Task) -> Result:
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
    door = ex.cmd("look", at=room)
    if DND in str(door.result).lower():
        raise ActionFailed(f"Do Not Disturb sign on {room}; did not knock or enter")
    answer = _knock(ex, room)
    if answer == "dnd":
        raise ActionFailed(f"Do Not Disturb sign on {room}; did not enter")
    if answer == "open":
        ex.log("note", request=task.request, room=room,
               text="a guest answered: an occupied room does not verify the check; reporting failed")
        raise ActionFailed(OCCUPIED_NOTE)
    if not ex.state.carrying("keycard"):
        ex.gather("keycard")
        ex.go(corridor)
    reply = ex.cmd("use", item="keycard", on=room)
    if not reply.ok:
        raise ActionFailed(f"keycard did not open {room}: {reply.result}")
    reply = ex.move(room)
    if not reply.ok:
        raise ActionFailed(f"could not enter {room}: {reply.result}")
    seen = str(ex.look().get("description") or "").strip() or "nothing to note"

    def leave() -> None:
        if not ex.move(corridor).ok:
            raise ActionFailed(f"could not leave {room}")

    return f"looked inside {room}: {seen}", leave


def lost_item(ex: Executor, task: Task) -> Result:
    item = task.item
    if not item:
        raise ActionFailed("no lost item named")
    room = task.room or _ask_room(ex, task.guest)
    _corridor(ex, room)
    if not ex.state.carrying(item):
        _find(ex, item, task.area_hint)
    return _deliver(ex, room, item)


def _ask_room(ex: Executor, guest: str | None) -> str:
    if not guest:
        raise ActionFailed("no room and no guest name in the request")
    ex.go(ex.hotel.special.get("clerk", "front-desk"))
    reply = ex.cmd("ask", person="clerk", question=f"Which room is {guest} in?")
    answer = reply.result.get("answer") if isinstance(reply.result, dict) else reply.result
    m = re.search(r"room[\s-]?(\d{3})", str(answer), re.IGNORECASE)
    if not reply.ok or not m:
        raise ActionFailed(f"the clerk did not know {guest}'s room")
    ex.log("asked_room", guest=guest, room=f"room-{m[1]}")
    return f"room-{m[1]}"


def _pick_found(ex: Executor, item: str) -> bool:
    """Pick item where a scan revealed it (now or earlier); True once carried."""
    name = next((f for f in ex.found if f == item or item in f or f in item), None)
    if name is None:
        return False
    place = ex.found.pop(name)
    ex.go(place)
    ok, text = ex.pick(name)
    if not ok:
        ex.log("found_item_gone", item=name, at=place, reply=text)
    return ok


def _find(ex: Executor, item: str, hint: str | None) -> None:
    if _pick_found(ex, item):
        return
    primary, secondary = scan_candidates(ex.hotel, hint)
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
            if _pick_found(ex, item):
                return
    raise ActionFailed(f"{item} not found after {scans} scans")


def scan_candidates(hotel: Hotel, hint: str | None) -> tuple[list[str], list[str]]:
    """Places named by the hint (e.g. "ground floor corridor" -> corridor-1a/1b/1c), then the
    places lost things end up (lobby-bar, front-desk, lobby)."""
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
    if "corridor" in words and not any(hotel.nodes[n]["kind"] == "corridor" for n in exact):
        floor = next((f for w, f in FLOOR_WORDS.items() if w in words), None)
        if m := re.search(r"floor\s*(\d)", h):
            floor = int(m[1])
        elif "top" in words:
            floor = max(v["floor"] for v in hotel.nodes.values())
        primary += [n for n in sorted(hotel.nodes) if hotel.nodes[n]["kind"] == "corridor"
                    and (floor is None or hotel.floor(n) == floor) and n not in primary]
    secondary = [n for n in SECONDARY_SCANS if n in hotel.nodes and n not in primary]
    return primary, secondary


HANDLERS: dict[Kind, Callable[[Executor, Task], Result]] = {
    Kind.AMENITY: amenity,
    Kind.TRAY: tray,
    Kind.MESSAGE: message,
    Kind.ROOM_CHECK: room_check,
    Kind.LOST_ITEM: lost_item,
}
