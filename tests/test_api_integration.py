#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Full-stack HTTP & SSE integration test suite for Antigravity Studio.
Runs completely isolated inside a temporary data directory (never mutates real `data/` or `custom.css`).
"""

from __future__ import annotations

import base64
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from email.message import Message
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402
import backend.agy_sync as agy_sync_mod  # noqa: E402
import backend.chat_service as chat_service_mod  # noqa: E402
import backend.config as config_mod  # noqa: E402
import backend.routes as routes_mod  # noqa: E402
import backend.storage as storage_mod  # noqa: E402
import backend.workspace_files as ws_files_mod  # noqa: E402
from backend.checkpoints import CheckpointManager  # noqa: E402
from backend.skills_repo import SkillRepository  # noqa: E402

# Minimal valid 1x1 transparent PNG
TINY_PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)
TINY_PNG_B64 = "data:image/png;base64," + base64.b64encode(TINY_PNG_BYTES).decode("ascii")


def invoke_http(
    method: str,
    path: str,
    body: Any = None,
    headers: Optional[Dict[str, str]] = None,
) -> Tuple[int, Dict[str, str], bytes]:
    """Invoke HarnessRequestHandler._handle_all end-to-end without binding a TCP socket."""
    raw_body = b""
    hdrs = {"Host": "127.0.0.1:8765"}
    if body is not None:
        if isinstance(body, (dict, list)):
            raw_body = json.dumps(body, ensure_ascii=False).encode("utf-8")
            hdrs["Content-Type"] = "application/json; charset=utf-8"
        elif isinstance(body, str):
            raw_body = body.encode("utf-8")
        else:
            raw_body = bytes(body)
    if headers:
        hdrs.update(headers)

    msg = Message()
    for k, v in hdrs.items():
        msg[k] = v
    if raw_body and "Content-Length" not in msg:
        msg["Content-Length"] = str(len(raw_body))

    raw_out = io.BytesIO()
    h = server.HarnessRequestHandler.__new__(server.HarnessRequestHandler)
    h.command = method
    h.path = path
    h.request_version = "HTTP/1.1"
    h.requestline = f"{method} {path} HTTP/1.1"
    h.headers = msg
    h.rfile = io.BytesIO(raw_body)
    h.wfile = raw_out
    h.client_address = ("127.0.0.1", 54321)
    h.server = None
    h.close_connection = True
    h._handle_all(method)

    resp_bytes = raw_out.getvalue()
    head_b, _, body_b = resp_bytes.partition(b"\r\n\r\n")
    head_lines = head_b.decode("iso-8859-1").splitlines()
    status_code = int(head_lines[0].split()[1])
    resp_headers: Dict[str, str] = {}
    for ln in head_lines[1:]:
        if ":" in ln:
            k, v = ln.split(":", 1)
            resp_headers[k.strip().lower()] = v.strip()
    return status_code, resp_headers, body_b


def parse_sse_events(raw_bytes: bytes) -> List[Dict[str, Any]]:
    events: List[Dict[str, Any]] = []
    for ln in raw_bytes.decode("utf-8", errors="replace").splitlines():
        if ln.startswith("data: "):
            events.append(json.loads(ln[6:]))
    return events


class IsolatedStudioTestCase(unittest.TestCase):
    """Base test case isolating all disk state into a fresh temporary directory."""

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp_root = Path(self._tmp.name)
        self.data_dir = self.tmp_root / "data"
        self.conv_dir = self.data_dir / "conversations"
        self.upload_dir = self.data_dir / "uploads"
        self.ws_dir = self.data_dir / "workspace"
        self.settings_file = self.data_dir / "settings.json"
        self.schedules_file = self.data_dir / "schedules.json"
        self.custom_css_file = self.tmp_root / "custom.css"

        for d in (self.data_dir, self.conv_dir, self.upload_dir, self.ws_dir):
            d.mkdir(parents=True, exist_ok=True)
        self.custom_css_file.write_text("/* isolated test css */\n", encoding="utf-8")

        self.checkpoints = CheckpointManager(self.data_dir)
        self.skills_repo = SkillRepository(self.data_dir)

        self._saved: List[Tuple[Any, str, Any]] = []
        patches = [
            (config_mod, "DATA_DIR", self.data_dir),
            (config_mod, "CONV_DIR", self.conv_dir),
            (config_mod, "UPLOAD_DIR", self.upload_dir),
            (config_mod, "DEFAULT_WORKSPACE_DIR", self.ws_dir),
            (config_mod, "SETTINGS_FILE", self.settings_file),
            (config_mod, "SCHEDULES_FILE", self.schedules_file),
            (config_mod, "CUSTOM_CSS_FILE", self.custom_css_file),
            (storage_mod, "CONV_DIR", self.conv_dir),
            (storage_mod, "SCHEDULES_FILE", self.schedules_file),
            (agy_sync_mod, "CONV_DIR", self.conv_dir),
            (agy_sync_mod, "DATA_DIR", self.data_dir),
            (agy_sync_mod, "DEFAULT_WORKSPACE_DIR", self.ws_dir),
            (agy_sync_mod, "AGY_SYNC_ROOTS", []),
            (agy_sync_mod, "_LAST_AUTO_SYNC_TS", 0.0),
            (routes_mod, "DATA_DIR", self.data_dir),
            (routes_mod, "UPLOAD_DIR", self.upload_dir),
            (routes_mod, "DEFAULT_WORKSPACE_DIR", self.ws_dir),
            (routes_mod, "CUSTOM_CSS_FILE", self.custom_css_file),
            (routes_mod, "CHECKPOINTS", self.checkpoints),
            (routes_mod, "SKILLS_REPO", self.skills_repo),
            (chat_service_mod, "DATA_DIR", self.data_dir),
            (chat_service_mod, "DEFAULT_WORKSPACE_DIR", self.ws_dir),
            (chat_service_mod, "CHECKPOINTS", self.checkpoints),
            (chat_service_mod, "SKILLS_REPO", self.skills_repo),
            (ws_files_mod, "UPLOAD_DIR", self.upload_dir),
            (ws_files_mod, "DEFAULT_WORKSPACE_DIR", self.ws_dir),
            (server, "DATA_DIR", self.data_dir),
            (server, "CONV_DIR", self.conv_dir),
            (server, "UPLOAD_DIR", self.upload_dir),
            (server, "CUSTOM_CSS_FILE", self.custom_css_file),
        ]
        for mod, attr, val in patches:
            if hasattr(mod, attr):
                self._saved.append((mod, attr, getattr(mod, attr)))
                setattr(mod, attr, val)

    def tearDown(self) -> None:
        for mod, attr, orig in reversed(self._saved):
            setattr(mod, attr, orig)
        self._tmp.cleanup()


class TestFullStackHttpApi(IsolatedStudioTestCase):
    def test_static_assets_security_headers_and_traversal_blocks(self) -> None:
        for route, expected_ct in [
            ("/", "text/html"),
            ("/static/studio-theme.css", "text/css"),
            ("/static/app.js", "application/javascript"),
            ("/favicon.ico", "image/x-icon"),
            ("/static/vendor/katex/katex.min.css", "text/css"),
            ("/static/vendor/katex/katex.min.js", "application/javascript"),
            ("/static/vendor/mermaid/mermaid.min.js", "application/javascript"),
        ]:
            st, hdrs, body = invoke_http("GET", route)
            self.assertEqual(st, 200, f"Expected 200 for {route}")
            self.assertIn(expected_ct, hdrs.get("content-type", ""))
            self.assertEqual(hdrs.get("x-content-type-options"), "nosniff")
            self.assertEqual(hdrs.get("referrer-policy"), "same-origin")
            self.assertGreater(len(body), 0)

        # Path traversal & unknown route blocks
        for bad_route in ["/static/../../server.py", "/uploads/../../server.py", "/api/nonexistent-endpoint"]:
            st, _, _ = invoke_http("GET", bad_route)
            self.assertEqual(st, 404, f"Expected 404 for {bad_route}")

        # DNS rebinding / CSRF Origin / Referer blocks
        st_host, _, _ = invoke_http("GET", "/api/status", headers={"Host": "evil.example.com:8765"})
        self.assertEqual(st_host, 403)
        st_orig, _, _ = invoke_http("POST", "/api/settings", {"theme": "dark"}, headers={"Origin": "https://evil.com"})
        self.assertEqual(st_orig, 403)
        st_ref, _, _ = invoke_http("POST", "/api/settings", {"theme": "dark"}, headers={"Referer": "https://evil.com/x"})
        self.assertEqual(st_ref, 403)

    def test_status_settings_and_github_token_redaction(self) -> None:
        st, _, raw = invoke_http("GET", "/api/status")
        self.assertEqual(st, 200)
        data = json.loads(raw)
        self.assertIn("settings", data)
        self.assertIn("engines", data)

        st_eng, _, raw_eng = invoke_http("GET", "/api/engines")
        self.assertEqual(st_eng, 200)
        self.assertEqual(len(json.loads(raw_eng)["engines"]), 4)

        # Save a token, language, and appearance settings; verify token is NEVER echoed back over HTTP
        self.assertEqual(data["settings"].get("language"), "zh-CN")
        st_save, _, raw_save = invoke_http(
            "POST",
            "/api/settings",
            {
                "theme": "dark",
                "color_scheme": "forest",
                "font_style": "mono",
                "language": "ja",
                "github_token": "gho_unit_test_secret_token",
            },
        )
        self.assertEqual(st_save, 200)
        pub = json.loads(raw_save)["settings"]
        self.assertEqual(pub["theme"], "dark")
        self.assertEqual(pub["color_scheme"], "forest")
        self.assertEqual(pub["font_style"], "mono")
        self.assertEqual(pub["language"], "ja")
        self.assertEqual(pub["github_token"], "")
        self.assertTrue(pub["github_token_set"])

        # Saving general settings with blank github_token must NOT wipe the stored token
        st_save2, _, raw_save2 = invoke_http(
            "POST",
            "/api/settings",
            {"theme": "light", "github_token": ""},
        )
        self.assertEqual(st_save2, 200)
        self.assertTrue(json.loads(raw_save2)["settings"]["github_token_set"])
        disk_settings = config_mod.load_settings()
        self.assertEqual(disk_settings["github_token"], "gho_unit_test_secret_token")

        # Dedicated server-log endpoint works regardless of active workspace
        (self.data_dir / "desktop-server.log").write_text("Server started cleanly\n", encoding="utf-8")
        st_log, _, raw_log = invoke_http("GET", "/api/server-log")
        self.assertEqual(st_log, 200)
        log_payload = json.loads(raw_log)
        self.assertTrue(log_payload["ok"])
        self.assertTrue(log_payload["read_only"])
        self.assertIn("Server started cleanly", log_payload["content"])

    def test_conversations_full_lifecycle_search_pin_fork_truncate_export(self) -> None:
        st, _, raw = invoke_http("POST", "/api/conversations", {"title": "集成测试对话", "cwd": str(self.ws_dir)})
        self.assertEqual(st, 201)
        cid = json.loads(raw)["conversation"]["id"]

        # Seed messages
        conv = storage_mod.load_conversation(cid)
        assert conv is not None
        conv["messages"] = [
            {"id": "u1", "role": "user", "content": "请解释红黑树旋转原理", "timestamp": 1700000100.0},
            {"id": "a1", "role": "assistant", "content": "左旋和右旋保持 $O(\\log n)$ 树高。", "timestamp": 1700000105.0},
            {"id": "u2", "role": "user", "content": "给我写个 Mermaid 图", "timestamp": 1700000200.0},
            {"id": "a2", "role": "assistant", "content": "```mermaid\ngraph TD\nA-->B\n```", "timestamp": 1700000205.0},
        ]
        storage_mod.save_conversation(conv)
        orig_updated = storage_mod.load_conversation(cid)["updated_at"]

        # Pinning only should NOT alter updated_at
        st_pin, _, raw_pin = invoke_http("PATCH", f"/api/conversations/{cid}", {"pinned": True})
        self.assertEqual(st_pin, 200)
        patched = json.loads(raw_pin)["conversation"]
        self.assertTrue(patched["pinned"])
        self.assertAlmostEqual(patched["updated_at"], orig_updated, places=3)

        # Full-text search hits body text
        st_q, _, raw_q = invoke_http("GET", "/api/conversations/search?q=%E7%BA%A2%E9%BB%91%E6%A0%91")
        self.assertEqual(st_q, 200)
        hits = json.loads(raw_q)["conversations"]
        self.assertEqual(len(hits), 1)
        self.assertEqual(hits[0]["id"], cid)

        # Export Markdown (raw attachment + json format)
        st_md, hdr_md, body_md = invoke_http("GET", f"/api/conversations/{cid}/export")
        self.assertEqual(st_md, 200)
        self.assertIn("text/markdown", hdr_md.get("content-type", ""))
        self.assertIn("attachment", hdr_md.get("content-disposition", ""))
        self.assertIn("红黑树旋转原理", body_md.decode("utf-8"))

        st_mdj, _, body_mdj = invoke_http("GET", f"/api/conversations/{cid}/export?format=json")
        self.assertEqual(st_mdj, 200)
        self.assertTrue(json.loads(body_mdj)["filename"].endswith(".md"))

        # Fork & truncate
        st_f, _, raw_f = invoke_http("POST", f"/api/conversations/{cid}/fork", {"up_to_index": 1})
        self.assertEqual(st_f, 201)
        fork_id = json.loads(raw_f)["conversation"]["id"]
        self.assertEqual(len(json.loads(raw_f)["conversation"]["messages"]), 2)

        st_t, _, raw_t = invoke_http("POST", f"/api/conversations/{cid}/truncate", {"keep_count": 2})
        self.assertEqual(st_t, 200)
        self.assertEqual(len(json.loads(raw_t)["conversation"]["messages"]), 2)

        # Delete & 404 check
        st_del, _, _ = invoke_http("DELETE", f"/api/conversations/{cid}")
        self.assertEqual(st_del, 200)
        invoke_http("DELETE", f"/api/conversations/{fork_id}")
        st_404, _, _ = invoke_http("GET", f"/api/conversations/{cid}")
        self.assertEqual(st_404, 404)

    def test_upload_avatar_library_and_custom_css_routes(self) -> None:
        # Upload PNG
        st_up, _, raw_up = invoke_http(
            "POST",
            "/api/upload",
            {"name": "pixel.png", "data_base64": TINY_PNG_B64, "mime": "image/png"},
        )
        self.assertEqual(st_up, 201)
        up_file = json.loads(raw_up)["file"]
        self.assertTrue(up_file["preview_url"].startswith("/uploads/"))

        # Serve uploaded bytes
        st_get, hdr_get, body_get = invoke_http("GET", up_file["preview_url"])
        self.assertEqual(st_get, 200)
        self.assertEqual(hdr_get.get("content-type"), "image/png")
        self.assertEqual(body_get, TINY_PNG_BYTES)

        # Library lists it & deletes it
        st_lib, _, raw_lib = invoke_http("GET", "/api/library")
        self.assertEqual(st_lib, 200)
        self.assertTrue(any(it.get("preview_url") == up_file["preview_url"] for it in json.loads(raw_lib)["items"]))

        fname = up_file["preview_url"].split("/uploads/", 1)[1]
        st_del, _, _ = invoke_http("DELETE", f"/api/library/upload/{fname}")
        self.assertEqual(st_del, 200)
        st_gone, _, _ = invoke_http("GET", up_file["preview_url"])
        self.assertEqual(st_gone, 404)

        # Avatar upload updates settings
        st_av, _, raw_av = invoke_http(
            "POST",
            "/api/avatar",
            {"name": "me.png", "data_base64": TINY_PNG_B64, "mime": "image/png"},
        )
        self.assertEqual(st_av, 201)
        av_url = json.loads(raw_av)["profile_avatar"]
        self.assertTrue(av_url.startswith("/uploads/"))
        self.assertEqual(config_mod.load_settings()["profile_avatar"], av_url)

        # Custom CSS read/write
        st_css_post, _, raw_css_post = invoke_http("POST", "/api/css", {"css": "body { --test-var: 1; }\n"})
        self.assertEqual(st_css_post, 200)
        self.assertTrue(json.loads(raw_css_post)["ok"])
        st_css_get, _, raw_css_get = invoke_http("GET", "/api/css")
        self.assertEqual(st_css_get, 200)
        self.assertIn("--test-var: 1", json.loads(raw_css_get)["css"])
        st_css_raw, _, body_css_raw = invoke_http("GET", "/custom.css")
        self.assertEqual(st_css_raw, 200)
        self.assertIn("--test-var: 1", body_css_raw.decode("utf-8"))

    def test_schedules_and_skills_http_crud(self) -> None:
        # Schedules validation + CRUD
        st_bad, _, _ = invoke_http("POST", "/api/schedules", {"name": "Empty", "prompt": ""})
        self.assertEqual(st_bad, 400)

        st_sc, _, raw_sc = invoke_http(
            "POST",
            "/api/schedules",
            {"name": "每日汇总", "prompt": "总结今日变更", "schedule_type": "daily", "daily_time": "08:30"},
        )
        self.assertEqual(st_sc, 201)
        tid = json.loads(raw_sc)["schedule"]["id"]

        st_patch, _, raw_patch = invoke_http("PATCH", f"/api/schedules/{tid}", {"enabled": False, "daily_time": "10:00"})
        self.assertEqual(st_patch, 200)
        self.assertFalse(json.loads(raw_patch)["schedule"]["enabled"])
        self.assertEqual(json.loads(raw_patch)["schedule"]["daily_time"], "10:00")

        st_404, _, _ = invoke_http("PATCH", "/api/schedules/missing-id", {"enabled": True})
        self.assertEqual(st_404, 404)

        st_del, _, _ = invoke_http("DELETE", f"/api/schedules/{tid}")
        self.assertEqual(st_del, 200)
        self.assertEqual(len(json.loads(invoke_http("GET", "/api/schedules")[2])["schedules"]), 0)

        # Skills HTTP CRUD + import + dispatch-preview
        st_sk_list, _, raw_sk = invoke_http("GET", "/api/skills")
        self.assertEqual(st_sk_list, 200)
        self.assertGreaterEqual(len(json.loads(raw_sk)["skills"]), 6)

        st_sk_add, _, raw_add = invoke_http(
            "POST",
            "/api/skills",
            {
                "name": "性能剖析师",
                "slug": "perf-profiler",
                "triggers": ["卡顿", "火焰图"],
                "body": "分析 CPU 火焰图并定位瓶颈。",
            },
        )
        self.assertEqual(st_sk_add, 200)
        sid = json.loads(raw_add)["skill"]["id"]

        st_dp, _, raw_dp = invoke_http(
            "POST",
            "/api/skills/dispatch-preview",
            {"prompt": "页面最近有点卡顿，帮我看火焰图", "auto_dispatch": True},
        )
        self.assertEqual(st_dp, 200)
        self.assertIn("perf-profiler", [s["slug"] for s in json.loads(raw_dp)["skills"]])

        st_imp, _, raw_imp = invoke_http(
            "POST",
            "/api/skills/import",
            {"raw_markdown": "---\nname: 发布检查\ntriggers: [release]\n---\n\n检查版本号与 Changelog。", "slug": "release-check"},
        )
        self.assertEqual(st_imp, 200)
        imp_id = json.loads(raw_imp)["skill"]["id"]

        st_tog, _, _ = invoke_http("PATCH", f"/api/skills/{sid}", {"enabled": False})
        self.assertEqual(st_tog, 200)
        st_rm1, _, _ = invoke_http("DELETE", f"/api/skills/{sid}")
        self.assertEqual(st_rm1, 200)
        st_rm2, _, _ = invoke_http("DELETE", f"/api/skills/{imp_id}")
        self.assertEqual(st_rm2, 200)

    def test_workspace_fs_and_local_folder_browser_http_routes(self) -> None:
        # Local folder browser HTTP CRUD
        st_mk, _, raw_mk = invoke_http("POST", "/api/fs/mkdir", {"parent": str(self.ws_dir), "name": "sub_proj"})
        self.assertEqual(st_mk, 200)
        sub_path = json.loads(raw_mk)["path"]
        self.assertTrue(Path(sub_path).is_dir())

        st_ls, _, raw_ls = invoke_http("GET", f"/api/fs/list?path={self.ws_dir}")
        self.assertEqual(st_ls, 200)
        self.assertTrue(any(d["name"] == "sub_proj" for d in json.loads(raw_ls)["dirs"]))

        st_rn, _, raw_rn = invoke_http("POST", "/api/fs/rename", {"path": sub_path, "new_name": "sub_proj_v2"})
        self.assertEqual(st_rn, 200)
        sub_path_v2 = json.loads(raw_rn)["path"]

        # Protected home deletion rejected via HTTP 400
        st_prot, _, _ = invoke_http("POST", "/api/fs/delete", {"path": str(Path.home())})
        self.assertEqual(st_prot, 400)

        # Workspace tree CRUD + read/write/raw/search
        st_cf, _, _ = invoke_http("POST", "/api/workspace/create", {"cwd": sub_path_v2, "path": "src/main.py", "kind": "file"})
        self.assertEqual(st_cf, 200)
        st_wf, _, _ = invoke_http("POST", "/api/workspace/write", {"cwd": sub_path_v2, "path": "src/main.py", "content": "print('ok')\n"})
        self.assertEqual(st_wf, 200)

        st_rd, _, raw_rd = invoke_http("GET", f"/api/workspace/read?cwd={sub_path_v2}&path=src/main.py")
        self.assertEqual(st_rd, 200)
        self.assertIn("print('ok')", json.loads(raw_rd)["content"])

        st_raw, _, body_raw = invoke_http("GET", f"/api/workspace/raw?cwd={sub_path_v2}&path=src/main.py")
        self.assertEqual(st_raw, 200)
        self.assertEqual(body_raw, b"print('ok')\n")

        st_srch, _, raw_srch = invoke_http("GET", f"/api/fs/files?cwd={sub_path_v2}&q=main")
        self.assertEqual(st_srch, 200)
        self.assertTrue(any(f["rel_path"] == "src/main.py" for f in json.loads(raw_srch)["files"]))

        # Traversal rejected
        st_trav, _, _ = invoke_http("POST", "/api/workspace/write", {"cwd": sub_path_v2, "path": "../evil.py", "content": "x"})
        self.assertEqual(st_trav, 400)
        st_raw_trav, _, _ = invoke_http("GET", f"/api/workspace/raw?cwd={sub_path_v2}&path=../evil.py")
        self.assertEqual(st_raw_trav, 404)

        # Clean delete
        st_dl, _, _ = invoke_http("POST", "/api/fs/delete", {"path": sub_path_v2})
        self.assertEqual(st_dl, 200)
        self.assertFalse(Path(sub_path_v2).exists())

    def test_checkpoints_and_git_http_workflow_on_temp_repo(self) -> None:
        repo = self.ws_dir / "git_demo"
        repo.mkdir()
        (repo / "README.md").write_text("# Demo v1\n", encoding="utf-8")

        # Manual checkpoint -> mutate -> preview -> restore -> GC
        st_cp, _, raw_cp = invoke_http("POST", "/api/checkpoints", {"cwd": str(repo), "conversation_id": "c-int", "label": "v1"})
        self.assertEqual(st_cp, 201)
        cp_id = json.loads(raw_cp)["checkpoint"]["id"]

        (repo / "README.md").write_text("# Broken v2\n", encoding="utf-8")
        st_prev, _, raw_prev = invoke_http("GET", f"/api/checkpoints/{cp_id}/preview")
        self.assertEqual(st_prev, 200)
        self.assertEqual(json.loads(raw_prev)["modified"], ["README.md"])

        st_rest, _, raw_rest = invoke_http("POST", f"/api/checkpoints/{cp_id}/restore", {"create_backup": False})
        self.assertEqual(st_rest, 200)
        self.assertTrue(json.loads(raw_rest)["ok"])
        self.assertEqual((repo / "README.md").read_text(encoding="utf-8"), "# Demo v1\n")

        st_gc, _, raw_gc = invoke_http("POST", "/api/checkpoints/gc", {"max_checkpoints": 60, "max_age_days": 30})
        self.assertEqual(st_gc, 200)
        self.assertTrue(json.loads(raw_gc)["ok"])

        # Git HTTP routes workflow (uses real git if usable in environment, otherwise verifies HTTP routing via deterministic fake _run_git)
        from backend.git_github import _find_git_binary
        import backend.git_github as git_mod

        git_bin = _find_git_binary()
        real_git_ok = False
        if git_bin:
            try:
                probe = subprocess.run([git_bin, "--version"], capture_output=True, text=True, timeout=5)
                real_git_ok = probe.returncode == 0
            except Exception:
                real_git_ok = False

        if real_git_ok:
            st_init, _, raw_init = invoke_http("POST", "/api/workspace/git-init", {"cwd": str(repo), "create_gitignore": True})
            self.assertEqual(st_init, 200)
            self.assertTrue(json.loads(raw_init)["ok"], raw_init.decode("utf-8", errors="ignore"))

            subprocess.run([git_bin, "config", "user.name", "Test Bot"], cwd=str(repo), check=True)
            subprocess.run([git_bin, "config", "user.email", "test@example.com"], cwd=str(repo), check=True)

            st_gs, _, raw_gs = invoke_http("GET", f"/api/workspace/git-status?cwd={repo}")
            self.assertEqual(st_gs, 200)
            self.assertTrue(json.loads(raw_gs)["is_git"])

            st_stg, _, raw_stg = invoke_http("POST", "/api/workspace/git-stage", {"cwd": str(repo), "all": True})
            self.assertEqual(st_stg, 200)
            self.assertTrue(json.loads(raw_stg)["ok"])

            st_cm, _, raw_cm = invoke_http("POST", "/api/workspace/git-commit", {"cwd": str(repo), "message": "initial commit"})
            self.assertEqual(st_cm, 200)
            self.assertTrue(json.loads(raw_cm)["ok"])

            (repo / "README.md").write_text("# Demo v2 changed\n", encoding="utf-8")
            st_df, _, raw_df = invoke_http("GET", f"/api/workspace/git-diff?cwd={repo}&path=README.md")
            self.assertEqual(st_df, 200)
            self.assertIn("Demo v2 changed", json.loads(raw_df).get("diff", ""))

            st_br, _, raw_br = invoke_http("POST", "/api/workspace/git-branch", {"cwd": str(repo), "action": "create", "name": "feat/test-branch"})
            self.assertEqual(st_br, 200)
            self.assertTrue(json.loads(raw_br)["ok"])

            st_wt, _, raw_wt = invoke_http("GET", f"/api/workspace/git-worktrees?cwd={repo}")
            self.assertEqual(st_wt, 200)
            self.assertTrue(json.loads(raw_wt)["is_git"])
        else:
            def fake_run_git(root, args, timeout=12):
                if args[:2] == ["rev-parse", "--is-inside-work-tree"]:
                    return 0, "true", ""
                if args[:2] == ["rev-parse", "--show-toplevel"]:
                    return 0, str(repo), ""
                if args[:2] == ["rev-parse", "--abbrev-ref"]:
                    return 0, "main", ""
                if args[:1] == ["status"]:
                    return 0, "## main\n M README.md\n", ""
                if args[:1] == ["branch"]:
                    return 0, "* main\n", ""
                if "diff" in args:
                    return 0, "@@ -1 +1 @@\n-# Demo v1\n+# Demo v2 changed\n", ""
                if args[:2] == ["worktree", "list"]:
                    return 0, f"worktree {repo}\nHEAD 11112222\nbranch refs/heads/main\n", ""
                return 0, "ok", ""

            with mock.patch.object(git_mod, "_run_git", side_effect=fake_run_git), mock.patch.object(routes_mod, "_run_git", side_effect=fake_run_git):
                st_gs, _, raw_gs = invoke_http("GET", f"/api/workspace/git-status?cwd={repo}")
                self.assertEqual(st_gs, 200)
                self.assertTrue(json.loads(raw_gs)["is_git"])

                st_stg, _, raw_stg = invoke_http("POST", "/api/workspace/git-stage", {"cwd": str(repo), "all": True})
                self.assertEqual(st_stg, 200)
                self.assertTrue(json.loads(raw_stg)["ok"])

                st_cm, _, raw_cm = invoke_http("POST", "/api/workspace/git-commit", {"cwd": str(repo), "message": "initial commit"})
                self.assertEqual(st_cm, 200)
                self.assertTrue(json.loads(raw_cm)["ok"])

                st_df, _, raw_df = invoke_http("GET", f"/api/workspace/git-diff?cwd={repo}&path=README.md")
                self.assertEqual(st_df, 200)
                self.assertIn("Demo v2 changed", json.loads(raw_df).get("diff", ""))

                st_wt, _, raw_wt = invoke_http("GET", f"/api/workspace/git-worktrees?cwd={repo}")
                self.assertEqual(st_wt, 200)
                self.assertTrue(json.loads(raw_wt)["is_git"])

    def test_sse_chat_demo_mocked_cli_and_streaming_terminal(self) -> None:
        # 1. Empty prompt -> 400
        st_empty, _, _ = invoke_http("POST", "/api/chat/stream", {"prompt": "   "})
        self.assertEqual(st_empty, 400)

        # 2. Demo SSE chat
        with mock.patch("server.run_sse_chat", side_effect=lambda p, emit: chat_service_mod.run_sse_chat(p, emit, fast_demo=True)):
            st_demo, hdr_demo, body_demo = invoke_http(
                "POST",
                "/api/chat/stream",
                {"prompt": "测试演示模式", "demo": True, "cwd": str(self.ws_dir)},
            )
        self.assertEqual(st_demo, 200)
        self.assertIn("text/event-stream", hdr_demo.get("content-type", ""))
        demo_evs = parse_sse_events(body_demo)
        demo_types = [e["type"] for e in demo_evs]
        self.assertIn("session", demo_types)
        self.assertIn("text_delta", demo_types)
        self.assertIn("done", demo_types)

        # 3. Mocked real CLI turn with auto-checkpoint + skill dispatch + tool_update + thinking
        (self.ws_dir / "sample.py").write_text("x = 1\n", encoding="utf-8")

        def fake_cli_stream(conv, prompt, settings, **kwargs):
            yield {"type": "meta", "agy_conversation_id": "agy-remote-999"}
            yield {"type": "thinking_delta", "delta": "Checking sample.py..."}
            yield {
                "type": "tool_update",
                "tool": {"id": "tc1", "name": "read_file", "args": {"Path": "sample.py"}, "status": "ACTIVE"},
            }
            yield {
                "type": "tool_update",
                "tool": {"id": "tc1", "name": "read_file", "output": "x = 1", "status": "DONE"},
            }
            yield {"type": "text_delta", "delta": "已完成审查，发现 $O(1)$ 逻辑正常。"}
            yield {"type": "result_meta", "agy_conversation_id": "agy-remote-999"}

        with mock.patch.object(chat_service_mod, "stream_agy_cli", side_effect=fake_cli_stream):
            st_cli, hdr_cli, body_cli = invoke_http(
                "POST",
                "/api/chat/stream",
                {"prompt": "/bug-hunter 排查 sample.py 的潜在问题", "cwd": str(self.ws_dir)},
            )
        self.assertEqual(st_cli, 200)
        self.assertIn("text/event-stream", hdr_cli.get("content-type", ""))
        cli_evs = parse_sse_events(body_cli)
        cli_types = [e["type"] for e in cli_evs]
        self.assertIn("checkpoint", cli_types)
        self.assertIn("skills_dispatched", cli_types)
        self.assertIn("tool_update", cli_types)
        self.assertIn("done", cli_types)

        done_ev = [e for e in cli_evs if e["type"] == "done"][-1]
        saved_conv = storage_mod.load_conversation(done_ev["conversation_id"])
        assert saved_conv is not None
        self.assertEqual(saved_conv["agy_conversation_id"], "agy-remote-999")
        self.assertEqual(len(saved_conv["messages"]), 2)
        self.assertIsInstance(saved_conv["messages"][0].get("timestamp"), float)
        self.assertEqual(saved_conv["messages"][1]["thinking"], "Checking sample.py...")
        self.assertEqual(saved_conv["messages"][1]["tools"][0]["output"], "x = 1")
        self.assertEqual(saved_conv["messages"][1]["tools"][0]["status"], "DONE")
        self.assertTrue(bool(done_ev.get("checkpoint_id")))

        # 4. Abort endpoint (no running proc -> ok, aborted=False)
        st_ab, _, raw_ab = invoke_http("POST", "/api/chat/abort", {"conversation_id": done_ev["conversation_id"]})
        self.assertEqual(st_ab, 200)
        self.assertTrue(json.loads(raw_ab)["ok"])

        # 5. Streaming terminal HTTP SSE endpoint
        st_tm, hdr_tm, body_tm = invoke_http(
            "POST",
            "/api/workspace/terminal/stream",
            {"command": "echo HTTP_SSE_TERM_OK", "cwd": str(self.ws_dir), "session_id": "int-term"},
        )
        self.assertEqual(st_tm, 200)
        self.assertIn("text/event-stream", hdr_tm.get("content-type", ""))
        tm_evs = parse_sse_events(body_tm)
        out_txt = "".join(e.get("chunk", "") for e in tm_evs if e.get("type") == "stdout")
        self.assertIn("HTTP_SSE_TERM_OK", out_txt)
        self.assertEqual([e for e in tm_evs if e.get("type") == "done"][-1]["exit_code"], 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
