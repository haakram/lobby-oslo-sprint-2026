"""scripts/forecast.py: the build + seed model behind the final's forecast (jury round 4, item C4)."""

from __future__ import annotations

import csv
import importlib.util
import math
import re
import sys
from pathlib import Path

SPEC = importlib.util.spec_from_file_location("forecast", Path(__file__).resolve().parent.parent / "scripts" / "forecast.py")
forecast = importlib.util.module_from_spec(SPEC)
sys.modules["forecast"] = forecast
SPEC.loader.exec_module(forecast)

BUILDS = {"old0000": 7.4, "d4e445c": 7.7, "c3801e0": 7.8}
SEEDS = {5: 0.15, 9: -0.10, 10: 0.30, 11: 0.0, 16: 0.15, 23: 0.05, 41: -0.2}
PLAYED = {"old0000": [5, 9, 10, 11, 41], "d4e445c": [10, 16, 23, 5, 9, 11], "c3801e0": [10, 16, 23, 5]}


def write_ledger(path: Path, extra: list[dict] | None = None) -> None:
    fields = ["shift", "kind", "complete", "commit", "seed", "score"]
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fields)
        writer.writeheader()
        for build, seeds in PLAYED.items():
            for seed in seeds:
                score = round(math.exp(BUILDS[build] + SEEDS[seed]))
                writer.writerow({"shift": f"w2-{build}{seed}", "kind": "build", "complete": "True", "commit": build,
                                 "seed": seed, "score": score})
        for row in extra or []:
            writer.writerow(row)


def test_the_fit_recovers_build_and_seed_effects_and_skips_board_tests_and_cut_nights(tmp_path: Path) -> None:
    path = tmp_path / "ledger.csv"
    write_ledger(path, [
        {"shift": "w2-x", "kind": "board-test", "complete": "True", "commit": "c3801e0", "seed": 41, "score": 9999},
        {"shift": "w2-y", "kind": "build", "complete": "False", "commit": "c3801e0", "seed": 41, "score": 10},
    ])
    cells, _ = forecast.read_cells(path)
    assert ("c3801e0", 41) not in cells
    fit = forecast.Fit(forecast.component(cells, "c3801e0"))
    assert fit.residual_sd < 1e-3  # the synthetic scores are exactly build + seed (up to rounding)
    assert abs((fit.build["c3801e0"] - fit.build["d4e445c"]) - 0.1) < 1e-3
    assert abs((fit.seed[10] - fit.seed[41]) - 0.5) < 1e-3


def test_component_keeps_only_builds_and_seeds_linked_to_the_target() -> None:
    cells = {("a", 1): 7.0, ("a", 2): 7.1, ("b", 2): 7.2, ("c", 3): 7.3}
    assert set(forecast.component(cells, "a")) == {("a", 1), ("a", 2), ("b", 2)}


def test_report_has_the_leave_seed_out_check_the_forecast_and_is_the_same_every_run(tmp_path: Path) -> None:
    path = tmp_path / "ledger.csv"
    write_ledger(path)
    text = forecast.report(path, "c3801e0")
    assert text == forecast.report(path, "c3801e0")
    assert "seed 9: predicted" in text and "seed 11: predicted" in text
    assert re.search(r"tuning penalty \(mean gap, log scale\): [+-]0\.000", text)  # an exact model leaves no gap
    assert "FORECAST, the final (mean of the best 9 of 10 unseen seeds), c3801e0:" in text
    assert "3 seeds it never played: 9 11 41" in text
