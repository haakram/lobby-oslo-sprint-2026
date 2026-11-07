"""CLI: python -m agent run|final|route|viewer."""

from __future__ import annotations

import argparse
import sys
import threading
from collections.abc import Callable

from agent import agent as shift
from agent.brain import Brain, CostGuard
from agent.client import WybeClient
from agent.config import Settings, load_settings
from agent.guard import FinalModeLocked, check_mode

FINAL_SHIFTS = 10
FINAL_REAL_TIME_S = 44 * 60

ClientFactory = Callable[..., WybeClient]


def _brain(settings: Settings) -> Brain:
    return Brain(settings, CostGuard(settings.budget_usd))


def cmd_run(args, settings: Settings, factory: ClientFactory) -> int:
    client = factory(settings, live=args.live)
    result = shift.run_shift(
        client, mode="practice", seed=args.seed, brain=_brain(settings), sim_end=args.sim_end
    )
    print(f"shift {result['shift']}  score {result['score']}  "
          f"served {result['requests_served']}  ({result['reason']})")
    return 0


def cmd_final(args, settings: Settings, factory: ClientFactory) -> int:
    try:
        check_mode("final", armed=settings.final_armed)
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
    return 0


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


def main(argv: list[str] | None = None, *, client_factory: ClientFactory | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m agent")
    sub = ap.add_subparsers(dest="command", required=True)
    p = sub.add_parser("run", help="one practice shift (offline fake unless --live)")
    p.add_argument("--seed", type=int, default=None)
    p.add_argument("--sim-end", default=None, help="stop at this sim clock, HH:MM:SS")
    p.add_argument("--live", action="store_true", help="use the real server (counted)")
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
    args = ap.parse_args(argv)
    return args.fn(args, load_settings(), client_factory or shift.make_client)


if __name__ == "__main__":
    sys.exit(main())
