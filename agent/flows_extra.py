"""Routines for the request types of the live seed-1 night (Task 13; wybe-api.md § 12).

Where the right handling is unknown, each routine implements the stated hypothesis and logs it as a
`hypothesis` decision ({id, request, action, score_before, score_after, ...}) so one exploratory
live run shows from score deltas what is right. Every run of a hypothesis flow logs exactly one such
line, however it ends (see Hyp). The safety rules of flows.py hold everywhere: a door is looked at
before any knock or keycard, and "done" needs an observed score rise.
"""

from __future__ import annotations

import functools
import re
from collections.abc import Callable
from dataclasses import replace

from agent.client import ShiftEnded, WybeError
from agent.executor import ActionFailed, Declined, Executor
from agent.flows import HANDLERS as BASE_HANDLERS
from agent.flows import Result, _ask_room, _corridor, _door_sign, _knock, _open_with_keycard, _rose
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


class Hyp:
    """The one `hypothesis` line of one run of a hypothesis flow: the first `log` call writes it,
    later ones are ignored. `extra` fields go on the line however it is written."""

    def __init__(self, ex: Executor, hid: str, task: Task, **extra):
        self.ex, self.hid, self.task, self.extra = ex, hid, task, extra
        self.before = ex.score_now()
        self.logged = False

    def log(self, action: str, before, after, **extra) -> None:
        if not self.logged:
            self.logged = True
            hyp(self.ex, self.hid, self.task, action, before, after, **{**self.extra, **extra})


def _hypothesis(hid: str):
    """Decorator: the flow runs as `flow(ex, task, h)` with a Hyp `h` for hid. The flow logs the
    outcomes it understands; any other exit (a shared step raising: no route, a door that can't be
    seen, a refused keycard, out of stock) is logged here with the reason, score_after being the
    score then. Not when the shift ends or the server can't be reached: there is no score to read."""

    def wrap(flow):
        @functools.wraps(flow)
        def run(ex: Executor, task: Task):
            h = Hyp(ex, hid, task)
            try:
                result = flow(ex, task, h)
            except (ShiftEnded, WybeError):
                raise
            except Exception as exc:
                if not h.logged:
                    h.log(f"failed: {exc}", h.before, ex.score_now())
                raise
            if not h.logged:
                h.log("ended", h.before, ex.score_now())
            return result

        return run

    return wrap


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


@_hypothesis("H-named")
def named(ex: Executor, task: Task, h: Hyp) -> Result:
    """H-named: a request naming a guest, not a room -> ask the clerk (once per name), then the
    normal amenity/tray/message routine. Logged once, when that routine ends, so the score delta
    covers the delivery (score_before is from before the ask)."""
    h.extra.update(guest=task.guest, room=None)
    cached = task.guest in ex.guest_rooms
    room = _ask_room(ex, task.guest)
    ex.ledger.set_room(task.request, room)
    h.extra["room"] = room
    found = f"{'cached' if cached else 'asked the clerk'}: {task.guest} is in {room}"
    item = f"tray-{room.removeprefix('room-')}" if task.kind is Kind.TRAY else task.item
    try:
        note, after = BASE_HANDLERS[task.kind](ex, replace(task, room=room, item=item))
    except ActionFailed as exc:
        h.log(f"{found}; {task.kind.value} failed: {exc}", h.before, ex.score_now())
        raise
    h.log(f"{found}; {note}", h.before, ex.score_now())
    return note, after


# --- H-bags --------------------------------------------------------------------------------------


@_hypothesis("H-bags")
def bags(ex: Executor, task: Task, h: Hyp) -> Result:
    """H-bags: bags from the desk into an empty room, opened with a keycard; done on a score rise.
    Bags ride only in the cart: a cart with no free slot fails up front (nothing is dropped)."""
    ex.cart_needed = True  # the bags ride only in the cart: never let go of it for the stairs
    try:
        return _bags(ex, task, h)
    finally:
        ex.cart_needed = False


def _bags(ex: Executor, task: Task, h: Hyp) -> Result:
    room = task.room
    corridor = _corridor(ex, room)
    if ex.state.has_cart and len(ex.state.cart) >= CART_SLOTS:
        raise ActionFailed("the cart is full: no room for the bags (dropped nothing)")
    if not ex.get_cart():  # bags are heavy, like trays
        raise ActionFailed("could not get the cart for the bags")
    ex.go(ex.hotel.special.get("clerk", "front-desk"))
    name = find_object(objects_here(ex.fresh_look()), BAG_WORDS, room) or "bags"
    ok, text = ex.pick(name)
    if not ok:
        raise ActionFailed(f"could not pick {name}: {text}")
    if not ex.state.carrying("keycard"):
        ex.gather("keycard")
    ex.go(corridor)
    if _door_sign(ex, room):
        raise ActionFailed(f"Do Not Disturb sign on {room}; did not open it (kept {name})")
    opened = _open_with_keycard(ex, room)
    if not opened.ok:
        raise ActionFailed(f"keycard did not open {room}: {opened.result}")
    mid = ex.score_now()
    placed = ex.cmd("place", item=name, where=room)
    if placed.ok:
        ex.take(name)
    after = ex.score_now()
    h.log(f"placed {name} inside {room} after a keycard: {placed.result}", mid, after, score_at_start=h.before)
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


@_hypothesis("H-noise")
def noise(ex: Executor, task: Task, h: Hyp) -> Result:
    """H-noise: look in the corridor; knock where the look points and ask politely for quiet."""
    corridor = _corridor(ex, task.room)
    num = task.room.removeprefix("room-")
    ex.go(corridor)
    look = ex.fresh_look()  # the first-visit look on arrival, when it was the last command
    desc, people = str(look.get("description") or "").strip(), _people(look)
    seen = f"{corridor}: {desc or 'no description'}" + (f"; people: {', '.join(people)}" if people else "")
    ex.log("noise_look", request=task.request, at=corridor, description=desc, people=people)
    rooms = named_rooms(ex, look)
    if not rooms:
        ex.work_order("stoy", f"Støyklage nær rom {num}: fant ingen kilde", room=task.room,
                      place=corridor, request=task.request)
        h.log("nothing named in the look; did not knock", h.before, ex.score_now(), seen=seen)
        raise ActionFailed(f"no source of the noise named; saw {seen}")
    target = rooms[0]
    ex.go(_corridor(ex, target))
    answer = _knock(ex, target)  # looks at the door first
    if answer != "open":
        why = f"ikke forstyrr-skilt på {target}" if answer == "dnd" else f"kilden {target} svarte ikke"
        ex.work_order("stoy", f"Støyklage nær rom {num}: {why}", room=target, place=corridor,
                      request=task.request)
        h.log(f"{target}: {answer}; said nothing", h.before, ex.score_now(), seen=seen)
        if answer == "dnd":
            raise ActionFailed(f"Do Not Disturb sign on {target}; did not knock. Saw {seen}")
        raise ActionFailed(f"no answer at {target}; saw {seen}")
    mid = ex.score_now()
    ex.cmd("say", text=NOISE_SAY)
    after = ex.score_now()
    ex.work_order("stoy", f"Støyklage nær rom {num}: ba rom {target.removeprefix('room-')} dempe seg",
                  room=target, place=corridor, request=task.request)
    h.log(f"knocked on {target} and asked for quiet", mid, after, seen=seen, score_at_start=h.before)
    if _rose(mid, after):
        return f"asked {target} to keep the noise down", None
    raise ActionFailed(f"asked {target} to keep the noise down but the score did not rise; saw {seen}")


# --- H-spill -------------------------------------------------------------------------------------


def _find_wet(ex: Executor, floor: int, corridors: list[str], seen: list[str],
              known: set[str] = frozenset()) -> tuple[list[str], list[str]]:
    """Walk the floor's corridors, looking before each step on, until a wet spot NOT in `known`
    shows (the reported spill is new; an old patch is usually one the robot slipped on hours ago:
    live R-067 signed corridor-1b for a spill in 1a, for 0). Returns (wet spots seen, in walk
    order; corridors not walked yet), so the walk can be resumed with a larger `known`."""
    if ex.hotel.nodes.get(ex.state.location, {}).get("floor") != floor:
        landing = next((e for e in ex.hotel.elevators() if ex.hotel.floor(e) == floor), None)
        if landing:
            ex.go(landing)  # stop at the landing: the first corridor is looked at, not slipped on
    try:
        order, _ = best_tour(ex.hotel, ex.state.location, corridors, with_cart=ex.state.has_cart)
    except NoRoute:
        order = list(corridors)
    remaining = [c for c in order if c != ex.state.location]
    found: list[str] = []
    while True:
        look = ex.fresh_look()  # the first-visit look on arrival, when it was the last command
        here, desc = ex.state.location, str(look.get("description") or "").strip()
        seen.append(f"{here}: {desc or 'no description'}")
        if "wet" in desc.lower() and here not in found:
            found.append(here)
        for to in [e["to"] for e in look["exits"] if "wet" in str(e.get("warning", "")).lower()]:
            seen.append(f"{here}: the floor towards {to} looks wet")  # marked wet by the look: a creep
            if to not in found and ex.hotel.nodes.get(to, {}).get("kind") != "room":
                found.append(to)
        if any(s not in known for s in found) or not remaining:
            return found, remaining
        ex.go(remaining.pop(0))


def _rank(found: list[str], known: set[str], hotel) -> list[str]:
    """Spots not known at task start first (walk order), then the known ones, newest first."""
    age = {spot: i for i, spot in enumerate(hotel.wet_spots())}
    old = sorted((s for s in found if s in known), key=lambda s: -age.get(s, -1))
    return [s for s in found if s not in known] + old


@_hypothesis("H-spill")
def spill(ex: Executor, task: Task, h: Hyp) -> Result:
    """H-spill: a wet-floor sign from storage, placed (no `where`) on the wet patch of floor N and
    LEFT THERE; the credit comes on the report, not the place (live seed 4, R-019/R-032: "Noted.
    Thanks." +43/+63 with the sign on the patch; every report with the sign elsewhere: "Noted."
    -30). Best patch: one not known when the task started, else the newest known one, a patch
    with a sign already standing last. No second placement: moving the sign is what lost the
    credit before. Done on a score rise, or (experiment spill_done, on by default, switched off
    for the shift by one unverified report) on the report."""
    floor = task.floor
    known = set(ex.hotel.wet_spots())
    corridors = sorted(n for n, v in ex.hotel.nodes.items() if v["kind"] == "corridor" and v["floor"] == floor)
    if not corridors:
        raise ActionFailed(f"no corridors known on floor {floor}")
    ex.gather("wet-floor-sign")
    seen: list[str] = []
    found, _rest = _find_wet(ex, floor, corridors, seen, known)
    if not found:
        ex.work_order("sol", f"Søl meldt i etasje {floor}: fant ikke vått gulv", request=task.request)
        h.log("no wet patch seen; sign kept", h.before, ex.score_now(), seen=seen)
        raise ActionFailed(f"no wet patch seen on floor {floor}: " + "; ".join(seen))
    signed = {s.split(":")[0] for s in seen if "sign stands" in s.lower()}
    ranked = _rank(found, known, ex.hotel)
    spot = ([s for s in ranked if s not in signed] or ranked)[0]
    ex.go(spot)  # a warned exit: seen, so the robot creeps onto it
    mid = ex.score_now()
    placed = ex.cmd("place", item="wet-floor-sign")
    if placed.ok:
        ex.take("wet-floor-sign")
    after = ex.score_now()
    ex.work_order("sol", f"Søl ved {spot}: varselskilt satt ut", place=spot, request=task.request)
    h.log(f"placed a wet-floor sign at {spot}: {placed.result}", mid, after, score_at_start=h.before,
          seen=seen, known=sorted(known), signed=sorted(signed), candidates=ranked)
    if not placed.ok:
        raise ActionFailed(f"could not place the wet-floor sign at {spot}: {placed.result}")
    if _rose(mid, after):
        return f"wet-floor sign placed over the spill at {spot}", None
    if ex.experiment("spill_done") and ex.state.location == spot:
        ex.exp_claim("spill_done")
        return f"wet-floor sign placed over the wet patch at {spot}", None
    raise ActionFailed(f"placed a wet-floor sign at {spot} but the score did not rise")


# --- H-followup ----------------------------------------------------------------------------------


def _original(ex: Executor, task: Task):
    """The ledger entry a follow-up is about. A named guest's order counts by the guest's room: if
    nothing matched, the clerk is asked about such guests (once per name per shift) first."""
    orig = ex.ledger.original_for(task, ex.guest_rooms)
    if orig is None and (guests := ex.ledger.unknown_guests(task, ex.guest_rooms)):
        for guest in guests:
            try:
                _ask_room(ex, guest)
            except ActionFailed as exc:  # unknown to the clerk, or the desk out of reach
                ex.log("note", request=task.request, text=f"could not learn {guest}'s room: {exc}")
        orig = ex.ledger.original_for(task, ex.guest_rooms)
    if orig is not None and orig.room is None:
        ex.ledger.set_room(orig.request, task.room)
    return orig


@_hypothesis("H-followup")
def followup(ex: Executor, task: Task, h: Hyp) -> Result:
    """H-followup: "the X they ordered never came". Deliver only against our own open order."""
    num = (task.room or "room-?").removeprefix("room-")
    item = task.item or "item"
    ex.work_order("gjesteklage", f"Gjesteklage fra rom {num}: bestilt {NORSK.get(item, item)} kom aldri",
                  room=task.room, request=task.request)
    orig = _original(ex, task)
    if orig is None and task.room and task.item and ex.experiment("followup_deliver"):
        # Experiment: bring the item anyway (a place scored 0 live) and report done. The server's
        # reply to that report says whether a follow-up is credited on the report instead.
        from agent.flows import _deliver

        ex.gather(task.item, 1)
        try:
            return _deliver(ex, task.room, task.item, 1)
        except ActionFailed as exc:
            if "did not rise" not in str(exc):
                raise
        ex.exp_claim("followup_deliver")
        return f"{item} brought to {task.room} now (no earlier order on record)", None
    if orig is None and ex.experiment("followup_probe"):
        # Probe: does the manager or the clerk know more about an order we have no record of?
        asked = ex.cmd("reply", request=task.request,
                       text=f"No order for a {item} from {num} is on record tonight. Should I bring one now?")
        ex.log("probe", name="followup_reply", request=task.request, reply=str(asked.result)[:300])
        try:
            ex.go(ex.hotel.special.get("clerk", "front-desk"))
            answer = ex.cmd("ask", person="clerk", question=f"Did room {num} order a {item} tonight?")
            ex.log("probe", name="followup_ask", request=task.request, reply=str(answer.result)[:300])
        except ActionFailed as exc:
            ex.log("probe", name="followup_ask", request=task.request, reply=f"failed: {exc}"[:200])
    if orig is None:  # a false claim: declined with the reason scores +5 live (failed 0, done -20)
        h.log("delivered nothing: no order on record", h.before, ex.score_now(), original=None)
        raise Declined(f"No {item} order from {num} on record tonight; nothing was ordered.")
    if orig.status == "done":  # live: a second call about a delivered order declined scored +5 (R-049)
        h.log(f"delivered nothing: {orig.request} was already done", h.before, ex.score_now(),
              original=orig.request)
        raise Declined(f"The {item} for {num} was already delivered under {orig.request}; nothing more to bring.")
    queued = next((t for t in ex.queue if t.request == orig.request), None)
    if queued is not None:  # still waiting: do it now, under its own id
        ex.queue.remove(queued)
        out = ex.run(queued)
        h.log(f"ran the waiting {orig.request}: {out.status}", h.before, ex.score_now(), original=orig.request)
        if out.status == "done":
            raise ActionFailed(f"delivered via {orig.request}")
        raise ActionFailed(f"tried {orig.request} again: {out.note}")
    # The original was reported failed earlier: deliver again (a place may still score).
    try:
        BASE_HANDLERS[orig.kind](ex, replace(orig.task, room=orig.room))
    except ActionFailed as exc:
        h.log(f"retried {orig.request}: {exc}", h.before, ex.score_now(), original=orig.request)
        raise ActionFailed(f"retried {orig.request}: {exc}") from None
    ex.ledger.set_status(orig.request, "done")  # served now: another follow-up must not redeliver it
    h.log(f"redelivered {orig.request}", h.before, ex.score_now(), original=orig.request)
    raise ActionFailed(f"delivered via {orig.request}")


HANDLERS: dict[Kind, Callable[[Executor, Task], Result]] = {
    Kind.BAGS: bags,
    Kind.NOISE: noise,
    Kind.SPILL: spill,
    Kind.FOLLOWUP: followup,
}
