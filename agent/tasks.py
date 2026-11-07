"""Rule-based parser: night-manager request text -> structured Task (no network, no Claude)."""

from __future__ import annotations

import re
from dataclasses import dataclass, replace
from enum import Enum

from agent.world import clock_to_seconds


class Kind(str, Enum):
    AMENITY = "amenity"
    TRAY = "tray"
    MESSAGE = "message"
    ROOM_CHECK = "room_check"
    LOST_ITEM = "lost_item"
    BAGS = "bags"
    NOISE = "noise"
    SPILL = "spill"
    FOLLOWUP = "followup"
    UNKNOWN = "unknown"


@dataclass
class Task:
    request: str
    kind: Kind
    text: str
    arrived: str
    room: str | None = None
    item: str | None = None
    count: int = 1
    message: str | None = None
    guest: str | None = None
    area_hint: str | None = None
    floor: int | None = None


ITEM_ALIASES: dict[str, str] = {
    "phone charger": "phone-charger",
    "phone chargers": "phone-charger",
    "charger": "phone-charger",
    "chargers": "phone-charger",
    "water bottle": "water-bottle",
    "water bottles": "water-bottle",
    "water": "water-bottle",
    "toiletry kit": "toiletry-kit",
    "toiletry kits": "toiletry-kit",
    "toiletries": "toiletry-kit",
    "pillow": "pillow",
    "pillows": "pillow",
    "towel": "towel",
    "towels": "towel",
    "glasses": "glasses",
}

_NUMBER_WORDS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5}

_PREFIX = re.compile(r"^\s*R-\d+\s*:\s*", re.IGNORECASE)
_ROOM = re.compile(r"(?<!\d)(\d{3})(?!\d)")
_ITEM_RE = re.compile(
    r"\b(" + "|".join(re.escape(k) for k in sorted(ITEM_ALIASES, key=len, reverse=True)) + r")\b",
    re.IGNORECASE,
)
_COUNT = re.compile(
    r"\b(one|two|three|four|five|[1-9])\s+(?:[a-z]+\s+)?" + _ITEM_RE.pattern,
    re.IGNORECASE,
)
_LOST = re.compile(r"\blost\b", re.IGNORECASE)
_TRAY = re.compile(r"\btray\b", re.IGNORECASE)
_MESSAGE = re.compile(
    r"^(?:(?:please|could you|can you)\s+)?(?:tell|let|inform|notify|message)\s+"
    r"(?:the\s+)?(?:guest\s+)?(?:in\s+)?(?:room\s+)?(\d{3})\b[,:]?\s*(?:know\s+)?(?:that\s+)?(.+?)\s*[.!]?$",
    re.IGNORECASE,
)
_CHECK = re.compile(r"\b(empty|tidy|occupied|vacant)\b", re.IGNORECASE)
# An explicit check phrase, never a bare "is"/"are": "210 is vacant now, please ..." is no room check.
_CHECK_VERB = re.compile(r"\b(check|verify|confirm|see if|see whether|make sure|find out)\b", re.IGNORECASE)
# A text about noise or a complaint is never a room check (a keycard entry on a false one costs -30),
# nor is one about an object in the room ("check the minibar in 305, it is empty" is not the room).
_NOT_CHECK = re.compile(
    r"\b(noise|noisy|loud|music|party|complaints?|complain\w*"
    r"|minibar|mini-bar|fridge|refrigerator|safe|wardrobe|closet|drawer|cupboard|shelf|shelves|bin"
    r"|kettle|bathtub|sink|toilet|shower)\b",
    re.IGNORECASE,
)
_HINT = re.compile(
    r"\b(?:maybe|probably|perhaps|possibly)\s+(?:somewhere\s+)?(?:around|in|near|at|by)?\s*"
    r"(?:the\s+)?(.+?)\s*[.!]?$",
    re.IGNORECASE,
)
_TITLED = r"(?:Mr|Mrs|Ms|Mx|Miss|Dr)\.?\s+[A-Z][\w'-]*"
_GUEST = re.compile(rf"^({_TITLED})")
# The request types of the live night (wybe-api.md § 12), checked before the older patterns.
_FOLLOWUP = re.compile(r"\bcall from (?:room\s+)?(\d{3})\b.*?\bthe (.+?) (?:they|she|he) ordered\b.*\bnever\b",
                       re.IGNORECASE)
_BAGS = re.compile(r"\b(?:bags?|luggage|suitcases?)\b.*?\b(?:up )?to (?:room\s+)?(\d{3})\b", re.IGNORECASE)
_NOISE = re.compile(r"\bnoise\b", re.IGNORECASE)
_SPILL = re.compile(r"\bspill\b.*?\bfloor (\d+|ground|first|second|third)\b", re.IGNORECASE)
_NAMED_WANTS = re.compile(rf"^({_TITLED}) (?:would like|wants|needs|asked for)\b")
_NAMED_TRAY = re.compile(rf"\broom service for ({_TITLED})", re.IGNORECASE)
_NAMED_MESSAGE = re.compile(rf"^(?:[Pp]lease\s+)?(?:[Ll]et|[Tt]ell) ({_TITLED})(?: know)?(?: that)?\s+(.+?)\s*[.!]?$")
_LOST_WHAT = re.compile(
    r"\blost\s+(?:(?:a|an|the|her|his|their|my|some)\s+)?(.+?)"
    r"(?=,|\s+(?:earlier|maybe|probably|perhaps|possibly|somewhere|tonight|near|in|at|by|around)\b|[.!?]|$)",
    re.IGNORECASE,
)
_SPILL_FLOORS = {"ground": 1, "first": 1, "second": 2, "third": 3}


_DEST = re.compile(r"\b(?:to|for|in|room)\s+(?:room\s+)?(\d{3})(?!\d)", re.IGNORECASE)


def _room(text: str) -> str | None:
    found = _DEST.findall(text) or _ROOM.findall(text)
    return f"room-{found[-1]}" if found else None


def _count(text: str) -> int:
    m = _COUNT.search(text)
    if not m:
        return 1
    w = m.group(1).lower()
    return _NUMBER_WORDS.get(w) or int(w)


def _item(text: str) -> str | None:
    m = _ITEM_RE.search(text)
    return ITEM_ALIASES[m.group(1).lower()] if m else None


def _lost_item(after_lost: str) -> str | None:
    """'a child's toy earlier tonight' -> 'toy'; 'reading glasses' -> 'reading-glasses'."""
    if item := _item(after_lost):
        return item
    m = _LOST_WHAT.match("lost " + after_lost.strip())
    words = [w for w in re.findall(r"[\w']+", m.group(1).lower()) if not w.endswith("'s")] if m else []
    return "-".join(words) or None


def parse_request(request_id: str, text: str, arrived: str) -> Task:
    body = _PREFIX.sub("", text or "").strip()
    base = {"request": request_id, "text": body, "arrived": arrived}
    room = _room(body)

    if m := _MESSAGE.match(body):
        return Task(kind=Kind.MESSAGE, room=f"room-{m.group(1)}", message=m.group(2), **base)
    if m := _FOLLOWUP.search(body):
        return Task(kind=Kind.FOLLOWUP, room=f"room-{m.group(1)}",
                    item=_item(m.group(2)) or m.group(2).strip().lower().replace(" ", "-"), **base)
    if (m := _BAGS.search(body)) and re.search(r"\b(?:take|bring|carry)\b", body, re.IGNORECASE):
        return Task(kind=Kind.BAGS, room=f"room-{m.group(1)}", **base)
    if _NOISE.search(body) and room:
        return Task(kind=Kind.NOISE, room=room, **base)
    if m := _SPILL.search(body):
        word = m.group(1).lower()
        return Task(kind=Kind.SPILL, floor=_SPILL_FLOORS.get(word) or int(word), **base)
    if not room and (m := _NAMED_WANTS.match(body)) and (item := _item(body)):
        return Task(kind=Kind.AMENITY, guest=m.group(1), item=item, count=_count(body), **base)
    if not room and (m := _NAMED_TRAY.search(body)):
        return Task(kind=Kind.TRAY, guest=m.group(1), **base)
    if not room and (m := _NAMED_MESSAGE.match(body)):
        return Task(kind=Kind.MESSAGE, guest=m.group(1), message=m.group(2), **base)
    if _LOST.search(body):
        after = body[_LOST.search(body).end():]
        hint = _HINT.search(after)
        g = _GUEST.match(body)
        item = _lost_item(after)
        if item:
            return Task(
                kind=Kind.LOST_ITEM, room=room, item=item,
                guest=g.group(1) if g else None,
                area_hint=hint.group(1).strip() if hint else None, **base,
            )
    if _TRAY.search(body) and room:
        return Task(kind=Kind.TRAY, room=room, item=f"tray-{room[5:]}", **base)
    if room and _CHECK.search(body) and _CHECK_VERB.search(body) and not _NOT_CHECK.search(body):
        return Task(kind=Kind.ROOM_CHECK, room=room, **base)
    item = _item(body)
    if room and item:
        return Task(kind=Kind.AMENITY, room=room, item=item, count=_count(body), **base)
    return Task(kind=Kind.UNKNOWN, room=room, **base)


def vet_brain_task(task: Task) -> Task:
    """A Brain-classified room check is accepted only when the text has nothing of a noise complaint
    in it; otherwise it becomes UNKNOWN (reported failed, never a keycard)."""
    if task.kind is Kind.ROOM_CHECK and _NOT_CHECK.search(task.text or ""):
        return replace(task, kind=Kind.UNKNOWN)
    return task


# --- the request ledger: every request of the shift, for follow-ups and duplicates ----------------

DUPLICATE_WINDOW_S = 600
ORDER_KINDS = (Kind.AMENITY, Kind.TRAY, Kind.LOST_ITEM)  # what a guest can say never came


def normalise(text: str) -> str:
    """'R-056: Bring the tray ... to 322.' -> 'bring the tray ... to 322'."""
    return " ".join(re.findall(r"[a-z0-9]+", _PREFIX.sub("", text or "").lower()))


@dataclass
class Entry:
    task: Task
    room: str | None  # filled in once a named guest's room is known
    norm: str
    status: str = "pending"  # pending | done | failed | skipped

    @property
    def request(self) -> str:
        return self.task.request

    @property
    def kind(self) -> Kind:
        return self.task.kind

    @property
    def item(self) -> str | None:
        return self.task.item


def _secs(clock: str) -> int | None:
    try:
        return clock_to_seconds(clock)
    except (ValueError, AttributeError):
        return None


class Ledger:
    """Requests of one shift keyed by id: kind, room, item, normalised text and status."""

    def __init__(self) -> None:
        self.entries: dict[str, Entry] = {}
        self.dnd: dict[str, str] = {}  # room -> sim clock when a Do Not Disturb sign was last seen

    def note_dnd(self, room: str, clock: str) -> None:
        self.dnd[room] = clock

    def dnd_seen(self, room: str, now: str, memory_s: int) -> str | None:
        """The clock a DND sign on `room` was seen, if that is within memory_s before `now`."""
        seen = self.dnd.get(room)
        if seen is None:
            return None
        a, b = _secs(seen), _secs(now)
        return seen if a is None or b is None or 0 <= b - a <= memory_s else None

    def add(self, task: Task) -> None:
        if task.request not in self.entries:
            self.entries[task.request] = Entry(task, task.room, normalise(task.text))

    def get(self, request: str) -> Entry | None:
        return self.entries.get(request)

    def set_room(self, request: str, room: str) -> None:
        if entry := self.entries.get(request):
            entry.room = room

    def set_status(self, request: str, status: str) -> None:
        if entry := self.entries.get(request):
            entry.status = status

    def _earlier(self, task: Task) -> list[Entry]:
        """Entries that came in before task (by arrival, then by order of arrival in the ledger)."""
        out = []
        for rid, entry in self.entries.items():
            if rid == task.request:
                break
            out.append(entry)
        return out

    def duplicate_of(self, task: Task) -> str | None:
        """H-duplicate: the same normalised text for the same room within 10 minutes earlier."""
        now, norm = _secs(task.arrived), normalise(task.text)
        if now is None or not norm:
            return None
        for entry in reversed(self._earlier(task)):
            then = _secs(entry.task.arrived)
            if (entry.norm == norm and entry.task.room == task.room and then is not None
                    and 0 <= now - then <= DUPLICATE_WINDOW_S):
                return entry.request
        return None

    def served(self) -> int:
        """Requests served this shift: reported done, or delivered later through a follow-up."""
        return sum(entry.status == "done" for entry in self.entries.values())

    def original_for(self, task: Task, guest_rooms: dict[str, str | None] | None = None) -> Entry | None:
        """H-followup: the latest earlier request for the same item to the same room. A named
        guest's request has no room until it runs; it counts by the guest's room in guest_rooms
        (the executor's cache of the clerk's answers)."""
        if task.room is None:
            return None
        for entry in reversed(self._earlier(task)):
            room = entry.room or (guest_rooms or {}).get(entry.task.guest or "")
            if (entry.kind in ORDER_KINDS and room == task.room
                    and entry.item is not None and entry.item == task.item):
                return entry
        return None

    def unknown_guests(self, task: Task, guest_rooms: dict[str, str | None]) -> list[str]:
        """Named guests of earlier orders for task's item whose room is not known and not asked yet."""
        return list(dict.fromkeys(
            entry.task.guest for entry in self._earlier(task)
            if entry.kind in ORDER_KINDS and entry.item == task.item and entry.room is None
            and entry.task.guest and entry.task.guest not in guest_rooms))
