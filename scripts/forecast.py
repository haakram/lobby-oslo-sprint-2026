"""The final's forecast: a build + seed model fitted on the evidence ledger (jury round 4, item C4; the data juror).

The Wybe simulator is deterministic: the same code on the same seed plays the same night. So the
spread between nights is not noise in a build, it is between seeds (how hard a night is) and between
builds (how good the code is). This script fits exactly that, and nothing else:

    log(score) = build effect + seed effect + residual

over the complete live ``build`` nights in ``docs/runs/ledger.csv`` (board tests and cut-off nights left
out; a build that played the same seed twice gives one cell, the mean of its log scores). It is fitted by
least squares on the build-seed graph that holds the target build (alternating means until they
settle; no numpy, so it runs in the repo's venv and in CI).

Then:

1. **Leave-seed-out check.** The only build nights on seeds no build of the final branch was tuned on
   are ``d4e445c``'s on seeds 9 and 11 (played once, Sun 00:23, never tuned live). Refit without those two
   cells, predict them, and compare with what was played. The mean gap (log scale) is the *tuning
   penalty*: how much worse a build does on a seed it was not tuned on than the model expects from its
   tuned nights. It rests on n = 2.
2. **The final.** The final plays 10 unseen seeds and ranks on the mean of the best 9. Simulate it:
   draw 10 seed effects from the seeds the target build never played (bootstrap), add the residual (a
   normal with the model's residual SD, standing for build-by-seed fit error) and the tuning penalty,
   drop the worst night, average the rest. 20,000 finals, a fixed random seed, so the output is the
   same on every run.

Writes ``docs/runs/forecast.txt`` (README and DEMO quote it). Read-only on the ledger; it never calls
the Wybe server.

Usage::

    python3 scripts/forecast.py               # print and write docs/runs/forecast.txt
    python3 scripts/forecast.py --check       # exit 1 if docs/runs/forecast.txt is out of date
    python3 scripts/forecast.py --build 8eac151 --stdout
"""

from __future__ import annotations

import argparse
import csv
import math
import random
import statistics
import sys
from collections import defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
LEDGER_CSV = REPO / "docs" / "runs" / "ledger.csv"
FORECAST_TXT = REPO / "docs" / "runs" / "forecast.txt"

TARGET = "c3801e0"  # the final branch's head (hamad/final)
HOLDOUT_BUILD, HOLDOUT_SEEDS = "d4e445c", (9, 11)
FINAL_SHIFTS, DROPPED = 10, 1
SIMULATIONS, RNG_SEED = 20_000, 20261108
INTERVAL = (0.10, 0.90)  # an 80 % interval

Cell = tuple[str, int]  # (commit, seed)


def read_cells(path: Path) -> tuple[dict[Cell, float], dict[Cell, list[int]]]:
    """Mean log score per (commit, seed) over the complete live build nights, and the scores behind each."""
    scores: dict[Cell, list[int]] = defaultdict(list)
    with path.open(encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            if row["kind"] != "build" or row["complete"] != "True" or not row["commit"] or not row["seed"]:
                continue
            if not row["score"] or int(row["score"]) <= 0:
                continue
            scores[(row["commit"], int(row["seed"]))].append(int(row["score"]))
    cells = {cell: statistics.fmean(math.log(s) for s in values) for cell, values in scores.items()}
    return cells, dict(scores)


def component(cells: dict[Cell, float], build: str) -> dict[Cell, float]:
    """The cells connected to `build` through shared seeds and builds (the effects are comparable only there)."""
    builds, seeds = {build}, set()
    changed = True
    while changed:
        changed = False
        for commit, seed in cells:
            if (commit in builds) != (seed in seeds):
                builds.add(commit)
                seeds.add(seed)
                changed = True
    return {cell: y for cell, y in cells.items() if cell[0] in builds}


class Fit:
    """log(score) = build + seed, least squares; seed effects centred on 0 over the seeds in the fit."""

    def __init__(self, cells: dict[Cell, float]) -> None:
        self.cells = cells
        by_build: dict[str, list[Cell]] = defaultdict(list)
        by_seed: dict[int, list[Cell]] = defaultdict(list)
        for cell in cells:
            by_build[cell[0]].append(cell)
            by_seed[cell[1]].append(cell)
        self.build = {b: 0.0 for b in by_build}
        self.seed = {s: 0.0 for s in by_seed}
        previous = math.inf
        for _ in range(20_000):  # alternating means: each step is the exact least-squares update of one side
            for b, group in by_build.items():
                self.build[b] = statistics.fmean(cells[c] - self.seed[c[1]] for c in group)
            for s, group in by_seed.items():
                self.seed[s] = statistics.fmean(cells[c] - self.build[c[0]] for c in group)
            centre = statistics.fmean(self.seed.values())
            self.seed = {s: e - centre for s, e in self.seed.items()}
            self.build = {b: e + centre for b, e in self.build.items()}
            sse = sum((y - self.predict_log(*cell)) ** 2 for cell, y in cells.items())
            if abs(previous - sse) < 1e-14:
                break
            previous = sse
        self.dof = len(cells) - len(self.build) - len(self.seed) + 1
        self.residual_sd = math.sqrt(sse / self.dof) if self.dof > 0 else float("nan")

    def predict_log(self, build: str, seed: int) -> float:
        return self.build[build] + self.seed[seed]


def quantile(values: list[float], q: float) -> float:
    ordered = sorted(values)
    position = q * (len(ordered) - 1)
    low = math.floor(position)
    high = min(low + 1, len(ordered) - 1)
    return ordered[low] + (ordered[high] - ordered[low]) * (position - low)


def simulate(level: float, seed_effects: list[float], residual_sd: float, penalty: float) -> list[float]:
    rng = random.Random(RNG_SEED)
    finals = []
    for _ in range(SIMULATIONS):
        nights = sorted(math.exp(level + rng.choice(seed_effects) + rng.gauss(0.0, residual_sd) + penalty)
                        for _ in range(FINAL_SHIFTS))
        finals.append(statistics.fmean(nights[DROPPED:]))
    return finals


def thousands(value: float) -> str:
    return f"{round(value):,}"


def pct(log_value: float) -> str:
    """A log-scale effect as a signed percentage, "+19 %"."""
    return f"{100 * (math.exp(log_value) - 1):+.0f} %"


def band(values: list[float]) -> str:
    """"2,035 (80 %: 1,898 - 2,186)" for simulated finals."""
    low, high = quantile(values, INTERVAL[0]), quantile(values, INTERVAL[1])
    return f"{thousands(quantile(values, 0.5))} (80 %: {thousands(low)} - {thousands(high)})"


def unseen_effects(fit: Fit, cells: dict[Cell, float], target: str) -> list[float]:
    played = {seed for commit, seed in cells if commit == target}
    return [fit.seed[seed] for seed in sorted(fit.seed) if seed not in played]


def report(path: Path, target: str) -> str:
    cells, scores = read_cells(path)
    linked = component(cells, target)
    if target not in {commit for commit, _ in linked}:
        raise SystemExit(f"no complete build nights for {target} in {path}")
    fit = Fit(linked)
    played = sorted({seed for commit, seed in linked if commit == target})
    unseen = [seed for seed in sorted(fit.seed) if seed not in played]
    effects = unseen_effects(fit, linked, target)
    level = fit.build[target]
    out: list[str] = []

    def say(*parts: str) -> None:
        out.append("".join(parts))

    say("Forecast for the final (scripts/forecast.py on docs/runs/ledger.csv; regenerate after new live nights)")
    say()
    say("Model: log(score) = build effect + seed effect, least squares over the complete live build nights")
    say(f"  {len(linked)} build x seed cells, {len(fit.build)} builds, {len(fit.seed)} seeds, ",
        f"residual SD {fit.residual_sd:.3f} on the log scale (about {pct(fit.residual_sd)}), {fit.dof} degrees of freedom")
    say(f"  target build {target}: played seeds {' '.join(map(str, played))}; ",
        f"{len(unseen)} seeds it never played: {' '.join(map(str, unseen))}")
    say()
    say("Seed difficulty (the seed effect, against the average seed; nights behind it):")
    nights_per_seed: dict[int, int] = defaultdict(int)
    for cell, values in scores.items():
        if cell in linked:
            nights_per_seed[cell[1]] += len(values)
    for seed in sorted(fit.seed, key=lambda s: -fit.seed[s]):
        n = nights_per_seed[seed]
        say(f"  seed {seed:>2}: {pct(fit.seed[seed]):>6}  ({n} night{'s' if n != 1 else ''}, ",
            "played by the target)" if seed in played else "unseen by the target)")

    # 1. Leave-seed-out: d4e445c's nights on 9 and 11, predicted from a fit without them.
    held = sorted((HOLDOUT_BUILD, seed) for seed in HOLDOUT_SEEDS if (HOLDOUT_BUILD, seed) in linked)
    gaps: list[float] = []
    say()
    say(f"Leave-seed-out check: {HOLDOUT_BUILD}'s nights on seeds {' and '.join(map(str, HOLDOUT_SEEDS))} ",
        "(never tuned live), predicted from a fit without them:")
    refit = Fit(component({c: y for c, y in linked.items() if c not in held}, target)) if held else None
    for commit, seed in held:
        if refit is None or commit not in refit.build or seed not in refit.seed:
            say(f"  seed {seed}: not predictable without its own night")
            continue
        predicted, live = math.exp(refit.predict_log(commit, seed)), math.exp(linked[(commit, seed)])
        gaps.append(math.log(live / predicted))
        say(f"  seed {seed}: predicted {thousands(predicted)}, played {thousands(live)} ({pct(math.log(live / predicted))})")
    penalty = statistics.fmean(gaps) if gaps else 0.0
    say(f"  tuning penalty (mean gap, log scale): {penalty:+.3f}, about {pct(penalty)} (n = {len(gaps)})")

    # 2. The target on its unseen seeds, and the final.
    played_mean = statistics.fmean(v for (commit, _), vs in scores.items() if commit == target for v in vs)
    plain = statistics.fmean(math.exp(level + e) for e in effects)
    say()
    say(f"{target} on the {len(unseen)} seeds it never played (model, mean night): {thousands(plain)} before the ",
        f"tuning penalty, {thousands(plain * math.exp(penalty))} after it; on the seeds it played: {thousands(played_mean)}")

    finals = simulate(level, effects, fit.residual_sd, penalty)
    mid = quantile(finals, 0.5)
    say()
    say(f"FORECAST, the final (mean of the best {FINAL_SHIFTS - DROPPED} of {FINAL_SHIFTS} unseen seeds), {target}:")
    say(f"  median {thousands(mid)}, 80 % interval {thousands(quantile(finals, INTERVAL[0]))} - ",
        thousands(quantile(finals, INTERVAL[1])))
    say(f"  ({SIMULATIONS:,} simulated finals: seed effects drawn from the {len(unseen)} unseen seeds, the residual ",
        f"SD, the tuning penalty; random seed {RNG_SEED})")
    say()
    say("Sensitivity (median, 80 % interval):")
    say(f"  no tuning penalty    {band(simulate(level, effects, fit.residual_sd, 0.0))}")
    say(f"  penalty doubled      {band(simulate(level, effects, fit.residual_sd, 2 * penalty))}")
    medians = []
    for drop in sorted(b for b in fit.build if b != target):
        sub = component({c: y for c, y in linked.items() if c[0] != drop}, target)
        alt_fit = Fit(sub)
        alt_effects = unseen_effects(alt_fit, sub, target)
        if alt_effects:
            alt = simulate(alt_fit.build[target], alt_effects, alt_fit.residual_sd, penalty)
            medians.append((quantile(alt, 0.5), drop, len(alt_effects), alt))
    if medians:
        (low_median, low_build, _, _), (_, high_build, high_n, high_alt) = min(medians), max(medians)
        say(f"  one build left out   the median moves between {thousands(low_median)} (without {low_build}) and ",
            f"{band(high_alt)} (without {high_build}, {high_n} unseen seeds left)")

    played_effect = statistics.fmean(fit.seed[seed] for seed in played)
    unseen_effect = statistics.fmean(effects)
    say()
    say(f"Why lower than the tuned nights ({thousands(played_mean)} -> {thousands(mid)}, {pct(math.log(mid / played_mean))}): ",
        "mostly seed difficulty.")
    say(f"  The seeds {target} played average {pct(played_effect)} against the average seed, the unseen ones ",
        f"{pct(unseen_effect)}: that alone is {pct(unseen_effect - played_effect)}.")
    say(f"  The tuning penalty we can measure adds {pct(penalty)} (two nights); dropping the worst night of ten ",
        "pulls the final's mean back up a little.")
    say()
    say("Caveats: the unseen seeds' effects rest on 1-3 nights each, mostly from early builds; the penalty is")
    say("estimated from n = 2; the replay bed screened every change on all 20 practice seeds (9 and 11 included),")
    say("so for the build that plays at 12:00 no ledger seed is truly untuned: the final is the only real holdout.")
    say("The model assumes a seed is equally much harder for every build (no build-by-seed term beyond the residual).")
    return "\n".join(out) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--ledger", type=Path, default=LEDGER_CSV)
    parser.add_argument("--build", default=TARGET, help="the build to forecast (default: the final branch's head)")
    parser.add_argument("--check", action="store_true", help="exit 1 if docs/runs/forecast.txt is out of date")
    parser.add_argument("--stdout", action="store_true", help="print only, write nothing")
    args = parser.parse_args(argv)
    text = report(args.ledger, args.build)
    if args.check:
        if not FORECAST_TXT.is_file() or FORECAST_TXT.read_text(encoding="utf-8") != text:
            print(f"out of date: {FORECAST_TXT.relative_to(REPO)}", file=sys.stderr)
            return 1
        return 0
    sys.stdout.write(text)
    if not args.stdout:
        FORECAST_TXT.write_text(text, encoding="utf-8")
        print(f"wrote {FORECAST_TXT.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
