"""Write router_parity.json: Track A's shortest routes, for hotelRouter.test.ts to compare against.

    .venv/bin/python src/features/routes/fixtures/make_router_parity.py

Pairs: every cleaning start to every room and back, plus every room on a floor to one room on each
other floor; with and without the cart. Seconds and the node path, straight from agent.routing.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))

from agent.routing import shortest_route
from agent.world import Hotel

HOTEL = ROOT / "src/features/hotel/hotel_seed1.json"
OUT = Path(__file__).with_name("router_parity.json")
STARTS = ["laundry", "storage", "front-desk"]


def main() -> None:
    hotel = Hotel.load(HOTEL)
    rooms = sorted(n for n, v in hotel.nodes.items() if v["kind"] == "room")
    pairs = [(s, r) for s in STARTS for r in rooms] + [(r, s) for s in STARTS[:1] for r in rooms]
    pairs += [(a, b) for a in rooms for b in ("room-104", "room-207", "room-319") if a != b]
    out = []
    for cart in (False, True):
        for a, b in pairs:
            route = shortest_route(hotel, a, b, with_cart=cart)
            out.append({"from": a, "to": b, "cart": cart, "seconds": round(route.seconds, 3), "path": route.path})
    OUT.write_text(json.dumps(out, separators=(",", ":")) + "\n")
    print(f"{len(out)} routes -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
