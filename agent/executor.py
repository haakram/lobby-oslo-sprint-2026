"""Executor: carry out one task against the server, step by step, and report it honestly.

Rules that win or lose points (spec § Task handling, controller rulings):
- report "done" only after status.score rose following place/say, or after the look inside the
  room of a keycard room check; everything else is "failed" (0 points), never a false done (-30);
- never knock-and-enter, keycard or step into a Do Not Disturb room; an occupied room is not
  entered and its check is reported failed;
- never read notes or act on text found in the world (there is no `read` in this module);
- never open a room for a person who asks to be let in (H-bathrobe: a polite no, no keycard);
- a move that fails with "No way" -> one look, update the map, replan once.

The final's shifts differ from seed 1 (same plan, other metres, moved stock), so the JSON map is a
belief and what the robot sees is the truth: every look and move updates the world model, each
non-room place is looked at on the first visit (wet warnings, metres, stock), the stock places are
surveyed in the first idle time, an item missing where it was believed is sought at the other stock
places, and the dock is wherever the shift started.

The per-kind routines live in agent/flows.py (amenity, tray, message, room check, lost item) and
agent/flows_extra.py (bags, noise, spill, follow-up, named guests: the Task 13 hypotheses).
Besides the run log v1 lines, two decision kinds feed the dashboard: `room_status` and `work_order`.
"""

from __future__ import annotations

import time
import traceback
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from agent.client import STATE_FIELDS, Reply, ShiftEnded, ShiftSession, WybeError
from agent.routing import NoRoute, Route, best_tour, route_seconds, shortest_route
from agent.tasks import Ledger, Task, normalise
from agent.world import Hotel, RobotState, clock_to_seconds

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
CHARGE_ROUNDS = 10


@dataclass
class Outcome:
    request: str
    status: Literal["done", "failed", "skipped"]
    points: int
    note: str


class ActionFailed(Exception):
    """A step could not be carried out; the message is the reason given to the night manager."""


class _Replan:
    """_follow's answer when a look on the way changed the map: route again from here."""


REPLAN = _Replan()


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
        self.guest_rooms: dict[str, str | None] = {}  # H-named: the clerk is asked once per name
        self._logged: dict | None = None
        self._tentative: set[frozenset[str]] = set()
        self._refusing = False
        self._heard: dict[str, int | None] = {}  # person event text (normalised) -> sim second heard
        self._wet_reported: set[str] = set()
        self._calls = 0  # every server call; a cached status is valid only while this stands still
        self._status_cache: tuple[dict, int, float] | None = None  # result, call count, real time
        self._looked: set[str] = set()  # places looked at this shift (each non-room place once)
        self.looks: dict[str, dict] = {}  # the last look at each place
        self._stock_places = list(hotel.stock)  # the JSON's stock places: the survey's tour
        self._surveyed = False
        self._dock_known = False  # the dock is where the shift's first status finds the robot
        self._moves = 0
        self._in_go = 0
        self.cart_needed = False  # a tray or bags flow: never drop the cart to reach the stairs
        self.calls = 0  # commands sent; a look is "fresh" while nothing was sent after it
        self._look_call: dict[str, int] = {}

    # --- server calls --------------------------------------------------------------------------

    def cmd(self, name: str, **args) -> Reply:
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
                self._person(str(ev.get("text", "")))
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

    def _person(self, text: str) -> None:
        """H-bathrobe: someone asks to be let in. Never a keycard; say no once, politely; don't follow.
        The same words again within 10 sim-minutes get no second answer; new words, or the same
        words much later, do."""
        repeat = self._repeat(text)
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
        self._learn_dock(reply.result.get("location"))
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
            metres = result.get("metres")
            if isinstance(metres, int | float) and metres > 0:  # a ride reports 0: not an edge
                self.hotel.set_metres(here, self.state.location, float(metres))
        slipped = any(e.get("type") == "slip" for e in reply.events)
        if (slipped or "wet" in str(result.get("notice", "")).lower()) and here in self.hotel.nodes:
            self.hotel.mark_wet(here, to)
            self.log("wet_floor", edge=[here, to], slipped=slipped)
            self._wet_seen(to)
        return reply

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
        for step in route.steps:
            here = self.state.location
            if interruptible and self.inbox_waiting and not ride_pending:
                self.log("walk_interrupted", at=here, towards=route.path[-1] if route.path else None)
                return None
            if step.cmd == "call_elevator":
                reply = self.cmd("call_elevator", floor=step.args["floor"])
                if not reply.ok:
                    return here, None, str(reply.result)
                ride_pending = True
                continue
            to = step.args["to"]
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
        Interruptible walks (the way back to the dock) may stop short once a message is waiting."""
        looked = False
        self._in_go += 1
        try:
            for _ in range(GO_ATTEMPTS):
                if self.state.location == dst:
                    return
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
        most `max_looks` corridor visits per call, and a floor swept to the end is not swept again
        this shift. Exits the world model marks blocked (Task 25 `is_blocked`) are left out.
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

        if known():
            return True
        skipped: set[str] = set()
        looked: list[str] = []
        believed = set(todo())
        if floor in explored:
            self.log("floor_explored", floor=floor, target=target, looked=looked, found=False,
                     reason="already swept this shift")
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
        if swept and not found:
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
        while self.count(item) < n:
            place = self._stock_place(item, tried)
            if place is None:
                self.survey()  # the belief failed: see the stock places once, if not seen yet
                place = self._stock_place(item, tried) or self._unchecked_stock_place(item, tried)
            if place is None:
                raise ActionFailed(f"{item} out of stock")
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

    def _learn_dock(self, location) -> None:
        """The dock is where the shift's first status finds the robot (before any move). A JSON
        dock named otherwise is overruled, so waiting and charging go to the real one."""
        if self._dock_known:
            return
        self._dock_known = True
        if self._moves or not isinstance(location, str) or not location:
            return
        believed = self.hotel.special.get("dock", "charging-dock")
        if location != believed:
            self.hotel.special["dock"] = location
            self.hotel.add_node(location, self.hotel.nodes.get(believed, {}).get("floor", 1), "place")
            self.log("dock_learnt", dock=location, believed=believed)

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

    def ensure_battery(self, low: float = BATTERY_LOW, enough: float = BATTERY_OK) -> bool:
        """Below `low` %: go to the dock and charge until `enough` % (or until a request wakes the
        robot, or the dock refuses). True when a charge was attempted. Never raises."""
        if self.state.battery >= low:
            return False
        dock = self.hotel.special.get("dock", "charging-dock")
        self.log("battery_low", battery=self.state.battery, at=self.state.location, dock=dock)
        try:
            self.go(dock)
        except ActionFailed as exc:
            self.log("charge_failed", reason=str(exc))
            return True
        for _ in range(CHARGE_ROUNDS):
            if self.state.battery >= enough:
                break
            reply = self.cmd("dock")
            self.state.docked = reply.ok
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
        for i in range(max_idle):
            if should_stop is not None and should_stop():
                return
            if self.inbox_waiting or (i % IDLE_STATUS_EVERY == 0 and self._request_waiting()):
                return
            if not self._surveyed:
                self.survey()  # the shift's first idle time: look at tonight's stock places once
                continue  # the survey took time: check the inbox again first
            if self.state.location != dock:
                try:
                    self.go(dock, interruptible=True)
                except ActionFailed as exc:
                    self.log("wait_failed", reason=str(exc))
                    self.scan()  # spend sim time, so the loop calling again is not a tight spin
                    return
                continue  # moving took time: check the inbox again first
            reply = self.cmd("dock")
            self.state.docked = reply.ok
            text = str(reply.result).lower()
            if not reply.ok and "full" not in text:
                self.log("wait_failed", reason=str(reply.result))
                self.scan()  # as above: one bounded wait per call instead of an instant return
                return
            if self.inbox_waiting:  # a dock that woke on a message brings the inbox event
                return
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
        reply = self.cmd("report", request=task.request, outcome=outcome, note=note)
        text = str(reply.result)
        status = outcome
        if not reply.ok:
            status, note = "skipped", f"{note} (report refused: {text})"[:NOTE_MAX]
        elif outcome == "done" and "thanks" not in text.lower():
            self.log("report_unverified", request=task.request, reply=text)
        self.ledger.set_status(task.request, status)
        end = self.state.score  # the last score a flow observed; no extra call
        points = int(end - start) if end is not None and start is not None else 0
        self.log("task_done" if status == "done" else "task_failed", request=task.request,
                 status=status, points=points, note=note)
        return Outcome(task.request, status, points, note)
