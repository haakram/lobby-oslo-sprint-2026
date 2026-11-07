import json
import threading
import urllib.error
import urllib.request
from pathlib import Path

import pytest

from agent import viewer_server

LIVE = "w2-aaaaaaaa11"
ENDED = "w2-bbbbbbbb22"


def _write(path: Path, lines: list[dict]) -> None:
    path.write_text("".join(json.dumps(x) + "\n" for x in lines))


@pytest.fixture()
def base(tmp_path):
    _write(
        tmp_path / f"{ENDED}.jsonl",
        [
            {"v": 1, "t": 1.0, "type": "start", "shift": ENDED, "mode": "practice", "seed": 1},
            {"v": 1, "t": 2.0, "type": "state", "clock": 10, "location": "lobby", "score": 4},
            {"v": 1, "t": 3.0, "type": "end", "score": 7, "requests_served": 2, "reason": "done"},
        ],
    )
    _write(
        tmp_path / f"{LIVE}.jsonl",
        [
            {"v": 1, "t": 5.0, "type": "start", "shift": LIVE, "mode": "practice", "seed": 2},
            {"v": 1, "t": 6.0, "type": "state", "clock": 3, "location": "lobby", "score": 1},
        ],
    )
    (tmp_path / ".env").write_text("SECRET=1")
    server = viewer_server.make_server(0, tmp_path)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()
    server.server_close()


def get(url):
    try:
        with urllib.request.urlopen(url) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def test_api_runs_lists_live_and_ended(base):
    status, body = get(base + "/api/runs")
    assert status == 200
    runs = {r["shift"]: r for r in json.loads(body)}
    assert runs[LIVE]["live"] is True and runs[LIVE]["score"] == 1 and runs[LIVE]["seed"] == 2
    assert runs[ENDED]["live"] is False and runs[ENDED]["score"] == 7
    assert runs[ENDED]["mode"] == "practice"
    assert json.loads(body)[0]["shift"] == LIVE  # newest first


def test_api_run_from_offset(base):
    _, body = get(f"{base}/api/run/{ENDED}")
    data = json.loads(body)
    assert len(data["lines"]) == 3 and data["next"] == 3
    _, body = get(f"{base}/api/run/{ENDED}?from=2")
    data = json.loads(body)
    assert [x["type"] for x in data["lines"]] == ["end"] and data["next"] == 3
    _, body = get(f"{base}/api/run/{ENDED}?from=99")
    assert json.loads(body) == {"lines": [], "next": 99}


def test_rejects_bad_shift_id_and_traversal(base):
    for path in ["/api/run/../../.env", "/api/run/not-a-shift", "/api/run/w2-xyz", "/static/../.env", "/static/.env",
                 "/static/%2e%2e/.env", "/static/..%2f.env", "/api/run/..%2f..%2f.env"]:
        assert get(base + path)[0] == 404, path
    assert get(f"{base}/api/run/w2-cccccccc33")[0] == 404  # valid id, no file


def test_half_written_last_line_is_not_served_until_complete(base, tmp_path):
    path = tmp_path / f"{LIVE}.jsonl"
    with path.open("a") as fh:
        fh.write('{"v":1,"type":"sta')  # no newline: writer is mid-line
    data = json.loads(get(f"{base}/api/run/{LIVE}")[1])
    assert len(data["lines"]) == 2 and data["next"] == 2
    with path.open("a") as fh:
        fh.write('te","clock":9,"location":"lobby","score":2}\n')
    data = json.loads(get(f"{base}/api/run/{LIVE}?from=2")[1])
    assert data["next"] == 3 and data["lines"][0]["type"] == "state" and data["lines"][0]["score"] == 2


def test_hotel_json_served(base):
    status, body = get(base + "/api/hotel")
    assert status == 200 and "nodes" in json.loads(body) and "edges" in json.loads(body)


def test_index_and_static_served(base):
    assert get(base + "/")[0] == 200
    assert get(base + "/static/app.js")[0] == 200
    assert get(base + "/static/missing.js")[0] == 404
