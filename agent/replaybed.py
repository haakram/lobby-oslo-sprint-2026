"""Replay bed: rebuild a real live night from its run log so the offline fake can replay it.

A run log (``docs/ARCHITECTURE.md`` § 4.3, run log v1) records every call the agent made and
every reply the live server gave. From one night's log ``reconstruct`` recovers what the server's
world must have been: every request with its arrival clock and exact text (the manager's skips and
the desk's forwarded calls too), the hotel graph and metres (the seed-1 base map re-roomed and
re-measured from every ``look`` and ``move``), the stock on the shelves, the Do Not Disturb rooms,
the empty and occupied rooms, the guests and their rooms, the lost items and where a scan found
them, the wet spots and when they were first met, the corridors closed off for cleaning and when,
the noisy rooms behind each complaint, the man in the bathrobe. What the log never revealed (a lost
item never found, a spill spot never seen) is modelled as the fake does today and listed in
``Scenario.flags``.

``fit_scoring`` fits the fake's per-kind reward (base, decay per minute of wait, false-done penalty)
on every served request of every log; ``run_replays`` replays nights with the current agent (or an
exported older commit's agent, for the fidelity check) in parallel processes.

    python -m agent replaybench --seeds 16,10          # the longest log of each seed
    python -m agent replaybench --nights all --fit      # every real night, refit the scoring first
    python -m agent replaybench --seeds 16 --code <dir> # an older agent export against the same night
"""

from __future__ import annotations

import collections
import glob
import json
import math
import os
import re
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass, field
from pathlib import Path

from agent.world import DEFAULT_MAP, clock_to_seconds

REPO = Path(__file__).resolve().parent.parent
SCORING_FILE = Path(__file__).parent / "data" / "replay_scoring.json"
# Where the team's live logs live: this checkout, the main checkout and every sibling worktree.
DEFAULT_LOG_GLOBS = [
    str(REPO / "temp" / "runs" / "w2-*.jsonl"),
    str(REPO.parent / "Oslo_Sprint_26" / "temp" / "runs" / "w2-*.jsonl"),
    str(REPO.parent / "oslo-wt" / "*" / "temp" / "runs" / "w2-*.jsonl"),
]
START_CLOCK = "22:00:00"
END_CLOCK = "06:00:00"
MANAGER = "night manager"
# [obs] every live map so far: the same corridors, each with this many rooms, numbered from a per-floor
# base (101/121/131, 201, 301/311/321) in corridor order.
ROOM_SLOTS = {1: [("corridor-1a", 3), ("corridor-1b", 3), ("corridor-1c", 2)],
              2: [("corridor-2a", 3), ("corridor-2b", 4), ("corridor-2c", 3), ("corridor-2d", 4)],
              3: [("corridor-3a", 3), ("corridor-3b", 4), ("corridor-3c", 3), ("corridor-3d", 4)]}
NOTE_OBJECTS = {"note", "staff-note", "sticky-note", "manual"}
LOST_BASES = ("glasses", "toy", "wallet", "phone", "keys", "scarf", "watch", "book")
HINT_PLACES = [  # [obs] hint text -> the place scans found the item most often
    ("ground floor corridor", "corridor-1b"), ("lobby bar", "lobby-bar"), ("kitchen pass", "kitchen-pass"),
    ("near the kitchen", "kitchen-pass"), ("front desk", "front-desk"), ("laundry", "laundry"),
    ("lobby", "lobby"), ("storage", "storage"), ("staff room", "staff-room"),
]
_MUSIC = re.compile(r"behind the door of (room-\d+)")
_OPENS = re.compile(r"^((?:Mr|Ms|Mx|Dr|Mrs|Miss|Prof)\.? [^\s].*?) opens the door of (room-\d+)")
_IS_IN = re.compile(r"^(.+?) is in (room-\d+)\.")
_AT_DOOR = re.compile(r"at the door of (room-\d+)")
_SKIP = re.compile(r"^Skip (R-\d+)\b")
_ELEV_ROOM = re.compile(r"next to the elevator\? For (R-\d+) that's (\d{3})")
_LOCKED_OUT = re.compile(r"locked out of (?:room[\s-]?)?(\d{3})")
_COUNT = re.compile(r"^(.*\S)\s+x(\d+)$")


def _hms(sec: int) -> str:
    sec = int(sec) % 86400
    return f"{sec // 3600:02d}:{sec % 3600 // 60:02d}:{sec % 60:02d}"


def _floor_of(room: str) -> int | None:
    m = re.search(r"(\d)\d\d$", room)
    return int(m[1]) if m else None


# --- loading -------------------------------------------------------------------------------------------


@dataclass
class Night:
    shift: str
    seed: int | None
    paths: list[str]
    events: list[dict]  # every log line, wall-clock order, duplicates dropped
    requests: int = 0  # distinct request ids the manager sent (skips and forwarded calls not counted)
    live_score: int | None = None  # the `end` line's score, else the last score the server reported
    live_served: int | None = None
    ended: bool = False  # the server ended it at 06:00 (a full night)
    reason: str = ""
    last_clock: str = START_CLOCK
    calls: int = 0
    agent_played: bool = False  # the agent ran tasks (not a hand-driven probe)
    scores: dict = field(default_factory=dict)  # clock -> score, every status reply (for partial nights)


def find_logs(extra: list[str] | None = None) -> dict[str, list[str]]:
    """Shift id -> every file that holds (part of) that shift's log, from the default places and
    `extra` globs/dirs/files."""
    paths: list[str] = []
    for pattern in DEFAULT_LOG_GLOBS + list(extra or []):
        p = Path(pattern)
        if p.is_dir():
            paths += glob.glob(str(p / "*.jsonl"))
        else:
            paths += glob.glob(pattern)
    by_shift: dict[str, list[str]] = collections.defaultdict(list)
    for path in sorted(set(paths)):
        name = Path(path).name
        if not name.startswith("w2-"):
            continue
        by_shift[name.removesuffix(".jsonl")].append(path)
    return dict(by_shift)


def load_night(shift: str, paths: list[str]) -> Night:
    """All copies of one shift's log merged (a continuation played on with --adopt lives in another
    worktree's copy), sorted by wall clock, identical lines dropped."""
    seen: set[str] = set()
    rows: list[tuple[float, int, dict]] = []
    for path in paths:
        with open(path, encoding="utf-8") as fh:
            for i, line in enumerate(fh):
                line = line.strip()
                if not line or line in seen:
                    continue
                seen.add(line)
                try:
                    e = json.loads(line)
                except ValueError:
                    continue
                rows.append((float(e.get("t") or 0), i, e))
    rows.sort(key=lambda r: (r[0], r[1]))
    night = Night(shift=shift, seed=None, paths=list(paths), events=[e for _, _, e in rows])
    rids: set[str] = set()
    last_score = None
    for e in night.events:
        t = e.get("type")
        if t == "start":
            night.seed = e.get("seed") if night.seed is None else night.seed
        elif t == "call":
            night.calls += 1
            if e.get("clock"):
                night.last_clock = e["clock"]
            r = e.get("result")
            if e.get("cmd") == "inbox" and isinstance(r, dict):
                for m in r.get("messages") or []:
                    if isinstance(m, dict) and isinstance(m.get("request"), str) and MANAGER in str(m.get("from")) \
                            and not _SKIP.match(str(m.get("text", ""))):
                        rids.add(m["request"])
            if isinstance(r, dict) and isinstance(r.get("score"), int):
                last_score = r["score"]
                if e.get("clock"):
                    night.scores[e["clock"]] = last_score
        elif t == "decision" and e.get("kind") in ("task_start", "task_done"):
            night.agent_played = True
        elif t == "end":
            night.ended = str(e.get("reason", "")).startswith("server ended")
            night.reason = str(e.get("reason", ""))
            if e.get("score") is not None:
                night.live_score = e["score"]
                night.live_served = e.get("requests_served")
    night.requests = len(rids)
    if night.live_score is None:
        night.live_score = last_score
    return night


def load_nights(extra: list[str] | None = None, *, min_requests: int = 1) -> list[Night]:
    """Every real night with at least `min_requests` requests, one per shift id, oldest first."""
    nights = [load_night(shift, paths) for shift, paths in find_logs(extra).items()]
    nights = [n for n in nights if n.requests >= min_requests]
    nights.sort(key=lambda n: (n.seed or 0, -n.calls, n.shift))
    return nights


def longest_per_seed(nights: list[Night]) -> list[Night]:
    best: dict[int, Night] = {}
    for n in nights:
        key = n.seed or -1
        if key not in best or (n.requests, n.calls) > (best[key].requests, best[key].calls):
            best[key] = n
    return [best[k] for k in sorted(best)]


# --- reconstruction --------------------------------------------------------------------------------------


@dataclass
class Scenario:
    """FakeWybe's world for one real night (JSON-able; `fake_kwargs` turns it into constructor args)."""

    shift: str
    seed: int | None
    requests: list[list]  # [clock, rid, text, sender]
    hotel: dict
    dnd_rooms: list[str]
    absent_rooms: list[str]
    untidy_rooms: list[str]
    guests: dict[str, str]
    hidden: dict[str, list]  # item -> [place, clock available]
    wet_spots: list[list]  # [clock, place]
    spill_spots: dict[str, str]  # request id -> the spot its sign must cover
    blocked: list[list]  # [a, b, from clock, to clock or None]
    people: list[list]  # [clock, place, text]
    noise_sources: dict[str, str | None]
    elevator_rooms: dict[str, str]  # floor -> room "next to the elevator"
    end_clock: str
    flags: list[str] = field(default_factory=list)
    live: dict = field(default_factory=dict)

    def to_json(self) -> str:
        return json.dumps(asdict(self), indent=1, sort_keys=True)

    @classmethod
    def from_json(cls, text: str) -> Scenario:
        return cls(**json.loads(text))

    def fake_kwargs(self, scoring: dict | None = None) -> dict:
        return {
            "requests": [tuple(r) for r in self.requests], "hotel": self.hotel,
            "dnd_rooms": set(self.dnd_rooms), "absent_rooms": set(self.absent_rooms),
            "untidy_rooms": set(self.untidy_rooms), "guests": dict(self.guests),
            "hidden": {k: tuple(v) for k, v in self.hidden.items()}, "wet": set(),
            "wet_spots": [tuple(w) for w in self.wet_spots], "spill_spots": dict(self.spill_spots),
            "blocked_edges": [tuple(b) for b in self.blocked], "people_events": [tuple(p) for p in self.people],
            "noise_sources": dict(self.noise_sources), "elevator_rooms": {int(k): v for k, v in self.elevator_rooms.items()},
            "end_clock": self.end_clock, "live_names": True, "scoring": scoring,
        }


def _parse_objects(objects: list) -> dict[str, int]:
    out: dict[str, int] = {}
    for obj in objects or []:
        if not isinstance(obj, str):
            continue
        m = _COUNT.match(obj.strip())
        name, n = (m[1], int(m[2])) if m else (obj.strip(), 1)
        out[name] = out.get(name, 0) + n
    return out


def _room_bases(rooms_by_floor: dict[int, set[int]], flags: list[str]) -> dict[int, int]:
    """The first room number of each floor: from the rooms seen or named, else seed 1's."""
    seed1 = {1: 101, 2: 201, 3: 311}
    bases: dict[int, int] = {}
    for floor, slots in ROOM_SLOTS.items():
        count = sum(n for _, n in slots)
        nums = sorted(rooms_by_floor.get(floor, set()))
        if not nums:
            bases[floor] = seed1[floor]
            flags.append(f"floor {floor}: no room seen or named; seed-1 numbering ({seed1[floor]}..) assumed")
            continue
        fits = [b for b in range(floor * 100 + 1, floor * 100 + 100, 10) if b <= nums[0] and nums[-1] < b + count]
        if not fits:
            bases[floor] = seed1[floor]
            flags.append(f"floor {floor}: rooms {nums} fit no known numbering; seed-1 numbering assumed")
            continue
        bases[floor] = fits[-1] if seed1[floor] not in fits else seed1[floor]
        if len(fits) > 1:
            flags.append(f"floor {floor}: rooms {nums} fit several numberings {fits}; {bases[floor]} assumed")
    return bases


def _hint_place(text: str) -> str | None:
    low = text.lower()
    for phrase, place in HINT_PLACES:
        if phrase in low:
            return place
    return None


def _lost_base(text: str) -> str:
    low = text.lower()
    for base in LOST_BASES:
        if re.search(rf"\b{base}\b", low):
            return base
    return "glasses"


def reconstruct(night: Night, *, end_clock: str = END_CLOCK) -> Scenario:  # noqa: C901 - one pass over the log
    flags: list[str] = []
    base = json.loads(Path(DEFAULT_MAP).read_text())
    seed1_rooms: dict[str, list[tuple[str, dict]]] = collections.defaultdict(list)  # corridor -> [(room, edge)]
    for e in base["edges"]:
        if e["b"].startswith("room-"):
            seed1_rooms[e["a"]].append((e["b"], e))
    for corridor in seed1_rooms:
        seed1_rooms[corridor].sort()

    # pass 1: walk the log
    messages: dict[tuple[str, str], list] = {}  # (rid, text) -> [clock, rid, text, sender]
    order: list[tuple[str, str]] = []
    corridor_rooms: dict[str, list[str]] = {}  # corridor -> rooms listed by an authoritative look
    exits: dict[tuple[str, str], dict] = {}  # (a, b) -> {"m", "door"}
    move_metres: dict[tuple[str, str], int] = {}
    first_look_objects: dict[str, dict[str, int]] = {}
    untidy: set[str] = set()
    dnd: set[str] = set()
    no_answer: set[str] = set()
    guests: dict[str, str] = {}
    scan_found: list[tuple[str, str, str]] = []  # (clock, place, item)
    wet_first: dict[str, str] = {}  # place -> first clock seen wet
    sign_places: list[tuple[str, str, str]] = []  # (clock, place, result text)
    blocked_seen: dict[tuple[str, str], list[str]] = collections.defaultdict(list)  # edge -> clocks blocked
    open_seen: dict[tuple[str, str], list[str]] = collections.defaultdict(list)  # edge -> clocks listed open
    people: dict[tuple[str, str, str], None] = {}
    music: list[tuple[str, str, str]] = []  # (clock, corridor, room)
    elev_rooms: dict[int, str] = {}
    reports: dict[str, tuple[str, str, int | None]] = {}  # rid -> (outcome, reply, score delta)
    loc = base.get("special", {}).get("dock", "charging-dock")
    clk = START_CLOCK
    last_score: int | None = None
    pending_report: tuple[str, str, str, int] | None = None
    pending_sign: tuple[str, str] | None = None
    sign_results: dict[str, tuple[str, str]] = {}  # rid -> (sign place, report reply)
    last_place_sign: tuple[str, str] | None = None
    asked_floor: dict[str, int] = {}

    def wet(place: str, when: str) -> None:
        if place and place not in wet_first:
            wet_first[place] = when

    for e in night.events:
        if e.get("type") != "call":
            continue
        cmd, args, r, ok = e.get("cmd"), e.get("args") or {}, e.get("result"), e.get("ok")
        if e.get("clock"):
            clk = e["clock"]
        for ev in e.get("events") or []:
            if ev.get("type") == "slip" and cmd in ("move", "navigate") and isinstance(r, dict):
                wet(r.get("at"), clk)
            if ev.get("type") == "person":
                where = r.get("at") if isinstance(r, dict) and r.get("at") else loc
                people[(clk, where, str(ev.get("text")))] = None
        if cmd == "inbox" and isinstance(r, dict):
            for m in r.get("messages") or []:
                if not isinstance(m, dict) or not m.get("request"):
                    continue
                key = (m["request"], str(m.get("text", "")))
                if key not in messages:
                    messages[key] = [m.get("at") or clk, m["request"], re.sub(r"^R-\d+: ", "", key[1]),
                                     str(m.get("from") or MANAGER)]
                    order.append(key)
        if isinstance(r, dict) and isinstance(r.get("score"), int):
            if pending_report is not None and last_score is not None:
                rid, outcome, reply, before = pending_report
                reports[rid] = (outcome, reply, r["score"] - before)
                pending_report = None
            last_score = r["score"]
        if cmd == "report" and ok and last_score is not None:
            pending_report = (str(args.get("request")), str(args.get("outcome")), str(r)[:14], last_score)
            if args.get("outcome") == "done" and last_place_sign is not None:
                sign_results[str(args.get("request"))] = (last_place_sign[1], str(r)[:14])
                last_place_sign = None
        if cmd in ("move", "navigate") and ok and isinstance(r, dict) and r.get("at"):
            if cmd == "move" and isinstance(r.get("metres"), int | float) and r["metres"] > 0:
                move_metres[(loc, r["at"])] = int(r["metres"])
            if "slipped" in str(r.get("notice", "")):
                wet(r["at"], clk)
            loc = r["at"]
        if cmd == "move" and not ok and "Closed off" in str(r) and args.get("to"):
            blocked_seen[tuple(sorted((loc, str(args["to"]))))].append(clk)
        if cmd == "look" and ok and isinstance(r, dict):
            if "sign" in r and "door" in r:
                if str(r.get("sign", "none")).lower() != "none":
                    dnd.add(str(r["door"]))
                continue
            here = r.get("location")
            if not here:
                continue
            loc = here
            desc = str(r.get("description") or "")
            if "wet patch" in desc:
                wet(here, clk)
            if m := _MUSIC.search(desc):
                music.append((clk, here, m[1]))
            if here.startswith("room-"):
                if "unmade" in desc or "towels on the floor" in desc:
                    untidy.add(here)
                if "Nobody is here" in desc:
                    no_answer.add(here)
            rooms_here = []
            for x in r.get("exits", []):
                to = x.get("to")
                if not to:
                    continue
                if to.startswith("room-"):
                    rooms_here.append(to)
                exits[(here, to)] = {"m": x.get("metres"), "door": "door" in x}
                key = tuple(sorted((here, to)))
                if x.get("blocked"):
                    blocked_seen[key].append(clk)
                else:
                    open_seen[key].append(clk)
                if "wet" in str(x.get("warning", "")).lower():
                    wet(to, clk)
            if rooms_here and not here.startswith("room-"):
                corridor_rooms[here] = sorted(rooms_here)
            for p in r.get("people") or []:
                if isinstance(p, dict) and p.get("who") == "guest" and (m := _AT_DOOR.search(str(p.get("state")))):
                    guests[str(p.get("name"))] = m[1]
            if here not in first_look_objects and not here.startswith("room-"):
                first_look_objects[here] = _parse_objects(r.get("objects") or [])
        if cmd == "knock" and ok and isinstance(r, str):
            door = str(args.get("door"))
            if "Do Not Disturb" in r:
                dnd.add(door)
            elif r.startswith("No answer"):
                no_answer.add(door)
            elif m := _OPENS.match(r):
                guests[m[1]] = m[2]
        if cmd == "ask" and ok and isinstance(r, dict):
            answer = str(r.get("answer") or "")
            if m := _IS_IN.match(answer):
                guests[m[1]] = m[2]
            if m := _ELEV_ROOM.search(answer):
                floor = asked_floor.get(m[1]) or _floor_of(m[2])
                if floor:
                    elev_rooms[floor] = f"room-{m[2]}"
        if cmd == "scan" and ok and isinstance(r, dict):
            for item in r.get("found") or []:
                scan_found.append((clk, loc, str(item)))
        if cmd == "place" and args.get("item") == "wet-floor-sign":
            target = str(args.get("where") or loc)
            sign_places.append((clk, target, str(r)))
            if ok:
                last_place_sign = (clk, target)
        if cmd == "use" and ok and args.get("item") == "keycard" and args.get("on"):
            pass

    # requests, in arrival order
    requests: list[list] = []
    rids_seen: set[str] = set()
    for key in sorted(order, key=lambda k: (clock_to_seconds(messages[k][0]), k[0])):
        clock, rid, text, sender = messages[key]
        if MANAGER in sender and not _SKIP.match(text):
            if rid in rids_seen:
                continue
            rids_seen.add(rid)
            if m := re.search(r"next to the elevator on floor (\d)", text):
                asked_floor[rid] = int(m[1])
        requests.append([clock, rid, text, sender])
    if not requests:
        flags.append("no requests in the log")

    # the hotel: seed-1 base, re-roomed and re-measured
    rooms_by_floor: dict[int, set[int]] = collections.defaultdict(set)
    for rooms in corridor_rooms.values():
        for room in rooms:
            if (f := _floor_of(room)) is not None:
                rooms_by_floor[f].add(int(room[-3:]))
    for _, _, text, sender in requests:
        if MANAGER in sender:
            for num in re.findall(r"\b([1-3]\d\d)\b", text):
                rooms_by_floor[int(num[0])].add(int(num))
    for room in list(guests.values()) + list(dnd) + list(no_answer):
        if (f := _floor_of(room)) is not None:
            rooms_by_floor[f].add(int(room[-3:]))
    bases = _room_bases(rooms_by_floor, flags)
    nodes = {n: dict(v) for n, v in base["nodes"].items() if v["kind"] != "room"}
    edges = [dict(e) for e in base["edges"] if not (e["a"].startswith("room-") or e["b"].startswith("room-"))]
    room_slots: dict[str, list[str]] = {}
    for floor, slots in ROOM_SLOTS.items():
        n = bases[floor]
        for corridor, count in slots:
            room_slots[corridor] = [f"room-{n + i}" for i in range(count)]
            n += count
    looked = set(corridor_rooms)
    for corridor, slot_rooms in room_slots.items():
        actual = corridor_rooms.get(corridor, slot_rooms)
        if corridor not in looked:
            flags.append(f"{corridor} never looked at: rooms {actual[0][5:]}-{actual[-1][5:]} assumed from the numbering")
        for i, room in enumerate(actual):
            template_room, template_edge = seed1_rooms[corridor][min(i, len(seed1_rooms[corridor]) - 1)]
            nodes[room] = dict(base["nodes"][template_room])
            m = exits.get((corridor, room), {}).get("m") or exits.get((room, corridor), {}).get("m") \
                or move_metres.get((corridor, room)) or template_edge["m"]
            edges.append({"a": corridor, "b": room, "m": int(m), "door": True})
    for e in edges:
        if e["a"].startswith("room-") or e["b"].startswith("room-"):
            continue
        seen = exits.get((e["a"], e["b"]), {}).get("m") or exits.get((e["b"], e["a"]), {}).get("m") \
            or move_metres.get((e["a"], e["b"])) or move_metres.get((e["b"], e["a"]))
        if seen:
            e["m"] = int(seen)
    unmeasured = [f"{e['a']}-{e['b']}" for e in edges if not e["a"].startswith("room-") and not e["b"].startswith("room-")
                  and not e.get("stairs") and not (exits.get((e["a"], e["b"])) or exits.get((e["b"], e["a"]))
                                                   or move_metres.get((e["a"], e["b"])) or move_metres.get((e["b"], e["a"])))]
    if unmeasured:
        flags.append(f"{len(unmeasured)} corridor edges never measured, seed-1 metres kept: {', '.join(unmeasured[:6])}"
                     + (" ..." if len(unmeasured) > 6 else ""))
    for (a, b), x in exits.items():
        if a not in nodes or b not in nodes:
            missing = b if b not in nodes else a
            nodes[missing] = {"floor": nodes.get(a, nodes.get(b, {})).get("floor", 1), "kind": "place", "x": 0.0, "z": 0.0}
            edges.append({"a": a, "b": b, "m": int(x.get("m") or 5), "door": bool(x.get("door"))})
            flags.append(f"unknown place {missing} seen from {a}: added as a plain place")
    stock_places = {p for p, items in base.get("stock", {}).items()}
    stock: dict[str, dict[str, int]] = {}
    seen_items: set[str] = set()
    for place, objects in first_look_objects.items():
        items = {k: v for k, v in objects.items() if k not in NOTE_OBJECTS and not k.startswith(("tray-", "luggage-", "bags-"))}
        if place in stock_places or items:
            stock[place] = items
            seen_items.update(items)
    for place in stock_places:
        if place not in first_look_objects:
            kept = {k: v for k, v in base["stock"][place].items() if k not in seen_items}
            if kept:
                stock[place] = kept
                flags.append(f"{place} never looked at: seed-1 stock assumed ({', '.join(kept)})")
    hotel = {"nodes": nodes, "edges": edges, "stock": stock, "special": dict(base.get("special", {}))}

    # rooms and guests
    guest_rooms = set(guests.values())
    absent = {r for r in no_answer if r not in dnd and r not in guest_rooms}
    for _, rid, text, sender in requests:
        if MANAGER in sender and (m := re.search(r"\b(?:up to|Check if) (\d{3})\b", text)):
            room = f"room-{m[1]}"
            if room in nodes and room not in dnd and room not in guest_rooms and room not in absent:
                absent.add(room)
                flags.append(f"{room}: empty assumed (a room check or bags request says so; never knocked)")

    # lost items: the Nth request for an item is item-N; where the scan found it, else the hint
    hidden: dict[str, list] = {}
    counts: dict[str, int] = collections.Counter()
    found_by_name = {item: (c, p) for c, p, item in scan_found}
    for clock, rid, text, sender in requests:
        if MANAGER not in sender or " lost " not in f" {text} ":
            continue
        base_item = _lost_base(text)
        counts[base_item] += 1
        name = base_item if counts[base_item] == 1 else f"{base_item}-{counts[base_item]}"
        if name in found_by_name:
            hidden[name] = [found_by_name[name][1], clock]
        else:
            place = _hint_place(text) or "lobby"
            hidden[name] = [place, clock]
            flags.append(f"{rid} {name}: never found by a scan; hidden at the hint ({place})")
    for item, (c, p) in found_by_name.items():
        if item not in hidden:
            hidden[item] = [p, START_CLOCK]
            flags.append(f"{item} found at {p} ({c}) without a matching request; hidden there from the start")

    # wet spots and the spill requests' own spots
    spill_spots: dict[str, str] = {}
    claimed: set[str] = set()
    corridors_by_floor = {f: [c for c, _ in slots] for f, slots in ROOM_SLOTS.items()}
    for clock, rid, text, sender in requests:
        m = re.search(r"spill on floor (\d)", text)
        if MANAGER not in sender or not m:
            continue
        floor = int(m[1])
        arrived = clock_to_seconds(clock)
        verified = sign_results.get(rid)
        spot = None
        if verified and verified[1] == "Noted. Thanks." and reports.get(rid, ("", "", 0))[2] and reports[rid][2] > 0:
            spot = verified[0]
        else:
            later = sorted((clock_to_seconds(c), p) for p, c in wet_first.items()
                           if p not in claimed and nodes.get(p, {}).get("floor") == floor and clock_to_seconds(c) >= arrived)
            if later and later[0][0] - arrived <= 90 * 60:
                spot = later[0][1]
        if spot is None:
            free = [c for c in corridors_by_floor[floor] if c not in claimed and c not in wet_first]
            spot = (free or corridors_by_floor[floor])[0]
            flags.append(f"{rid} spill on floor {floor}: its spot was never seen; {spot} assumed")
        spill_spots[rid] = spot
        claimed.add(spot)
    wet_spots = [[c, p] for p, c in sorted(wet_first.items(), key=lambda kv: clock_to_seconds(kv[1])) if p not in claimed]

    # corridors closed off for cleaning
    blocked: list[list] = []
    for (a, b), clocks in blocked_seen.items():
        first = min(clocks, key=clock_to_seconds)
        last = max(clocks, key=clock_to_seconds)
        reopened = sorted((c for c in open_seen.get((a, b), []) if clock_to_seconds(c) > clock_to_seconds(last)), key=clock_to_seconds)
        blocked.append([a, b, first, reopened[0] if reopened else None])
        if not reopened:
            flags.append(f"{a}-{b} closed off from {first} (first seen) to the end: never seen open again")

    # noise: the complaint's source room
    noise_sources: dict[str, str | None] = {}
    for clock, rid, text, sender in requests:
        m = re.search(r"noise near (\d{3})", text)
        if MANAGER not in sender or not m:
            continue
        room = f"room-{m[1]}"
        corridor = next((c for c, rooms in room_slots.items() if room in (corridor_rooms.get(c) or rooms)), None)
        arrived = clock_to_seconds(clock)
        later = [(clock_to_seconds(c), src) for c, at, src in music if at == corridor and clock_to_seconds(c) >= arrived]
        if later:
            noise_sources[room] = min(later)[1]
        else:
            flags.append(f"{rid} noise near {room}: the noisy room was never seen; the fake's default (next room) used")

    for floor in (1, 2, 3):
        if floor not in elev_rooms:
            elev_rooms[floor] = room_slots[f"corridor-{floor}a"][0]
    people_list = sorted(([c, p, t] for (c, p, t) in people), key=lambda x: clock_to_seconds(x[0]))

    return Scenario(
        shift=night.shift, seed=night.seed, requests=requests, hotel=hotel, dnd_rooms=sorted(dnd),
        absent_rooms=sorted(absent), untidy_rooms=sorted(untidy), guests=guests, hidden=hidden,
        wet_spots=wet_spots, spill_spots=spill_spots, blocked=blocked, people=people_list,
        noise_sources=noise_sources, elevator_rooms={str(k): v for k, v in sorted(elev_rooms.items())},
        end_clock=end_clock, flags=flags,
        live={"score": night.live_score, "served": night.live_served, "calls": night.calls,
              "last_clock": night.last_clock, "ended": night.ended, "reason": night.reason,
              "requests": night.requests, "agent_played": night.agent_played,
              "reports": {rid: list(v) for rid, v in reports.items()}},
    )


# --- scoring fit -------------------------------------------------------------------------------------------

GROWTH_PER_HOUR = 0.08  # [obs] +8 %/h on every kind (free fits: 0.06-0.09)
REPORT_KINDS = ("room_check", "spill")  # [obs] credited on the report, no separate +5
FALSE_DONE_SEEN = {"amenity": 20, "followup": 20, "tray": 30, "spill": 30, "bags": 35, "lost_item": 40}  # [obs]


def _lstsq(rows: list[list[float]], y: list[float]) -> list[float]:
    n = len(rows[0])
    a = [[sum(r[i] * r[j] for r in rows) for j in range(n)] for i in range(n)]
    b = [sum(r[i] * v for r, v in zip(rows, y, strict=True)) for i in range(n)]
    for i in range(n):
        p = max(range(i, n), key=lambda k: abs(a[k][i]))
        a[i], a[p], b[i], b[p] = a[p], a[i], b[p], b[i]
        if not a[i][i]:
            continue
        for k in range(n):
            if k != i:
                f = a[k][i] / a[i][i]
                a[k] = [x - f * z for x, z in zip(a[k], a[i], strict=True)]
                b[k] -= f * b[i]
    return [b[i] / a[i][i] if a[i][i] else 0.0 for i in range(n)]


def reward_samples(night: Night) -> list[tuple[str, float, float, int]]:
    """(kind, wait_min, hours since 22:00, points) for every request the live server rewarded:
    the flow's observed rise for delivered kinds, the report's rise for room checks and spills."""
    arrived: dict[str, int] = {}
    kinds: dict[str, str] = {}
    clk = START_CLOCK
    out: list[tuple[str, float, float, int]] = []
    last_score: int | None = None
    pending: tuple[str, int] | None = None
    for e in night.events:
        if e.get("type") == "decision":
            d, k = e.get("data") or {}, e.get("kind")
            if k == "request":
                kinds[d.get("request")] = d.get("kind")
            elif k == "task_done" and d.get("status") == "done" and d.get("request") in arrived:
                kind, pts = kinds.get(d["request"]), d.get("points")
                if kind and kind not in REPORT_KINDS and isinstance(pts, int) and pts > 0:
                    out.append((kind, (clock_to_seconds(clk) - arrived[d["request"]]) / 60,
                                (clock_to_seconds(clk) - clock_to_seconds(START_CLOCK)) / 3600, pts))
            continue
        if e.get("type") != "call":
            continue
        cmd, args, r = e.get("cmd"), e.get("args") or {}, e.get("result")
        if e.get("clock"):
            clk = e["clock"]
        if cmd == "inbox" and isinstance(r, dict):
            for m in r.get("messages") or []:
                if isinstance(m, dict) and m.get("request") and m["request"] not in arrived and MANAGER in str(m.get("from")):
                    arrived[m["request"]] = clock_to_seconds(m.get("at") or clk)
        if isinstance(r, dict) and isinstance(r.get("score"), int):
            if pending is not None and last_score is not None:
                rid, before = pending
                delta = r["score"] - before
                if delta > 0 and kinds.get(rid) in REPORT_KINDS and rid in arrived:
                    out.append((kinds[rid], (clock_to_seconds(clk) - arrived[rid]) / 60,
                                (clock_to_seconds(clk) - clock_to_seconds(START_CLOCK)) / 3600, delta))
                pending = None
            last_score = r["score"]
        if cmd == "report" and e.get("ok") and args.get("outcome") == "done" and last_score is not None \
                and str(r) == "Noted. Thanks.":
            pending = (str(args.get("request")), last_score)
    return out


def fit_scoring(nights: list[Night]) -> dict:
    """Per kind: points = round(base * (1 + 0.08 h) - decay * wait_min), floor 5, least squares on
    every rewarded request of every log; the false-done penalty per kind as observed live."""
    by: dict[str, list[tuple[float, float, int]]] = collections.defaultdict(list)
    for n in nights:
        for kind, wait, hour, pts in reward_samples(n):
            by[kind].append((wait, hour, pts))
    kinds: dict[str, dict] = {}
    for kind, rows in sorted(by.items()):
        if len(rows) < 4:
            continue
        x = [[1 + GROWTH_PER_HOUR * h, -w] for w, h, _ in rows]
        y = [float(p) for _, _, p in rows]
        b, d = _lstsq(x, y)
        d = max(0.0, d)
        res = [p - (b * (1 + GROWTH_PER_HOUR * h) - d * w) for w, h, p in rows]
        kinds[kind] = {"base": round(b, 2), "decay": round(d, 3), "n": len(rows),
                       "rmse": round(math.sqrt(sum(r * r for r in res) / len(res)), 2),
                       "false_done": FALSE_DONE_SEEN.get(kind, 30)}
    for kind, pen in FALSE_DONE_SEEN.items():
        kinds.setdefault(kind, {"base": 0, "decay": 0, "n": 0, "rmse": 0, "false_done": pen})
    return {"growth_per_hour": GROWTH_PER_HOUR, "min_points": 5, "verified_bonus": 5, "judgement_bonus": 5,
            "kinds": kinds, "fitted_on_nights": len(nights)}


def load_scoring(path: Path = SCORING_FILE) -> dict | None:
    try:
        return json.loads(Path(path).read_text())
    except (OSError, ValueError):
        return None


# --- replaying -------------------------------------------------------------------------------------------

# Runs in a child process with `agent` imported from `code_dir` (this checkout, or an export of an
# older commit for the fidelity check) and THIS checkout's fake loaded by file path, so an old agent
# plays against the reconstructed night. Reads a job JSON, writes a result JSON.
_WORKER = r'''
import importlib.util, json, sys
job = json.load(open(sys.argv[1]))
sys.path.insert(0, job["code_dir"])
import httpx
from agent.agent import run_shift, load_params
from agent.client import WybeClient
from agent.config import Settings
from pathlib import Path
spec = importlib.util.spec_from_file_location("replay_offline", job["offline_path"])
offline = importlib.util.module_from_spec(spec); spec.loader.exec_module(offline)
kw = job["fake_kwargs"]
kw["requests"] = [tuple(r) for r in kw["requests"]]
for k in ("dnd_rooms", "absent_rooms", "untidy_rooms", "wet"):
    kw[k] = set(kw[k])
kw["hidden"] = {k: tuple(v) for k, v in kw["hidden"].items()}
kw["wet_spots"] = [tuple(w) for w in kw["wet_spots"]]
kw["blocked_edges"] = [tuple(b) for b in kw["blocked_edges"]]
kw["people_events"] = [tuple(p) for p in kw["people_events"]]
kw["elevator_rooms"] = {int(k): v for k, v in kw["elevator_rooms"].items()}
fake = offline.FakeWybe(**kw)
settings = Settings(url="https://replay.invalid/", key="offline", anthropic_key=None, budget_usd=0.0, max_rps=1000.0,
                    final_armed=False, runs_dir=Path(job["runs_dir"]))
client = WybeClient(settings, transport=httpx.MockTransport(fake.handler), sleep=lambda s: None)
params = load_params()
try:
    kwargs = {"mode": "practice", "seed": job["seed"], "params": params, "sim_end": job["sim_end"]}
    if job.get("call_cap"):
        kwargs["call_cap"] = job["call_cap"]
    result = run_shift(client, **kwargs)
    out = {"score": result.get("score"), "calls": result.get("calls"), "at_cap": result.get("at_cap"),
           "served": result.get("requests_served"), "reason": result.get("reason"), "error": None}
except Exception as exc:
    out = {"score": fake.score, "calls": None, "at_cap": None, "served": None, "reason": "crashed", "error": f"{type(exc).__name__}: {exc}"[:200]}
outcomes = {}
for rid, o in fake.reports.items():
    outcomes[o] = outcomes.get(o, 0) + 1
out.update({"fake_score": fake.score, "reports": outcomes, "false_done": list(fake.false_done),
            "wrong_deliveries": len(fake.wrong_deliveries), "slips": fake.slips, "unsafe": list(fake.unsafe),
            "stranded": fake.stranded, "verified": sum(r.completed for r in fake._requests.values()),
            "end_clock": fake._clock()})
json.dump(out, open(sys.argv[2], "w"))
'''


@dataclass
class ReplayResult:
    shift: str
    seed: int | None
    live_score: int | None
    replay_score: int | None
    calls: int | None
    capped_score: int | None
    served: int | None
    reports: dict
    penalties: dict
    gap: float | None  # (replay - live) / |live|
    seconds: float
    error: str | None = None
    flags: int = 0
    end_clock: str = ""


def replay_night(scenario: Scenario, *, code_dir: Path | None = None, scoring: dict | None = None,
                 sim_end: str | None = None, call_cap: int = 0, runs_dir: Path | None = None,
                 python: str | None = None) -> ReplayResult:
    """One night in a child process; `code_dir` is the checkout whose `agent` package plays."""
    code_dir = Path(code_dir or REPO).resolve()
    runs_dir = Path(runs_dir or REPO / "temp" / "replay_runs")
    runs_dir.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="replay-") as tmp:
        job = Path(tmp) / "job.json"
        out = Path(tmp) / "out.json"
        worker = Path(tmp) / "worker.py"
        worker.write_text(_WORKER)
        job.write_text(json.dumps({
            "code_dir": str(code_dir), "offline_path": str(Path(__file__).parent / "offline.py"),
            "fake_kwargs": scenario.fake_kwargs(scoring), "seed": scenario.seed, "runs_dir": str(runs_dir),
            "sim_end": sim_end or scenario.end_clock, "call_cap": call_cap,
        }))
        env = dict(os.environ)
        env.pop("FINAL_ARMED", None)
        env["WYBE_NIGHTSHIFT_KEY"] = "offline"
        proc = subprocess.run([python or sys.executable, "-I", str(worker), str(job), str(out)],
                              cwd=str(code_dir), env=env, capture_output=True, text=True, timeout=1800, check=False)
        data = json.loads(out.read_text()) if out.exists() else {"error": (proc.stderr or proc.stdout)[-400:]}
    live = scenario.live.get("score")
    score = data.get("score")
    if score is None and data.get("fake_score") is not None:
        score = data["fake_score"]
    gap = None
    if isinstance(live, int | float) and live and isinstance(score, int | float):
        gap = (score - live) / abs(live)
    at_cap = data.get("at_cap")
    return ReplayResult(
        shift=scenario.shift, seed=scenario.seed, live_score=live, replay_score=score, calls=data.get("calls"),
        capped_score=(at_cap[0] if at_cap else score), served=data.get("verified"), reports=data.get("reports") or {},
        penalties={"false_done": len(data.get("false_done") or []), "slips": data.get("slips"),
                   "wrong": data.get("wrong_deliveries"), "unsafe": len(data.get("unsafe") or []),
                   "stranded": data.get("stranded")},
        gap=gap, seconds=round(time.monotonic() - started, 1), error=data.get("error"), flags=len(scenario.flags),
        end_clock=str(data.get("end_clock") or ""),
    )


def run_replays(scenarios: list[Scenario], *, parallel: int = 4, **kw) -> list[ReplayResult]:
    with ThreadPoolExecutor(max_workers=max(1, parallel)) as pool:
        return list(pool.map(lambda s: replay_night(s, **kw), scenarios))


def summarize(results: list[ReplayResult]) -> dict:
    gaps = sorted(r.gap for r in results if r.gap is not None)
    scores = [r.replay_score for r in results if isinstance(r.replay_score, int | float)]
    med = (gaps[len(gaps) // 2] if len(gaps) % 2 else (gaps[len(gaps) // 2 - 1] + gaps[len(gaps) // 2]) / 2) if gaps else None
    return {
        "nights": len(results), "mean": sum(scores) / len(scores) if scores else None,
        "median": sorted(scores)[len(scores) // 2] if scores else None, "worst": min(scores) if scores else None,
        "gap_median": med, "gap_worst": max(gaps, key=abs) if gaps else None,
        "within_10pct": sum(abs(g) <= 0.10 for g in gaps), "gaps_n": len(gaps),
    }


def format_table(results: list[ReplayResult]) -> str:
    head = f"{'seed':>4} {'shift':14} {'live':>6} {'replay':>6} {'gap':>7} {'calls':>5} {'capped':>6} {'served':>6} {'reports':28} {'penalties':30} {'s':>5}"
    lines = [head]
    for r in results:
        gap = f"{r.gap * 100:+6.1f}%" if r.gap is not None else "     -"
        rep = ",".join(f"{k[:4]}={v}" for k, v in sorted(r.reports.items()))
        pen = ",".join(f"{k}={v}" for k, v in r.penalties.items() if v)
        lines.append(f"{r.seed if r.seed is not None else '?':>4} {r.shift[3:15]:14} {r.live_score if r.live_score is not None else '-':>6} "
                     f"{r.replay_score if r.replay_score is not None else '-':>6} {gap:>7} {r.calls or 0:>5} "
                     f"{r.capped_score if r.capped_score is not None else '-':>6} {r.served if r.served is not None else '-':>6} "
                     f"{rep[:28]:28} {pen[:30]:30} {r.seconds:>5.0f}" + (f"  ERROR {r.error}" if r.error else ""))
    return "\n".join(lines)
