"""Safety lock: a scored "final" shift can only start when armed and inside the Oslo time window."""

from datetime import datetime
from zoneinfo import ZoneInfo

OSLO = ZoneInfo("Europe/Oslo")
FINAL_START = datetime(2026, 11, 8, 11, 59, tzinfo=OSLO)
FINAL_END = datetime(2026, 11, 8, 13, 0, tzinfo=OSLO)


class FinalModeLocked(Exception):
    """Raised when a final-mode start is not allowed."""


def check_mode(mode: str, *, armed: bool, now: datetime | None = None) -> None:
    if mode == "practice":
        return
    if mode != "final":
        raise ValueError(f"unknown mode: {mode!r}")
    if not armed:
        raise FinalModeLocked("final mode is not armed (FINAL_ARMED=1 is required)")
    now = now or datetime.now(OSLO)
    if not (FINAL_START <= now < FINAL_END):
        raise FinalModeLocked("final mode is only allowed 2026-11-08 11:59-13:00 Oslo time")
