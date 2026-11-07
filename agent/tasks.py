"""Rule-based parser: night-manager request text -> structured Task (no network, no Claude)."""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum


class Kind(str, Enum):
    AMENITY = "amenity"
    TRAY = "tray"
    MESSAGE = "message"
    ROOM_CHECK = "room_check"
    LOST_ITEM = "lost_item"
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

_PREFIX = re.compile(r"^\s*R-\d+\s*:\s*", re.I)
_ROOM = re.compile(r"(?<!\d)(\d{3})(?!\d)")
_COUNT = re.compile(r"\b(one|two|three|four|five|[1-9])\b(?!\d)", re.I)
_ITEM_RE = re.compile(
    r"\b(" + "|".join(re.escape(k) for k in sorted(ITEM_ALIASES, key=len, reverse=True)) + r")\b",
    re.I,
)
_LOST = re.compile(r"\blost\b", re.I)
_TRAY = re.compile(r"\btray\b", re.I)
_MESSAGE = re.compile(
    r"^(?:(?:please|could you|can you)\s+)?(?:tell|let|inform|notify|message)\s+"
    r"(?:the\s+)?(?:guest\s+)?(?:in\s+)?(?:room\s+)?(\d{3})\b[,:]?\s*(?:know\s+)?(?:that\s+)?(.+?)\s*[.!]?$",
    re.I,
)
_CHECK = re.compile(r"\b(empty|tidy|occupied|vacant)\b", re.I)
_CHECK_VERB = re.compile(r"\b(check|is|are|verify|see)\b", re.I)
_HINT = re.compile(
    r"\b(?:maybe|probably|perhaps|possibly)\s+(?:somewhere\s+)?(?:around|in|near|at|by)?\s*"
    r"(?:the\s+)?(.+?)\s*[.!]?$",
    re.I,
)
_GUEST = re.compile(r"^((?:Mr|Mrs|Ms|Mx|Miss|Dr)\.?\s+[A-Z][\w'-]*)")


def _room(text: str) -> str | None:
    m = _ROOM.search(text)
    return f"room-{m.group(1)}" if m else None


def _count(text: str) -> int:
    for m in _COUNT.finditer(text):
        w = m.group(1).lower()
        return _NUMBER_WORDS.get(w) or int(w)
    return 1


def _item(text: str) -> str | None:
    m = _ITEM_RE.search(text)
    return ITEM_ALIASES[m.group(1).lower()] if m else None


def parse_request(request_id: str, text: str, arrived: str) -> Task:
    body = _PREFIX.sub("", text or "").strip()
    base = dict(request=request_id, text=body, arrived=arrived)
    room = _room(body)

    if _LOST.search(body):
        after = body[_LOST.search(body).end():]
        hint = _HINT.search(after)
        g = _GUEST.match(body)
        item = _item(after)
        if item:
            return Task(
                kind=Kind.LOST_ITEM, room=room, item=item,
                guest=g.group(1) if g else None,
                area_hint=hint.group(1).strip() if hint else None, **base,
            )
    if _TRAY.search(body) and room:
        return Task(kind=Kind.TRAY, room=room, item=f"tray-{room[5:]}", **base)
    m = _MESSAGE.match(body)
    if m:
        return Task(kind=Kind.MESSAGE, room=f"room-{m.group(1)}", message=m.group(2), **base)
    if room and _CHECK.search(body) and _CHECK_VERB.search(body):
        return Task(kind=Kind.ROOM_CHECK, room=room, **base)
    item = _item(body)
    if room and item:
        # count only from words outside the room number
        return Task(kind=Kind.AMENITY, room=room, item=item, count=_count(body), **base)
    return Task(kind=Kind.UNKNOWN, room=room, **base)
