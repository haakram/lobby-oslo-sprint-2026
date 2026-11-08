"""scripts/forecast.py: the build + seed model behind the final's forecast (review round 4, item C4)."""

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
    cells, _ = forecast.read_cells(path, "c3801e0")
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
    assert "FORECAST, the final (mean of the best 9 of 10 unseen seeds), c3801e0 (head of hamad/final" in text
    assert "3 seeds it never played: 9 11 41" in text
    assert "leave-one-cell-out RMSE" in text
    assert "Out-of-sample check: the dress rehearsal" in text and "not started yet" in text
    assert "the final is the only real holdout" not in text


def test_the_penalty_s_uncertainty_widens_the_band() -> None:
    effects = [0.1, -0.1, 0.0, 0.2, -0.2]
    fixed = forecast.simulate(7.6, effects, 0.05, -0.05)
    drawn = forecast.simulate(7.6, effects, 0.05, -0.05, 0.1)
    width = lambda v: forecast.quantile(v, 0.9) - forecast.quantile(v, 0.1)
    assert width(drawn) > 1.3 * width(fixed)
    assert forecast.best_mean([1, 10, 10, 10, 10, 10, 10, 10, 10, 10]) == 10


def test_the_rehearsal_is_kept_out_of_the_fit_and_compared_with_the_forecast_committed_before_it(tmp_path: Path, monkeypatch) -> None:
    path = tmp_path / "ledger.csv"
    seeds = forecast.REHEARSAL_SEEDS
    rows = [{"shift": f"w2-r{seed}", "kind": "build", "complete": "True", "commit": "c3801e0", "seed": seed,
             "score": 2000 + 10 * i, "started": "2026-11-08T05:02:33+01:00"} for i, seed in enumerate(seeds)]
    fields = ["shift", "kind", "complete", "commit", "seed", "score", "started"]
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fields)
        writer.writeheader()
        for build, played in PLAYED.items():
            for seed in played:
                writer.writerow({"shift": f"w2-{build}{seed}", "kind": "build", "complete": "True", "commit": build,
                                 "seed": seed, "score": round(math.exp(BUILDS[build] + SEEDS[seed])),
                                 "started": "2026-11-08T03:00:00+01:00"})
        writer.writerows(rows)
    committed = ("b57e4c1", "2026-11-08T04:08:43+01:00",
                 ("c3801e0 on the 16 seeds it never played (model, mean night): 2,105 before the tuning penalty, 1,989 after it\n"
                 "FORECAST, the final (mean of the best 9 of 10 unseen seeds), c3801e0:\n  median 2,035, 80 % interval 1,898 - 2,186\n"))
    monkeypatch.setattr(forecast, "committed_before", lambda when: committed)
    cells, _ = forecast.read_cells(path, "c3801e0")
    assert not any(seed in seeds for _, seed in cells)
    text = "\n".join(forecast.rehearsal_check(path, "c3801e0"))
    assert "complete nights 10 of 10" in text
    assert "final median 2,035 (80 %: 1,898 - 2,186), mean night 1,989" in text
    best9 = sum(sorted(2000 + 10 * i for i in range(10))[1:]) / 9
    assert f"RESULT, mean of the best 9 of 10: {round(best9):,} against the committed median 2,035: inside the committed 80 % interval" in text


def test_the_second_forecast_is_the_rehearsals_posterior_predictive_with_a_slot_for_the_final(tmp_path: Path, monkeypatch) -> None:
    """Round 6 (the data review): the rehearsal alone, its mean's and spread's uncertainty drawn; then the final's slot."""
    played = [2085, 2166, 2481, 2138, 2312, 2186, 2008, 2236, 1786, 1969]  # 8de9ffc's ten rehearsal nights
    finals = forecast.predictive(played)
    assert finals == forecast.predictive(played)  # a fixed random seed: the same every run
    band = [round(forecast.quantile(finals, q)) for q in (0.5, 0.1, 0.9)]
    assert band == [2170, 2055, 2301]
    # Wider than a 10-point bootstrap, which ignores that uncertainty.
    rng = forecast.random.Random(forecast.RNG_SEED)
    boots = [forecast.best_mean([rng.choice(played) for _ in range(10)]) for _ in range(forecast.SIMULATIONS)]
    assert band[2] - band[1] > forecast.quantile(boots, 0.9) - forecast.quantile(boots, 0.1)

    path = tmp_path / "ledger.csv"
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=["shift", "kind", "complete", "commit", "seed", "score"])
        writer.writeheader()
        for seed, score in zip(forecast.REHEARSAL_SEEDS, played):
            writer.writerow({"shift": f"w2-r{seed}", "kind": "build", "complete": "True", "commit": "8de9ffc", "seed": seed, "score": score})
    hunt = tmp_path / "hunt.log"
    hunt.write_text("".join(f"[w0] seed {s}: 70 req, est {2000 + 10 * s} pts, fup 1\n" for s in range(20, 100)), encoding="utf-8")
    monkeypatch.setattr(forecast, "SEEDHUNT_LOG", hunt)
    monkeypatch.setattr(forecast.seedhunt, "__defaults__", (hunt,))
    lines, doc = forecast.second_forecast(path, "8de9ffc", (2050, 1759, 2393))
    text = "\n".join(lines)
    assert "median 2,170, 80 % interval 2,055 - 2,301" in text
    assert "over the 80 seeds it probed" in text
    assert "Both forecasts, committed before the final: the model 2,050 (80 %: 1,759 - 2,393); the rehearsal 2,170 (80 %: 2,055 - 2,301)" in text
    assert "THE FINAL (12:00-13:00, mean of the best 9 of 10): not played yet" in text
    assert doc["second"]["median"] == 2170 and doc["final"] is None
    monkeypatch.setattr(forecast, "FINAL_RESULT", (2200.0, "the server's board, 13:05"))
    lines, doc = forecast.second_forecast(path, "8de9ffc", (2050, 1759, 2393))
    assert "THE FINAL: 2,200 (the server's board, 13:05); the model's 80 % interval: inside; the rehearsal's: inside" in "\n".join(lines)
    assert doc["final"] == {"score": 2200.0, "source": "the server's board, 13:05"}
