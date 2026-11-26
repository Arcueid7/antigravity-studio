#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Frontend static integrity, multi-format reader, NDJSON parser edge cases,
and open-source release hygiene checks for Antigravity Studio.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.agy_runtime import AgyStreamState, _build_carryover_recap  # noqa: E402
from backend.workspace_files import read_workspace_file  # noqa: E402


class TestAgyStreamAndCarryover(unittest.TestCase):
    def test_agy_stream_state_full_event_normalization(self) -> None:
        st = AgyStreamState()

        # Blank line -> ignored
        self.assertEqual(st.feed_line("   \n"), [])

        # Init event captures conversation_id & model
        evs_init = st.feed_line(json.dumps({"event": "init", "conversation_id": "conv-abc", "model": "gemini-2.5-pro"}))
        self.assertEqual(st.agy_conversation_id, "conv-abc")
        self.assertTrue(any(e["type"] == "meta" and e.get("model") == "gemini-2.5-pro" for e in evs_init))

        # Cumulative thinking diffing
        t1 = st.feed_line(json.dumps({"event": "step_update", "step_index": 1, "thinking": "Step 1"}))
        t2 = st.feed_line(json.dumps({"event": "step_update", "step_index": 1, "thinking": "Step 1 -> Step 2"}))
        self.assertEqual([e["delta"] for e in t1 if e["type"] == "thinking_delta"], ["Step 1"])
        self.assertEqual([e["delta"] for e in t2 if e["type"] == "thinking_delta"], [" -> Step 2"])

        # Tool call update
        tc = st.feed_line(
            json.dumps(
                {
                    "event": "step_update",
                    "step_index": 2,
                    "tool_call": {"id": "c1", "name": "edit_file", "args": {"Path": "a.py"}, "status": "DONE", "output": "ok"},
                }
            )
        )
        self.assertEqual(len(tc), 1)
        self.assertEqual(tc[0]["type"], "tool_update")
        self.assertEqual(tc[0]["tool"]["name"], "edit_file")

        # Cumulative text diffing
        a1 = st.feed_line(json.dumps({"event": "step_update", "step_index": 3, "text": "Hello"}))
        a2 = st.feed_line(json.dumps({"event": "step_update", "step_index": 3, "text": "Hello world"}))
        self.assertEqual([e["delta"] for e in a1 if e["type"] == "text_delta"], ["Hello"])
        self.assertEqual([e["delta"] for e in a2 if e["type"] == "text_delta"], [" world"])

        # Result event does NOT duplicate text already emitted
        res_ev = st.feed_line(json.dumps({"event": "result", "response": "Hello world", "duration_ms": 420}))
        self.assertFalse(any(e["type"] == "text_delta" for e in res_ev))
        self.assertTrue(any(e["type"] == "result_meta" and e.get("duration_ms") == 420 for e in res_ev))

        # Result fallback when NO text delta was emitted earlier
        st2 = AgyStreamState()
        res2 = st2.feed_line(json.dumps({"event": "result", "response": "Fallback reply"}))
        self.assertTrue(any(e["type"] == "text_delta" and e["delta"] == "Fallback reply" for e in res2))

        # Non-JSON plain stdout falls back cleanly as text_delta
        st3 = AgyStreamState()
        plain = st3.feed_line("plain text warning\n")
        self.assertEqual(plain, [{"type": "text_delta", "delta": "plain text warning\n"}])

        # Error event
        err_ev = st3.feed_line(json.dumps({"event": "error", "error": "quota exceeded"}))
        self.assertEqual(err_ev, [{"type": "error", "message": "quota exceeded"}])

    def test_carryover_recap_builds_bounded_history(self) -> None:
        self.assertEqual(_build_carryover_recap([]), "")
        msgs = [
            {"role": "user", "content": "问题 1"},
            {"role": "assistant", "content": "回答 1"},
            {"role": "user", "content": "问题 2"},
        ]
        recap = _build_carryover_recap(msgs)
        self.assertIn("问题 1", recap)
        self.assertIn("回答 1", recap)
        # Current trailing user message is excluded from carryover recap (sent separately)
        self.assertNotIn("问题 2", recap)


class TestMultiFormatWorkspaceReaders(unittest.TestCase):
    def test_reads_code_csv_tsv_ipynb_zip_image_pdf_binary_and_blocks_escape(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            ws = Path(tmp) / "ws"
            ws.mkdir()

            # Code & Markdown
            (ws / "hello.py").write_text("def add(a, b):\n    return a + b\n", encoding="utf-8")
            py_res = read_workspace_file(str(ws), "hello.py")
            self.assertTrue(py_res["ok"])
            self.assertIn("def add", py_res["content"])

            # CSV & TSV tables
            (ws / "metrics.csv").write_text("name,score\nalice,98\nbob,92\n", encoding="utf-8")
            csv_res = read_workspace_file(str(ws), "metrics.csv")
            self.assertTrue(csv_res["ok"])
            self.assertEqual(csv_res["kind"], "table")
            self.assertEqual(csv_res["sheets"][0]["rows"][1], ["alice", "98"])

            (ws / "metrics.tsv").write_text("k\tv\nx\t1\n", encoding="utf-8")
            tsv_res = read_workspace_file(str(ws), "metrics.tsv")
            self.assertEqual(tsv_res["kind"], "table")
            self.assertEqual(tsv_res["sheets"][0]["rows"][1], ["x", "1"])

            # Jupyter Notebook (.ipynb)
            nb = {
                "cells": [
                    {"cell_type": "markdown", "source": ["# Title\n"]},
                    {"cell_type": "code", "source": ["print(1+1)\n"], "outputs": []},
                ]
            }
            (ws / "analysis.ipynb").write_text(json.dumps(nb), encoding="utf-8")
            nb_res = read_workspace_file(str(ws), "analysis.ipynb")
            self.assertTrue(nb_res["ok"])
            self.assertEqual(nb_res["kind"], "ipynb")
            self.assertEqual(len(nb_res["cells"]), 2)

            # ZIP archive
            zp = ws / "bundle.zip"
            with zipfile.ZipFile(zp, "w") as zf:
                zf.writestr("a.txt", "hello")
                zf.writestr("sub/b.py", "x = 2")
            zip_res = read_workspace_file(str(ws), "bundle.zip")
            self.assertTrue(zip_res["ok"])
            self.assertEqual(zip_res["kind"], "archive")
            self.assertGreaterEqual(len(zip_res["entries"]), 2)

            # Image & PDF
            (ws / "pic.png").write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x00" * 16)
            img_res = read_workspace_file(str(ws), "pic.png")
            self.assertEqual(img_res["kind"], "image")
            self.assertIn("/api/workspace/raw", img_res["preview_url"])

            (ws / "doc.pdf").write_bytes(b"%PDF-1.4\n%%EOF\n")
            pdf_res = read_workspace_file(str(ws), "doc.pdf")
            self.assertEqual(pdf_res["kind"], "pdf")

            # Binary file
            (ws / "blob.bin").write_bytes(b"\x00\x01\x02\x03\xff\xfe")
            bin_res = read_workspace_file(str(ws), "blob.bin")
            self.assertEqual(bin_res["kind"], "binary")

            # Escape blocked
            (Path(tmp) / "outside.txt").write_text("secret", encoding="utf-8")
            esc_res = read_workspace_file(str(ws), "../outside.txt")
            self.assertFalse(esc_res["ok"])


class TestFrontendStaticIntegrity(unittest.TestCase):
    def test_html_no_duplicate_ids_and_all_js_dom_refs_valid(self) -> None:
        html = (ROOT / "static" / "index.html").read_text(encoding="utf-8")
        html_ids = re.findall(r'\bid="([^"]+)"', html)
        dups = sorted(set(i for i in html_ids if html_ids.count(i) > 1))
        self.assertEqual(dups, [], f"Duplicate HTML IDs found: {dups}")

        js_files = [ROOT / "static" / "app.js"] + sorted((ROOT / "static" / "js").glob("*.js"))
        all_js = "\n".join(p.read_text(encoding="utf-8") for p in js_files)

        js_id_refs = set(re.findall(r"(?:\$\(|getElementById\()['\"]([a-zA-Z0-9_-]+)['\"]\)", all_js))
        dyn_ids = set(re.findall(r"""(?:id=["']|\.id\s*=\s*["'])([a-zA-Z0-9_-]+)["']""", all_js))
        missing = sorted(js_id_refs - set(html_ids) - dyn_ids)
        self.assertEqual(missing, [], f"JS references missing DOM IDs: {missing}")

    def test_es_module_imports_and_exports_match(self) -> None:
        js_files = [ROOT / "static" / "app.js"] + sorted((ROOT / "static" / "js").glob("*.js"))
        export_map = {}
        for p in js_files:
            txt = p.read_text(encoding="utf-8")
            syms = set(re.findall(r"export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z0-9_$]+)", txt))
            for grp in re.findall(r"export\s*\{([^}]+)\}", txt):
                for part in grp.split(","):
                    part = part.strip()
                    if not part:
                        continue
                    syms.add(part.split(" as ")[-1].strip())
            export_map[p.resolve()] = syms

        import_re = re.compile(r"import\s*\{([^}]+)\}\s*from\s*['\"](\.[^'\"]+)['\"]", re.S)
        for p in js_files:
            txt = p.read_text(encoding="utf-8")
            for names_raw, rel_spec in import_re.findall(txt):
                target = (p.parent / rel_spec).resolve()
                self.assertTrue(target.is_file(), f"Broken ES import in {p.name}: {rel_spec}")
                available = export_map.get(target, set())
                for item in names_raw.split(","):
                    item = item.strip()
                    if not item:
                        continue
                    orig_name = item.split(" as ")[0].strip()
                    self.assertIn(
                        orig_name,
                        available,
                        f"{p.name} imports missing symbol '{orig_name}' from {rel_spec}",
                    )

    def test_static_assets_and_offline_vendors_complete(self) -> None:
        html = (ROOT / "static" / "index.html").read_text(encoding="utf-8")
        self.assertNotIn("claude-theme.css", html)
        self.assertIn("/static/studio-theme.css", html)

        # Verify every /static/... path referenced in index.html & manifest.json exists on disk
        manifest = (ROOT / "static" / "manifest.json").read_text(encoding="utf-8")
        for src_name, content in [("index.html", html), ("manifest.json", manifest)]:
            for raw_url in re.findall(r'["\'](/static/[^"\'?#]+)', content):
                rel = raw_url[len("/static/"):]
                asset = ROOT / "static" / rel
                self.assertTrue(asset.is_file(), f"Missing static asset referenced by {src_name}: {raw_url}")

        # Verify KaTeX CSS font references & Mermaid bundle
        katex_dir = ROOT / "static" / "vendor" / "katex"
        katex_css = (katex_dir / "katex.min.css").read_text(encoding="utf-8")
        woff2_refs = sorted(set(re.findall(r"fonts/([A-Za-z0-9_-]+\.woff2)", katex_css)))
        self.assertGreaterEqual(len(woff2_refs), 15)
        for wf in woff2_refs:
            self.assertTrue((katex_dir / "fonts" / wf).is_file(), f"Missing KaTeX font: {wf}")

        mermaid_js = ROOT / "static" / "vendor" / "mermaid" / "mermaid.min.js"
        self.assertTrue(mermaid_js.is_file())
        self.assertGreater(mermaid_js.stat().st_size, 100_000)


class TestReleaseHygieneAndDesktopCompile(unittest.TestCase):
    def test_gitignore_protects_runtime_data_and_caches(self) -> None:
        gi = ROOT / ".gitignore"
        self.assertTrue(gi.is_file(), ".gitignore must exist before open-sourcing")
        txt = gi.read_text(encoding="utf-8")
        self.assertIn("data/", txt)
        self.assertIn("__pycache__/", txt)
        self.assertIn("AntigravityStudio.exe", txt)
        self.assertIn("dist/", txt)

        for required_doc in (
            "LICENSE",
            "THIRD_PARTY_LICENSES.md",
            "SECURITY.md",
            "README.md",
            "README_ZH.md",
            "create-desktop-shortcut.bat",
            ".github/workflows/ci.yml",
            ".github/workflows/release.yml",
            "desktop/package_release.ps1",
        ):
            self.assertTrue((ROOT / required_doc).is_file(), f"Missing release file: {required_doc}")

        html = (ROOT / "static" / "index.html").read_text(encoding="utf-8")
        self.assertNotIn("例如：Arcueid", html)
        self.assertNotIn("kh813/agent-deck", html)

    def test_no_hardcoded_secret_tokens_in_tracked_source(self) -> None:
        secret_patterns = [
            re.compile(r"\bgho_[A-Za-z0-9]{12,}\b"),
            re.compile(r"\bghp_[A-Za-z0-9]{12,}\b"),
            re.compile(r"\bgithub_pat_[A-Za-z0-9_]{16,}\b"),
            re.compile(r"\bAIzaSy[A-Za-z0-9_-]{20,}\b"),
            re.compile(r"\bsk-proj-[A-Za-z0-9_-]{20,}\b"),
        ]
        skip_dirs = {"data", "__pycache__", "vendor", "lib", ".git", "dist"}
        leaks = []
        for p in ROOT.rglob("*"):
            if not p.is_file() or any(part in skip_dirs for part in p.parts):
                continue
            if p.suffix.lower() in {".exe", ".dll", ".ico", ".png", ".woff2", ".pyc", ".zip"}:
                continue
            if p.name == "test_api_integration.py":
                continue
            txt = p.read_text(encoding="utf-8", errors="ignore")
            for pat in secret_patterns:
                if pat.search(txt):
                    leaks.append(f"{p.relative_to(ROOT)} matched {pat.pattern}")
        self.assertEqual(leaks, [], f"Potential hardcoded secret tokens found: {leaks}")

    def test_csharp_desktop_launcher_compiles_cleanly(self) -> None:
        if os.name != "nt":
            self.skipTest("Windows-only C# desktop launcher check")
        csc = Path(r"C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe")
        core_dll = ROOT / "desktop" / "lib" / "Microsoft.Web.WebView2.Core.dll"
        wf_dll = ROOT / "desktop" / "lib" / "Microsoft.Web.WebView2.WinForms.dll"
        if not (csc.is_file() and core_dll.is_file() and wf_dll.is_file()):
            self.skipTest("csc.exe or WebView2 DLLs unavailable in this environment")

        with tempfile.TemporaryDirectory() as tmp:
            out_exe = Path(tmp) / "check_launcher.exe"
            res = subprocess.run(
                [
                    str(csc),
                    "/nologo",
                    "/target:winexe",
                    "/platform:x64",
                    "/optimize+",
                    f"/win32icon:{ROOT / 'static' / 'icon.ico'}",
                    "/r:System.dll",
                    "/r:System.Drawing.dll",
                    "/r:System.Windows.Forms.dll",
                    f"/r:{core_dll}",
                    f"/r:{wf_dll}",
                    f"/out:{out_exe}",
                    str(ROOT / "desktop" / "AntigravityStudioLauncher.cs"),
                ],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=30,
            )
            self.assertEqual(res.returncode, 0, f"C# compile failed:\n{res.stdout}\n{res.stderr}")
            self.assertEqual((res.stdout + res.stderr).strip(), "", f"Unexpected compiler warnings:\n{res.stdout}{res.stderr}")
            self.assertTrue(out_exe.is_file())


if __name__ == "__main__":
    unittest.main(verbosity=2)
