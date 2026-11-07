import pytest

from agent.config import load_settings

VARS = [
    "WYBE_NIGHTSHIFT_URL",
    "WYBE_NIGHTSHIFT_KEY",
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_BUDGET_USD",
    "NIGHTSHIFT_MAX_RPS",
    "FINAL_ARMED",
]


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    for v in VARS:
        monkeypatch.delenv(v, raising=False)


def test_settings_repr_hides_keys(tmp_path):
    f = tmp_path / ".env"
    f.write_text("WYBE_NIGHTSHIFT_KEY=secret123abc\nANTHROPIC_API_KEY=sk-ant-hidden999\n")
    s = load_settings((str(f),))
    assert "secret123abc" not in repr(s) and "sk-ant-hidden999" not in repr(s)
    assert s.key == "secret123abc" and s.anthropic_key == "sk-ant-hidden999"
    assert s.max_rps == 5.0 and s.budget_usd == 30.0
    assert s.url == "https://nightshift.wybe.me/" and s.final_armed is False


def test_later_file_wins_and_environment_wins_over_files(tmp_path, monkeypatch):
    a, b = tmp_path / "a", tmp_path / "b"
    a.write_text("WYBE_NIGHTSHIFT_KEY=one\nNIGHTSHIFT_MAX_RPS=2\n")
    b.write_text("WYBE_NIGHTSHIFT_KEY=two\n")
    s = load_settings((str(a), str(b)))
    assert s.key == "two" and s.max_rps == 2.0
    monkeypatch.setenv("WYBE_NIGHTSHIFT_KEY", "fromenv")
    assert load_settings((str(a), str(b))).key == "fromenv"


def test_final_armed_only_from_environment(tmp_path, monkeypatch):
    f = tmp_path / ".env"
    f.write_text("FINAL_ARMED=1\n")
    assert load_settings((str(f),)).final_armed is False
    monkeypatch.setenv("FINAL_ARMED", "1")
    assert load_settings((str(f),)).final_armed is True


def test_missing_files_and_key_ok(tmp_path):
    s = load_settings((str(tmp_path / "nope"),))
    assert s.key == "" and s.anthropic_key is None
