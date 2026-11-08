"""Settings loader. Later env file wins; real environment variables win over files."""

import math
import os
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlsplit

from dotenv import dotenv_values


@dataclass(frozen=True)
class Settings:
    url: str
    key: str = field(repr=False)
    anthropic_key: str | None = field(repr=False)
    budget_usd: float
    max_rps: float
    final_armed: bool
    user_agent: str = "TeamLobby-agent/1.0"
    runs_dir: Path = Path("temp/runs")


LOCAL_HOSTS = ("localhost", "127.0.0.1")


def _checked_url(url: str) -> str:
    """The bearer key goes to this URL: https only, plain http just for local test servers."""
    try:
        parts = urlsplit(url)
        host = parts.hostname
    except ValueError:
        parts, host = None, None
    if parts is not None and (
        (parts.scheme == "https" and host)
        or (parts.scheme == "http" and host in LOCAL_HOSTS)
    ):
        return url
    raise ValueError(
        "WYBE_NIGHTSHIFT_URL must start with https:// (http:// is allowed only for "
        "localhost or 127.0.0.1)"
    )


MAX_RPS_CEILING = 50.0  # a 0, negative or NaN rate would switch the limiter off: refuse to start


def _rps(raw: str) -> float:
    try:
        rps = float(raw)
    except ValueError:
        rps = math.nan
    if not math.isfinite(rps) or not 0 < rps <= MAX_RPS_CEILING:
        raise ValueError(f"NIGHTSHIFT_MAX_RPS must be a number in (0, {MAX_RPS_CEILING:g}], got {raw!r}")
    return rps


def load_settings(env_files: tuple[str, ...] = (".env", ".env.local")) -> Settings:
    values: dict[str, str | None] = {}
    for path in env_files:
        values.update(dotenv_values(path))
    values.update(os.environ)

    def get(name: str, default: str = "") -> str:
        return values.get(name) or default

    return Settings(
        url=_checked_url(get("WYBE_NIGHTSHIFT_URL", "https://nightshift.wybe.me/")),
        key=get("WYBE_NIGHTSHIFT_KEY"),
        anthropic_key=get("ANTHROPIC_API_KEY") or None,
        budget_usd=float(get("ANTHROPIC_BUDGET_USD", "30")),
        # Measured live 2026-11-07: 20 req/s clean, HTTP 429 above ~22 req/s per key.
        max_rps=_rps(get("NIGHTSHIFT_MAX_RPS", "16")),
        # Environment only, never a file, so nobody arms the final by accident.
        final_armed=os.environ.get("FINAL_ARMED") == "1",
    )
