"""Shell-level checks of scripts/secrets.sh in a temp repo with a fake clipboard and dummy keys."""

import os
import pty
import shutil
import stat
import subprocess
import time
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "secrets.sh"
DUMMY = "WYBE_NIGHTSHIFT_KEY=dummy-wybe-111\nANTHROPIC_API_KEY=dummy-ant-222\n"

pytestmark = pytest.mark.skipif(shutil.which("bash") is None, reason="needs bash")


@pytest.fixture()
def repo(tmp_path):
    (tmp_path / "scripts").mkdir()
    shutil.copy(SCRIPT, tmp_path / "scripts" / "secrets.sh")
    bindir = tmp_path / "bin"
    bindir.mkdir()
    (bindir / "pbcopy").write_text('#!/bin/sh\ncat > "$FAKE_CLIP"\n')
    (bindir / "pbpaste").write_text('#!/bin/sh\ncat "$FAKE_CLIP"\n')
    for f in bindir.iterdir():
        f.chmod(0o755)
    (tmp_path / "clip").write_text("")
    return tmp_path


def env(repo):
    e = dict(os.environ)
    e.update(PATH=f"{repo / 'bin'}:{os.environ['PATH']}", FAKE_CLIP=str(repo / "clip"),
             SECRETS_CLEAR_AFTER="1")
    return e


def mode(path: Path) -> int:
    return stat.S_IMODE(path.stat().st_mode)


def run_copy_with_tty(repo):
    """`copy` only uses the clipboard when stdout is a terminal, so give it a pty."""
    master, slave = pty.openpty()
    try:
        proc = subprocess.run(
            ["bash", "scripts/secrets.sh", "copy"], cwd=repo, env=env(repo), stdout=slave,
            stderr=subprocess.PIPE, stdin=subprocess.DEVNULL, timeout=20, check=False,
        )
        os.close(slave)
        out = os.read(master, 65536).decode()
    finally:
        os.close(master)
    return proc, out


def wait_for(cond, seconds=6.0):
    end = time.time() + seconds
    while time.time() < end:
        if cond():
            return True
        time.sleep(0.1)
    return cond()


def test_copy_never_prints_values_and_clears_clipboard(repo):
    (repo / ".env").write_text(DUMMY)
    proc, out = run_copy_with_tty(repo)
    assert proc.returncode == 0
    assert "dummy-wybe-111" not in out and "dummy-ant-222" not in out
    assert "dummy-wybe-111" in (repo / "clip").read_text()
    assert wait_for(lambda: (repo / "clip").read_text() == "")


def test_copy_does_not_clear_a_clipboard_the_user_replaced(repo):
    (repo / ".env").write_text(DUMMY)
    run_copy_with_tty(repo)
    (repo / "clip").write_text("something else the user copied")
    time.sleep(2.5)
    assert (repo / "clip").read_text() == "something else the user copied"


def test_paste_tightens_env_mode_and_new_files_are_600(repo):
    (repo / ".env").write_text("OTHER=1\n")
    (repo / ".env").chmod(0o644)
    r = subprocess.run(
        ["bash", "scripts/secrets.sh", "paste"], cwd=repo, env=env(repo), input=DUMMY,
        capture_output=True, text=True, timeout=20, check=False,
    )
    assert r.returncode == 0
    assert "dummy-wybe-111" not in r.stdout + r.stderr
    assert mode(repo / ".env") == 0o600
    assert "ANTHROPIC_API_KEY=dummy-ant-222" in (repo / ".env").read_text()


def test_paste_creates_env_as_600_from_example(repo):
    (repo / ".env.example").write_text("WYBE_NIGHTSHIFT_KEY=\n")
    (repo / ".env.example").chmod(0o644)
    r = subprocess.run(
        ["bash", "scripts/secrets.sh", "paste"], cwd=repo, env=env(repo), input=DUMMY,
        capture_output=True, text=True, timeout=20, check=False,
    )
    assert r.returncode == 0
    assert mode(repo / ".env") == 0o600
