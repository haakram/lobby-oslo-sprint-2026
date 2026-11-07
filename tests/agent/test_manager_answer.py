"""A room described, not numbered ("the room next to the elevator on floor 2"): the night manager is asked
with `reply` per request (live seeds 16, 23: +10 at once, the answer "R-014: Sorry: 201." in the very next
inbox read at the same clock). The answer is per REQUEST: live seed 23, R-031, R-032 and R-041 (same words)
delivered to R-014's room 201 each cost -10. Nothing is cached by phrase or floor; a clear request never
gets a reply ("exactly as written", 0 points)."""

from agent import flows
from agent.agent import _read_inbox, run_shift
from tests.agent.test_agent import _decisions, client_for
from tests.agent.test_executor import calls, setup, solo
from tests.fakes.fake_wybe import INBOX_EVENT, FakeWybe

PHRASE = "next to the elevator on floor 2"
QUESTION = f"Which room number is the one {PHRASE}?"
SENT = "Sent. The night manager answers quickly."
KIT = "The guest in the room next to the elevator on floor 2 wants a toiletry kit."
WATER = "The guest in the room next to the elevator on floor 2 wants a water bottle."
TWO_ROOMS = {"R-014": "room-201", "R-031": "room-202"}  # 203 is empty on the default night


def _places(fake) -> dict[str, str]:
    return {e["args"]["item"]: e["args"]["where"] for e in calls(fake, "place") if e["ok"]}


def _after(fake, cmd: str, request: str) -> list[dict]:
    """The call `cmd` for `request` and the one right after it."""
    i = next(i for i, e in enumerate(fake.log) if e["cmd"] == cmd and e["args"].get("request") == request)
    return fake.log[i:i + 2]


# --- the fake ------------------------------------------------------------------------------------


def test_fake_answers_a_reply_on_a_described_room_with_plus_ten_and_the_room_in_the_next_inbox(tmp_path):
    script = [("22:00:00", "R-014", KIT), ("22:00:00", "R-015", "104 wants a towel.")]
    fake, session, _ = setup(tmp_path, requests=script, described_rooms={"R-014": "room-201"})
    session.cmd("inbox")
    before = fake.score
    reply = session.cmd("reply", request="R-014", text=QUESTION)
    assert reply.ok and reply.result == SENT
    assert fake.score == before + 10
    inbox = session.cmd("inbox")
    assert inbox.clock == reply.clock
    assert inbox.result["messages"] == [
        {"from": "night manager", "at": reply.clock, "text": "R-014: Sorry: 201.", "request": "R-014"}]
    clear = session.cmd("reply", request="R-015", text="Which room?")
    assert clear.result == "R-015 is exactly as written."
    assert fake.score == before + 10  # a clear request: 0 points


def test_fake_gives_two_requests_with_the_same_words_their_own_rooms(tmp_path):
    fake = FakeWybe(requests=[("22:01:00", "R-014", KIT), ("22:02:00", "R-031", KIT)])
    rooms = {rid: req.room for rid, req in ((r.rid, r) for r in fake._pending) if rid}
    assert rooms["R-014"] != rooms["R-031"]
    assert {rooms["R-014"], rooms["R-031"]} <= {"room-201", "room-202", "room-203"}


# --- the shift loop ------------------------------------------------------------------------------


def test_each_described_request_gets_its_own_reply_and_its_own_room(tmp_path):
    fake = FakeWybe(requests=[("22:03:30", "R-014", KIT), ("22:40:00", "R-031", WATER)],
                    described_rooms=TWO_ROOMS)
    result = run_shift(client_for(tmp_path, fake.handler), seed=1, sim_end="23:30:00")
    replies = [(e["args"]["request"], e["args"]["text"], e["result"]) for e in calls(fake, "reply")]
    assert replies == [("R-014", QUESTION, SENT), ("R-031", QUESTION, SENT)]
    for rid in ("R-014", "R-031"):  # the answer is read at once: 0 sim seconds
        reply, read = _after(fake, "reply", rid)
        assert read["cmd"] == "inbox" and read["clock"] == reply["clock"]
    assert not calls(fake, "ask")  # nobody else was asked
    assert _places(fake) == {"toiletry-kit": "room-201", "water-bottle": "room-202"}
    assert fake.reports == {"R-014": "done", "R-031": "done"}
    assert not fake.wrong_deliveries and not fake.false_done
    assert _decisions(tmp_path, result, "manager_answer") == [
        {"request": "R-014", "room": "room-201", "phrase": PHRASE},
        {"request": "R-031", "room": "room-202", "phrase": PHRASE}]


def test_a_clear_request_never_sends_reply(tmp_path):
    fake = FakeWybe(requests=[("22:03:30", "R-001", "104 wants a toiletry kit."),
                              ("22:10:00", "R-002", "Mr Aas would like a pillow.")])
    run_shift(client_for(tmp_path, fake.handler), seed=1, sim_end="23:00:00")
    assert fake.reports.get("R-001") == "done"
    assert calls(fake, "ask")  # the named guest went to the clerk, as before
    assert not calls(fake, "reply")


def test_no_answer_in_the_first_read_falls_back_to_the_clerk_at_once_and_never_reuses_it(tmp_path):
    fake = FakeWybe(requests=[("22:03:30", "R-014", KIT), ("22:40:00", "R-031", WATER)],
                    described_rooms=TWO_ROOMS)
    held: list[dict] = []
    real_reply, real_ask = fake._cmd_reply, fake._cmd_ask

    def late_reply(args):  # R-014's answer comes only after the clerk was asked
        out = real_reply(args)
        if args.get("request") == "R-014":
            held.append(fake._unread.pop())
        return out

    def ask(args):
        out = real_ask(args)
        fake._unread.extend(held)
        fake._events.extend(dict(INBOX_EVENT) for _ in held)
        held.clear()
        return out

    fake._cmd_reply, fake._cmd_ask = late_reply, ask
    fake._answer = lambda who, q: ("The room next to the elevator? For R-014 that's 201." if "r-014" in q
                                   else "I don't know. The night manager might.")
    result = run_shift(client_for(tmp_path, fake.handler), seed=1, sim_end="23:30:00")
    reply, read = _after(fake, "reply", "R-014")
    assert read["cmd"] == "inbox" and read["result"]["messages"] == [] and read["clock"] == reply["clock"]
    start = fake.log.index(read)
    to_desk = fake.log[start + 1:next(i for i, e in enumerate(fake.log) if e["cmd"] == "ask")]
    assert {e["cmd"] for e in to_desk} <= {"move", "navigate", "look", "status"}  # no waiting
    asks = [e["args"]["question"] for e in calls(fake, "ask")]
    assert asks == ["Which room is the one next to the elevator on floor 2? That is for R-014."]
    assert [e["args"]["request"] for e in calls(fake, "reply")] == ["R-014", "R-031"]
    assert _places(fake) == {"toiletry-kit": "room-201", "water-bottle": "room-202"}
    assert fake.reports == {"R-014": "done", "R-031": "done"}
    assert not fake.wrong_deliveries
    assert _decisions(tmp_path, result, "manager_answer") == [  # R-014's late answer is never reused
        {"request": "R-031", "room": "room-202", "phrase": PHRASE}]


# --- the flow, one request -----------------------------------------------------------------------


def test_the_clerks_answer_for_another_request_is_not_used(tmp_path):
    fake, _, ex, task = solo(tmp_path, KIT, described_rooms={"R-001": "room-201"})
    fake._answer = lambda who, q: "The room next to the elevator? For R-011 that's 332."
    out = ex.run(task)  # no shift loop: no inbox hook, so the manager's answer is not read here
    assert [e["args"]["request"] for e in calls(fake, "reply")] == ["R-001"]
    assert out.status == "failed"
    assert not calls(fake, "place")


def test_the_desk_note_counts_only_on_the_line_for_this_request(tmp_path):
    note = "Floor 2: the room next to the elevator is 203. R-001: 202."
    fake, _, ex, task = solo(tmp_path, KIT, described_rooms={"R-001": "room-202"})
    fake._answer = lambda who, q: "There's a note about it right here on the desk."
    fake._notes_here = lambda: {"staff-note": note} if fake._location == "front-desk" else {}
    ex.run(task)
    assert calls(fake, "read")
    assert _places(fake) == {"toiletry-kit": "room-202"}
    fake2, _, ex2, task2 = solo(tmp_path / "b", KIT, described_rooms={"R-001": "room-201"})
    fake2._answer = fake._answer
    fake2._notes_here = lambda: {"staff-note": "Floor 2: the room next to the elevator is 202."} \
        if fake2._location == "front-desk" else {}
    out = ex2.run(task2)
    assert out.status == "failed" and not calls(fake2, "place")  # no line for R-001: not the floor's room


def test_read_inbox_stashes_messages_on_known_requests(tmp_path):
    fake, _, ex = setup(tmp_path, requests=[("23:00:00", "R-099", "104 wants a towel.")])
    fake._unread = [
        {"from": "night manager", "at": "22:00:00", "text": "R-014: Sorry: 201.", "request": "R-014"},
        {"from": "night manager", "at": "22:00:00", "text": "R-020: 104 wants a towel.", "request": "R-020"}]
    seen, pending = {"R-014"}, []
    _read_inbox(ex, None, seen, pending)
    assert ex.answers == {"R-014": ["R-014: Sorry: 201."]}
    assert [t.request for t in pending] == ["R-020"]


def test_manager_room_parses_only_this_requests_answer(tmp_path):
    _, _, ex = setup(tmp_path, requests=[])
    ex.answers = {"R-114": ["R-114: Sorry: 201."],
                  "R-014": ["Skip R-014, 309 checked out. Don't bother with it."],
                  "R-015": ["R-015: Sorry: 301."], "R-016": ["R-016: it is room-203."]}
    assert flows._manager_room(ex, "R-114", PHRASE) == "room-201"  # not 114
    assert flows._manager_room(ex, "R-014", PHRASE) is None  # a skip is no answer
    assert flows._manager_room(ex, "R-015", PHRASE) is None  # floor 3 is not floor 2
    assert flows._manager_room(ex, "R-016", PHRASE) == "room-203"
    assert flows._manager_room(ex, "R-017", PHRASE) is None  # never another request's answer
