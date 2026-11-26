#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Automated backend regression test suite for Antigravity Studio.
Runs with zero external dependencies via Python's built-in `unittest`.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402
from backend.checkpoints import CheckpointManager  # noqa: E402
from backend.engines import (  # noqa: E402
    ClaudeStreamParser,
    CodexStreamParser,
    GeminiStreamParser,
    list_engines_status,
)
from backend.git_worktree import git_add_worktree, git_list_worktrees, git_remove_worktree  # noqa: E402
from backend.security import validate_local_request  # noqa: E402
from backend.skills_repo import SkillRepository  # noqa: E402
from backend.terminal_stream import stream_workspace_terminal  # noqa: E402
from backend.workspace_io import (  # noqa: E402
    create_workspace_entry,
    delete_workspace_entry,
    rename_workspace_entry,
    write_workspace_file,
)


class TestSecurityValidation(unittest.TestCase):
    def test_allows_loopback_hosts_and_origins(self) -> None:
        self.assertEqual(validate_local_request("GET", {"Host": "127.0.0.1:8765"}), (True, None))
        self.assertEqual(validate_local_request("POST", {"Host": "localhost:8765", "Origin": "http://localhost:8765"}), (True, None))
        self.assertEqual(validate_local_request("POST", {"Host": "[::1]:8765", "Origin": "http://[::1]:8765"}), (True, None))

    def test_blocks_dns_rebinding_and_cross_origin(self) -> None:
        ok, err = validate_local_request("GET", {"Host": "evil.example.com:8765"})
        self.assertFalse(ok)
        self.assertIn("Host", err or "")

        ok2, err2 = validate_local_request("POST", {"Host": "127.0.0.1:8765", "Origin": "https://evil.com"})
        self.assertFalse(ok2)
        self.assertIn("Origin", err2 or "")

        ok3, err3 = validate_local_request("POST", {"Host": "127.0.0.1:8765", "Origin": "null"})
        self.assertFalse(ok3)

        ok4, err4 = validate_local_request("POST", {"Host": "127.0.0.1:8765", "Referer": "https://attacker.site/page"})
        self.assertFalse(ok4)
        self.assertIn("Referer", err4 or "")


class TestCheckpointsAndRollback(unittest.TestCase):
    def test_create_preview_and_restore_cycle(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            ws = tmp_path / "ws"
            data = tmp_path / "data"
            ws.mkdir()
            data.mkdir()

            (ws / "app.py").write_text("print('v1')\n", encoding="utf-8")
            (ws / "keep.txt").write_text("hello\n", encoding="utf-8")
            (ws / "delete_me.txt").write_text("will be deleted\n", encoding="utf-8")

            mgr = CheckpointManager(data)
            cp = mgr.create_checkpoint(str(ws), conv_id="c1", label="before-edit")
            self.assertIsNotNone(cp)
            assert cp is not None
            self.assertEqual(cp["file_count"], 3)

            # Mutate workspace: edit 1 file, delete 1 file, create 1 new file
            (ws / "app.py").write_text("print('v2 broken')\n", encoding="utf-8")
            (ws / "delete_me.txt").unlink()
            (ws / "new_junk.py").write_text("# unwanted\n", encoding="utf-8")

            preview = mgr.preview_restore(cp["id"])
            self.assertTrue(preview["ok"])
            self.assertEqual(preview["modified"], ["app.py"])
            self.assertEqual(preview["deleted"], ["delete_me.txt"])
            self.assertEqual(preview["created"], ["new_junk.py"])
            self.assertEqual(preview["total_changes"], 3)

            res = mgr.restore_checkpoint(cp["id"], create_backup=True)
            self.assertTrue(res["ok"])
            self.assertEqual(res["restored"], 2)
            self.assertEqual(res["removed"], 1)
            self.assertIsNotNone(res["backup_checkpoint"])

            self.assertEqual((ws / "app.py").read_text(encoding="utf-8"), "print('v1')\n")
            self.assertEqual((ws / "delete_me.txt").read_text(encoding="utf-8"), "will be deleted\n")
            self.assertFalse((ws / "new_junk.py").exists())

    def test_checkpoint_gc_prunes_old_and_orphan_blobs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            ws = tmp_path / "ws"
            data = tmp_path / "data"
            ws.mkdir()
            data.mkdir()

            mgr = CheckpointManager(data)

            # Shared file present across all snapshots + unique per-snapshot content
            (ws / "shared.txt").write_text("shared-constant-content\n", encoding="utf-8")

            cp_ids = []
            for idx in range(4):
                (ws / "evolving.txt").write_text(f"unique-version-{idx}\n", encoding="utf-8")
                cp = mgr.create_checkpoint(str(ws), conv_id="c1", label=f"step-{idx}")
                self.assertIsNotNone(cp)
                assert cp is not None
                cp_ids.append(cp["id"])
                # Make timestamps strictly increasing (and mark cp 0 as expired 45 days ago)
                mp = mgr.manifests_dir / f"{cp['id']}.json"
                doc = json.loads(mp.read_text(encoding="utf-8"))
                doc["created_at"] = 1_700_000_000.0 + idx * 100.0
                if idx == 0:
                    doc["created_at"] = 1_000_000_000.0  # very old / expired
                mp.write_text(json.dumps(doc), encoding="utf-8")

            # Also create a corrupt manifest and a dangling orphan blob
            (mgr.manifests_dir / "corrupt.json").write_text("{broken json", encoding="utf-8")
            orphan_shard = mgr.blobs_dir / "zz"
            orphan_shard.mkdir(parents=True, exist_ok=True)
            (orphan_shard / ("z" * 64)).write_bytes(b"orphan-blob-data")

            # Keep latest 2 checkpoints (max_age_days=0 disables wall-clock cutoff except keeping top 2)
            # Wait: also verify max_age_days=30 prunes old timestamps cleanly by setting latest 2 to recent time
            import time as _time
            now = _time.time()
            for offset, cid in enumerate(cp_ids[2:]):
                mp = mgr.manifests_dir / f"{cid}.json"
                doc = json.loads(mp.read_text(encoding="utf-8"))
                doc["created_at"] = now - (100 - offset * 10)
                mp.write_text(json.dumps(doc), encoding="utf-8")

            gc = mgr.garbage_collect(max_checkpoints=2, max_age_days=30)
            self.assertTrue(gc["ok"])
            self.assertEqual(gc["remaining_manifests"], 2)
            # cp_ids[0], cp_ids[1], and corrupt.json -> 3 manifests removed
            self.assertEqual(gc["removed_manifests"], 3)
            # 2 old unique evolving.txt blobs + 1 dangling orphan blob -> 3 blobs removed
            self.assertEqual(gc["removed_blobs"], 3)
            # shared.txt (1) + latest 2 evolving.txt (2) -> 3 blobs remaining
            self.assertEqual(gc["remaining_blobs"], 3)
            self.assertGreater(gc["freed_bytes"], 0)
            self.assertFalse(orphan_shard.exists())

            # Surviving checkpoint can still restore cleanly after GC!
            (ws / "evolving.txt").write_text("broken-now\n", encoding="utf-8")
            restored = mgr.restore_checkpoint(cp_ids[2], create_backup=False)
            self.assertTrue(restored["ok"])
            self.assertEqual((ws / "evolving.txt").read_text(encoding="utf-8"), "unique-version-2\n")
            self.assertEqual((ws / "shared.txt").read_text(encoding="utf-8"), "shared-constant-content\n")


class TestWorkspaceWriteSecurity(unittest.TestCase):
    def test_write_inside_workspace_and_block_traversal(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            ws = Path(tmp) / "proj"
            ws.mkdir()

            ok_res = write_workspace_file(
                str(ws),
                "src/hello.py",
                "x = 42\n",
                server._resolve_workspace_root,
                server._safe_resolve_inside,
            )
            self.assertTrue(ok_res["ok"])
            self.assertEqual((ws / "src" / "hello.py").read_text(encoding="utf-8"), "x = 42\n")

            bad_trav = write_workspace_file(
                str(ws),
                "../escape.txt",
                "nope",
                server._resolve_workspace_root,
                server._safe_resolve_inside,
            )
            self.assertFalse(bad_trav["ok"])

            bad_git = write_workspace_file(
                str(ws),
                ".git/config",
                "nope",
                server._resolve_workspace_root,
                server._safe_resolve_inside,
            )
            self.assertFalse(bad_git["ok"])

    def test_workspace_tree_create_rename_delete_and_guards(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            ws = Path(tmp) / "proj"
            ws.mkdir()

            # Create folder & nested file
            d_res = create_workspace_entry(str(ws), "docs/notes", "dir", server._resolve_workspace_root, server._safe_resolve_inside)
            self.assertTrue(d_res["ok"])
            self.assertTrue((ws / "docs" / "notes").is_dir())

            f_res = create_workspace_entry(str(ws), "docs/notes/draft.md", "file", server._resolve_workspace_root, server._safe_resolve_inside)
            self.assertTrue(f_res["ok"])
            self.assertTrue((ws / "docs" / "notes" / "draft.md").is_file())

            # Rename file
            r_res = rename_workspace_entry(str(ws), "docs/notes/draft.md", "docs/notes/final.md", server._resolve_workspace_root, server._safe_resolve_inside)
            self.assertTrue(r_res["ok"])
            self.assertFalse((ws / "docs" / "notes" / "draft.md").exists())
            self.assertTrue((ws / "docs" / "notes" / "final.md").is_file())

            # Block traversal & .git
            self.assertFalse(create_workspace_entry(str(ws), "../evil.txt", "file", server._resolve_workspace_root, server._safe_resolve_inside)["ok"])
            self.assertFalse(delete_workspace_entry(str(ws), ".git/config", server._resolve_workspace_root, server._safe_resolve_inside)["ok"])

            # Delete file & folder
            del_f = delete_workspace_entry(str(ws), "docs/notes/final.md", server._resolve_workspace_root, server._safe_resolve_inside)
            self.assertTrue(del_f["ok"])
            self.assertFalse((ws / "docs" / "notes" / "final.md").exists())

            del_d = delete_workspace_entry(str(ws), "docs", server._resolve_workspace_root, server._safe_resolve_inside)
            self.assertTrue(del_d["ok"])
            self.assertFalse((ws / "docs").exists())

    def test_local_folder_browser_mkdir_rename_delete_and_guards(self) -> None:
        from backend.workspace_files import (
            create_local_directory,
            delete_local_directory,
            rename_local_directory,
        )

        with tempfile.TemporaryDirectory() as tmp:
            mk = create_local_directory(tmp, "alpha_project")
            self.assertTrue(mk["ok"])
            self.assertTrue((Path(tmp) / "alpha_project").is_dir())

            # Duplicate & traversal rejected
            self.assertFalse(create_local_directory(tmp, "alpha_project")["ok"])
            self.assertFalse(create_local_directory(tmp, "../escape_dir")["ok"])

            # Rename
            rn = rename_local_directory(mk["path"], "beta_project")
            self.assertTrue(rn["ok"])
            self.assertTrue((Path(tmp) / "beta_project").is_dir())
            self.assertFalse((Path(tmp) / "alpha_project").exists())

            # Protected system / user home deletion blocked
            self.assertFalse(delete_local_directory(str(Path.home()))["ok"])

            # Delete created folder cleanly
            dl = delete_local_directory(rn["path"])
            self.assertTrue(dl["ok"])
            self.assertFalse((Path(tmp) / "beta_project").exists())


class TestStreamingTerminalSSE(unittest.TestCase):
    def test_streaming_terminal_emits_live_events(self) -> None:
        frames = []

        def emit_bytes(chunk: bytes) -> bool:
            frames.append(chunk.decode("utf-8"))
            return True

        with tempfile.TemporaryDirectory() as tmp:
            stream_workspace_terminal(
                "echo STREAM_OK_123",
                tmp,
                "test-sess",
                server._resolve_workspace_root,
                server.ACTIVE_TERM_PROCS,
                server.TERM_LOCK,
                emit_bytes,
                timeout_sec=15,
            )

        events = []
        for f in frames:
            for ln in f.splitlines():
                if ln.startswith("data: "):
                    events.append(json.loads(ln[6:]))

        types = [e["type"] for e in events]
        self.assertIn("start", types)
        self.assertIn("done", types)
        combined_out = "".join(e.get("chunk", "") for e in events if e["type"] == "stdout")
        self.assertIn("STREAM_OK_123", combined_out)
        done_ev = [e for e in events if e["type"] == "done"][-1]
        self.assertEqual(done_ev["exit_code"], 0)


class TestMultiEngineAdapters(unittest.TestCase):
    def test_engine_registry_and_stream_parsers(self) -> None:
        reg = server.get_engine_registry()
        self.assertEqual(set(reg.keys()), {"agy", "claude", "codex", "gemini"})
        statuses = list_engines_status(reg, server.load_settings())
        self.assertEqual(len(statuses), 4)

        cp = ClaudeStreamParser()
        evs = cp.feed_line(json.dumps({"type": "assistant", "session_id": "s1", "message": {"content": [{"type": "text", "text": "hi"}]}}))
        self.assertTrue(any(e["type"] == "text_delta" and e["delta"] == "hi" for e in evs))

        xp = CodexStreamParser()
        xevs = xp.feed_line(json.dumps({"type": "item.completed", "thread_id": "t1", "item": {"type": "agent_message", "text": "hello codex"}}))
        self.assertTrue(any(e["type"] == "text_delta" and e["delta"] == "hello codex" for e in xevs))

        gp = GeminiStreamParser()
        gevs = gp.feed_line(json.dumps({"type": "message", "role": "assistant", "session_id": "g1", "content": "hello gemini"}))
        self.assertTrue(any(e["type"] == "text_delta" and e["delta"] == "hello gemini" for e in gevs))


class TestConversationForkAndTruncate(unittest.TestCase):
    def test_fork_and_truncate_routes(self) -> None:
        status, _, raw = server.dispatch_standard_request(
            "POST",
            "/api/conversations",
            json.dumps({"title": "Unit Test Thread"}).encode("utf-8"),
        )
        self.assertEqual(status, 201)
        cid = json.loads(raw)["conversation"]["id"]
        fork_cid = None
        try:
            conv = server.load_conversation(cid)
            assert conv is not None
            conv["messages"] = [
                {"id": "m0", "role": "user", "content": "first"},
                {"id": "m1", "role": "assistant", "content": "reply1"},
                {"id": "m2", "role": "user", "content": "second"},
                {"id": "m3", "role": "assistant", "content": "reply2"},
            ]
            server.save_conversation(conv)

            # Fork at message index 1 (keeps m0, m1)
            f_status, _, f_raw = server.dispatch_standard_request(
                "POST",
                f"/api/conversations/{cid}/fork",
                json.dumps({"up_to_index": 1}).encode("utf-8"),
            )
            self.assertEqual(f_status, 201)
            forked = json.loads(f_raw)["conversation"]
            fork_cid = forked["id"]
            self.assertEqual(len(forked["messages"]), 2)
            self.assertTrue(forked["context_carryover"])
            self.assertIn("(分支)", forked["title"])

            # Truncate original to keep_count=2
            t_status, _, t_raw = server.dispatch_standard_request(
                "POST",
                f"/api/conversations/{cid}/truncate",
                json.dumps({"keep_count": 2}).encode("utf-8"),
            )
            self.assertEqual(t_status, 200)
            truncated = json.loads(t_raw)["conversation"]
            self.assertEqual(len(truncated["messages"]), 2)
            self.assertIsNone(truncated["agy_conversation_id"])
            self.assertTrue(truncated["context_carryover"])
        finally:
            server.dispatch_standard_request("DELETE", f"/api/conversations/{cid}")
            if fork_cid:
                server.dispatch_standard_request("DELETE", f"/api/conversations/{fork_cid}")


class TestGitWorktrees(unittest.TestCase):
    def test_worktree_porcelain_parsing_and_msys_paths(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp) / "demo-repo"
            repo.mkdir()
            wt2 = Path(tmp) / "demo-repo-wt-feat-ui"

            def fake_git(root, args, timeout=12):
                if args[:2] == ["rev-parse", "--show-toplevel"]:
                    return 0, str(repo), ""
                if args[:3] == ["worktree", "list", "--porcelain"]:
                    out = (
                        f"worktree {repo}\nHEAD 1111222233334444\nbranch refs/heads/main\n\n"
                        f"worktree {wt2}\nHEAD 5555666677778888\nbranch refs/heads/feat/ui\n"
                    )
                    return 0, out, ""
                if args[:2] == ["show-ref", "--verify"]:
                    return 1, "", ""
                if args[:2] == ["worktree", "add"]:
                    wt2.mkdir(parents=True, exist_ok=True)
                    return 0, "Preparing worktree", ""
                if args[:2] == ["worktree", "remove"]:
                    return 0, "", ""
                if args[:2] == ["worktree", "prune"]:
                    return 0, "", ""
                return 0, "", ""

            listed = git_list_worktrees(str(repo), server._resolve_workspace_root, fake_git)
            self.assertTrue(listed["ok"])
            self.assertTrue(listed["is_git"])
            self.assertEqual(len(listed["worktrees"]), 2)
            self.assertEqual(listed["worktrees"][0]["branch"], "main")
            self.assertTrue(listed["worktrees"][0]["is_main"])
            self.assertEqual(listed["worktrees"][1]["branch"], "feat/ui")

            added = git_add_worktree(str(repo), "feat/ui", True, "", server._resolve_workspace_root, fake_git)
            self.assertTrue(added["ok"])

            removed = git_remove_worktree(str(repo), str(wt2), False, server._resolve_workspace_root, fake_git)
            self.assertTrue(removed["ok"])


class TestHttpSecurityHandler(unittest.TestCase):
    def _invoke_handler(self, method: str, path: str, headers: dict, body: bytes = b"") -> tuple:
        import io
        from email.message import Message

        raw_out = io.BytesIO()
        msg = Message()
        for k, v in headers.items():
            msg[k] = v
        if body and "Content-Length" not in msg:
            msg["Content-Length"] = str(len(body))

        h = server.HarnessRequestHandler.__new__(server.HarnessRequestHandler)
        h.command = method
        h.path = path
        h.request_version = "HTTP/1.1"
        h.requestline = f"{method} {path} HTTP/1.1"
        h.headers = msg
        h.rfile = io.BytesIO(body)
        h.wfile = raw_out
        h.client_address = ("127.0.0.1", 55555)
        h.server = None
        h.close_connection = True
        h._handle_all(method)

        resp_bytes = raw_out.getvalue()
        head_b, _, body_b = resp_bytes.partition(b"\r\n\r\n")
        head_lines = head_b.decode("iso-8859-1").splitlines()
        status_code = int(head_lines[0].split()[1])
        resp_headers = {}
        for ln in head_lines[1:]:
            if ":" in ln:
                k, v = ln.split(":", 1)
                resp_headers[k.strip().lower()] = v.strip()
        return status_code, resp_headers, body_b

    def test_http_handler_enforces_host_and_origin(self) -> None:
        # Valid loopback request -> 200 + security headers + engines list
        st1, hdr1, body1 = self._invoke_handler("GET", "/api/status", {"Host": "127.0.0.1:8765"})
        self.assertEqual(st1, 200)
        self.assertEqual(hdr1.get("x-content-type-options"), "nosniff")
        parsed = json.loads(body1.decode("utf-8"))
        self.assertIn("engines", parsed)

        # Evil Host (DNS rebinding attempt) -> 403
        st2, _, _ = self._invoke_handler("GET", "/api/status", {"Host": "evil.com:8765"})
        self.assertEqual(st2, 403)

        # Cross-origin POST -> 403
        st3, _, _ = self._invoke_handler(
            "POST",
            "/api/workspace/write",
            {"Host": "127.0.0.1:8765", "Origin": "https://evil.com", "Content-Type": "application/json"},
            b"{}",
        )
        self.assertEqual(st3, 403)

        # Checkpoint GC HTTP endpoint -> 200 with structured stats
        st4, _, body4 = self._invoke_handler(
            "POST",
            "/api/checkpoints/gc",
            {"Host": "127.0.0.1:8765", "Content-Type": "application/json"},
            json.dumps({"max_checkpoints": 60, "max_age_days": 30}).encode("utf-8"),
        )
        self.assertEqual(st4, 200)
        gc_data = json.loads(body4.decode("utf-8"))
        self.assertTrue(gc_data.get("ok"))
        self.assertIn("remaining_manifests", gc_data)
        self.assertIn("remaining_blobs", gc_data)


class TestSkillRepositoryAndDispatcher(unittest.TestCase):
    def test_starter_seed_crud_import_and_auto_dispatch(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            data_dir = Path(tmp) / "data"
            data_dir.mkdir()
            repo = SkillRepository(data_dir)

            # 1. Starter skills seeded automatically
            initial = repo.list_skills()
            self.assertGreaterEqual(len(initial), 6)
            slugs = {s["slug"] for s in initial}
            self.assertIn("code-architect", slugs)
            self.assertIn("bug-hunter", slugs)

            # 2. Create custom skill with triggers
            created = repo.upsert_skill(
                {
                    "name": "SQL 调优专家",
                    "slug": "sql-tuner",
                    "category": "数据库",
                    "description": "排查慢查询与索引优化",
                    "triggers": ["慢查询", "sql 优化", "explain"],
                    "tags": ["sql", "mysql"],
                    "enabled": True,
                    "auto_dispatch": True,
                    "body": "请分析执行计划并给出联合索引建议。",
                }
            )
            self.assertTrue(created["ok"])
            self.assertEqual(created["skill"]["slug"], "sql-tuner")

            # 3. Auto-dispatch by trigger keyword
            auto_res = repo.dispatch_for_prompt("请帮我分析这条慢查询并做 SQL 优化", auto_dispatch=True)
            dispatched_slugs = [s["slug"] for s in auto_res["skills"]]
            self.assertIn("sql-tuner", dispatched_slugs)
            self.assertEqual(auto_res["skills"][0]["reason"], "auto")
            self.assertTrue(any("SQL 调优专家" in blk for blk in auto_res["directive_blocks"]))

            # 4. Inline `/slug` slash invocation strips token cleanly
            slash_res = repo.dispatch_for_prompt("/ui-polish 帮我调整侧边栏留白", auto_dispatch=False)
            self.assertEqual([s["slug"] for s in slash_res["skills"]], ["ui-polish"])
            self.assertEqual(slash_res["skills"][0]["reason"], "slash")
            self.assertEqual(slash_res["cleaned_prompt"], "帮我调整侧边栏留白")

            # 5. Import raw SKILL.md
            imp = repo.import_skill(
                raw_markdown="---\nname: API 文档助手\ntriggers: [openapi, swagger]\n---\n\n生成标准 OpenAPI 3.1 规范。",
                slug_override="api-doc-helper",
            )
            self.assertTrue(imp["ok"])
            self.assertEqual(imp["skill"]["slug"], "api-doc-helper")

            # 6. Toggle flag & delete
            toggled = repo.toggle_skill_flags("repo:sql-tuner", {"auto_dispatch": False})
            self.assertTrue(toggled["ok"])
            self.assertFalse(toggled["skill"]["auto_dispatch"])
            after_off = repo.dispatch_for_prompt("这条慢查询怎么优化", auto_dispatch=True)
            self.assertNotIn("sql-tuner", [s["slug"] for s in after_off["skills"]])

            deleted = repo.delete_skill("repo:sql-tuner")
            self.assertTrue(deleted["ok"])
            self.assertIsNone(repo.get_skill("repo:sql-tuner"))


class TestConversationSearchPinAndExport(unittest.TestCase):
    def test_full_text_search_pin_order_and_markdown_export(self) -> None:
        from backend.storage import (
            create_conversation,
            export_conversation_markdown,
            list_conversations,
            save_conversation,
            search_conversations,
        )

        orig_conv_dir = server.CONV_DIR
        import backend.storage as storage_mod
        orig_storage_dir = storage_mod.CONV_DIR
        with tempfile.TemporaryDirectory() as tmp:
            tmp_conv = Path(tmp) / "convs"
            tmp_conv.mkdir()
            storage_mod.CONV_DIR = tmp_conv
            server.CONV_DIR = tmp_conv
            try:
                c1 = create_conversation({"title": "算法复杂度笔记", "cwd": tmp})
                c1["messages"] = [
                    {"role": "user", "content": "解释一下斐波那契的时间复杂度"},
                    {
                        "role": "assistant",
                        "content": "朴素递归的时间复杂度是 $O(2^n)$，使用动态规划可降至 $O(n)$。",
                        "thinking": "分析递推关系 T(n) = T(n-1) + T(n-2)",
                        "tools": [{"id": "t1", "name": "read_file", "status": "DONE"}],
                    },
                ]
                save_conversation(c1)

                c2 = create_conversation({"title": "系统架构评审", "cwd": tmp})
                c2["messages"] = [
                    {"role": "user", "content": "画一个微服务网关流程图"},
                    {"role": "assistant", "content": "使用 Mermaid 架构图描述反向代理与鉴权链路。"},
                ]
                save_conversation(c2)

                # Pin c1 so it stays ahead of newer c2
                c1["pinned"] = True
                save_conversation(c1, touch_updated=False)
                ordered = list_conversations()
                self.assertEqual(ordered[0]["id"], c1["id"])
                self.assertTrue(ordered[0]["pinned"])

                # Full-text search matches body text ("动态规划") not present in title
                hits = search_conversations("动态规划")
                self.assertEqual(len(hits), 1)
                self.assertEqual(hits[0]["id"], c1["id"])
                self.assertTrue(hits[0]["match_in_body"])
                self.assertIn("动态规划", hits[0]["match_snippet"])

                # Markdown export returns clean structured note
                exported = export_conversation_markdown(c1["id"])
                self.assertIsNotNone(exported)
                assert exported is not None
                fname, md = exported
                self.assertTrue(fname.endswith(".md"))
                self.assertIn("# 算法复杂度笔记", md)
                self.assertIn("$O(2^n)$", md)
                self.assertIn("<details>", md)
                self.assertIn("read_file", md)
            finally:
                storage_mod.CONV_DIR = orig_storage_dir
                server.CONV_DIR = orig_conv_dir


class TestAgyConversationSync(unittest.TestCase):
    def test_sync_imports_app_and_cli_filters_subagents_merges_updates_and_respects_delete(self) -> None:
        import sqlite3
        import backend.agy_sync as agy_sync_mod
        import backend.storage as storage_mod

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            data_dir = root / "studio_data"
            conv_dir = data_dir / "conversations"
            ws_dir = data_dir / "workspace"
            conv_dir.mkdir(parents=True)
            ws_dir.mkdir(parents=True)

            app_root = root / "antigravity"
            cli_root = root / "antigravity-cli"
            for r in (app_root, cli_root):
                (r / "brain").mkdir(parents=True)

            # 1. Create fake App conversation + subagent conversation in app_root SQLite & brain
            app_cid = "aaaaaaaa-1111-2222-3333-444444444444"
            sub_cid = "bbbbbbbb-1111-2222-3333-444444444444"
            cli_cid = "cccccccc-1111-2222-3333-444444444444"

            app_tr = app_root / "brain" / app_cid / ".system_generated" / "logs" / "transcript.jsonl"
            app_tr.parent.mkdir(parents=True)
            app_tr.write_text(
                "\n".join(
                    [
                        json.dumps(
                            {
                                "step_index": 0,
                                "source": "USER_EXPLICIT",
                                "type": "USER_INPUT",
                                "created_at": "2026-11-26T04:00:00Z",
                                "content": "<USER_REQUEST>\n分析架构设计\n</USER_REQUEST>\n<ADDITIONAL_METADATA>ignored</ADDITIONAL_METADATA>",
                            },
                            ensure_ascii=False,
                        ),
                        json.dumps(
                            {
                                "step_index": 1,
                                "source": "MODEL",
                                "type": "PLANNER_RESPONSE",
                                "created_at": "2026-11-26T04:00:05Z",
                                "model": "gemini-4-neon-high",
                                "thinking": "先看主入口文件",
                                "tool_calls": [{"name": "read_file", "args": {"Path": '"C:\\\\demo\\\\server.py"'}}],
                            },
                            ensure_ascii=False,
                        ),
                        json.dumps(
                            {
                                "step_index": 2,
                                "source": "MODEL",
                                "type": "GENERIC",
                                "content": "huge raw tool output skipped by prefilter",
                            }
                        ),
                        json.dumps(
                            {
                                "step_index": 3,
                                "source": "MODEL",
                                "type": "PLANNER_RESPONSE",
                                "created_at": "2026-11-26T04:00:10Z",
                                "model": "gemini-4-neon-high",
                                "content": "架构清晰，采用纯标准库分层设计。",
                            },
                            ensure_ascii=False,
                        ),
                    ]
                )
                + "\n",
                encoding="utf-8",
            )

            sub_tr = app_root / "brain" / sub_cid / ".system_generated" / "logs" / "transcript.jsonl"
            sub_tr.parent.mkdir(parents=True)
            sub_tr.write_text(
                json.dumps({"step_index": 0, "source": "MODEL", "type": "PLANNER_RESPONSE", "content": "subagent"}) + "\n",
                encoding="utf-8",
            )

            cli_tr = cli_root / "brain" / cli_cid / ".system_generated" / "logs" / "transcript.jsonl"
            cli_tr.parent.mkdir(parents=True)
            cli_tr.write_text(
                "\n".join(
                    [
                        json.dumps(
                            {
                                "step_index": 0,
                                "source": "USER_EXPLICIT",
                                "type": "USER_INPUT",
                                "created_at": "2026-11-26T05:00:00Z",
                                "content": "<USER_REQUEST>\n检查 CLI 同步\n</USER_REQUEST>",
                            },
                            ensure_ascii=False,
                        ),
                        json.dumps(
                            {
                                "step_index": 1,
                                "source": "MODEL",
                                "type": "PLANNER_RESPONSE",
                                "created_at": "2026-11-26T05:00:02Z",
                                "model": "gemini-4-flash",
                                "content": "CLI 同步正常。",
                            },
                            ensure_ascii=False,
                        ),
                    ]
                )
                + "\n",
                encoding="utf-8",
            )

            # Seed SQLite conversation_summaries.db in both roots
            for db_root, rows in [
                (
                    app_root,
                    [
                        (app_cid, "架构设计讨论", "分析架构设计", 4, "2026-11-26 04:00:10+00:00", "", "", 0, "antigravity", 0),
                        (sub_cid, "", "", 1, "2026-11-26 04:01:00+00:00", "", app_cid, 1, "antigravity", 0),
                    ],
                ),
                (
                    cli_root,
                    [
                        (cli_cid, "", "检查 CLI 同步", 2, "2026-11-26 05:00:02+00:00", '["file:///C:/DemoProj"]', "", 0, "antigravity-cli", 0),
                    ],
                ),
            ]:
                con = sqlite3.connect(str(db_root / "conversation_summaries.db"))
                con.execute(
                    """
                    CREATE TABLE conversation_summaries (
                        conversation_id TEXT PRIMARY KEY,
                        title TEXT, preview TEXT, step_count INTEGER,
                        last_modified_time TEXT, workspace_uris TEXT,
                        parent_conversation_id TEXT, nesting_depth INTEGER,
                        app_data_dir TEXT, killed INTEGER
                    )
                    """
                )
                con.executemany(
                    "INSERT INTO conversation_summaries VALUES (?,?,?,?,?,?,?,?,?,?)",
                    rows,
                )
                con.commit()
                con.close()

            saved = [
                (agy_sync_mod, "CONV_DIR", agy_sync_mod.CONV_DIR),
                (agy_sync_mod, "DATA_DIR", agy_sync_mod.DATA_DIR),
                (agy_sync_mod, "DEFAULT_WORKSPACE_DIR", agy_sync_mod.DEFAULT_WORKSPACE_DIR),
                (agy_sync_mod, "AGY_SYNC_ROOTS", agy_sync_mod.AGY_SYNC_ROOTS),
                (agy_sync_mod, "_LAST_AUTO_SYNC_TS", agy_sync_mod._LAST_AUTO_SYNC_TS),
                (storage_mod, "CONV_DIR", storage_mod.CONV_DIR),
            ]
            try:
                agy_sync_mod.CONV_DIR = conv_dir
                agy_sync_mod.DATA_DIR = data_dir
                agy_sync_mod.DEFAULT_WORKSPACE_DIR = ws_dir
                agy_sync_mod.AGY_SYNC_ROOTS = [("app", app_root), ("cli", cli_root)]
                agy_sync_mod._LAST_AUTO_SYNC_TS = 0.0
                storage_mod.CONV_DIR = conv_dir

                res1 = agy_sync_mod.sync_agy_conversations(force=True)
                self.assertTrue(res1["ok"])
                self.assertEqual(res1["imported"], 2)  # app_cid + cli_cid (sub_cid excluded!)

                convs = storage_mod.list_conversations()
                self.assertEqual(len(convs), 2)
                by_agy = {c["agy_conversation_id"]: c for c in convs}
                self.assertIn(app_cid, by_agy)
                self.assertIn(cli_cid, by_agy)
                self.assertNotIn(sub_cid, by_agy)
                self.assertEqual(by_agy[app_cid]["title"], "架构设计讨论")
                self.assertEqual(by_agy[app_cid]["agy_source"], "app")
                self.assertEqual(by_agy[cli_cid]["agy_source"], "cli")
                self.assertEqual(by_agy[cli_cid]["cwd"], r"C:\DemoProj")

                # Verify parsed message details & cleaned tool args
                loaded_app = storage_mod.load_conversation(by_agy[app_cid]["id"])
                assert loaded_app is not None
                self.assertEqual(len(loaded_app["messages"]), 2)
                self.assertEqual(loaded_app["messages"][0]["content"], "分析架构设计")
                self.assertEqual(loaded_app["messages"][1]["thinking"], "先看主入口文件")
                self.assertEqual(loaded_app["messages"][1]["tools"][0]["args"]["Path"], r"C:\demo\server.py")

                # Second sync with unchanged files skips cleanly
                res2 = agy_sync_mod.sync_agy_conversations(force=True)
                self.assertEqual(res2["imported"], 0)
                self.assertEqual(res2["updated"], 0)

                # Simulate new turn appended externally in CLI transcript -> incremental merge!
                with cli_tr.open("a", encoding="utf-8") as f:
                    f.write(
                        json.dumps(
                            {
                                "step_index": 2,
                                "source": "USER_EXPLICIT",
                                "type": "USER_INPUT",
                                "created_at": "2026-11-26T05:05:00Z",
                                "content": "<USER_REQUEST>\n续聊第二轮\n</USER_REQUEST>",
                            },
                            ensure_ascii=False,
                        )
                        + "\n"
                        + json.dumps(
                            {
                                "step_index": 3,
                                "source": "MODEL",
                                "type": "PLANNER_RESPONSE",
                                "created_at": "2026-11-26T05:05:03Z",
                                "content": "已同步第二轮回复。",
                            },
                            ensure_ascii=False,
                        )
                        + "\n"
                    )
                refreshed = agy_sync_mod.refresh_single_agy_conversation(
                    storage_mod.load_conversation(by_agy[cli_cid]["id"]) or {}
                )
                self.assertEqual(len(refreshed["messages"]), 4)
                self.assertEqual(refreshed["messages"][3]["content"], "已同步第二轮回复。")

                # Delete tombstone prevents immediate auto-sync re-import
                agy_sync_mod.mark_agy_conversation_deleted(app_cid, loaded_app.get("agy_sync_size", 0))
                storage_mod.conv_path(by_agy[app_cid]["id"]).unlink()
                agy_sync_mod._LAST_AUTO_SYNC_TS = 0.0
                res3 = agy_sync_mod.sync_agy_conversations(force=False)
                self.assertEqual(res3["imported"], 0)
            finally:
                for mod, attr, orig in reversed(saved):
                    setattr(mod, attr, orig)


if __name__ == "__main__":
    unittest.main(verbosity=2)
