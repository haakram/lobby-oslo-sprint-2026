"""CLI: python -m agent run|final|route|viewer|bench|tune."""

from __future__ import annotations

import argparse
import os
import sys
import threading
from collections.abc import Callable
from dataclasses import replace
from datetime import datetime
from pathlib import Path

from agent import agent as shift
from agent.brain import Brain, CostGuard
from agent.client import ShiftSession, WybeClient, WybeError
from agent.config import Settings, load_settings
from agent.guard import OSLO, FinalModeLocked, check_mode

FINAL_SHIFTS = 10
FINAL_REAL_TIME_S = 44 * 60
FINAL_LOCK = Path("temp/final.lock")  # the pid of the one final process allowed at a time

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
    session = None
    if getattr(args, "adopt", None):
        # A live practice shift the server still lists (e.g. left mid-night by an outage): play on.
        if not args.live:
            print("--adopt needs --live", file=sys.stderr)
            return 2
        session = ShiftSession(client, args.adopt, "practice", args.seed)
        session.log_decision("adopted_shift", {"shift": args.adopt})
    result = shift.run_shift(
        client, mode="practice", seed=args.seed, brain=brain, sim_end=args.sim_end, session=session
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
    other = _take_final_lock(FINAL_LOCK)  # two final processes would play the same shifts
    if other is not None:
        print(f"final: another final process (pid {other}) holds {FINAL_LOCK}; not starting a second one",
              file=sys.stderr)
        return 2
    try:
        return _final(settings, factory)
    finally:
        _drop_final_lock(FINAL_LOCK)


def _final(settings: Settings, factory: ClientFactory) -> int:
    from agent.world import Hotel

    try:  # a bad params or map file must fail here, before any shift has started
        params = shift.load_params()
        Hotel.load()
    except Exception as exc:  # noqa: BLE001
        print(f"final: setup failed before any start ({type(exc).__name__}: {str(exc)[:200]}); "
              "check agent/data/params_best.json and the hotel map", file=sys.stderr)
        return 2
    client = factory(settings, live=True)  # one client: its rate limiter is shared by all shifts
    stop = threading.Event()
    try:  # also the pre-flight: the key and the connection work, and we know what already runs
        starter = shift.FinalStarter(client, limit=FINAL_SHIFTS, stop=stop)
    except WybeError as exc:
        print(f"final: could not list our shifts, nothing started: {exc}", file=sys.stderr)
        return 2
    _say(f"final: {len(starter.live)} live final shift(s) to adopt, {starter.ended} ended, "
         f"starting {starter.remaining} new (limit {FINAL_SHIFTS})")
    brain = _brain(settings)
    results: list[dict] = [{} for _ in range(FINAL_SHIFTS)]

    def not_started(i: int, label: str, why: str) -> None:
        results[i] = {"shift": None, "score": None, "reason": f"not started: {why}"}
        _say(f"{label} {results[i]['reason']}")

    def work(i: int) -> None:
        label = f"shift {i + 1}/{FINAL_SHIFTS}"
        if stop.is_set():
            return not_started(i, label, "stopped")
        try:
            hotel = Hotel.load()  # this shift's own map, before its start
            session = starter.session()
        except Exception as exc:  # noqa: BLE001 - one dead shift must not stop the others
            return not_started(i, label, f"{type(exc).__name__}: {str(exc)[:120]}")
        if session is None:
            return not_started(i, label, "stopped" if stop.is_set() else "all final starts used")
        _say(f"{label} {session.shift_id} {'adopted' if session.shift_id in starter.live else 'started'}")
        try:
            results[i] = shift.run_shift(
                client, session=session, params=params, hotel=hotel, brain=brain,
                real_time_limit_s=FINAL_REAL_TIME_S, stop=stop,
            )
        except Exception as exc:  # noqa: BLE001
            results[i] = {"shift": session.shift_id, "score": None, "reason": f"crashed: {type(exc).__name__}"}
        r = results[i]
        _say(f"{label} {session.shift_id} ended  score {r.get('score')}  ({r.get('reason')})")

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
    _say("summary:")
    for r in results:
        print(f"shift {r.get('shift')}  score {r.get('score')}  ({r.get('reason')})", flush=True)
    return 0 if any(r.get("score") is not None for r in results) else 1


def _say(text: str) -> None:
    print(f"[{datetime.now(OSLO):%H:%M:%S}] {text}", flush=True)


def _other_final_pid(path: Path) -> int | None:
    """The pid in the lockfile when it belongs to another process that is still alive."""
    try:
        pid = int(path.read_text().strip())
    except (OSError, ValueError):
        return None
    if pid == os.getpid():
        return None
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return None  # stale: that process is gone
    except PermissionError:
        return pid  # alive, another user's
    return pid


def _take_final_lock(path: Path) -> int | None:
    """Write our pid into the lockfile; returns the other live holder's pid instead when there is one."""
    other = _other_final_pid(path)
    if other is not None:
        return other
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(str(os.getpid()))
    return None


def _drop_final_lock(path: Path) -> None:
    try:
        if path.read_text().strip() == str(os.getpid()):
            path.unlink()
    except OSError:
        pass


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

    def make(seed: int, hourly_scale: float = 1.0) -> WybeClient:
        fake = FakeWybe(**offline_scenario(seed, hourly_scale=hourly_scale))
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
    if args.live and args.hourly_scale != 1.0:
        print("--hourly-scale is offline only (generated nights); the live server plays its own", file=sys.stderr)
        return 2
    if args.live:
        client = factory(settings, live=True)  # one client: its rate limiter is shared by all threads
        make = lambda: client
    else:
        make = _offline_factory()
    cap = _resolve_cap(args, settings)
    res = run_bench(make, seeds, parallel=args.parallel, sim_end=args.sim_end, max_calls=cap,
                    hourly_scale=args.hourly_scale)
    for seed, score in res.scores.items():
        at = f" at {res.cap_clocks[seed]}" if seed in res.cap_clocks else ""
        low = res.min_battery.get(seed)
        print(f"seed {seed}  score {score}  calls {res.calls.get(seed, 0)}  capped {res.capped_scores[seed]}{at}"
              f"  requests {res.requests.get(seed, 0)}  served {res.served.get(seed, 0)}"
              f"  min_battery {'-' if low is None else f'{low:.1f}'}  docks {res.dock_calls.get(seed, 0)}")
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
        capped=args.optimise_capped, hourly_scale=args.hourly_scale,
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
    p.add_argument("--adopt", default=None, metavar="SHIFT", help="play on a live practice shift the server lists (with --live)")
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
    p.add_argument("--sim-end", default="06:00:00", help="stop at this sim clock, HH:MM:SS (the night ends 06:00)")
    p.add_argument("--live", action="store_true", help="use the real server (counted)")
    p.add_argument("--max-calls", type=int, default=None, help="call cap per shift (default: the final's, 44*60*rps/10; 0 = none). The capped score is the "
                   "last score the agent observed (status/end replies); retries are not counted")
    p.add_argument("--hourly-scale", type=float, default=1.0, help="multiply every hour's generated requests (1.3: ~88 a night, like live seeds 10/16/23); seed 1 ignores it")
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
    p.add_argument("--hourly-scale", type=float, default=1.0, help="multiply every hour's generated requests (1.3: ~88 a night, like live seeds 10/16/23); seed 1 ignores it")
    p.set_defaults(fn=cmd_tune)
    args = ap.parse_args(argv)
    return args.fn(args, load_settings(), client_factory or shift.make_client)


if __name__ == "__main__":
    sys.exit(main())
