"""Re-export: the offline fake lives in agent/offline.py so the CLI can run without test code."""

from agent.offline import *
from agent.offline import DEFAULT_REQUESTS, FakeWybe  # noqa: F401
