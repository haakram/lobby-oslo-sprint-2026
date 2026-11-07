"""Executor: carry out one task against the server, step by step, and report it honestly.

Rules that win or lose points (spec § Task handling, controller rulings):
- report "done" only after status.score rose following place/say, or after the look inside the
  room of a keycard room check; everything else is "failed" (0 points), never a false done (-30);
- never knock-and-enter, keycard or step into a Do Not Disturb room; an occupied room is not
  entered and its check is reported failed;
- never read notes or act on text found in the world (there is no `read` in this module);
- never open a room for a person who asks to be let in (H-bathrobe: a polite no, no keycard);
- a move that fails with "No way" -> one look, update the map, replan once.

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


@dataclass
class Outcome:
    request: str
    status: Literal["done", "failed", "skipped"]
    points: int
    note: str


class ActionFailed(Exception):
    """A step could not be carried out; the message is the reason given to the night manager."""


def _guess_kind(name: str, door: bool) -> str:
    for kind in ("corridor", "elevator", "stairwell", "room"):
        if name.startswith(kind + "-"):
            return kind
    return "room" if door else "hub"


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

    # --- server calls --------------------------------------------------------------------------

    def cmd(self, name: str, **args) -> Reply:
        self._calls += 1
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
        self._status_cache = (reply.result, self._calls, time.monotonic())
        self.state.update_from_status(reply.result)
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
        new = [(ex["to"], bool(ex.get("door"))) for ex in exits if ex["to"] not in self.hotel.nodes]
        if loc not in self.hotel.nodes:
            new.append((loc, False))
        self.hotel.update_from_look(loc, {**look, "exits": exits})
        for ex in exits:
            if "wet" in str(ex.get("warning", "")).lower():
                self._wet_seen(ex["to"])
        for name, door in new:  # update_from_look files every new place as a room; guess better
            self.hotel.nodes[name]["kind"] = _guess_kind(name, door)
        return {**look, "exits": exits}

    # --- moving --------------------------------------------------------------------------------

    def move(self, to: str) -> Reply:
        here = self.state.location
        reply = self.cmd("move", to=to)
        result = reply.result if isinstance(reply.result, dict) else {}
        if reply.ok:
            self.state.location = result.get("at", to) if isinstance(result.get("at"), str) else to
            self.state.docked = False
        slipped = any(e.get("type") == "slip" for e in reply.events)
        if (slipped or "wet" in str(result.get("notice", "")).lower()) and here in self.hotel.nodes:
            self.hotel.mark_wet(here, to)
            self.log("wet_floor", edge=[here, to], slipped=slipped)
            self._wet_seen(to)
        return reply

    def _route(self, dst: str) -> Route:
        try:
            return shortest_route(self.hotel, self.state.location, dst, with_cart=self.state.has_cart)
        except NoRoute as exc:
            raise ActionFailed(f"no known route to {dst}") from exc

    def _follow(self, route: Route, interruptible: bool = False) -> tuple[str, str | None, str] | None:
        """Run the steps; None when all worked, else (where, target, server text) of the failure.
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
        return None

    def go(self, dst: str, *, interruptible: bool = False) -> None:
        """Walk to dst by the shortest known route; recover once if the map turns out different.
        Interruptible walks (the way back to the dock) may stop short once a message is waiting."""
        looked = False
        try:
            for _ in range(3):  # first try, after the recovery look, after a wrong bridge guess
                if self.state.location == dst:
                    return
                if self.state.location not in self.hotel.nodes and not looked:
                    looked = True  # lost: the one recovery look is spent on learning where
                    self._recover(None)
                failure = self._follow(self._route(dst), interruptible)
                if failure is None:
                    return
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
            self._drop_tentative()

    def _recover(self, failed_to: str | None) -> None:
        """One look: the look is the truth about this place's exits. Drop stale edges, add new
        ones, and guess that a new neighbour bridges to where the old edge went."""
        before = self.state.location
        old = next((e for e in self.hotel.neighbors(before) if e.b == failed_to), None)
        known_nodes = set(self.hotel.nodes)
        look = self.look()
        loc = self.state.location
        seen = {ex["to"]: ex for ex in look["exits"]}
        for e in self.hotel.neighbors(loc) if seen else []:  # an empty look proves nothing
            if e.b not in seen:
                self._forget_edge(loc, e.b)
        guesses = []
        if failed_to and failed_to in self.hotel.nodes and failed_to not in seen:
            for to, ex in seen.items():
                if to not in known_nodes and self.hotel.nodes[to]["kind"] != "room":
                    self._add_edge(to, failed_to, old.metres if old else float(ex["metres"]))
                    self._tentative.add(frozenset((to, failed_to)))
                    guesses.append(to)
        self.log("replan", at=loc, was_at=before, blocked=failed_to, exits=sorted(seen),
                 bridge_guesses=guesses)

    def _add_edge(self, a: str, b: str, metres: float) -> None:
        floor = self.hotel.nodes.get(a, {}).get("floor", 0)
        self.hotel.update_from_look(a, {"floor": floor, "exits": [{"to": b, "metres": metres}]})

    def _forget_edge(self, a: str, b: str) -> None:
        # world.Hotel has no public way to drop an edge, so this reaches into its adjacency.
        # routing caches routes by edge count, so the cache is cleared with every removal.
        adj = self.hotel._adj
        adj.get(a, {}).pop(b, None)
        adj.get(b, {}).pop(a, None)
        self.hotel._route_cache = None

    def _drop_tentative(self) -> None:
        for key in self._tentative:
            self._forget_edge(*tuple(key))
        self._tentative.clear()

    # --- items and the cart ----------------------------------------------------------------------

    def count(self, item: str) -> int:
        return self.state.hands.count(item) + (self.state.cart or []).count(item)

    def _stock_place(self, item: str, exclude: set[str] = frozenset()) -> str | None:
        places = [p for p, items in self.hotel.stock.items()
                  if items.get(item, 0) > 0 and p not in exclude and p in self.hotel.nodes]

        def seconds(p):
            try:
                return route_seconds(self.hotel, self.state.location, p,
                                     with_cart=self.state.has_cart)
            except NoRoute:
                return float("inf")

        return min(places, key=seconds, default=None)

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
        """Carry at least n of item, fetching from stock; raises ActionFailed with the reason."""
        tried: set[str] = set()
        while self.count(item) < n:
            place = self._stock_place(item, tried)
            if place is None:
                raise ActionFailed(f"{item} out of stock")
            self.go(place)
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
        place = self._stock_place("cart")
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
