#!/usr/bin/env python3
"""Simple development server that serves the project and accepts PNG uploads.

- Drag & drop PNGs from the UI, which POSTs to `/upload`.
- The server resizes the PNG to the standard tile width (256px) using
  `resize_tiles.resize_image` and drops it into `tiles/`.
- `tiles/manifest.json` is updated automatically with defaults for label and origin.

Run:
  python upload_server.py
Then open http://localhost:8000/ to use the builder.
"""
from __future__ import annotations

import cgi
import json
import os
import re
import secrets
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler
from pathlib import Path
from socketserver import TCPServer
from typing import Tuple

from resize_tiles import DEFAULT_WIDTH, resize_image

ROOT = Path(__file__).parent.resolve()
TILES_DIR = ROOT / "tiles"
MANIFEST_PATH = TILES_DIR / "manifest.json"


def slugify(name: str) -> str:
    base = Path(name).stem.lower()
    base = re.sub(r"[^0-9a-zA-Z]+", "-", base).strip("-") or "tile"
    return base


def load_manifest() -> dict:
    if MANIFEST_PATH.exists():
        with open(MANIFEST_PATH, "r", encoding="utf-8") as fh:
            return json.load(fh)
    return {"tiles": []}


def save_manifest(manifest: dict) -> None:
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(MANIFEST_PATH, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=2)


def add_manifest_entry(filename: str, label: str, origin_y: float) -> dict:
    manifest = load_manifest()
    existing_keys = {tile["key"] for tile in manifest.get("tiles", [])}
    base_key = slugify(filename)
    key = base_key
    counter = 2
    while key in existing_keys:
        key = f"{base_key}{counter}"
        counter += 1
    entry = {
        "key": key,
        "label": label,
        "file": f"tiles/{filename}",
        "originY": round(origin_y, 3),
        "scale": 1,
    }
    manifest.setdefault("tiles", []).append(entry)
    save_manifest(manifest)
    return entry


class UploadHandler(SimpleHTTPRequestHandler):
    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/upload":
            self.send_error(HTTPStatus.NOT_FOUND, "Unknown endpoint")
            return

        content_type = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in content_type:
            self.send_error(HTTPStatus.BAD_REQUEST, "Expected multipart form data")
            return

        form = cgi.FieldStorage(
            fp=self.rfile,
            headers=self.headers,
            environ={
                "REQUEST_METHOD": "POST",
                "CONTENT_TYPE": content_type,
            },
        )

        if "file" not in form:
            self.send_error(HTTPStatus.BAD_REQUEST, "Missing file field")
            return

        file_item = form["file"]
        if not file_item.filename:
            self.send_error(HTTPStatus.BAD_REQUEST, "Empty filename")
            return

        raw = file_item.file.read()
        if not raw:
            self.send_error(HTTPStatus.BAD_REQUEST, "Empty file")
            return

        label = form.getfirst("label", "").strip() or slugify(file_item.filename)
        origin_raw = form.getfirst("originY", "0.5")
        try:
            origin_y = max(0.0, min(1.0, float(origin_raw)))
        except ValueError:
            origin_y = 0.5

        safe_name = slugify(file_item.filename)
        filename = f"{safe_name}-{secrets.token_hex(3)}.png"
        target_path = TILES_DIR / filename
        TILES_DIR.mkdir(parents=True, exist_ok=True)
        with open(target_path, "wb") as fh:
            fh.write(raw)

        resize_image(target_path, DEFAULT_WIDTH, None, inplace=True, suffix="")
        entry = add_manifest_entry(filename, label, origin_y)
        self.respond_json({"message": "업로드 완료", "entry": entry})

    def respond_json(self, payload: dict, status: HTTPStatus = HTTPStatus.OK) -> None:
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def serve(addr: Tuple[str, int]) -> None:
    os.chdir(ROOT)
    with TCPServer(addr, UploadHandler) as httpd:
        host, port = httpd.server_address
        print(f"Serving on http://{host}:{port}")
        httpd.serve_forever()


if __name__ == "__main__":
    serve(("localhost", 8000))
