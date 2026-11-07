"""Settings loader. Later env file wins; real environment variables win over files."""

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import dotenv_values


@dataclass(frozen=True)
class Settings:
    url: str
    key: str = field(repr=False)
    anthropic_key: str | None = field(repr=False)
    budget_usd: float
    max_rps: float
    final_armed: bool
    user_agent: str = "TeamFettero-agent/1.0"
    runs_dir: Path = Path("temp/runs")


def load_settings(env_files: tuple[str, ...] = (".env", ".env.local")) -> Settings:
    values: dict[str, str | None] = {}
    for path in env_files:
        values.update(dotenv_values(path))
    values.update(os.environ)

    def get(name: str, default: str = "") -> str:
        return values.get(name) or default

    return Settings(
        url=get("WYBE_NIGHTSHIFT_URL", "https://nightshift.wybe.me/"),
        key=get("WYBE_NIGHTSHIFT_KEY"),
        anthropic_key=get("ANTHROPIC_API_KEY") or None,
        budget_usd=float(get("ANTHROPIC_BUDGET_USD", "30")),
        max_rps=float(get("NIGHTSHIFT_MAX_RPS", "5")),
        # Environment only, never a file, so nobody arms the final by accident.
        final_armed=os.environ.get("FINAL_ARMED") == "1",
    )
