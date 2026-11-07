"""Thrifty, interruptible idle (batching design § 3.2, folded into Task 18 C1): the idle hours of a
night must cost few calls, and a request that arrives during the walk back is served from there."""

from itertools import pairwise

import httpx

from agent.client import WybeClient
from agent.config import Settings
from agent.executor import IDLE_SCANS_PER_DOCK, IDLE_STATUS_EVERY, IDLE_STEPS, Executor
from agent.world import Hotel, RobotState, clock_to_seconds
from tests.fakes.fake_wybe import FakeWybe

CHARGER = "319 wants a phone charger."


def _setup(tmp_path, requests, battery=50):
    fake = FakeWybe(requests=requests)
    settings = Settings(url="https://nightshift.test/", key="test-key", anthropic_key=None,
                        budget_usd=30.0, max_rps=1000.0, final_armed=False, runs_dir=tmp_path / "runs")
    client = WybeClient(settings, transport=httpx.MockTransport(fake.handler), sleep=lambda s: None)
    session = client.start_shift("practice", seed=1)
    ex = Executor(session, Hotel.load(), RobotState())
    session.cmd("inbox")  # the welcome message, read the way the loop does
    ex.inbox_waiting = False
    ex._surveyed = True  # the opening's get_cart surveyed at 22:00; not part of this test
    fake.battery = battery
    return fake, session, ex


def _cmds(fake, since):
    return [e["cmd"] for e in fake.log[since:]]


def test_idle_hour_polls_status_only_every_tenth_check(tmp_path):
    fake, _, ex = _setup(tmp_path, requests=[])
    since = len(fake.log)
    ex.wait_for_request(max_idle=25)
    cmds = _cmds(fake, since)
    assert cmds.count("status") == 3  # checks 0, 10 and 20
    assert all(b != "status" for a, b in pairwise(cmds) if a == "dock")
    # one dock per IDLE_SCANS_PER_DOCK scans: the first step docks, then 5 scans, dock again, ...
    assert cmds.count("dock") == 5 and cmds.count("scan") == 25
    assert IDLE_STATUS_EVERY == 10 and IDLE_STEPS == 200 and IDLE_SCANS_PER_DOCK == 5


def test_wait_for_request_keeps_a_pending_inbox_flag_and_makes_no_call(tmp_path):
    fake, _, ex = _setup(tmp_path, requests=[])
    ex.inbox_waiting = True  # seen on an earlier reply; only the loop's inbox read clears it
    since = len(fake.log)
    ex.wait_for_request()
    assert _cmds(fake, since) == [] and ex.inbox_waiting is True


def test_request_during_the_walk_back_stops_at_the_next_node(tmp_path):
    fake, _, ex = _setup(tmp_path, requests=[("22:10:00", "R-001", CHARGER)])
    ex.go("corridor-1b")  # three nodes from the dock
    fake._now = clock_to_seconds("22:09:55")  # the first move back crosses the request's time
    since = len(fake.log)
    ex.wait_for_request()
    cmds = _cmds(fake, since)
    assert cmds == ["status", "move"], cmds  # one status (check 0), one step, then the request waits
    assert ex.state.location == "corridor-1a" and ex.inbox_waiting is True
    assert fake._cmd_status({})[1]["unread_messages"] == 1  # left for the loop to read


def test_walk_back_never_stops_between_call_elevator_and_the_ride(tmp_path):
    fake, _, ex = _setup(tmp_path, requests=[("22:10:00", "R-001", CHARGER)])
    ex.go("elevator-3")
    fake._now = clock_to_seconds("22:09:50")  # the 45 s elevator call crosses the request's time
    since = len(fake.log)
    ex.wait_for_request()
    cmds = _cmds(fake, since)
    assert cmds == ["status", "call_elevator", "move"], cmds  # the ride follows its call
    assert ex.state.location == "elevator-1"


def test_two_refreshes_in_a_row_make_one_status_call(tmp_path):
    fake, _, ex = _setup(tmp_path, requests=[])
    since = len(fake.log)
    first = ex.refresh()
    second = ex.refresh()
    assert _cmds(fake, since) == ["status"] and first == second


def test_score_after_an_action_always_hits_the_server(tmp_path):
    fake, _, ex = _setup(tmp_path, requests=[])
    since = len(fake.log)
    ex.refresh()
    ex.cmd("look")
    fake.score = 7
    assert ex.score_now() == 7
    assert _cmds(fake, since) == ["status", "look", "status"]


def test_wait_for_request_returns_when_told_to_stop(tmp_path):
    fake, _, ex = _setup(tmp_path, requests=[])
    checks = {"n": 0}

    def out_of_time() -> bool:
        checks["n"] += 1
        return checks["n"] > 2

    since = len(fake.log)
    ex.wait_for_request(should_stop=out_of_time)
    cmds = _cmds(fake, since)
    assert cmds.count("dock") == 1 and cmds.count("scan") == 2  # two idle steps: dock+scan, scan
