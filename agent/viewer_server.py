"""Local 3D viewer server: serves viewer/ plus the hotel map and run logs (read-only, 127.0.0.1)."""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

ROOT = Path(__file__).resolve().parent.parent
VIEWER_DIR = ROOT / "viewer"
HOTEL_JSON = Path(__file__).resolve().parent / "data" / "hotel_seed1.json"
SHIFT_RE = re.compile(r"^w2-[0-9a-f]{8,64}$")
STATIC_RE = re.compile(r"^[A-Za-z0-9_.-]+$")
DEFAULT_ALLOWED_ORIGINS = ("http://localhost:3000", "http://127.0.0.1:3000")


def allowed_origins() -> set[str]:
    """CORS allowlist for /api/*: env VIEWER_ALLOWED_ORIGINS (comma-separated) or the dev default."""
    raw = os.environ.get("VIEWER_ALLOWED_ORIGINS", "")
    custom = {o.strip() for o in raw.split(",") if o.strip()}
    return custom or set(DEFAULT_ALLOWED_ORIGINS)


def read_lines(path: Path) -> list[dict]:
    """Complete, valid JSON lines of a run log (a half-written last line is ignored)."""
    out: list[dict] = []
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return out
    for raw in text.split("\n")[:-1]:  # last element is "" or a half-written line
        if not raw.strip():
            continue
        try:
            obj = json.loads(raw)
        except ValueError:
            continue
        if isinstance(obj, dict):
            out.append(obj)
    return out


def summarize(path: Path) -> dict | None:
    lines = read_lines(path)
    start = next((x for x in lines if x.get("type") == "start"), None)
    if start is None:
        return None
    score = 0
    for x in lines:
        if x.get("type") in ("state", "end") and isinstance(x.get("score"), (int, float)):
            score = x["score"]
    return {
        "shift": path.stem,
        "mode": start.get("mode"),
        "seed": start.get("seed"),
        "started": start.get("t", path.stat().st_mtime),
        "score": score,
        "live": not any(x.get("type") == "end" for x in lines),
    }


def make_handler(runs_dir: Path):
    class Handler(BaseHTTPRequestHandler):
        server_version = "NightShiftViewer"

        def log_message(self, *args):  # quiet
            pass

        def _send(self, status: int, body: bytes, ctype: str = "application/json") -> None:
            self.send_response(status)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self._cors_headers()
            self.end_headers()
            self.wfile.write(body)

        def _is_api(self) -> bool:
            return urlsplit(self.path).path.startswith("/api/")

        def _allowed_origin(self) -> str | None:
            origin = self.headers.get("Origin")
            return origin if origin and origin in allowed_origins() else None

        def _cors_headers(self) -> None:
            """Echo an allowed Origin on /api/* only (never "*"); static files get nothing."""
            if not self._is_api():
                return
            self.send_header("Vary", "Origin")
            origin = self._allowed_origin()
            if origin:
                self.send_header("Access-Control-Allow-Origin", origin)

        def do_OPTIONS(self):
            origin = self._allowed_origin() if self._is_api() else None
            if origin is None:
                self.send_response(403)
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()

        def _json(self, obj, status: int = 200) -> None:
            self._send(status, json.dumps(obj).encode())

        def _not_found(self) -> None:
            self._json({"error": "not found"}, 404)

        def _file(self, path: Path) -> None:
            try:
                body = path.read_bytes()
            except OSError:
                return self._not_found()
            ctype = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
            if ctype.startswith("text/") or ctype.endswith("javascript"):
                ctype += "; charset=utf-8"
            self._send(200, body, ctype)

        def do_GET(self):
            parts = urlsplit(self.path)
            path = parts.path
            if path == "/":
                return self._file(VIEWER_DIR / "index.html")
            if path.startswith("/static/"):
                name = path[len("/static/"):]
                if not STATIC_RE.match(name) or name.startswith("."):  # no slashes, no "..", no %-escapes
                    return self._not_found()
                return self._file(VIEWER_DIR / name)
            if path == "/api/hotel":
                return self._file(HOTEL_JSON)
            if path == "/api/runs":
                runs = []
                for p in runs_dir.glob("*.jsonl"):
                    if SHIFT_RE.match(p.stem) and (s := summarize(p)):
                        runs.append(s)
                runs.sort(key=lambda r: r["started"], reverse=True)
                return self._json(runs)
            if path.startswith("/api/run/"):
                shift = unquote(path[len("/api/run/"):])
                if not SHIFT_RE.match(shift):
                    return self._not_found()
                f = runs_dir / f"{shift}.jsonl"
                if not f.is_file():
                    return self._not_found()
                try:
                    start = max(0, int(parse_qs(parts.query).get("from", ["0"])[0]))
                except ValueError:
                    start = 0
                lines = read_lines(f)
                return self._json({"lines": lines[start:], "next": max(start, len(lines))})
            self._not_found()

    return Handler


def make_server(port: int = 8765, runs_dir: Path = Path("temp/runs")) -> ThreadingHTTPServer:
    server = ThreadingHTTPServer(("127.0.0.1", port), make_handler(Path(runs_dir)))
    server.daemon_threads = True
    return server


def serve(port: int = 8765, runs_dir: Path = Path("temp/runs")) -> None:
    server = make_server(port, runs_dir)
    print(f"Night Shift viewer: http://127.0.0.1:{server.server_address[1]}/  (runs: {runs_dir})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description="Night Shift 3D viewer")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--runs-dir", type=Path, default=Path("temp/runs"))
    args = ap.parse_args(argv)
    serve(args.port, args.runs_dir)


if __name__ == "__main__":
    main()
