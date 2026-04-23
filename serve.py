#!/usr/bin/env python3
"""
Static file server for dist/ that adds the cross-origin isolation headers
needed for SharedArrayBuffer (which the LLM worker uses for multi-threaded
WASM). Run from the project root after `npm run build`:

    python3 serve.py

Then open http://localhost:5173/
"""
import http.server
import socketserver
import os

PORT = 5173
DIRECTORY = "dist"


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        # Disable caching during local testing so rebuilds show immediately
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if not os.path.isdir(DIRECTORY):
    raise SystemExit(f"{DIRECTORY!r} not found. Run `npm run build` first.")

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Serving {DIRECTORY}/ on http://localhost:{PORT}/")
    httpd.serve_forever()
