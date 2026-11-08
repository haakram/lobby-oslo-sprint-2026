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

The target is the build that plays at 12:00: the head of ``hamad/final``, read from git (jury round 5,
The data juror and the Wybe juror), and every commit whose agent code (``agent/``) is identical to it counts as the same
build (``013f90d`` and ``8de9ffc`` differ only in a test).

1. **Leave-seed-out check.** The only build nights on seeds no build of the final branch was tuned on
   are ``d4e445c``'s on seeds 9 and 11 (played once, Sun 00:23, never tuned live). Refit without those two
   cells, predict them, and compare with what was played. The mean gap (log scale) is the *tuning
   penalty*: how much worse a build does on a seed it was not tuned on than the model expects from its
   tuned nights. It rests on n = 2.
2. **The final.** The final plays 10 unseen seeds and ranks on the mean of the best 9. Simulate it:
   draw 10 seed effects from the seeds the target build never played (bootstrap), add the residual and
   the tuning penalty, drop the worst night, average the rest. 20,000 finals, a fixed random seed, so
   the output is the same on every run. Round 5 (the data juror): the residual is the leave-one-cell-out RMSE
   (how well the model predicts a cell it did not see), not the in-sample SD, and the penalty is drawn
   once per simulated final from a normal with its mean and its standard error (n = 2), so the band
   carries the penalty's uncertainty instead of treating it as known.
3. **Out-of-sample check.** The dress rehearsal: the target build on 10 seeds no build had played
   (``REHEARSAL_SEEDS``), started Sun 05:02. It is compared with the forecast committed before it (the
   last commit of ``docs/runs/forecast.txt`` before the first rehearsal start, read from git), and the
   rehearsal's own nights give a second forecast (a bootstrap of its scores, best 9 of 10).

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
import functools
import math
import random
import re
import statistics
import subprocess
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
LEDGER_CSV = REPO / "docs" / "runs" / "ledger.csv"
FORECAST_TXT = REPO / "docs" / "runs" / "forecast.txt"

FINAL_BRANCH = "hamad/final"  # the build that plays at 12:00 is this branch's head
TARGET_FALLBACK = "8de9ffc"  # when git cannot say (a clone without the branch)
HOLDOUT_BUILD, HOLDOUT_SEEDS = "d4e445c", (9, 11)
# The dress rehearsal (Sun 05:02, 8de9ffc): ten seeds no build had played. Out of sample for every forecast before it.
REHEARSAL_SEEDS = (22, 34, 53, 55, 67, 70, 78, 83, 86, 93)
FINAL_SHIFTS, DROPPED = 10, 1
SIMULATIONS, RNG_SEED = 20_000, 20261108
INTERVAL = (0.10, 0.90)  # an 80 % interval

Cell = tuple[str, int]  # (commit, seed)


def git(*args: str) -> str:
    try:
        out = subprocess.run(["git", "-C", str(REPO), *args], capture_output=True, text=True, timeout=20, check=False)
    except (OSError, subprocess.SubprocessError):
        return ""
    return out.stdout.strip() if out.returncode == 0 else ""


def final_head() -> str:
    """The head of the final branch, the build that plays at 12:00 (local branch, else origin's)."""
    return git("rev-parse", "--short=7", FINAL_BRANCH) or git("rev-parse", "--short=7", f"origin/{FINAL_BRANCH}") or TARGET_FALLBACK


@functools.lru_cache(maxsize=None)
def same_code(commit: str, target: str) -> bool:
    """True when the agent's code (agent/) is identical in both commits: the same build for the forecast."""
    if commit == target:
        return True
    if not git("rev-parse", "--verify", "--quiet", f"{commit}^{{commit}}") or not git("rev-parse", "--verify", "--quiet", f"{target}^{{commit}}"):
        return False
    try:
        out = subprocess.run(["git", "-C", str(REPO), "diff", "--quiet", commit, target, "--", "agent"], capture_output=True, timeout=20, check=False)
    except (OSError, subprocess.SubprocessError):
        return False
    return out.returncode == 0


def read_rows(path: Path, target: str) -> list[dict]:
    """The complete live build nights with a score, each commit with the target's agent code named as the target."""
    rows = []
    with path.open(encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            if row["kind"] != "build" or row["complete"] != "True" or not row["commit"] or not row["seed"]:
                continue
            if not row["score"] or int(row["score"]) <= 0:
                continue
            row["played"] = row["commit"]
            if same_code(row["commit"], target):
                row["commit"] = target
            rows.append(row)
    return rows


def read_cells(path: Path, target: str) -> tuple[dict[Cell, float], dict[Cell, list[int]]]:
    """Mean log score per (commit, seed) over the complete live build nights, and the scores behind each; the
    dress rehearsal's seeds are left out (they are the out-of-sample check)."""
    scores: dict[Cell, list[int]] = defaultdict(list)
    for row in read_rows(path, target):
        if int(row["seed"]) in REHEARSAL_SEEDS:
            continue  # the out-of-sample check: kept out of the fit, so the model's forecast never saw it
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


def simulate(level: float, seed_effects: list[float], residual_sd: float, penalty: float, penalty_se: float = 0.0) -> list[float]:
    """Simulated finals. With `penalty_se`, each final draws its own tuning penalty from N(penalty, penalty_se)."""
    rng = random.Random(RNG_SEED)
    finals = []
    for _ in range(SIMULATIONS):
        drawn = rng.gauss(penalty, penalty_se) if penalty_se > 0 else penalty
        nights = sorted(math.exp(level + rng.choice(seed_effects) + rng.gauss(0.0, residual_sd) + drawn)
                        for _ in range(FINAL_SHIFTS))
        finals.append(statistics.fmean(nights[DROPPED:]))
    return finals


def loo_rmse(cells: dict[Cell, float], target: str) -> tuple[float, int]:
    """Leave-one-cell-out: refit without each cell, predict it when its build and seed are still in the fit."""
    errors = []
    for cell, y in cells.items():
        rest = component({c: v for c, v in cells.items() if c != cell}, target)
        if cell[0] not in {c for c, _ in rest} or cell[1] not in {s for _, s in rest}:
            continue
        fit = Fit(rest)
        if cell[0] in fit.build and cell[1] in fit.seed:
            errors.append(y - fit.predict_log(*cell))
    return (math.sqrt(statistics.fmean(e * e for e in errors)) if errors else float("nan")), len(errors)


def best_mean(scores: list[float]) -> float:
    """The final's statistic: the mean of the best FINAL_SHIFTS - DROPPED of FINAL_SHIFTS nights."""
    return statistics.fmean(sorted(scores)[DROPPED:])


def committed_before(when: datetime) -> tuple[str, str, str] | None:
    """(commit, time, text) of the last committed docs/runs/forecast.txt before `when`, from git."""
    line = git("log", "-1", f"--before={when.isoformat()}", "--format=%h %cI", "--", "docs/runs/forecast.txt")
    if not line:
        return None
    commit, stamp = line.split()[:2]
    text = git("show", f"{commit}:docs/runs/forecast.txt")
    return (commit, stamp, text) if text else None


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
    cells, scores = read_cells(path, target)
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
    penalty_se = statistics.stdev(gaps) / math.sqrt(len(gaps)) if len(gaps) > 1 else 0.0
    say(f"  tuning penalty (mean gap, log scale): {penalty:+.3f}, about {pct(penalty)} (n = {len(gaps)}), ",
        f"standard error {penalty_se:.3f}")
    rmse, predicted_cells = loo_rmse(linked, target)
    say(f"  leave-one-cell-out RMSE over the {predicted_cells} predictable cells: {rmse:.3f} on the log scale ",
        f"(the in-sample residual SD is {fit.residual_sd:.3f})")

    # 2. The target on its unseen seeds, and the final.
    played_mean = statistics.fmean(v for (commit, _), vs in scores.items() if commit == target for v in vs)
    plain = statistics.fmean(math.exp(level + e) for e in effects)
    say()
    say(f"{target} on the {len(unseen)} seeds it never played (model, mean night): {thousands(plain)} before the ",
        f"tuning penalty, {thousands(plain * math.exp(penalty))} after it; on the seeds it played: {thousands(played_mean)}")

    residual = rmse if math.isfinite(rmse) else fit.residual_sd
    finals = simulate(level, effects, residual, penalty, penalty_se)
    mid = quantile(finals, 0.5)
    say()
    say(f"FORECAST, the final (mean of the best {FINAL_SHIFTS - DROPPED} of {FINAL_SHIFTS} unseen seeds), {target} ",
        f"(head of {FINAL_BRANCH}, the build that plays at 12:00):")
    say(f"  median {thousands(mid)}, 80 % interval {thousands(quantile(finals, INTERVAL[0]))} - ",
        thousands(quantile(finals, INTERVAL[1])))
    say(f"  ({SIMULATIONS:,} simulated finals: seed effects drawn from the {len(unseen)} unseen seeds, the leave-one-cell-out ",
        f"residual {residual:.3f}, the tuning penalty drawn per final from N({penalty:+.3f}, {penalty_se:.3f}); random seed {RNG_SEED})")
    say()
    say("Sensitivity (median, 80 % interval):")
    say(f"  penalty fixed, in-sample residual (round 4's method)  {band(simulate(level, effects, fit.residual_sd, penalty))}")
    say(f"  no tuning penalty    {band(simulate(level, effects, residual, 0.0))}")
    say(f"  penalty doubled      {band(simulate(level, effects, residual, 2 * penalty, penalty_se))}")
    medians = []
    for drop in sorted(b for b in fit.build if b != target):
        sub = component({c: y for c, y in linked.items() if c[0] != drop}, target)
        alt_fit = Fit(sub)
        alt_effects = unseen_effects(alt_fit, sub, target)
        if alt_effects:
            alt = simulate(alt_fit.build[target], alt_effects, residual, penalty, penalty_se)
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
    out.extend(rehearsal_check(path, target))
    say()
    say("Caveats: the unseen seeds' effects rest on 1-3 nights each, mostly from early builds; the penalty is")
    say("estimated from n = 2 (its uncertainty is in the band); the replay bed screened every change on all 20")
    say("practice seeds (9 and 11 included), so no ledger seed is truly untuned for this build. Practice seeds go to")
    say(f"999: the held-out nights are the dress rehearsal's ({' '.join(map(str, REHEARSAL_SEEDS))}), above. The model")
    say("assumes a seed is equally much harder for every build (no build-by-seed term beyond the residual). The")
    say("final may use a different map and other tasks (docs/research/wybe-api.md § 1): that distribution shift is")
    say("not in any band here and is a larger risk than the tuning penalty.")
    return "\n".join(out) + "\n"


def rehearsal_check(path: Path, target: str) -> list[str]:
    """The dress rehearsal against the forecast committed before it, and the rehearsal's own forecast."""
    rows = [r for r in read_rows(path, target) if r["commit"] == target and int(r["seed"]) in REHEARSAL_SEEDS]
    starts: list[datetime] = []
    with path.open(encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            if row["seed"] and int(row["seed"]) in REHEARSAL_SEEDS and row["commit"] and same_code(row["commit"], target):
                starts.append(datetime.fromisoformat(row["started"]))
    out = ["", f"Out-of-sample check: the dress rehearsal, {target} on {len(REHEARSAL_SEEDS)} seeds no build had played "
           f"({' '.join(map(str, REHEARSAL_SEEDS))})"]
    if not starts:
        return out + ["  not started yet"]
    first = min(starts)
    by_seed = {int(r["seed"]): int(r["score"]) for r in rows}
    played = [by_seed[s] for s in REHEARSAL_SEEDS if s in by_seed]
    out.append(f"  started {first.strftime('%a %H:%M')}; complete nights {len(played)} of {len(REHEARSAL_SEEDS)}: "
               + ", ".join(f"seed {s} {thousands(by_seed[s])}" for s in REHEARSAL_SEEDS if s in by_seed))
    before = committed_before(first)
    median = low = high = night_after = night_before = None
    if before:
        commit, stamp, text = before
        m = re.search(r"median ([\d,]+), 80 % interval ([\d,]+) - ([\d,]+)", text)
        n = re.search(r"\(model, mean night\): ([\d,]+) before the tuning penalty, ([\d,]+) after it", text)
        t = re.search(r"FORECAST, the final .*?, (\w+)", text)
        if m:
            median, low, high = (int(v.replace(",", "")) for v in m.groups())
        if n:
            night_before, night_after = (int(v.replace(",", "")) for v in n.groups())
        when = datetime.fromisoformat(stamp).strftime("%a %H:%M")
        out.append(f"  forecast committed before it: {commit} ({when}, for {t.group(1) if t else '?'}), final median "
                   f"{thousands(median) if median else '?'} (80 %: {thousands(low) if low else '?'} - {thousands(high) if high else '?'}), "
                   f"mean night {thousands(night_after) if night_after else '?'} after the tuning penalty "
                   f"({thousands(night_before) if night_before else '?'} before)")
    else:
        out.append("  no forecast was committed before it")
    if not played:
        return out
    mean_night = statistics.fmean(played)
    if night_after:
        without = f"; {pct(math.log(mean_night / night_before))} against the forecast without the penalty" if night_before else ""
        out.append(f"  mean night so far {thousands(mean_night)} against {thousands(night_after)} forecast "
                   f"({pct(math.log(mean_night / night_after))}{without})")
    if len(played) == len(REHEARSAL_SEEDS):
        actual = best_mean(played)
        verdict = ""
        if low and high:
            verdict = "inside" if low <= actual <= high else ("above" if actual > high else "below")
            verdict = f": {verdict} the committed 80 % interval"
        out.append(f"  RESULT, mean of the best {FINAL_SHIFTS - DROPPED} of {FINAL_SHIFTS}: {thousands(actual)} against the "
                   f"committed median {thousands(median) if median else '?'}{verdict}")
    else:
        out.append(f"  the final's statistic (best {FINAL_SHIFTS - DROPPED} of {FINAL_SHIFTS}) waits for all {len(REHEARSAL_SEEDS)} nights")
    if len(played) >= 4:
        rng = random.Random(RNG_SEED)
        boots = [best_mean([rng.choice(played) for _ in range(FINAL_SHIFTS)]) for _ in range(SIMULATIONS)]
        out.append(f"  the rehearsal's own forecast for the final (bootstrap of its {len(played)} nights, best 9 of 10): {band(boots)}")
        out.append("  (no model and no tuned seed in it, but only as many seeds as it has; the map and tasks of the final may differ)")
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--ledger", type=Path, default=LEDGER_CSV)
    parser.add_argument("--build", default=None, help=f"the build to forecast (default: the head of {FINAL_BRANCH}, from git)")
    parser.add_argument("--check", action="store_true", help="exit 1 if docs/runs/forecast.txt is out of date")
    parser.add_argument("--stdout", action="store_true", help="print only, write nothing")
    args = parser.parse_args(argv)
    text = report(args.ledger, args.build or final_head())
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
