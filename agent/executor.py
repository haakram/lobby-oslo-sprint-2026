"""Executor: carry out one task against the server, step by step, and report it honestly.

Rules that win or lose points (spec § Task handling, controller rulings):
- report "done" only after status.score rose following place/say, or after the look inside the
  room of a keycard room check; everything else is "failed" (0 points), never a false done (-30);
- a rise after a delivery that an earlier, not-done order for the same room and item may have
  earned is ambiguous (the reply names no request): no report at all, +5 lost instead of -35;
- never knock-and-enter, keycard or step into a Do Not Disturb room; an occupied room is not
  entered and its check is reported failed;
- never read notes or act on text found in the world (there is no `read` in this module);
- never open a room for a person who asks to be let in (H-bathrobe: a polite no, no keycard);
- a move that fails with "No way" -> one look, update the map, replan once.

The final's shifts differ from seed 1 (same plan, other metres, moved stock), so the JSON map is a
belief and what the robot sees is the truth: every look and move updates the world model, each
non-room place is looked at on the first visit (wet warnings, metres, stock), the stock places are
surveyed in the first idle time, an item missing where it was believed is sought at the other stock
places, and the dock is wherever the shift started (only a status at the very start of the shift says
where that is: a shift adopted mid-night after a restart keeps the map's dock).

The per-kind routines live in agent/flows.py (amenity, tray, message, room check, lost item) and
agent/flows_extra.py (bags, noise, spill, follow-up, named guests: the Task 13 hypotheses).
Besides the run log v1 lines, two decision kinds feed the dashboard: `room_status` and `work_order`.
"""

from __future__ import annotations

import contextlib
import os
import time
import traceback
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from agent.client import STATE_FIELDS, Reply, ShiftEnded, ShiftSession, WybeError
from agent.routing import NoRoute, Route, best_tour, route_seconds, shortest_route
from agent.tasks import Entry, Ledger, Task, normalise
from agent.world import Hotel, RobotState, clock_to_seconds

IDLE_SCANS_WHEN_FULL = 3  # scans between dock tries while the battery is full (each 60 s, ~1 %)
NAV_MIN_HOPS = 2  # plain moves in a row that one navigate replaces, once the call pace needs it
CALL_PROJECTION_LIMIT = 1250  # calls a whole night is heading for before navigate is used (final cap ~1,320)
NIGHT_S = 8 * 3600
# Offline seeds 1-3: navigate on 2+ hop legs saves 170-220 calls a night for 10-35 points of slower
# walking; a night cut by the final's call cap loses 150-200 points of its last hour (live seeds 2, 4).
WET_LOOK_S = 10 * 60  # a corridor approach looked at longer ago than this is looked at again
# (live batch 5: 7 slips in 4 nights still, on patches younger than the 30 min window used before)
DEFAULT_EXPERIMENTS = ("spill_done", "sign_move")  # live seed 4: two spill reports verified (+43,
# +63) when the sign stood on the patch; the report, not the place, carries the credit (like a room
# check). sign_move: out of signs, the sign over the oldest verified spill is moved to the new patch
# (another team, 61 shifts: no score change 25 game-minutes after such a move; spills never dry).

IDLE_STEPS = 200  # dock+scan cycles per wait_for_request (~100 sim-s each); the loop calls again
IDLE_STATUS_EVERY = 10  # idle checks between fallback `status` polls (replies carry the inbox event)
STATUS_FRESH_S = 15.0  # a status is reused only with no call since and within the final's 20 s rule
NOTE_MAX = 300
LET_ME_IN = ("locked out", "let me in")
REFUSAL = "I'm sorry, I can't open rooms for guests. Please ask the front desk to check your ID."
PERSON_MEMORY_S = 600  # the same person event within 10 sim-minutes of hearing it is a repeat
GO_ATTEMPTS = 24  # route tries per go(): each first-visit look may change the map and replan
BATTERY_LOW = 25.0  # below this a trip waits for a charge ...
BATTERY_OK = 60.0  # ... up to this (or until a request arrives)
BATTERY_CRITICAL = 10.0  # below this the charge goes ahead even while work waits
DRAIN_PER_MIN = 0.9  # [obs] active battery drain, % per sim minute (413 live intervals)
DOCK_MARGIN = 5.0  # % kept on top of what the way to the dock drains
CHARGE_ROUNDS = 10
DOCK_RETRY_S = 600  # a dock found out of reach from a place is not tried from there for 10 sim-min
MOVE_REFUSALS_MAX = 3  # the same move refused this many times in a row: given up, its edge dropped
SHIFT_START = "22:00:00"  # the shift's start clock when the session does not report one
DOCK_LEARN_S = 120  # the dock is learnt only from a first status this close to the shift's start


@dataclass
class Outcome:
    request: str
    status: Literal["done", "failed", "declined", "skipped"]
    points: int
    note: str


class ActionFailed(Exception):
    """A step could not be carried out; the message is the reason given to the night manager."""


class OutOfStock(ActionFailed):
    """gather found the item at none of the stock places (nor, for a sign, as stock anywhere)."""


class Declined(ActionFailed):
    """The request is turned down for a true reason and reported `declined` (the server's third
    outcome besides done/failed; the fourth is cancelled). Live (scout, 5 of 5): a follow-up claim
    with no order on record reported declined scores +5; the same as failed scores 0, and as done -20."""


def night_seconds(clock: str) -> int:
    """Sim second of a night clock, after-midnight clocks counted past 24:00 (00:10 is after 23:50)."""
    s = clock_to_seconds(clock)
    return s + 24 * 3600 if s < 12 * 3600 else s


class _Replan:
    """_follow's answer when a look on the way changed the map: route again from here."""


REPLAN = _Replan()
# A move refused like this (live: "Closed off: a cleaning crew has blocked that corridor.") means
# that edge is closed for a while: route around it, never retry the same move.
CLOSED_OFF = ("closed off", "blocked", "cleaning")


class Executor:
    def __init__(
        self,
        session: ShiftSession,
        hotel: Hotel,
        state: RobotState,
        *,
        brain=None,
        max_scans: int = 6,
    ):
        self.session = session
        self.hotel = hotel
        self.state = state
        self.brain = brain
        self.max_scans = max_scans
        self.found: dict[str, str] = {}  # item revealed by a scan -> where it lies
        self.inbox_waiting = False  # an inbox event was seen; the shift loop clears it
        self.ledger = Ledger()  # every request of the shift (follow-ups, duplicates)
        self.queue: list[Task] = []  # the shift loop's pending tasks (a follow-up may run one early)
        self.read_inbox: Callable[[], None] | None = None
        # Every inbox message on a request already known (an answer, a skip, a follow-up), by request
        # id, as the shift loop's read finds it: the manager answers a `reply` this way (Task 9).
        self.answers: dict[str, list[str]] = {}
        self.checked_out: set[str] = set()  # rooms the manager's skip says checked out: nothing is done there
        # wet spot -> night second it was first seen wet (the map's own: the shift start); H-spill's
        # "old patch" is one first seen before the request's message arrived
        self.wet_first_seen: dict[str, int] = dict.fromkeys(hotel.wet_spots(), night_seconds(SHIFT_START))
        self.signs_placed: dict[str, str] = {}  # place -> the spill request its wet-floor sign serves, oldest first
        self.verified: set[str] = set()  # requests whose "done" report the server thanked for
        self.guest_rooms: dict[str, str | None] = {}  # H-named: the clerk is asked once per name
        self._logged: dict | None = None
        self._tentative: set[frozenset[str]] = set()
        self._refusing = False
        self._pleas: list[tuple[int | None, str]] = []  # Task 27: (sim second, place) of let-me-in pleas
        self._heard: dict[str, int | None] = {}  # person event text (normalised) -> sim second heard
        self._wet_reported: set[str] = set()
        self._calls = 0  # every server call; a cached status is valid only while this stands still
        self._status_cache: tuple[dict, int, float] | None = None  # result, call count, real time
        self._looked: set[str] = set()  # places looked at this shift (each non-room place once)
        self.looks: dict[str, dict] = {}  # the last look at each place
        self._stock_places = list(hotel.stock)  # the JSON's stock places: the survey's tour
        self._surveyed = False
        self._dock_known = False  # the dock is where the shift's first status finds the robot
        self._learnt_dock: str | None = None  # that place, when it overruled the map's dock ...
        self._map_dock: str | None = None  # ... which a refused dock there reverts to, once
        self._dock_reverted = False
        self._dock_out_of_reach: tuple[str, str, int] | None = None  # (from where, dock, sim second)
        self._refused_move: tuple[str, str, str] | None = None  # the last move, while it was refused
        self._refused_run = 0  # how many times in a row that same move was refused
        self._moves = 0
        self._in_go = 0
        self.cart_needed = False  # a tray or bags flow: never drop the cart to reach the stairs
        self.calls = 0  # commands sent; a look is "fresh" while nothing was sent after it
        self._look_call: dict[str, int] = {}
        # Score experiments (NS_EXPERIMENTS=a,b): a flow may claim "done" on a path the server has
        # not rewarded yet; the report's reply settles it. One unverified report ends the experiment
        # for the shift (a false done costs 35), a verified one keeps it on.
        names = [n.strip() for n in os.environ.get("NS_EXPERIMENTS", "").split(",") if n.strip()]
        self.experiments: dict[str, bool | None] = {n: None for n in names or DEFAULT_EXPERIMENTS}
        self._look_clock: dict[str, int] = {}  # place -> sim second of the last look there
        self._visited: set[str] = set()  # places the robot has stood in: navigate works only there
        self._exp_pending: str | None = None

    def experiment(self, name: str) -> bool:
        """True while the named experiment is switched on and not yet refuted this shift."""
        return name in self.experiments and self.experiments[name] is not False

    def exp_claim(self, name: str) -> None:
        """The task about to be reported done rides on this experiment."""
        self._exp_pending = name

    def stamp_wet(self) -> None:
        """Stamp each wet spot not stamped yet with the clock now: run before every call, that is the
        clock of the reply that showed it wet (an unreadable clock: the shift start, i.e. old)."""
        new = [s for s in self.hotel.wet_spots() if s not in self.wet_first_seen]
        if new:
            try:
                now = night_seconds(self.state.clock)
            except (AttributeError, TypeError, ValueError):
                now = night_seconds(SHIFT_START)
            self.wet_first_seen.update(dict.fromkeys(new, now))

    def movable_signs(self) -> list[str]:
        """Where our wet-floor signs stand over spills already reported done and verified, oldest
        first: what a new patch may take when storage is out. None while sign_move or spill_done is
        off (live the place never raises the score: without spill_done no done report is made)."""
        if not (self.experiment("sign_move") and self.experiment("spill_done")):
            return []
        return [place for place, rid in self.signs_placed.items() if rid in self.verified]

    # --- server calls --------------------------------------------------------------------------

    def cmd(self, name: str, **args) -> Reply:
        self.stamp_wet()  # spots the last reply showed wet: first seen at its clock
        self._calls += 1  # Task 18: the status cache
        self.calls += 1  # Task 19: fresh_look
        reply = self.session.cmd(name, **args)
        if reply.clock:
            self.state.clock = reply.clock
        for ev in reply.events:
            if ev.get("type") == "inbox":
                self.inbox_waiting = True
            elif ev.get("type") == "dock":
                self.state.docked = False
            elif ev.get("type") == "person":
                at = reply.result.get("at") if isinstance(reply.result, dict) else None
                self._person(str(ev.get("text", "")), at if isinstance(at, str) else None)
        return reply

    def log(self, decision: str, /, **data) -> None:
        self.session.log_decision(decision, data)

    def room_status(self, room: str, status: str, source: str, note: str) -> None:
        """Dashboard: klar | opptatt | ikke_forstyrr | ma_vaskes, from room_check | knock | door_sign."""
        self.log("room_status", room=room, status=status, source=source, note=note[:200])

    def work_order(self, kind: str, text: str, *, room: str | None = None, place: str | None = None,
                   request: str | None = None) -> None:
        """Dashboard: a fault handled or found; kind is stoy | sol | teknisk | gjesteklage | annet."""
        self.log("work_order", room=room, place=place, type=kind, text=text[:200], request=request)

    def _wet_seen(self, place: str) -> None:
        if place not in self._wet_reported:
            self._wet_reported.add(place)
            self.work_order("sol", f"Vått gulv ved {place}", place=place)

    def _repeat(self, text: str) -> bool:
        """True when the same words were heard within PERSON_MEMORY_S (a server repeating an event
        on later replies); otherwise remembers them as heard now."""
        key = normalise(text)
        try:
            now = clock_to_seconds(self.state.clock)
        except (ValueError, AttributeError):
            now = None
        if key in self._heard:
            then = self._heard[key]
            if now is None or then is None or 0 <= now - then < PERSON_MEMORY_S:
                return True
        self._heard[key] = now
        return False

    def pleaded_here(self) -> bool:
        """Task 27: a "locked out"/"let me in" person event at this place within PERSON_MEMORY_S."""
        try:
            now = clock_to_seconds(self.state.clock)
        except (ValueError, AttributeError):
            now = None
        return any(place == self.state.location and (now is None or then is None or 0 <= now - then < PERSON_MEMORY_S)
                   for then, place in self._pleas)

    def _person(self, text: str, place: str | None = None) -> None:
        """H-bathrobe: someone asks to be let in. Never a keycard; say no once, politely; don't follow.
        The same words again within 10 sim-minutes get no second answer; new words, or the same
        words much later, do."""
        repeat = self._repeat(text)
        if any(w in text.lower() for w in LET_ME_IN):
            try:
                then = clock_to_seconds(self.state.clock)
            except (ValueError, AttributeError):
                then = None
            self._pleas.append((then, place or self.state.location))
        self.log("person", text=text[:200], repeat=repeat)
        if repeat or self._refusing or not any(w in text.lower() for w in LET_ME_IN):
            return
        self._refusing = True
        try:
            before = self.score_now()
            self.cmd("say", text=REFUSAL)
            self.log("hypothesis", id="H-bathrobe", request=None, text=text[:200],
                     action="said a polite no; no keycard; did not follow",
                     score_before=before, score_after=self.score_now())
        finally:
            self._refusing = False

    def refresh(self) -> dict:
        """Free `status` -> state; logs a `state` line when something changed. Two refreshes with
        no call in between (and under STATUS_FRESH_S) share one status: nothing can have changed."""
        if self._status_cache is not None:
            cached, calls, at = self._status_cache
            if calls == self._calls and time.monotonic() - at < STATUS_FRESH_S:
                return cached
        reply = self.cmd("status")
        if not reply.ok or not isinstance(reply.result, dict):
            return {}
        self.state.update_from_status(reply.result)  # first: a bad reply must not get cached
        if isinstance(self.state.location, str):
            self._visited.add(self.state.location)
        self._learn_dock(reply.result.get("location"), reply.clock)
        self._status_cache = (reply.result, self._calls, time.monotonic())
        snap = {k: getattr(self.state, k) for k in STATE_FIELDS}
        snap = {k: list(v) if isinstance(v, list) else v for k, v in snap.items()}
        if snap != self._logged:
            self.session.log_state(snap)
            self._logged = snap
        return reply.result

    def score_now(self) -> int | None:
        score = self.refresh().get("score")
        return score if isinstance(score, int | float) else None

    def look(self) -> dict:
        reply = self.cmd("look")
        if not reply.ok or not isinstance(reply.result, dict):
            raise ActionFailed(f"look failed: {reply.result}")
        look = reply.result
        loc = look.get("location") if isinstance(look.get("location"), str) else self.state.location
        self.state.location = loc
        with contextlib.suppress(ValueError, AttributeError):
            self._look_clock[loc] = clock_to_seconds(self.state.clock)
        exits = [
            ex for ex in look.get("exits") or []
            if isinstance(ex, dict) and isinstance(ex.get("to"), str)
            and isinstance(ex.get("metres"), int | float)
        ]
        look = {**look, "exits": exits}
        known_nodes = set(self.hotel.nodes)
        lost = [e.b for e in self.hotel.neighbors(loc)] if exits else []
        self.hotel.update_from_look(loc, look, authoritative=True)
        seen = {ex["to"]: ex for ex in exits}
        lost = [b for b in lost if b not in seen]
        if lost and self._in_go:  # an old exit is gone: guess that a new neighbour bridges to it
            for to, ex in seen.items():
                if to not in known_nodes and self.hotel.nodes[to]["kind"] != "room":
                    for b in lost:
                        self._add_edge(to, b, float(ex["metres"]))
                        self._tentative.add(frozenset((to, b)))
        for ex in exits:
            if "wet" in str(ex.get("warning", "")).lower():
                self._wet_seen(ex["to"])
        self._tentative -= {frozenset((loc, ex["to"])) for ex in exits}  # a seen exit is real
        self._looked.add(loc)
        self.looks[loc] = look
        self._look_call[loc] = self.calls
        if lost or any(to not in known_nodes for to in seen):
            self.log("map_learnt", at=loc, lost=lost, new=sorted(set(seen) - known_nodes))
        return look

    def fresh_look(self) -> dict:
        """The look at this place if it was the last command sent (the first-visit look on
        arrival), else a new one. Not for door looks before a knock or keycard: those stay fresh."""
        loc = self.state.location
        if self._look_call.get(loc) == self.calls and loc in self.looks:
            return self.looks[loc]
        return self.look()

    # --- moving --------------------------------------------------------------------------------

    def move(self, to: str) -> Reply:
        here = self.state.location
        self._moves += 1
        reply = self.cmd("move", to=to)
        result = reply.result if isinstance(reply.result, dict) else {}
        if reply.ok:
            self.state.location = result.get("at", to) if isinstance(result.get("at"), str) else to
            self.state.docked = False
            self._visited.add(self.state.location)
            metres = result.get("metres")
            if isinstance(metres, int | float) and metres > 0:  # a ride reports 0: not an edge
                self.hotel.set_metres(here, self.state.location, float(metres))
            self._refused_move, self._refused_run = None, 0
        slipped = any(e.get("type") == "slip" for e in reply.events)
        if (slipped or "wet" in str(result.get("notice", "")).lower()) and here in self.hotel.nodes:
            self.hotel.mark_wet(here, to)
            self.log("wet_floor", edge=[here, to], slipped=slipped)
            self._wet_seen(to)
        if not reply.ok:
            self._move_refused(here, to, str(reply.result))
        return reply

    def _move_refused(self, here: str, to: str, text: str) -> None:
        """The same move refused MOVE_REFUSALS_MAX times in a row (no move worked in between):
        whatever loop keeps asking for it is broken out of (ActionFailed), and the edge is dropped
        from the map so no route plans it again. Live seed 3: one corridor closed for cleaning was
        tried 125 times until the battery died and the shift ended "stranded" (-200)."""
        key = (here, to, text)
        self._refused_run = self._refused_run + 1 if key == self._refused_move else 1
        self._refused_move = key
        if self._refused_run < MOVE_REFUSALS_MAX:
            return
        closed = self._close_edge(here, to, text)
        self.log("move_refused_repeatedly", at=here, to=to, times=self._refused_run, reason=text[:200],
                 edge_dropped=closed)
        raise ActionFailed(f"the move {here} -> {to} was refused {self._refused_run} times in a row: {text}")

    def _close_edge(self, a: str, b: str, text: str) -> bool:
        """Drop an edge the server refused, unless a room door or the robot itself (its battery,
        its cart) is the reason: those ways open again with a keycard, a charge or without the cart."""
        low = text.lower()
        if "battery" in low or "cart" in low or "room" in {
                self.hotel.nodes.get(n, {}).get("kind") for n in (a, b)}:
            return False
        self.hotel.forget_edge(a, b)
        return True

    def _close_refused(self) -> list[str] | None:
        """Drop the edge of the last refused move (if a move was refused since the last that
        worked); the edge as [from, to] when it was dropped."""
        if self._refused_move is None:
            return None
        here, to, text = self._refused_move
        return [here, to] if self._close_edge(here, to, text) else None

    def _route(self, dst: str) -> Route:
        return shortest_route(self.hotel, self.state.location, dst, with_cart=self.state.has_cart)

    def _follow(
        self, route: Route, interruptible: bool = False
    ) -> tuple[str, str | None, str] | _Replan | None:
        """Run the steps; None when all worked, REPLAN when a first-visit look changed the map on
        the way, else (where, target, server text) of the failure.
        Interruptible: stop at the next node once a message is waiting, so the request is planned
        from here; never between call_elevator and its ride (the 45 s call would be wasted)."""
        ride_pending = False
        steps = list(route.steps)
        i = 0
        while i < len(steps):
            step = steps[i]
            i += 1
            here = self.state.location
            if interruptible and self.inbox_waiting and not ride_pending:
                self.log("walk_interrupted", at=here, towards=route.path[-1] if route.path else None)
                return None
            if step.cmd == "move" and not ride_pending:
                leg = self._navigable_leg(here, steps, i - 1)
                if leg and self._navigate(leg):
                    i += len(leg) - 1
                    if self._look_on_arrival():
                        return REPLAN
                    continue
            if step.cmd == "call_elevator":
                reply = self.cmd("call_elevator", floor=step.args["floor"])
                if not reply.ok:
                    return here, None, str(reply.result)
                ride_pending = True
                continue
            to = step.args["to"]
            if self._stale_before_corridor(here, to):
                before = self.hotel.version
                try:  # wet patches appear all night: a fresh look (5 s) turns a slip into a creep
                    self.look()
                except ActionFailed as exc:
                    self.log("look_failed", at=here, reason=str(exc))
                if self.hotel.version != before:
                    return REPLAN
            reply = self.move(to)
            ride_pending = False
            if not reply.ok:
                return here, to, str(reply.result)
            if frozenset((here, to)) in self._tentative:  # a guessed edge held: learn it for real
                self._tentative.discard(frozenset((here, to)))
                metres = reply.result.get("metres") if isinstance(reply.result, dict) else None
                self._forget_edge(here, to)
                self._add_edge(here, to, metres if isinstance(metres, int | float) else 1.0)
                self.log("edge_learnt", edge=[here, to], metres=metres)
            if self._look_on_arrival():
                return REPLAN
        return None

    def _navigable_leg(self, here: str, steps: list, start: int) -> list[str]:
        """The destinations of the plain moves from steps[start] on (no elevator call or ride in
        between) when there are NAV_MIN_HOPS or more and every one is a place the robot has stood
        in, none is a room, no hop is a known wet spot (a creep step by step is the safe way over
        one) and no edge is a guess: one `navigate` call then replaces them. Live: navigate costs
        1.25 s/m against 1 s/m for moves, but one call for the leg; the final caps a shift's calls
        (~1,320) and live nights ran 1,325-1,486 calls, losing the last, dearest hour."""
        min_hops = self._nav_min_hops()
        if min_hops is None:
            return []
        leg: list[str] = []
        prev = here
        for step in steps[start:]:
            if step.cmd != "move":
                break
            to = step.args["to"]
            kind = self.hotel.nodes.get(to, {}).get("kind")
            if to not in self._visited or kind in (None, "room", "service"):
                break
            if self.hotel.is_wet(prev, to) or frozenset((prev, to)) in self._tentative:
                break
            if kind == "elevator" and self.hotel.floor(to) != self.hotel.floor(prev):
                break  # a ride, not a walk
            leg.append(to)
            prev = to
        if len(leg) < min_hops:
            return []
        if self._stale_before_corridor(here, leg[0]):
            return []  # the fresh look comes first; the next pass may navigate
        return leg

    def _nav_min_hops(self) -> int | None:
        """Navigate only when the night's call pace, projected from the first sim hour on, would
        pass CALL_PROJECTION_LIMIT (NS_NAV_MIN_HOPS forces a leg length; 0 switches navigate off)."""
        forced = os.environ.get("NS_NAV_MIN_HOPS")
        if forced is not None and forced.isdigit():
            return int(forced) or None
        try:
            elapsed = clock_to_seconds(self.state.clock) - clock_to_seconds("22:00:00")
        except (ValueError, AttributeError):
            return None
        if elapsed < 0:
            elapsed += 24 * 3600
        if elapsed < 3600:
            return None
        projected = self.session.calls * NIGHT_S / elapsed
        return NAV_MIN_HOPS if projected > CALL_PROJECTION_LIMIT else None

    def _navigate(self, leg: list[str]) -> bool:
        """One navigate to the leg's end; False (nothing moved) when the server declined."""
        here = self.state.location
        reply = self.cmd("navigate", to=leg[-1])
        result = reply.result if isinstance(reply.result, dict) else {}
        if not reply.ok or not isinstance(result.get("at"), str):
            self.log("navigate_declined", at=here, to=leg[-1], reply=str(reply.result)[:160])
            return False
        self.state.location = result["at"]
        self.state.docked = False
        self._visited.add(result["at"])
        self._moves += len(leg)
        self._refused_move, self._refused_run = None, 0
        if any(e.get("type") == "slip" for e in reply.events) or "wet" in str(result.get("notice", "")).lower():
            self.log("wet_floor", edge=[here, result["at"]], slipped=True, navigated=True)
            for a, b in zip([here, *leg], leg, strict=False):
                self.hotel.mark_wet(a, b)  # which hop it was is unknown: creep over all of them
        if result["at"] != leg[-1]:
            self.log("navigate_short", at=result["at"], to=leg[-1])
        return True

    def _stale_before_corridor(self, here: str, to: str) -> bool:
        """Step into a corridor whose wetness is unknown and whose approach was last looked at
        more than WET_LOOK_S ago (live seed 1: 6-7 slips a night, -15 and 60 s each, all on the
        first step onto a patch that appeared after the first-visit look)."""
        nodes = self.hotel.nodes
        if nodes.get(to, {}).get("kind") != "corridor" or nodes.get(here, {}).get("kind") == "room":
            return False
        if here not in nodes or self.hotel.is_wet(here, to):
            return False
        try:
            now = clock_to_seconds(self.state.clock)
        except (ValueError, AttributeError):
            return False
        last = self._look_clock.get(here)
        return last is None or now - last > WET_LOOK_S

    def _look_on_arrival(self) -> bool:
        """The first time at a non-room place this shift: one look (5 s), so wet warnings, metres
        and stock are known before the next step. True when the map changed (route again)."""
        loc = self.state.location
        if loc in self._looked or self.hotel.nodes.get(loc, {}).get("kind") == "room":
            return False
        before = self.hotel.version
        try:
            self.look()
        except ActionFailed as exc:
            self._looked.add(loc)  # once per place, even when the look failed
            self.log("look_failed", at=loc, reason=str(exc))
        return self.hotel.version != before

    def go(self, dst: str, *, interruptible: bool = False) -> None:
        """Walk to dst by the shortest known route. When the believed map has no route, or a move
        fails with "No way", one look learns the real exits and the route is planned again (once).
        A route changed by a first-visit look on the way is simply planned again from there.
        A move refused as closed off (cleaning) closes that edge for BLOCK_S and plans again from
        here (live seed 3: 125 retries of one closed move stranded the robot).
        Interruptible walks (the way back to the dock) may stop short once a message is waiting."""
        looked = False
        self._in_go += 1
        try:
            for _ in range(GO_ATTEMPTS):
                if self.state.location == dst:
                    return
                try:  # closures start their time now, and the ones whose time is up open again
                    self.hotel.expire_blocks(clock_to_seconds(self.state.clock))
                except (ValueError, AttributeError):
                    pass
                if self.state.location not in self.hotel.nodes and not looked:
                    looked = True  # lost: the one recovery look is spent on learning where
                    self._recover(None)
                try:
                    route = self._route(dst)
                except NoRoute:
                    if self._drop_cart_for(dst):
                        continue
                    if looked:
                        raise ActionFailed(f"no known route to {dst}") from None
                    looked = True
                    self._recover(None)
                    continue
                failure = self._follow(route, interruptible)
                if failure is None:
                    return
                if failure is REPLAN:
                    continue
                here, to, text = failure
                if to is not None and frozenset((here, to)) in self._tentative:
                    self.log("replan", at=here, reason="guessed edge does not exist", to=to)
                    self._drop_tentative()
                    continue
                low = text.lower()
                if to is not None and any(w in low for w in CLOSED_OFF):
                    self.hotel.block_edge(here, to)  # BLOCK_S from the clock of this refusal
                    self.log("replan", at=here, reason="closed off", blocked=to, text=text[:120])
                    continue
                if looked or not ("no way" in low or "no elevator panel" in low):
                    raise ActionFailed(f"could not reach {dst}: {text}")
                looked = True
                self._recover(to)
            raise ActionFailed(f"could not reach {dst}")
        finally:
            self._in_go -= 1
            if not self._in_go:
                self._drop_tentative()

    def _recover(self, failed_to: str | None) -> None:
        """One look: the look is the truth about this place's exits (look() drops stale edges, adds
        new places and guesses that a new neighbour bridges to where a lost edge went)."""
        before = self.state.location
        old = next((e for e in self.hotel.neighbors(before) if e.b == failed_to), None)
        known_nodes = set(self.hotel.nodes)
        look = self.look()
        loc = self.state.location
        seen = {ex["to"]: ex for ex in look["exits"]}
        guesses = []
        if failed_to and failed_to in self.hotel.nodes and failed_to not in seen:
            for to, ex in seen.items():
                if to not in known_nodes and self.hotel.nodes[to]["kind"] != "room":
                    if frozenset((to, failed_to)) not in self._tentative:
                        self._add_edge(to, failed_to, old.metres if old else float(ex["metres"]))
                        self._tentative.add(frozenset((to, failed_to)))
                    guesses.append(to)
        self.log("replan", at=loc, was_at=before, blocked=failed_to, exits=sorted(seen),
                 bridge_guesses=guesses)

    def _drop_cart_for(self, dst: str) -> bool:
        """No route with the cart (stairs): let go of it here when a route exists without it and
        the task does not need it. The cart's place is remembered so it can be fetched again."""
        if not self.state.has_cart or self.cart_needed:
            return False
        try:
            shortest_route(self.hotel, self.state.location, dst, with_cart=False)
        except NoRoute:
            return False
        reply = self.cmd("drop", item="cart")
        self.log("cart_dropped", at=self.state.location, to_reach=dst, ok=reply.ok,
                 left_in_cart=list(self.state.cart or []))
        if not reply.ok:
            self.refresh()
            return not self.state.has_cart
        self.state.cart = None
        self.hotel.stock.setdefault(self.state.location, {})["cart"] = 1
        return True

    def _add_edge(self, a: str, b: str, metres: float) -> None:
        floor = self.hotel.nodes.get(a, {}).get("floor", 0)
        self.hotel.update_from_look(a, {"floor": floor, "exits": [{"to": b, "metres": metres}]})

    def _forget_edge(self, a: str, b: str) -> None:
        self.hotel.forget_edge(a, b)

    def _drop_tentative(self) -> None:
        for key in self._tentative:
            self._forget_edge(*tuple(key))
        self._tentative.clear()

    def explore_floor(self, floor: int, target: str | None = None, *, max_looks: int = 8) -> bool:
        """Task 26: a request names a room the map does not know (other nights number and lay out
        floors differently; live seed 2 lost ~500 points to "unknown room"). Go to that floor and
        visit its corridors not yet looked at this shift, nearest first (the believed ones, then
        corridor exits the looks discover), each first visit being a look that teaches the map
        the rooms off it. Stops as soon as `target` hangs off a looked-at corridor. Bounded: at
        most `max_looks` corridor visits per call, and a floor swept to the end with nothing
        skipped is not swept again this shift. Exits the world model marks blocked (Task 25
        `is_blocked`) are left out. A floor the map has nothing on gets one elevator try (the
        lift refusing it closes the floor for the shift).
        Never raises; True when `target` is known (with a corridor) afterwards."""
        explored: set[int] = self.__dict__.setdefault("_explored_floors", set())
        is_blocked = getattr(self.hotel, "is_blocked", None)

        def known() -> bool:
            if not target or target not in self.hotel.nodes:
                return False
            try:
                self.hotel.room_corridor(target)
            except KeyError:
                return False
            return True

        def unusable(place: str) -> bool:
            edges = self.hotel.neighbors(place)
            return bool(edges) and callable(is_blocked) and all(is_blocked(e.b, place) for e in edges)

        def todo() -> list[str]:
            return [n for n, v in self.hotel.nodes.items()
                    if v.get("kind") == "corridor" and v.get("floor") == floor
                    and n not in self._looked and n not in skipped and not unusable(n)]

        def ride_to_floor() -> bool:
            """The map has nothing on this floor: from the nearest elevator landing ask the lift
            for it, step in and look (the look teaches the landing's corridors). False when the
            server refuses the floor, which then closes it for the shift (a clean failure)."""
            landings = [e for e in self.hotel.elevators() if self._seconds_to(e) < float("inf")]
            if not landings:
                return False
            try:
                self.go(min(landings, key=self._seconds_to))
            except ActionFailed as exc:
                self.log("explore_skip", place=f"floor {floor}", reason=str(exc))
                return False
            reply = self.cmd("call_elevator", floor=floor)
            text = str(reply.result)
            if not reply.ok:
                explored.add(floor)
                self.log("explore_skip", place=f"floor {floor}", reason=text)
                return False
            after = text.lower().split("step in to ", 1)  # "... Step in to elevator-4 to ride ..."
            landing = after[1].split()[0].strip(".,") if len(after) > 1 and after[1].split() else ""
            self.hotel.add_node(landing or f"elevator-{floor}", floor, "elevator")
            reply = self.move(landing or f"elevator-{floor}")
            if not reply.ok:
                self.log("explore_skip", place=f"floor {floor}", reason=str(reply.result))
                return False
            looked.append(self.state.location)
            if self.state.location not in self._looked:
                try:
                    self.look()
                except ActionFailed as exc:
                    self._looked.add(self.state.location)
                    self.log("look_failed", at=self.state.location, reason=str(exc))
            return True

        if known():
            return True
        skipped: set[str] = set()
        looked: list[str] = []
        believed = set(todo())
        if floor in explored:
            self.log("floor_explored", floor=floor, target=target, looked=looked, found=False,
                     reason="already swept this shift")
            return False
        new_floor = not believed and not any(
            v.get("floor") == floor for v in self.hotel.nodes.values())
        if new_floor and not ride_to_floor():  # a floor the starting map does not have: one try
            self.log("floor_explored", floor=floor, target=target, looked=looked, found=False,
                     swept=False, skipped=[f"floor {floor}"])
            return False
        swept = False
        while len(looked) < max_looks:
            candidates = todo()
            if not candidates:
                swept = True  # every believed and discovered corridor of the floor was looked at
                break
            nxt = min(candidates, key=lambda c: (c not in believed, self._seconds_to(c), c))
            if self._seconds_to(nxt) == float("inf"):
                skipped.add(nxt)
                continue
            try:
                self.go(nxt)  # the first visit looks on arrival
            except ActionFailed as exc:
                skipped.add(nxt)
                self.log("explore_skip", place=nxt, reason=str(exc))
                continue
            if self.state.location not in self._looked:
                try:
                    self.look()
                except ActionFailed as exc:
                    self._looked.add(self.state.location)
                    self.log("look_failed", at=self.state.location, reason=str(exc))
            looked.append(self.state.location)
            if known():
                break
        found = known()
        if swept and not found and not skipped:  # a skipped corridor (a closure) may open later
            explored.add(floor)
        self.log("floor_explored", floor=floor, target=target, looked=looked, found=found,
                 swept=swept, skipped=sorted(skipped))
        return found

    # --- items and the cart ----------------------------------------------------------------------

    def count(self, item: str) -> int:
        return self.state.hands.count(item) + (self.state.cart or []).count(item)

    def _seconds_to(self, place: str) -> float:
        try:
            return route_seconds(self.hotel, self.state.location, place, with_cart=self.state.has_cart)
        except NoRoute:
            return float("inf")

    def _stock_place(self, item: str, exclude: set[str] = frozenset()) -> str | None:
        """The nearest place believed to hold item (the JSON, corrected by every look and pick)."""
        places = [p for p, items in self.hotel.stock.items()
                  if items.get(item, 0) > 0 and p not in exclude and p in self.hotel.nodes]
        return min(places, key=self._seconds_to, default=None)

    def _unchecked_stock_place(self, item: str, exclude: set[str] = frozenset()) -> str | None:
        """The nearest stock place (storage, laundry, front desk, ...) not yet looked at this shift:
        tonight's stock may sit there whatever the JSON says (live seed 2: towels in the laundry)."""
        places = [p for p in self._stock_places
                  if p not in exclude and p not in self._looked and p in self.hotel.nodes]
        return min(places, key=self._seconds_to, default=None)

    def pick(self, item: str) -> tuple[bool, str]:
        reply = self.cmd("pick", item=item)
        text = str(reply.result)
        here = self.hotel.stock.get(self.state.location)
        if reply.ok:
            if "cart" in text.lower() and self.state.cart is not None:
                self.state.cart.append(item)
            else:
                self.state.hands.append(item)
            if here and item in here:
                here[item] = max(0, here[item] - 1)
        elif here is not None and f"no {item}".lower() in text.lower():
            here[item] = 0  # learnt: nothing left here
        return reply.ok, text

    def pick_or_cart(self, item: str) -> tuple[bool, str]:
        """pick; if both hands are full and there is no cart, fetch the cart once and retry."""
        ok, text = self.pick(item)
        low = text.lower()
        if ok or self.state.has_cart or f"no {item}".lower() in low or not (
                "full" in low or "hands" in low):
            return ok, text
        here = self.state.location
        self.log("hands_full", item=item, at=here)
        if not self.get_cart():
            return ok, text
        self.go(here)
        return self.pick(item)

    def take(self, item: str) -> None:
        """The robot let go of item (placed it): mirror the server, hands first."""
        if item in self.state.hands:
            self.state.hands.remove(item)
        elif self.state.cart and item in self.state.cart:
            self.state.cart.remove(item)

    def gather(self, item: str, n: int = 1) -> None:
        """Carry at least n of item, fetching from stock; raises ActionFailed with the reason.
        Where it is believed to be first; when it is not there (the look shows none, or the pick is
        refused), the survey (if it has not run yet) and then the other stock places not yet seen
        this shift, nearest first."""
        tried: set[str] = set()
        if item == "wet-floor-sign":  # a sign standing on a wet patch is not stock: it serves a spill
            tried = set(self.signs_placed) | set(self.hotel.wet_spots())
        while self.count(item) < n:
            place = self._stock_place(item, tried)
            if place is None:
                self.survey()  # the belief failed: see the stock places once, if not seen yet
                place = self._stock_place(item, tried) or self._unchecked_stock_place(item, tried)
            if place is None:
                raise OutOfStock(f"{item} out of stock")
            self.go(place)
            if place in self._looked and self.hotel.stock.get(place, {}).get(item, 0) <= 0:
                tried.add(place)  # the look here showed none: no pick wasted
                self.log("stock_miss", item=item, at=place)
                continue
            while self.count(item) < n:
                ok, text = self.pick_or_cart(item)
                if not ok:
                    if f"no {item}".lower() not in text.lower():
                        raise ActionFailed(f"could not pick {item}: {text}")
                    tried.add(place)
                    break

    def ensure_item(self, item: str) -> bool:
        try:
            self.gather(item, 1)
            return True
        except ActionFailed as exc:
            self.log("ensure_item_failed", item=item, reason=str(exc))
            return False

    def get_cart(self) -> bool:
        if self.state.has_cart:
            return True
        self.survey()
        place = self._stock_place("cart") or self._unchecked_stock_place("cart")
        if place is None:
            return False
        try:
            self.go(place)
        except ActionFailed as exc:
            self.log("get_cart_failed", reason=str(exc))
            return False
        reply = self.cmd("use", item="cart")
        if not reply.ok:
            if "already" in str(reply.result).lower():
                self.refresh()
                return self.state.has_cart
            self.hotel.stock.get(place, {})["cart"] = 0
            self.log("get_cart_failed", reason=str(reply.result))
            return False
        self.state.cart = []
        if "cart" in self.hotel.stock.get(place, {}):
            self.hotel.stock[place]["cart"] = 0
        return True

    def stock_cart(self, items: dict[str, int]) -> None:
        """Fill the cart (and hands) up to the given counts from the stock rooms, best order."""
        if not self.get_cart():
            return
        by_place: dict[str, list[str]] = {}
        for item, n in items.items():
            if n > self.count(item) and (place := self._stock_place(item)):
                by_place.setdefault(place, []).append(item)
        try:
            order, _ = best_tour(self.hotel, self.state.location, list(by_place), with_cart=True)
        except NoRoute:
            order = list(by_place)
        picked: dict[str, int] = {}
        for place in order:
            try:
                self.go(place)
            except ActionFailed as exc:
                self.log("stock_cart_skip", place=place, reason=str(exc))
                continue
            for item in by_place[place]:
                while self.count(item) < items[item]:
                    if not self.pick(item)[0]:
                        break
                    picked[item] = picked.get(item, 0) + 1
        self.log("stock_cart", picked=picked)
        self.refresh()

    # --- learning the night's hotel --------------------------------------------------------------

    def _learn_dock(self, location, clock) -> None:
        """The dock is where the shift's first status finds the robot, when that status comes at
        the very start of the shift (within DOCK_LEARN_S of its start clock) and before any move.
        A JSON dock named otherwise is then overruled, so waiting and charging go to the real one.
        A shift adopted mid-night (a restart) finds the robot anywhere: it keeps the map's dock."""
        if self._dock_known:
            return
        self._dock_known = True
        if self._moves or not isinstance(location, str) or not location:
            return
        believed = self.hotel.special.get("dock", "charging-dock")
        if location == believed:
            return
        if not self._at_shift_start(clock):
            self.log("dock_kept", dock=believed, at=location, clock=clock)
            return
        self.hotel.special["dock"] = location
        self.hotel.add_node(location, self.hotel.nodes.get(believed, {}).get("floor", 1), "place")
        self._learnt_dock, self._map_dock = location, believed
        self.log("dock_learnt", dock=location, believed=believed)

    def _at_shift_start(self, clock) -> bool:
        """True when clock is within DOCK_LEARN_S after the shift's start clock (the one the
        session reports, else SHIFT_START). No usable clock: False (the map's dock is safer)."""
        start = getattr(self.session, "start_clock", None)
        try:
            gap = clock_to_seconds(clock) - clock_to_seconds(start if isinstance(start, str) else SHIFT_START)
        except (AttributeError, TypeError, ValueError):
            return False
        return 0 <= gap <= DOCK_LEARN_S

    def _revert_dock(self, dock: str, text: str) -> bool:
        """A dock refused at the learnt dock for any reason but a full battery: the learning was
        wrong (e.g. a restart in the shift's first minutes, after the robot had moved). Back to the
        map's dock, once per shift; True when the caller should walk there and dock again."""
        if (self._dock_reverted or self._learnt_dock is None or self._map_dock is None
                or dock != self._learnt_dock or "full" in text.lower()):
            return False
        self._dock_reverted = True
        self.hotel.special["dock"] = self._map_dock
        self.log("dock_reverted", dock=self._map_dock, learnt=dock, reason=text[:200])
        return True

    def survey(self) -> None:
        """Once per shift, in the first idle time (or before the first stock trip): look at the dock
        and the believed stock places (storage, laundry, front desk) on one tour, so tonight's stock
        and metres are known before a request depends on them. Never raises."""
        if self._surveyed:
            return
        self._surveyed = True
        dock = self.hotel.special.get("dock", "charging-dock")
        places = [p for p in dict.fromkeys([dock, *self._stock_places]) if p in self.hotel.nodes]
        start = self.state.location
        try:
            if start not in self._looked:
                self.look()  # here first: at 22:00 that is the dock, before anything moves
            todo = [p for p in places if p not in self._looked]
            try:
                order, _ = best_tour(self.hotel, self.state.location, todo, with_cart=self.state.has_cart)
            except NoRoute:
                order = todo
            for place in order:
                if place in self._looked:
                    continue
                try:
                    self.go(place)  # the first visit looks on arrival
                except ActionFailed as exc:
                    self.log("survey_skip", place=place, reason=str(exc))
                    continue
                if place not in self._looked:
                    self.look()
        except ActionFailed as exc:
            self.log("survey_failed", reason=str(exc))
        self.log("survey", from_place=start, looked=sorted(p for p in places if p in self._looked),
                 stock={p: self.hotel.stock.get(p, {}) for p in places})

    def _now_s(self) -> int | None:
        try:
            return clock_to_seconds(self.state.clock)
        except (AttributeError, TypeError, ValueError):
            return None

    def _reach_dock(self, dock: str, *, interruptible: bool = False) -> bool:
        """Walk to the dock; True once there (or stopped short for a waiting message). A failed
        walk is never retried by the same route: one fresh look updates the map, the move the
        server refused is dropped from it, and the route is planned once more. When that fails
        too, the dock counts as out of reach from here for DOCK_RETRY_S, so the idle passes
        between do not walk into the same refusal again (they spend their bounded wait instead)."""
        here, now = self.state.location, self._now_s()
        out = self._dock_out_of_reach
        if (out is not None and out[:2] == (here, dock) and now is not None
                and 0 <= now - out[2] < DOCK_RETRY_S):
            return False
        try:
            self.go(dock, interruptible=interruptible)
            return True
        except ActionFailed as exc:
            first = str(exc)
        try:
            self.look()
        except ActionFailed as exc:
            self.log("look_failed", at=self.state.location, reason=str(exc))
        self.log("dock_replan", at=self.state.location, dock=dock, reason=first[:200],
                 dropped=self._close_refused())
        try:
            self.go(dock, interruptible=interruptible)
            return True
        except ActionFailed as exc:
            self._close_refused()
            self._dock_out_of_reach = (self.state.location, dock, self._now_s() or 0)
            self.log("dock_out_of_reach", at=self.state.location, dock=dock, reason=str(exc)[:200])
            return False

    def _battery(self) -> float | None:
        battery = self.state.battery
        if isinstance(battery, int | float) and not isinstance(battery, bool):
            return float(battery)
        return None

    def _dock_reserve(self, dock: str) -> float:
        """% the way to the dock drains (route seconds x DRAIN_PER_MIN) plus DOCK_MARGIN; 0 at the
        dock, or when no route is known (there is nothing to plan the reserve on)."""
        if self.state.location == dock:
            return 0.0
        seconds = self._seconds_to(dock)
        if seconds == float("inf"):
            return 0.0
        return seconds / 60 * DRAIN_PER_MIN + DOCK_MARGIN

    def _work_waiting(self) -> bool:
        return self.inbox_waiting or bool(self.queue)

    def ensure_battery(self, low: float = BATTERY_LOW, enough: float = BATTERY_OK) -> bool:
        """Charge at the dock below `low` %, or below what the way to the dock drains plus a margin
        (a far dock is headed for earlier), up to `enough` % (or until a request wakes the robot,
        or the dock refuses). Not while work waits (a message, or a queued task: no 40-minute
        charge in front of it) unless the battery is below BATTERY_CRITICAL or that reserve: a
        flat battery loses the rest of the night. True when a charge was attempted. Never raises
        except ShiftEnded and Ctrl-C: the loop calls it before every choice."""
        try:
            return self._charge(low, enough)
        except ShiftEnded:
            raise
        except Exception as exc:  # noqa: BLE001 - an odd reply must not block every loop pass
            self.log("charge_failed", error=type(exc).__name__, reason=str(exc)[:200])
            return False

    def _charge(self, low: float, enough: float) -> bool:
        battery = self._battery()
        if battery is None:
            self.log("battery_unknown", battery=repr(self.state.battery)[:40])
            return False
        dock = self.hotel.special.get("dock", "charging-dock")
        reserve = self._dock_reserve(dock)
        if battery >= max(low, reserve):
            return False
        forced = battery < max(BATTERY_CRITICAL, reserve)
        if not forced and self._work_waiting():
            self.log("charge_deferred", battery=battery, queued=len(self.queue), inbox=self.inbox_waiting)
            return False
        self.log("battery_low", battery=battery, at=self.state.location, dock=dock,
                 reserve=round(reserve, 1), forced=forced)
        for _ in range(CHARGE_ROUNDS):
            battery = self._battery()
            if battery is None or battery >= enough:
                break
            dock = self.hotel.special.get("dock", "charging-dock")
            if not self._reach_dock(dock):
                self.log("charge_failed", reason=f"could not reach {dock}")
                break
            if not forced and self._work_waiting():
                break  # a request came in on the way: it goes first
            reply = self.cmd("dock")
            self.state.docked = reply.ok
            if not reply.ok and self._revert_dock(dock, str(reply.result)):
                continue  # dock again, at the map's dock
            text = str(reply.result).lower()
            self.refresh()
            if not reply.ok or self.inbox_waiting or "woke" in text or "message" in text:
                break
        self.log("charged", battery=self.state.battery, woken=self.inbox_waiting)
        return True

    # --- waiting -------------------------------------------------------------------------------

    def _request_waiting(self) -> bool:
        if self.inbox_waiting:
            return True
        unread = self.refresh().get("unread_messages", 0)
        return isinstance(unread, int) and unread > 0

    def scan(self) -> list[str]:
        """60 s: reveals hidden items here; remembers them in `found` for a later lost-item task."""
        reply = self.cmd("scan")
        result = reply.result if isinstance(reply.result, dict) else {}
        found = [f for f in result.get("found") or [] if isinstance(f, str)]
        for item in found:
            self.found[item] = self.state.location
        self.log("scan", at=self.state.location, found=found)
        return found

    def wait_for_request(self, max_idle: int = IDLE_STEPS,
                         should_stop: Callable[[], bool] | None = None) -> None:
        """Go to the dock and charge until a request arrives. Never eats the inbox (the loop
        reads it) and never clears `inbox_waiting` (only the loop's inbox read does). Every reply
        carries the inbox event, so `status` is polled only every IDLE_STATUS_EVERY checks. The
        dock refuses at 100 % and stops when full, so idle time is spent on scans between docks;
        returns as soon as a message is waiting, when should_stop() says so (the final's clock),
        or after max_idle cycles."""
        dock = self.hotel.special.get("dock", "charging-dock")
        scans_first = 0  # after a dock refused as full: this many scans before the next dock try
        for i in range(max_idle):
            if should_stop is not None and should_stop():
                return
            if self.inbox_waiting or (i % IDLE_STATUS_EVERY == 0 and self._request_waiting()):
                return
            if scans_first and self.state.location == dock:
                # A full battery refuses the dock (2 s, one call); live nights spent 60-100 calls on
                # dock/scan pairs. Each scan reply carries the inbox event, so nothing is missed.
                scans_first -= 1
                self.scan()
                continue
            if not self._surveyed:
                self.survey()  # the shift's first idle time: look at tonight's stock places once
                continue  # the survey took time: check the inbox again first
            if self.state.location != dock:
                if not self._reach_dock(dock, interruptible=True):
                    self.log("wait_failed", reason=f"could not reach {dock}")
                    self.scan()  # spend sim time, so the loop calling again is not a tight spin
                    return
                continue  # moving took time: check the inbox again first
            reply = self.cmd("dock")
            self.state.docked = reply.ok
            text = str(reply.result).lower()
            if not reply.ok and "full" not in text:
                if self._revert_dock(dock, str(reply.result)):
                    dock = self.hotel.special["dock"]
                    continue  # walk to the map's dock and dock there
                self.log("wait_failed", reason=str(reply.result))
                self.scan()  # as above: one bounded wait per call instead of an instant return
                return
            if self.inbox_waiting:  # a dock that woke on a message brings the inbox event
                return
            if not reply.ok:  # full: let the battery dip over a few scans before docking again
                scans_first = IDLE_SCANS_WHEN_FULL - 1
            self.scan()  # idle time spent usefully; the battery dips so the next dock works

    # --- tasks ---------------------------------------------------------------------------------

    def run(self, task: Task) -> Outcome:
        from agent import flows

        self.ledger.add(task)
        self.log("task_start", request=task.request, kind=task.kind.value, room=task.room,
                 item=task.item)
        # No status call of its own: the loop refreshed just before, and the flows read the score
        # before and after their last action (that is what verifies a "done"), so `points` comes
        # from the scores they observed. The report's own bonus lands on the next refresh.
        start = self.state.score
        try:
            note, after = flows.handle(self, task)
        except (ShiftEnded, WybeError):
            raise
        except Declined as exc:
            return self._finish(task, "declined", str(exc), start)
        except ActionFailed as exc:
            return self._finish(task, "failed", str(exc), start)
        except Exception as exc:  # noqa: BLE001 - an odd reply must not crash the shift
            tb = traceback.extract_tb(exc.__traceback__)
            where = f"{Path(tb[-1].filename).name}:{tb[-1].lineno} in {tb[-1].name}" if tb else "?"
            self.log("executor_error", request=task.request, error=type(exc).__name__,
                     message=str(exc)[:300], where=where)
            return self._finish(task, "failed", f"internal error ({type(exc).__name__})", start)
        outcome = self._finish(task, "done", note, start)
        if after:  # the report is in: a hiccup here must not lose the outcome (or redo the task)
            try:
                after()
            except (ActionFailed, WybeError) as exc:
                self.log("after_task_failed", request=task.request, reason=str(exc))
        return outcome

    def _finish(self, task: Task, outcome: str, note: str, start: int | None) -> Outcome:
        note = note[:NOTE_MAX]
        twin = self._open_twin(task) if outcome == "done" else None
        if twin is not None:  # Task 22: the rise may be twin's; unreported, not "failed" either
            status, note = "skipped", f"{note} (not reported: the rise may be {twin.request}'s)"[:NOTE_MAX]
        else:
            reply = self.cmd("report", request=task.request, outcome=outcome, note=note)
            text = str(reply.result)
            status = outcome
            if not reply.ok:
                status, note = "skipped", f"{note} (report refused: {text})"[:NOTE_MAX]
            elif outcome == "done" and "thanks" not in text.lower():
                self.log("report_unverified", request=task.request, reply=text)
            elif outcome == "done":
                self.verified.add(task.request)
            if self._exp_pending and outcome == "done":
                verified = reply.ok and "thanks" in text.lower()
                self.experiments[self._exp_pending] = verified
                self.log("experiment", name=self._exp_pending, request=task.request,
                         verified=verified, reply=text[:120], score=self.state.score)
        self._exp_pending = None
        self.ledger.set_status(task.request, status)
        end = self.state.score  # the last score a flow observed; no extra call
        points = int(end - start) if end is not None and start is not None else 0
        self.log("task_done" if status == "done" else "task_failed", request=task.request,
                 status=status, points=points, note=note)
        return Outcome(task.request, status, points, note)

    def _open_twin(self, task: Task) -> Entry | None:
        """An earlier, not-done order for the room (a named guest's, once asked) and item of task:
        the server may have credited task's delivery to it. Logged when found."""
        from agent.flows import same_item

        entry = self.ledger.get(task.request)
        room = (entry.room if entry else None) or task.room or self.guest_rooms.get(task.guest or "")
        twin = self.ledger.open_twin(task, room, same=same_item, guest_rooms=self.guest_rooms)
        if twin is not None:
            self.log("report_skipped_ambiguous", request=task.request, other=twin.request, room=room,
                     item=task.item)
        return twin
