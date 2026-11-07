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


def req(url, method="GET", origin=None, headers=None):
    h = dict(headers or {})
    if origin is not None:
        h["Origin"] = origin
    r = urllib.request.Request(url, method=method, headers=h)
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, resp.headers, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.headers, e.read()


ACAO = "Access-Control-Allow-Origin"


def test_cors_allowed_origin_echoed_with_vary(base):
    for path in ["/api/runs", "/api/hotel", f"/api/run/{ENDED}"]:
        for origin in ["http://localhost:3000", "http://127.0.0.1:3000"]:
            status, headers, _ = req(base + path, origin=origin)
            assert status == 200 and headers[ACAO] == origin, path
            assert "Origin" in headers["Vary"]


def test_cors_disallowed_or_missing_origin_gets_no_header(base):
    for origin in ["http://evil.example", "http://localhost:3001", "null", None]:
        status, headers, _ = req(base + "/api/runs", origin=origin)
        assert status == 200 and ACAO not in headers, origin


def test_cors_not_on_static_files(base):
    for path in ["/", "/static/app.js"]:
        status, headers, _ = req(base + path, origin="http://localhost:3000")
        assert status == 200 and ACAO not in headers, path


def test_cors_preflight_allowed_origin(base):
    status, headers, body = req(base + "/api/runs", "OPTIONS", "http://localhost:3000")
    assert status == 204 and body == b""
    assert headers[ACAO] == "http://localhost:3000"
    assert headers["Access-Control-Allow-Methods"] == "GET, OPTIONS"
    assert headers["Access-Control-Allow-Headers"] == "Content-Type"
    assert "Origin" in headers["Vary"]


def test_cors_preflight_disallowed_origin_is_403(base):
    for origin in ["http://evil.example", None]:
        status, headers, _ = req(base + "/api/runs", "OPTIONS", origin)
        assert status == 403 and ACAO not in headers
        assert "Access-Control-Allow-Methods" not in headers
    status, headers, _ = req(base + "/static/app.js", "OPTIONS", "http://localhost:3000")
    assert status == 403 and ACAO not in headers


def test_cors_env_override(base, monkeypatch):
    monkeypatch.setenv("VIEWER_ALLOWED_ORIGINS", "https://app.example, http://localhost:4000")
    for origin in ["https://app.example", "http://localhost:4000"]:
        assert req(base + "/api/runs", origin=origin)[1][ACAO] == origin
    assert ACAO not in req(base + "/api/runs", origin="http://localhost:3000")[1]


def _raw(base, path, host, method="GET"):
    req = urllib.request.Request(base + path, method=method, headers={"Host": host})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code


def test_host_check_allows_loopback_names(base):
    port = base.rsplit(":", 1)[1]
    assert _raw(base, "/api/runs", f"127.0.0.1:{port}") == 200
    assert _raw(base, "/api/runs", f"localhost:{port}") == 200
    assert _raw(base, "/", f"localhost:{port}") == 200


@pytest.mark.parametrize(
    "host", ["evil.example", "evil.example:8765", "localhost", "127.0.0.1", "localhost:1",
             "localhost.evil.example:{port}", "127.0.0.1:{port}.evil.example"],
)
def test_host_check_rejects_rebinding(base, host):
    port = base.rsplit(":", 1)[1]
    host = host.format(port=port)
    for path in ("/api/runs", "/api/hotel", "/", "/static/app.js"):
        assert _raw(base, path, host) == 403


def test_host_check_applies_to_options(base):
    port = base.rsplit(":", 1)[1]
    req = urllib.request.Request(
        base + "/api/runs", method="OPTIONS",
        headers={"Host": "evil.example", "Origin": "http://localhost:3000"},
    )
    with pytest.raises(urllib.error.HTTPError) as e:
        urllib.request.urlopen(req)
    assert e.value.code == 403
    ok = urllib.request.Request(
        base + "/api/runs", method="OPTIONS",
        headers={"Host": f"localhost:{port}", "Origin": "http://localhost:3000"},
    )
    with urllib.request.urlopen(ok) as r:
        assert r.status == 204
