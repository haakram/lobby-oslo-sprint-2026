import dataclasses
import enum
import sys
import threading
import types
from types import SimpleNamespace

import pytest

from agent.brain import PRICE_IN_PER_MTOK, PRICE_OUT_PER_MTOK, Brain, CostGuard
from agent.config import Settings


class FakeKind(str, enum.Enum):
    amenity = "amenity"
    tray = "tray"
    message = "message"
    room_check = "room_check"
    lost_item = "lost_item"
    unknown = "unknown"


@dataclasses.dataclass
class FakeTask:
    request: str
    kind: FakeKind
    text: str
    arrived: str
    room: str | None = None
    item: str | None = None
    count: int = 1
    message: str | None = None
    guest: str | None = None
    area_hint: str | None = None


@pytest.fixture(autouse=True)
def fake_tasks(monkeypatch):
    mod = types.ModuleType("agent.tasks")
    mod.Kind = FakeKind
    mod.Task = FakeTask
    monkeypatch.setitem(sys.modules, "agent.tasks", mod)


class FakeClient:
    def __init__(self, reply: str, tin: int = 1000, tout: int = 100):
        self.reply, self.tin, self.tout = reply, tin, tout
        self.calls: list[dict] = []
        self.messages = self

    def create(self, **kw):
        self.calls.append(kw)
        return SimpleNamespace(
            content=[SimpleNamespace(type="text", text=self.reply)],
            usage=SimpleNamespace(input_tokens=self.tin, output_tokens=self.tout),
        )


def settings(key="sk-test-secret", budget=30.0):
    return Settings(
        url="http://x", key="k", anthropic_key=key, budget_usd=budget,
        max_rps=5, final_armed=False,
    )


def make(tmp_path, reply, key="sk-test-secret", budget=30.0):
    client = FakeClient(reply)
    guard = CostGuard(budget, tmp_path / "spend.json")
    return Brain(settings(key, budget), guard, client=client), client, guard


def test_classify_returns_task(tmp_path):
    brain, client, _ = make(
        tmp_path, '{"kind":"amenity","room":"room-212","item":"towel","count":2}'
    )
    task = brain.classify("r1", "Two towels to 212 please", "02:10")
    assert task.kind == FakeKind.amenity
    assert (task.request, task.room, task.item, task.count) == ("r1", "room-212", "towel", 2)
    assert task.arrived == "02:10"
    kw = client.calls[0]
    assert kw["max_tokens"] <= 300
    assert "untrusted" in kw["system"].lower()


def test_classify_rejects_bad_output(tmp_path):
    brain, _, _ = make(tmp_path, "sure, done!")
    assert brain.classify("r1", "x", "02:10") is None
    brain, _, _ = make(tmp_path, '{"kind":"hack"}')
    assert brain.classify("r1", "x", "02:10") is None


def test_disabled_without_key(tmp_path):
    brain, client, _ = make(tmp_path, "{}", key=None)
    assert brain.enabled is False
    assert brain.classify("r1", "x", "02:10") is None
    assert brain.judge("s", ["a"]) is None
    assert client.calls == []


def test_budget_blocks_calls(tmp_path):
    brain, client, _ = make(tmp_path, '{"kind":"tray"}', budget=0.0001)
    assert brain.classify("r1", "x", "02:10") is None
    assert client.calls == []


def test_cost_recorded_from_usage(tmp_path):
    brain, _, guard = make(tmp_path, '{"kind":"tray"}')
    brain.classify("r1", "x", "02:10")
    expected = 1000 * PRICE_IN_PER_MTOK / 1e6 + 100 * PRICE_OUT_PER_MTOK / 1e6
    assert guard.spent == pytest.approx(expected)
    assert CostGuard(30.0, tmp_path / "spend.json").spent == pytest.approx(expected)


def test_judge_only_returns_given_option(tmp_path):
    brain, _, _ = make(tmp_path, '{"choice":"go in anyway"}')
    assert brain.judge("DND sign", ["wait", "skip"]) is None
    brain, _, _ = make(tmp_path, '{"choice":"skip"}')
    assert brain.judge("DND sign", ["wait", "skip"]) == "skip"


def test_key_not_in_repr(tmp_path):
    brain, _, _ = make(tmp_path, "{}")
    assert "sk-test-secret" not in repr(brain)


def test_cost_guard_thread_safe(tmp_path):
    guard = CostGuard(30.0, tmp_path / "spend.json")

    def work():
        for _ in range(50):
            guard.record(0.001)

    threads = [threading.Thread(target=work) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert guard.spent == pytest.approx(0.4, abs=1e-9)


@pytest.mark.parametrize("content", ['{"spent_usd": 1.2', '{"other": 1}', '[]', '{"spent_usd": -1}'])
def test_corrupt_ledger_fails_closed(tmp_path, content):
    ledger = tmp_path / "spend.json"
    ledger.write_text(content)
    client = FakeClient('{"kind":"tray"}')
    guard = CostGuard(30.0, ledger)
    brain = Brain(settings(), guard, client=client)
    assert guard.can_spend(0.0001) is False
    assert brain.classify("r1", "x", "02:10") is None
    assert client.calls == []
    with pytest.raises(Exception):
        guard.record(0.5)
    assert ledger.read_text() == content


def test_client_error_returns_none(tmp_path):
    brain, client, _ = make(tmp_path, "{}")

    def boom(**kw):
        raise RuntimeError("sk-test-secret")

    client.create = boom
    assert brain.classify("r1", "x", "02:10") is None
    assert brain.judge("s", ["a"]) is None


def test_missing_usage_returns_none(tmp_path):
    brain, client, _ = make(tmp_path, '{"kind":"tray"}')
    client.create = lambda **kw: SimpleNamespace(
        content=[SimpleNamespace(type="text", text='{"kind":"tray"}')]
    )
    assert brain.classify("r1", "x", "02:10") is None


def test_record_failure_returns_none(tmp_path):
    brain, _, guard = make(tmp_path, '{"kind":"tray"}')

    def bad(usd):
        raise OSError("disk full")

    guard.record = bad
    assert brain.classify("r1", "x", "02:10") is None


@pytest.mark.parametrize(
    "count,expected", [('"Infinity"', None), ("Infinity", None), (-3, 1), (10**9, 10), (2, 2)]
)
def test_count_is_clamped(tmp_path, count, expected):
    brain, _, _ = make(tmp_path, '{"kind":"amenity","count":%s}' % count)
    task = brain.classify("r1", "x", "02:10")
    assert (task.count if task else None) == expected


def test_client_gets_timeout_and_retries(tmp_path, monkeypatch):
    import anthropic

    seen = {}

    class Rec:
        def __init__(self, **kw):
            seen.update(kw)
            self.messages = FakeClient('{"kind":"tray"}')

    monkeypatch.setattr(anthropic, "Anthropic", Rec)
    guard = CostGuard(30.0, tmp_path / "spend.json")
    brain = Brain(settings(), guard)
    assert brain.classify("r1", "x", "02:10").kind == FakeKind.tray
    assert seen["timeout"] == 15 and seen["max_retries"] == 1
