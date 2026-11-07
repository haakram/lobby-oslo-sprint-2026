from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from agent.guard import FinalModeLocked, check_mode

OSLO = ZoneInfo("Europe/Oslo")


def test_practice_always_allowed():
    check_mode("practice", armed=False)


def test_final_refused_when_not_armed():
    with pytest.raises(FinalModeLocked):
        check_mode("final", armed=False, now=datetime(2026, 11, 8, 12, 30, tzinfo=OSLO))


def test_final_refused_outside_window_even_when_armed():
    for t in [
        datetime(2026, 11, 7, 23, 0, tzinfo=OSLO),
        datetime(2026, 11, 8, 11, 58, tzinfo=OSLO),
        datetime(2026, 11, 8, 13, 0, tzinfo=OSLO),
    ]:
        with pytest.raises(FinalModeLocked):
            check_mode("final", armed=True, now=t)


def test_final_allowed_armed_inside_window():
    check_mode("final", armed=True, now=datetime(2026, 11, 8, 12, 0, tzinfo=OSLO))


def test_final_window_converts_timezones():
    utc = ZoneInfo("UTC")
    check_mode("final", armed=True, now=datetime(2026, 11, 8, 11, 0, tzinfo=utc))  # 12:00 Oslo
    with pytest.raises(FinalModeLocked):
        check_mode("final", armed=True, now=datetime(2026, 11, 8, 12, 0, tzinfo=utc))  # 13:00 Oslo


def test_unknown_mode_rejected():
    with pytest.raises(ValueError):
        check_mode("finale", armed=True)
