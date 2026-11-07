"""CLI: python -m agent run|final|route|viewer|bench|tune."""

from __future__ import annotations

import argparse
import sys
import threading
from collections.abc import Callable
from dataclasses import replace
from datetime import datetime
from pathlib import Path

from agent import agent as shift
from agent.brain import Brain, CostGuard
from agent.client import WybeClient
from agent.config import Settings, load_settings
from agent.guard import OSLO, FinalModeLocked, check_mode

FINAL_SHIFTS = 10
FINAL_REAL_TIME_S = 44 * 60

ClientFactory = Callable[..., WybeClient]


def _now() -> datetime:
    """The clock the final's guard sees; tests patch this so they never depend on the real date."""
    return datetime.now(OSLO)


def _brain(settings: Settings) -> Brain:
    return Brain(settings, CostGuard(settings.budget_usd))


def cmd_run(args, settings: Settings, factory: ClientFactory) -> int:
    client = factory(settings, live=args.live)
    # Offline runs must not spend real Claude budget unless --brain is given.
    brain = _brain(settings) if (args.live or args.brain) else None
    result = shift.run_shift(
        client, mode="practice", seed=args.seed, brain=brain, sim_end=args.sim_end
    )
    print(f"shift {result['shift']}  score {result['score']}  "
          f"served {result['requests_served']}  ({result['reason']})")
    return 0


def cmd_final(args, settings: Settings, factory: ClientFactory) -> int:
    try:
        check_mode("final", armed=settings.final_armed, now=_now())
    except FinalModeLocked as exc:
        print(f"final is locked: {exc}", file=sys.stderr)
        return 2
    client = factory(settings, live=True)  # one client: its rate limiter is shared by all shifts
    brain = _brain(settings)
    stop = threading.Event()
    results: list[dict] = [{} for _ in range(FINAL_SHIFTS)]

    def work(i: int) -> None:
        try:
            results[i] = shift.run_shift(
                client, mode="final", seed=None, brain=brain,
                real_time_limit_s=FINAL_REAL_TIME_S, stop=stop,
            )
        except Exception as exc:  # noqa: BLE001 - one dead shift must not stop the others
            results[i] = {"shift": None, "score": None, "reason": f"crashed: {type(exc).__name__}"}

    threads = [threading.Thread(target=work, args=(i,), daemon=True) for i in range(FINAL_SHIFTS)]
    for t in threads:
        t.start()
    try:
        for t in threads:
            t.join()
    except KeyboardInterrupt:
        stop.set()
        for t in threads:
            t.join()
    for r in results:
        print(f"shift {r.get('shift')}  score {r.get('score')}  ({r.get('reason')})")
    return 1 if all(str(r.get("reason", "")).startswith("crashed") for r in results) else 0


def cmd_route(args, settings: Settings, factory: ClientFactory) -> int:
    from agent.routing import NoRoute, shortest_route
    from agent.world import Hotel

    try:
        route = shortest_route(Hotel.load(), args.src, args.dst, with_cart=args.cart)
    except (NoRoute, KeyError) as exc:
        print(f"no route: {exc}", file=sys.stderr)
        return 1
    print(" -> ".join(route.path) + f"   ({route.seconds:.0f} sim-s)")
    return 0


def cmd_viewer(args, settings: Settings, factory: ClientFactory) -> int:
    from agent.viewer_server import serve

    serve(args.port)
    return 0


def _offline_factory():
    """A fresh fake night per seed; never the real key, no throttle, no sleeping."""
    import httpx

    from agent.bench import offline_scenario
    from agent.offline import FakeWybe

    settings = load_settings()

    def make(seed: int) -> WybeClient:
        fake = FakeWybe(**offline_scenario(seed))
        offline = replace(settings, key="offline", max_rps=1000.0, runs_dir=Path("temp/bench_runs"))
        return WybeClient(offline, transport=httpx.MockTransport(fake.handler), sleep=lambda s: None)

    return make


def _resolve_cap(args, settings: Settings) -> int:
    """--max-calls: unset = what one final shift gets at our rate; 0 = unlimited."""
    from agent.bench import default_max_calls

    return default_max_calls(settings.max_rps) if args.max_calls is None else args.max_calls


def cmd_bench(args, settings: Settings, factory: ClientFactory) -> int:
    from agent.bench import parse_seeds, run_bench

    seeds = parse_seeds(args.seeds)
    if args.live:
        client = factory(settings, live=True)  # one client: its rate limiter is shared by all threads
        make = lambda: client
    else:
        make = _offline_factory()
    cap = _resolve_cap(args, settings)
    res = run_bench(make, seeds, parallel=args.parallel, sim_end=args.sim_end, max_calls=cap)
    for seed, score in res.scores.items():
        at = f" at {res.cap_clocks[seed]}" if seed in res.cap_clocks else ""
        print(f"seed {seed}  score {score}  calls {res.calls.get(seed, 0)}  capped {res.capped_scores[seed]}{at}")
    print(f"mean {res.mean:.1f}  mean_drop_worst {res.mean_drop_worst:.1f}")
    print(f"cap {cap or 'none'}  capped mean {res.mean_capped:.1f}  "
          f"capped mean_drop_worst {res.mean_drop_worst_capped:.1f}")
    print(f"params {res.params.to_json()}")
    return 0


def cmd_tune(args, settings: Settings, factory: ClientFactory) -> int:
    from agent.bench import parse_seeds, tune

    best, results = tune(
        _offline_factory(), parse_seeds(args.seeds), trials=args.trials, parallel=args.parallel,
        rng_seed=args.rng_seed, out_path=Path(args.out), max_calls=_resolve_cap(args, settings),
        capped=args.optimise_capped,
    )
    top = max(results, key=lambda r: r.mean_drop_worst_capped if args.optimise_capped else r.mean_drop_worst)
    print(f"baseline  mean {results[0].mean:.1f}  mean_drop_worst {results[0].mean_drop_worst:.1f}")
    print(f"best      mean {top.mean:.1f}  mean_drop_worst {top.mean_drop_worst:.1f}")
    print(f"params {best.to_json()}")
    return 0


def main(argv: list[str] | None = None, *, client_factory: ClientFactory | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m agent")
    sub = ap.add_subparsers(dest="command", required=True)
    p = sub.add_parser("run", help="one practice shift (offline fake unless --live)")
    p.add_argument("--seed", type=int, default=None)
    p.add_argument("--sim-end", default=None, help="stop at this sim clock, HH:MM:SS")
    p.add_argument("--live", action="store_true", help="use the real server (counted)")
    p.add_argument("--brain", action="store_true", help="allow Claude offline too (spends budget)")
    p.set_defaults(fn=cmd_run)
    p = sub.add_parser("final", help="the 10 scored shifts (live; locked outside the window)")
    p.set_defaults(fn=cmd_final)
    p = sub.add_parser("route", help="shortest route between two places")
    p.add_argument("src")
    p.add_argument("dst")
    p.add_argument("--cart", action="store_true")
    p.set_defaults(fn=cmd_route)
    p = sub.add_parser("viewer", help="3D viewer of the run logs")
    p.add_argument("--port", type=int, default=8765)
    p.set_defaults(fn=cmd_viewer)
    p = sub.add_parser("bench", help="score many shifts, mean and mean-drop-worst (offline unless --live)")
    p.add_argument("--seeds", default="1-10", help="e.g. 1-10 or 1-3,7")
    p.add_argument("--parallel", type=int, default=5)
    p.add_argument("--sim-end", default="02:00:00", help="stop at this sim clock, HH:MM:SS")
    p.add_argument("--live", action="store_true", help="use the real server (counted)")
    p.add_argument("--max-calls", type=int, default=None, help="call cap per shift (default: the final's, 44*60*rps/10; 0 = none). The capped score is the "
                   "last score the agent observed (status/end replies); retries are not counted")
    p.set_defaults(fn=cmd_bench)
    p = sub.add_parser("tune", help="offline parameter search; writes the best params (never live)")
    p.add_argument("--seeds", default="1-20")
    p.add_argument("--trials", type=int, default=12)
    p.add_argument("--parallel", type=int, default=5)
    p.add_argument("--rng-seed", type=int, default=0)
    p.add_argument("--out", default="agent/data/params_candidate.json")
    p.add_argument("--max-calls", type=int, default=None, help="call cap per shift (default: the final's, 44*60*rps/10; 0 = none). The capped score is the "
                   "last score the agent observed (status/end replies); retries are not counted")
    p.add_argument("--optimise-capped", action="store_true", help="pick the best score at the call cap")
    p.set_defaults(fn=cmd_tune)
    args = ap.parse_args(argv)
    return args.fn(args, load_settings(), client_factory or shift.make_client)


if __name__ == "__main__":
    sys.exit(main())
