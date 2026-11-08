"""Score-blind mode (NS_SCORE_BLIND=1, side branch hamad/blind): no score, score delta or report reply
decides a "done" or what is reported; what the robot itself saw or heard does (executor module doc).

A juror's question: "Hide the score from your agent: what is its false-done rate?" The sighted agent waits
for the score to rise before most "done" reports, so its credited rate is partly the referee's. These tests
pin each gate the blind mode changes, and the last ones prove the blindness: with every score and every
report reply replaced by garbage, a blind night sends exactly the same calls.
"""

import json

import httpx
import pytest

from agent.agent import run_shift
from tests.agent.test_agent import client_for
from tests.agent.test_executor import BAGS_TEXT, calls, decisions, next_task, run_one, setup, solo
from tests.fakes.fake_wybe import FakeWybe

SPILL = "Someone mentioned a spill on floor 3."
NOISE = "Complaint about noise near 201."


@pytest.fixture
def blind(monkeypatch):
    monkeypatch.setenv("NS_SCORE_BLIND", "1")


@pytest.fixture
def sighted(monkeypatch):
    monkeypatch.delenv("NS_SCORE_BLIND", raising=False)


def checks(session):
    return decisions(session, "blind_check")


def no_rise_on_delivery(fake, monkeypatch):
    """The server credits no delivery (a wrong room, an order it does not count): the score stays put."""
    monkeypatch.setattr(fake, "_judge_delivery", lambda room, item: None)


def reworded_place(fake, monkeypatch, old, new):
    real = fake._cmd_place

    def place(args):
        ok, text = real(args)
        return ok, text.replace(old, new) if ok else text

    monkeypatch.setattr(fake, "_cmd_place", place)


def scripted_say(fake, monkeypatch, heard, *, credit):
    """`say` answers with `heard`; with credit, the server still scores what was said (the real say runs)."""
    real = fake._cmd_say

    def say(args):
        if credit:
            real(args)
        return True, {"said": args["text"], "heard": list(heard)}

    monkeypatch.setattr(fake, "_cmd_say", say)


# --- off by default --------------------------------------------------------------------------------


def test_off_by_default_the_score_gate_decides_and_nothing_extra_is_logged(tmp_path, sighted, monkeypatch):
    fake, session, ex = setup(tmp_path, rids={"R-001"})
    no_rise_on_delivery(fake, monkeypatch)
    assert ex.blind is False
    out = ex.run(next_task(ex, session, "R-001"))
    assert out.status == "failed" and "score did not rise" in out.note
    assert fake.reports == {"R-001": "failed"} and not checks(session)


# --- gate 1: a delivery (amenity, tray, lost item, named guest: flows._deliver) ------------------------


def test_blind_delivery_is_done_on_the_place_reply_even_without_a_rise(tmp_path, blind, monkeypatch):
    fake, session, ex = setup(tmp_path, rids={"R-001"})
    no_rise_on_delivery(fake, monkeypatch)
    out = ex.run(next_task(ex, session, "R-001"))
    assert out.status == "done", out
    # the robot saw "Placed phone-charger inside room-319." and said done; the server disagrees: the
    # false done the measurement counts (the sighted robot would have reported failed)
    assert fake.reports == {"R-001": "done"} and fake.false_done == ["R-001"]
    [check] = checks(session)
    assert check["check"] == "place" and check["observed"] is True and check["request"] == "R-001"
    assert "inside room-319" in check["evidence"] and check["score_after"] == check["score_before"]


def test_blind_delivery_not_seen_inside_the_room_is_failed_despite_a_rise(tmp_path, blind, monkeypatch):
    fake, session, ex = setup(tmp_path, rids={"R-001"})
    reworded_place(fake, monkeypatch, " inside ", " outside ")
    out = ex.run(next_task(ex, session, "R-001"))
    assert out.status == "failed" and "did not put it inside" in out.note, out
    assert fake.reports == {"R-001": "failed"}
    [check] = checks(session)
    assert check["observed"] is False and check["score_after"] > check["score_before"]  # the rise is ignored


def test_blind_tray_and_named_guest_deliveries_use_the_same_gate(tmp_path, blind):
    for rid in ("R-002", "R-008"):  # a tray; a pillow for Mr Aas (the clerk names the room)
        fake, session, _ex, out = run_one(tmp_path / rid, rid)
        assert out.status == "done", (rid, out)
        assert [c["check"] for c in checks(session)] == ["place"] and not fake.false_done


# --- gate 2: a message (flows.message) ------------------------------------------------------------------


def test_blind_message_is_done_when_the_guest_takes_it_in_even_without_a_rise(tmp_path, blind, monkeypatch):
    fake, session, ex = setup(tmp_path, rids={"R-003"})
    scripted_say(fake, monkeypatch, ['Mr Berg calls back: "Thanks!"'], credit=False)
    out = ex.run(next_task(ex, session, "R-003"))
    assert out.status == "done", out
    assert len(calls(fake, "say")) == 1 and fake.false_done == ["R-003"]
    [check] = checks(session)
    assert check["check"] == "say" and check["observed"] is True and "Thanks" in check["evidence"]


def test_blind_message_not_taken_in_is_failed_despite_a_rise(tmp_path, blind, monkeypatch):
    fake, session, ex = setup(tmp_path, rids={"R-003"})
    scripted_say(fake, monkeypatch, ['Mr Berg calls back: "Sorry, what was that?"'], credit=True)
    out = ex.run(next_task(ex, session, "R-003"))
    assert out.status == "failed" and "no one there took it in" in out.note, out
    assert len(calls(fake, "say")) == 2  # the full request text, once more, as the sighted flow does
    assert fake.reports == {"R-003": "failed"}
    assert [c["observed"] for c in checks(session)] == [False, False]


def test_blind_message_counts_the_guest_who_took_it_in_beside_one_who_did_not(tmp_path, blind, monkeypatch):
    # two doors open at once (replay seed 11, R-042): the addressee thanks, the neighbour asks "what was that?"
    fake, session, ex = setup(tmp_path, rids={"R-003"})
    scripted_say(fake, monkeypatch, ['Mr Berg calls back: "Thanks!"', 'Ms Dahl calls back: "Sorry, what was that?"'],
                 credit=True)
    out = ex.run(next_task(ex, session, "R-003"))
    assert out.status == "done", out
    assert len(calls(fake, "say")) == 1 and [c["observed"] for c in checks(session)] == [True]


# --- gate 3: a noise complaint (flows_extra.noise) -----------------------------------------------------


def test_blind_noise_is_done_when_the_music_stops_even_without_a_rise(tmp_path, blind, monkeypatch):
    fake, session, ex, task = solo(tmp_path, NOISE, noise_sources={"room-201": "room-202"})
    scripted_say(fake, monkeypatch, ['The music stops. A muffled "sorry!"'], credit=False)  # the live words
    out = ex.run(task)
    assert out.status == "done", out
    assert fake.reports == {"R-001": "done"}
    [check] = checks(session)
    assert check["observed"] is True and check["score_after"] == check["score_before"]


def test_blind_noise_with_nothing_heard_is_failed_despite_a_rise(tmp_path, blind, monkeypatch):
    fake, session, ex, task = solo(tmp_path, NOISE, noise_sources={"room-201": "room-202"})
    scripted_say(fake, monkeypatch, [], credit=True)
    out = ex.run(task)
    assert out.status == "failed" and "heard no answer" in out.note, out
    assert fake.reports == {"R-001": "failed"}
    [check] = checks(session)
    assert check["observed"] is False and check["evidence"] == "nothing heard"
    assert check["score_after"] > check["score_before"]


# --- gate 4: bags (flows_extra.bags) --------------------------------------------------------------------


def test_blind_bags_are_done_on_the_place_reply_even_without_a_rise(tmp_path, blind, monkeypatch):
    fake, session, ex, task = solo(tmp_path, BAGS_TEXT.format(206))
    no_rise_on_delivery(fake, monkeypatch)
    out = ex.run(task)
    assert out.status == "done", out
    assert fake.reports == {"R-001": "done"} and fake.false_done == ["R-001"]
    [check] = checks(session)
    assert check["check"] == "place" and "inside room-206" in check["evidence"]


def test_blind_bags_not_seen_inside_are_failed_despite_a_rise(tmp_path, blind, monkeypatch):
    fake, _session, ex, task = solo(tmp_path, BAGS_TEXT.format(206))
    reworded_place(fake, monkeypatch, " inside ", " by ")
    out = ex.run(task)
    assert out.status == "failed" and "did not put it inside" in out.note, out
    assert fake.reports == {"R-001": "failed"}


# --- gate 5: a spill (flows_extra.spill) and what a report's reply may change (Executor._finish) ---------


def spill_never_credited(fake, monkeypatch):
    """As live: the sign's place raises nothing, and here the report is not credited either ("Noted.")."""
    real = fake._complete
    monkeypatch.setattr(fake, "_complete", lambda r: None if r.kind == "spill" else real(r))


def test_blind_spill_is_done_on_the_sign_reply_and_no_reply_refutes_anything(tmp_path, blind, monkeypatch):
    fake, session, ex, task = solo(tmp_path, SPILL, spill_spots={3: "corridor-3c"}, wet_spots=[])
    spill_never_credited(fake, monkeypatch)
    out = ex.run(task)
    assert out.status == "done", out
    assert calls(fake, "report")[-1]["result"] == "Noted."  # the referee says no ...
    assert ex.experiments == {"spill_done": None, "sign_move": None}  # ... and the robot does not listen
    assert ex.verified == set() and ex.reported_done == {"R-001"}
    assert ex.movable_signs() == ["corridor-3c"]  # its own done, not the server's thanks
    [check] = checks(session)
    assert check["check"] == "sign" and check["observed"] is True and "over the spill" in check["evidence"]


def test_sighted_spill_the_same_reply_refutes_the_experiment(tmp_path, sighted, monkeypatch):
    # the contrast: the final build reads "Noted." and stops claiming spills and moving signs
    fake, _session, ex, task = solo(tmp_path, SPILL, spill_spots={3: "corridor-3c"}, wet_spots=[])
    spill_never_credited(fake, monkeypatch)
    assert ex.run(task).status == "done"
    assert ex.experiments["spill_done"] is False and ex.movable_signs() == []


def test_blind_sign_not_over_a_spill_is_failed(tmp_path, blind, monkeypatch):
    fake, _session, ex, task = solo(tmp_path, SPILL, spill_spots={3: "corridor-3c"}, wet_spots=[])
    reworded_place(fake, monkeypatch, "Wet floor sign placed over the spill.", "Placed wet-floor-sign at corridor-3c.")
    out = ex.run(task)
    assert out.status == "failed" and "did not put it over a spill" in out.note, out
    assert fake.reports == {"R-001": "failed"}


def test_blind_experiment_stays_on_whatever_the_replies_said(tmp_path, blind):
    _fake, _session, ex = setup(tmp_path, rids={"R-001"})
    ex.experiments["spill_done"] = False  # as a sighted night would leave it after one "Noted."
    assert ex.experiment("spill_done") is True and ex.experiment("not_switched_on") is False


# --- gate 6: a Do Not Disturb order left at the door (experiment dnd_leave, flows._leave_at_door) --------


def test_blind_dnd_leave_claims_without_looking_at_the_score(tmp_path, blind, monkeypatch):
    monkeypatch.setenv("NS_EXPERIMENTS", "dnd_leave")
    fake, session, ex, out = run_one(tmp_path, "R-006", dnd_rooms={"room-208"})
    assert out.status == "done" and "outside the door" in out.note, out
    assert not calls(fake, "use") and fake.reports == {"R-006": "done"}
    [exp] = decisions(session, "experiment")
    assert exp["name"] == "dnd_leave" and exp["verified"] is False  # the reply is logged ...
    assert ex.experiment("dnd_leave") is True  # ... never acted on


# --- the proof: scores and report replies hidden behind garbage change nothing -------------------------


def scrambled(handler):
    """Every score the server shows becomes a falling counter and every report reply swaps "Noted." and
    "Noted. Thanks.": a robot that used either would act differently."""
    n = {"calls": 0}

    def wrapped(request: httpx.Request) -> httpx.Response:
        resp = handler(request)
        body = json.loads(resp.content)
        n["calls"] += 1
        result = body.get("result")
        if isinstance(result, dict) and "score" in result:
            result["score"] = -n["calls"]
        if json.loads(request.content).get("cmd") == "report" and isinstance(result, str):
            body["result"] = "Noted." if "thanks" in result.lower() else "Noted. Thanks."
        return httpx.Response(resp.status_code, json=body)

    return wrapped


def night_calls(tmp_path, *, scramble):
    fake = FakeWybe()
    handler = scrambled(fake.handler) if scramble else fake.handler
    run_shift(client_for(tmp_path, handler), seed=1)
    return [(e["cmd"], e["args"]) for e in fake.log], fake


def test_blind_night_sends_the_same_calls_with_scores_and_replies_scrambled(tmp_path, blind):
    plain, fake = night_calls(tmp_path / "plain", scramble=False)
    hidden, _ = night_calls(tmp_path / "hidden", scramble=True)
    assert len(plain) > 1000 and fake.reports
    assert hidden == plain


def done_reports(log):
    return [a["request"] for c, a in log if c == "report" and a.get("outcome") == "done"]


def test_sighted_night_changes_when_the_score_is_scrambled(tmp_path, sighted):
    # the contrast, so the test above is not trivially true: the final build reads the score
    plain, _ = night_calls(tmp_path / "plain", scramble=False)
    hidden, _ = night_calls(tmp_path / "hidden", scramble=True)
    assert hidden != plain
    assert len(done_reports(hidden)) < len(done_reports(plain))
