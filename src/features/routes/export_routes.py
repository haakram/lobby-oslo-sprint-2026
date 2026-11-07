"""Write the route matrix for the Ruter screen, using only Track A's router.

    npm run routes -- LOCATIONS_JSON [--hotel agent/data/hotel_seed1.json] [--start storage]

LOCATIONS_JSON is a JSON list of node ids (every Product.location), for example:
    npx tsx -e 'import {PRODUCTS} from "./src/features/catalog/products"; \
      console.log(JSON.stringify([...new Set(PRODUCTS.map(p => p.location))]))' > temp/locations.json

Writes src/features/routes/data/hotel.routes.json in the RouteMatrix shape (src/features/routes/types.ts):
legs for every ordered pair among the start and the locations, with Track A's seconds and path and
the metres summed from the map's edges (a lift ride has no edge, so it adds no metres).
"""

import argparse
import itertools
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

from agent.routing import shortest_route
from agent.world import Hotel

OUT = ROOT / "src/features/routes/data/hotel.routes.json"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("locations", type=Path)
    parser.add_argument("--hotel", type=Path, default=ROOT / "agent/data/hotel_seed1.json")
    parser.add_argument("--start", default="storage")
    args = parser.parse_args()

    raw = json.loads(args.hotel.read_text())
    hotel = Hotel.load(args.hotel)
    edge_m = {}
    for e in raw["edges"]:
        edge_m[(e["a"], e["b"])] = edge_m[(e["b"], e["a"])] = e["m"]

    places = [args.start, *dict.fromkeys(json.loads(args.locations.read_text()))]
    legs, used = {}, set()
    for a, b in itertools.permutations(places, 2):
        route = shortest_route(hotel, a, b)
        metres = sum(edge_m.get(step, 0) for step in zip(route.path, route.path[1:]))
        legs[f"{a}|{b}"] = {"metres": round(metres, 1), "seconds": round(route.seconds, 1), "path": route.path}
        used.update(route.path)

    nodes = {i: {k: raw["nodes"][i][k] for k in ("floor", "kind", "x", "z")} for i in sorted(used)}
    matrix = {"map": args.hotel.stem, "start": args.start, "nodes": nodes, "legs": legs}
    OUT.write_text(json.dumps(matrix, indent=2, ensure_ascii=False) + "\n")
    print(f"{len(legs)} legs, {len(nodes)} nodes -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
