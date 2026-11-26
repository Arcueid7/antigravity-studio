#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Antigravity Studio — Lightweight HTTP Server Entrypoint.
Zero external dependencies — runs natively on Python 3.10+ using
ThreadingHTTPServer (avoids Windows asyncio socketpair deadlocks).
Modular services live in `backend/`.
"""

from __future__ import annotations

import argparse
import http.server
import json
import os
import sys
import threading
import urllib.parse
from typing import Any

from backend.agy_runtime import (  # noqa: F401
    AgyStreamState,
    CAPABILITY_DIRECTIVES,
    fetch_agy_models,
    fetch_agy_usage,
    find_agy_binary,
    get_engine_registry,
    stream_agy_cli,
    stream_demo_response,
)
from backend.chat_service import (  # noqa: F401
    CHECKPOINTS,
    SKILLS_REPO,
    execute_scheduled_task_async,
    run_sse_chat,
    scheduler_daemon_loop,
)
from backend.config import (  # noqa: F401
    ACTIVE_LOCK,
    ACTIVE_PROCESSES,
    ACTIVE_TERM_PROCS,
    BASE_DIR,
    CONV_DIR,
    CUSTOM_CSS_FILE,
    DATA_DIR,
    DEFAULT_GITHUB_OAUTH_CLIENT_ID,
    DEFAULT_SETTINGS,
    DEFAULT_WORKSPACE_DIR,
    IMAGE_EXTS,
    MIME_OVERRIDES,
    MODELS_CACHE,
    SCHEDULES_FILE,
    SCHEDULES_LOCK,
    SETTINGS_FILE,
    SKIP_DIRS,
    STATIC_DIR,
    TERM_LOCK,
    UPLOAD_DIR,
    USAGE_CACHE,
    USAGE_LOCK,
    VIDEO_EXTS,
    _no_window_flags,
    _public_settings,
    _safe_is_file,
    get_custom_css_mtime,
    load_settings,
    save_settings,
)
from backend.routes import dispatch_standard_request
from backend.security import SECURITY_RESPONSE_HEADERS, validate_local_request
from backend.storage import (  # noqa: F401
    conv_path,
    create_conversation,
    fork_conversation,
    list_conversations,
    load_conversation,
    load_schedules,
    save_conversation,
    save_schedules,
    truncate_conversation,
)
from backend.terminal_stream import stream_workspace_terminal
from backend.workspace_files import _resolve_workspace_root, _safe_resolve_inside  # noqa: F401


# ---------------------------------------------------------------------------
# Multi-threaded Standard Library HTTP Server (Zero asyncio, Zero socketpair)
# ---------------------------------------------------------------------------

class HarnessRequestHandler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, format: str, *args: Any) -> None:
        # Suppress noisy per-poll access logs while keeping startup banner clean
        pass

    def _read_body(self) -> bytes:
        length = int(self.headers.get("Content-Length", "0") or "0")
        return self.rfile.read(length) if length > 0 else b""

    def _send_security_headers(self) -> None:
        for k, v in SECURITY_RESPONSE_HEADERS.items():
            self.send_header(k, v)

    def _handle_all(self, method: str) -> None:
        # Strict loopback Host / Origin / Referer security validation
        ok_req, sec_err = validate_local_request(method, self.headers)
        if not ok_req:
            err_bytes = json.dumps({"error": sec_err or "Forbidden"}, ensure_ascii=False).encode("utf-8")
            self.send_response(403)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(err_bytes)))
            self._send_security_headers()
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(err_bytes)
            return

        parsed = urllib.parse.urlsplit(self.path)
        path = urllib.parse.unquote(parsed.path)
        query = urllib.parse.parse_qs(parsed.query)
        body = self._read_body() if method in ("POST", "PATCH", "PUT") else b""

        if method == "POST" and path == "/api/chat/stream":
            try:
                payload = json.loads(body.decode("utf-8")) if body else {}
            except Exception:
                payload = {}

            if not (payload.get("prompt") or "").strip() and not (payload.get("attachments") or []):
                err = json.dumps({"error": "Prompt cannot be empty"}).encode("utf-8")
                self.send_response(400)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(err)))
                self._send_security_headers()
                self.send_header("Connection", "close")
                self.end_headers()
                self.wfile.write(err)
                return

            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self._send_security_headers()
            self.send_header("Connection", "close")
            self.send_header("X-Accel-Buffering", "no")
            self.end_headers()

            def emit_bytes(chunk: bytes) -> bool:
                try:
                    self.wfile.write(chunk)
                    self.wfile.flush()
                    return True
                except (ConnectionError, BrokenPipeError, OSError):
                    return False

            run_sse_chat(payload, emit_bytes)
            return

        if method == "POST" and path == "/api/workspace/terminal/stream":
            try:
                payload = json.loads(body.decode("utf-8")) if body else {}
            except Exception:
                payload = {}

            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self._send_security_headers()
            self.send_header("Connection", "close")
            self.send_header("X-Accel-Buffering", "no")
            self.end_headers()

            def emit_term_bytes(chunk: bytes) -> bool:
                try:
                    self.wfile.write(chunk)
                    self.wfile.flush()
                    return True
                except (ConnectionError, BrokenPipeError, OSError):
                    return False

            stream_workspace_terminal(
                payload.get("command", ""),
                payload.get("cwd", ""),
                payload.get("session_id", "default"),
                _resolve_workspace_root,
                ACTIVE_TERM_PROCS,
                TERM_LOCK,
                emit_term_bytes,
            )
            return

        status, content_type, data = dispatch_standard_request(method, path, body, query)
        self.send_response(status)
        if isinstance(content_type, dict):
            for hk, hv in content_type.items():
                self.send_header(str(hk), str(hv))
        else:
            self.send_header("Content-Type", content_type)
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self._send_security_headers()
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        self._handle_all("GET")

    def do_POST(self) -> None:
        self._handle_all("POST")

    def do_PATCH(self) -> None:
        self._handle_all("PATCH")

    def do_DELETE(self) -> None:
        self._handle_all("DELETE")


class HarnessHTTPServer(http.server.ThreadingHTTPServer):
    daemon_threads = True
    # On Windows, SO_REUSEADDR allows two processes to bind the same port silently
    # while the older process keeps receiving traffic. Keep it disabled on Windows.
    allow_reuse_address = os.name != "nt"


def main() -> None:
    ap = argparse.ArgumentParser(description="Antigravity Studio Desktop Harness for agy CLI")
    ap.add_argument("--host", default="127.0.0.1", help="Bind host (default: 127.0.0.1)")
    ap.add_argument("--port", type=int, default=8765, help="Bind port (default: 8765)")
    ap.add_argument("--open", action="store_true", help="Open browser automatically")
    args = ap.parse_args()

    try:
        httpd = HarnessHTTPServer((args.host, args.port), HarnessRequestHandler)
    except OSError as exc:
        print(f"[ERROR] Port {args.port} is already in use ({exc}).")
        print("        Run start.bat (which automatically replaces the old process) or close the previous server window first.")
        sys.exit(1)
    url = f"http://{args.host}:{args.port}"
    agy_bin = find_agy_binary(load_settings().get("agy_path", ""))

    print("=" * 64)
    print("  Antigravity Studio (agy CLI)")
    print(f"  Local URL   : {url}")
    print(f"  Custom CSS  : {CUSTOM_CSS_FILE}")
    print(f"  agy Binary  : {agy_bin or 'Not detected yet (Demo stream ready)'}")
    print("=" * 64)
    sys.stdout.flush()

    try:
        from datetime import datetime
        studio_log = DATA_DIR / "studio-server.log"
        ts_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        entry = f"[{ts_str}] Started Antigravity Studio PID={os.getpid()} URL={url} agy={agy_bin or 'demo'}\n"
        prev_lines = (
            studio_log.read_text(encoding="utf-8", errors="replace").splitlines()[-180:]
            if studio_log.exists()
            else []
        )
        studio_log.write_text("\n".join(prev_lines) + ("\n" if prev_lines else "") + entry, encoding="utf-8")
    except Exception:
        pass

    if agy_bin:
        threading.Thread(target=fetch_agy_models, daemon=True).start()
        threading.Thread(target=fetch_agy_usage, daemon=True).start()
    threading.Thread(target=scheduler_daemon_loop, daemon=True).start()
    threading.Thread(target=CHECKPOINTS.garbage_collect, daemon=True).start()

    if args.open:
        import webbrowser
        webbrowser.open(url)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
