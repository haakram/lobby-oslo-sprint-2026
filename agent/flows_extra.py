"""Routines for the request types of the live seed-1 night (Task 13; wybe-api.md § 12).

Where the right handling is unknown, each routine implements the stated hypothesis and logs it as a
`hypothesis` decision ({id, request, action, score_before, score_after, ...}) so one exploratory
live run shows from score deltas what is right. The safety rules of flows.py hold everywhere: a door
is looked at before any knock or keycard, and "done" needs an observed score rise.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import replace

from agent.executor import ActionFailed, Executor
from agent.flows import DND, Result, _ask_room, _corridor, _knock, _rose
from agent.flows import HANDLERS as BASE_HANDLERS
from agent.routing import NoRoute, best_tour
from agent.tasks import Kind, Task

CART_SLOTS = 8  # live: the 9th item in the cart is refused
BAG_WORDS = ("bag", "luggage", "suitcase")
NOISE_SAY = ("Good evening. Sorry to disturb you — could you please keep the noise down? "
             "Other guests are sleeping.")
STAFF = ("clerk", "maintenance")
NORSK = {"phone-charger": "mobillader", "water-bottle": "vannflaske", "toiletry-kit": "toalettsett",
         "pillow": "pute", "towel": "håndkle"}  # dashboard text only


def hyp(ex: Executor, hid: str, task: Task | None, action: str, before, after, **extra) -> None:
    ex.log("hypothesis", id=hid, request=task.request if task else None, action=action,
           score_before=before, score_after=after, **extra)


def objects_here(look: dict) -> list[str]:
    """'bags-206 x2' -> 'bags-206'."""
    return [re.sub(r"\s+x\d+$", "", o) for o in look.get("objects") or [] if isinstance(o, str)]


def find_object(names: list[str], words: tuple[str, ...], room: str | None, guest: str | None = None,
                *, exact: bool = False) -> str | None:
    """The object whose name has one of `words`; one naming the room or the guest wins. With
    exact, only such a named one (never another room's tray)."""
    found = [n for n in names if any(w in n.lower() for w in words)]
    num = room.removeprefix("room-") if room else None
    surname = guest.split()[-1].lower() if guest else None
    for name in found:
        if (num and num in name) or (surname and surname in name.lower()):
            return name
    return None if exact else next(iter(found), None)


# --- H-named -------------------------------------------------------------------------------------


def resolve_named(ex: Executor, task: Task) -> Task:
    """H-named: a request naming a guest, not a room -> ask the clerk (once per name), then the
    normal amenity/tray/message routine."""
    before, cached = ex.score_now(), task.guest in ex.guest_rooms
    try:
        room = _ask_room(ex, task.guest)
    except ActionFailed as exc:
        hyp(ex, "H-named", task, f"clerk asked about {task.guest}: {exc}", before, ex.score_now(),
            guest=task.guest, room=None)
        raise
    ex.ledger.set_room(task.request, room)
    hyp(ex, "H-named", task, f"{'cached' if cached else 'asked the clerk'}: {task.guest} is in {room}",
        before, ex.score_now(), guest=task.guest, room=room)
    item = f"tray-{room.removeprefix('room-')}" if task.kind is Kind.TRAY else task.item
    return replace(task, room=room, item=item)


# --- H-bags --------------------------------------------------------------------------------------


def bags(ex: Executor, task: Task) -> Result:
    """H-bags: bags from the desk into an empty room, opened with a keycard; done on a score rise."""
    room = task.room
    corridor = _corridor(ex, room)
    before = ex.score_now()
    if len(ex.state.hands) >= 2 and len(ex.state.cart or []) >= CART_SLOTS:
        raise ActionFailed("hands and cart are full: no room for the bags (dropped nothing)")
    if not ex.get_cart():  # bags are heavy, like trays
        raise ActionFailed("could not get the cart for the bags")
    ex.go(ex.hotel.special.get("clerk", "front-desk"))
    name = find_object(objects_here(ex.look()), BAG_WORDS, room) or "bags"
    ok, text = ex.pick(name)
    if not ok:
        hyp(ex, "H-bags", task, f"pick {name} failed: {text}", before, ex.score_now())
        raise ActionFailed(f"could not pick {name}: {text}")
    if not ex.state.carrying("keycard"):
        ex.gather("keycard")
    ex.go(corridor)
    door = ex.cmd("look", at=room)
    if DND in str(door.result).lower():
        ex.room_status(room, "ikke_forstyrr", "door_sign", "Do Not Disturb sign")
        hyp(ex, "H-bags", task, f"Do Not Disturb on {room}; kept {name}", before, ex.score_now())
        raise ActionFailed(f"Do Not Disturb sign on {room}; did not open it")
    if not door.ok:
        raise ActionFailed(f"could not see the door of {room}: {door.result}")
    opened = ex.cmd("use", item="keycard", on=room)
    if not opened.ok:
        raise ActionFailed(f"keycard did not open {room}: {opened.result}")
    mid = ex.score_now()
    placed = ex.cmd("place", item=name, where=room)
    if placed.ok:
        ex.take(name)
    after = ex.score_now()
    hyp(ex, "H-bags", task, f"placed {name} inside {room} after a keycard: {placed.result}", mid, after,
        score_at_start=before)
    if placed.ok and _rose(mid, after):
        return f"{name} taken up to {room}", None
    raise ActionFailed(f"placed {name} in {room} ({placed.result}) but the score did not rise")


# --- H-noise -------------------------------------------------------------------------------------


def _people(look: dict) -> list[str]:
    out = []
    for p in look.get("people") or []:
        if isinstance(p, dict) and p.get("who") not in STAFF:
            out.append(" ".join(str(p.get(k)) for k in ("name", "state", "role") if p.get(k)))
    return out


def named_rooms(ex: Executor, look: dict) -> list[str]:
    """Rooms the look's description or people name (a number, or a guest whose room is known)."""
    texts = [str(look.get("description") or "")] + _people(look)
    rooms: list[str] = []
    for text in texts:
        for num in re.findall(r"(?<!\d)(\d{3})(?!\d)", text):
            if f"room-{num}" in ex.hotel.nodes and f"room-{num}" not in rooms:
                rooms.append(f"room-{num}")
        for guest, room in ex.guest_rooms.items():
            if room and guest.lower() in text.lower() and room not in rooms:
                rooms.append(room)
    return rooms


def noise(ex: Executor, task: Task) -> Result:
    """H-noise: look in the corridor; knock where the look points and ask politely for quiet."""
    corridor = _corridor(ex, task.room)
    num = task.room.removeprefix("room-")
    before = ex.score_now()
    ex.go(corridor)
    look = ex.look()
    desc, people = str(look.get("description") or "").strip(), _people(look)
    seen = f"{corridor}: {desc or 'no description'}" + (f"; people: {', '.join(people)}" if people else "")
    ex.log("noise_look", request=task.request, at=corridor, description=desc, people=people)
    rooms = named_rooms(ex, look)
    if not rooms:
        ex.work_order("stoy", f"Støyklage nær rom {num}: fant ingen kilde", room=task.room,
                      place=corridor, request=task.request)
        hyp(ex, "H-noise", task, "nothing named in the look; did not knock", before, ex.score_now(),
            seen=seen)
        raise ActionFailed(f"no source of the noise named; saw {seen}")
    target = rooms[0]
    ex.go(_corridor(ex, target))
    answer = _knock(ex, target)  # looks at the door first
    if answer != "open":
        ex.work_order("stoy", f"Støyklage nær rom {num}: kilden {target} svarte ikke", room=target,
                      place=corridor, request=task.request)
        hyp(ex, "H-noise", task, f"{target}: {answer}; said nothing", before, ex.score_now(), seen=seen)
        if answer == "dnd":
            raise ActionFailed(f"Do Not Disturb sign on {target}; did not knock. Saw {seen}")
        raise ActionFailed(f"no answer at {target}; saw {seen}")
    mid = ex.score_now()
    ex.cmd("say", text=NOISE_SAY)
    after = ex.score_now()
    ex.work_order("stoy", f"Støyklage nær rom {num}: ba rom {target.removeprefix('room-')} dempe seg",
                  room=target, place=corridor, request=task.request)
    hyp(ex, "H-noise", task, f"knocked on {target} and asked for quiet", mid, after, seen=seen,
        score_at_start=before)
    if _rose(mid, after):
        return f"asked {target} to keep the noise down", None
    raise ActionFailed(f"asked {target} to keep the noise down but the score did not rise; saw {seen}")


# --- H-spill -------------------------------------------------------------------------------------


def _find_wet(ex: Executor, floor: int, corridors: list[str], seen: list[str]) -> str | None:
    """Walk the floor's corridors, looking before each step on, until the wet patch shows."""
    if ex.hotel.nodes.get(ex.state.location, {}).get("floor") != floor:
        landing = next((e for e in ex.hotel.elevators() if ex.hotel.floor(e) == floor), None)
        if landing:
            ex.go(landing)  # stop at the landing: the first corridor is looked at, not slipped on
    try:
        order, _ = best_tour(ex.hotel, ex.state.location, corridors, with_cart=ex.state.has_cart)
    except NoRoute:
        order = corridors
    for stop in [None, *order]:
        if stop is not None:
            if stop == ex.state.location:
                continue
            ex.go(stop)
        look = ex.look()
        here, desc = ex.state.location, str(look.get("description") or "").strip()
        seen.append(f"{here}: {desc or 'no description'}")
        if "wet" in desc.lower():
            return here
        warned = [e["to"] for e in look["exits"] if "wet" in str(e.get("warning", "")).lower()]
        if warned:
            seen.append(f"{here}: the floor towards {warned[0]} looks wet")
            ex.go(warned[0])  # seen now: the robot creeps instead of slipping
            return warned[0]
    return None


def spill(ex: Executor, task: Task) -> Result:
    """H-spill: a wet-floor sign from storage, placed (no `where`) on the wet patch of floor N."""
    floor = task.floor
    corridors = sorted(n for n, v in ex.hotel.nodes.items() if v["kind"] == "corridor" and v["floor"] == floor)
    if not corridors:
        raise ActionFailed(f"no corridors known on floor {floor}")
    before = ex.score_now()
    ex.gather("wet-floor-sign")
    seen: list[str] = []
    spot = _find_wet(ex, floor, corridors, seen)
    if spot is None:
        ex.work_order("sol", f"Søl meldt i etasje {floor}: fant ikke vått gulv", request=task.request)
        hyp(ex, "H-spill", task, "no wet patch seen; sign kept", before, ex.score_now(), seen=seen)
        raise ActionFailed(f"no wet patch seen on floor {floor}: " + "; ".join(seen))
    mid = ex.score_now()
    placed = ex.cmd("place", item="wet-floor-sign")
    if placed.ok:
        ex.take("wet-floor-sign")
    after = ex.score_now()
    ex.work_order("sol", f"Søl ved {spot}: varselskilt satt ut", place=spot, request=task.request)
    hyp(ex, "H-spill", task, f"placed a wet-floor sign at {spot}: {placed.result}", mid, after,
        score_at_start=before, seen=seen)
    if placed.ok and _rose(mid, after):
        return f"wet-floor sign placed over the spill at {spot}", None
    raise ActionFailed(f"placed a wet-floor sign at {spot} ({placed.result}) but the score did not rise")


# --- H-followup ----------------------------------------------------------------------------------


def followup(ex: Executor, task: Task) -> Result:
    """H-followup: "the X they ordered never came". Deliver only against our own open order."""
    num = (task.room or "room-?").removeprefix("room-")
    item = task.item or "item"
    ex.work_order("gjesteklage", f"Gjesteklage fra rom {num}: bestilt {NORSK.get(item, item)} kom aldri", room=task.room,
                  request=task.request)
    before = ex.score_now()
    orig = ex.ledger.original_for(task)
    if orig is None or orig.status == "done":
        why = "no order on record" if orig is None else f"{orig.request} was already done"
        hyp(ex, "H-followup", task, f"delivered nothing: {why}", before, before,
            original=orig.request if orig else None)
        raise ActionFailed(f"no order for {item} from {num} on record")
    queued = next((t for t in ex.queue if t.request == orig.request), None)
    if queued is not None:  # still waiting: do it now, under its own id
        ex.queue.remove(queued)
        out = ex.run(queued)
        hyp(ex, "H-followup", task, f"ran the waiting {orig.request}: {out.status}", before, ex.score_now(),
            original=orig.request)
        if out.status == "done":
            raise ActionFailed(f"delivered via {orig.request}")
        raise ActionFailed(f"tried {orig.request} again: {out.note}")
    # The original was reported failed earlier: deliver again (a place may still score).
    try:
        BASE_HANDLERS[orig.kind](ex, replace(orig.task, room=orig.room))
    except ActionFailed as exc:
        hyp(ex, "H-followup", task, f"retried {orig.request}: {exc}", before, ex.score_now(),
            original=orig.request)
        raise ActionFailed(f"retried {orig.request}: {exc}") from None
    hyp(ex, "H-followup", task, f"redelivered {orig.request}", before, ex.score_now(), original=orig.request)
    raise ActionFailed(f"delivered via {orig.request}")


HANDLERS: dict[Kind, Callable[[Executor, Task], Result]] = {
    Kind.BAGS: bags,
    Kind.NOISE: noise,
    Kind.SPILL: spill,
    Kind.FOLLOWUP: followup,
}
