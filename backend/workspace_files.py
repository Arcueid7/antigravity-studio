# -*- coding: utf-8 -*-
"""Workspace tree browsing, multi-format document readers, uploads, library, and legacy terminal."""

from __future__ import annotations

import base64
import csv
import io
import json
import mimetypes
import os
import re
import shutil
import string
import subprocess
import time
import urllib.parse
import uuid
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from backend.config import (
    ACTIVE_TERM_PROCS,
    BASE_DIR,
    CONV_DIR,
    IMAGE_EXTS,
    SKIP_DIRS,
    TERM_LOCK,
    UPLOAD_DIR,
    VIDEO_EXTS,
    _no_window_flags,
    _safe_is_file,
    load_settings,
)

def collect_library_items() -> List[Dict[str, Any]]:
    """Aggregates uploaded media/files and generated HTML/SVG/code Artifacts."""
    items: List[Dict[str, Any]] = []

    # 1. Uploaded files, sketches, images & videos
    try:
        for p in UPLOAD_DIR.iterdir():
            if not _safe_is_file(p):
                continue
            ext = p.suffix.lower()
            stat = p.stat()
            orig_name = p.name.split("_", 1)[1] if "_" in p.name else p.name
            if ext in IMAGE_EXTS:
                kind = "image"
            elif ext in VIDEO_EXTS:
                kind = "video"
            else:
                kind = "file"
            items.append(
                {
                    "id": f"up-{p.name}",
                    "kind": kind,
                    "title": orig_name,
                    "stored_name": p.name,
                    "path": str(p),
                    "size": stat.st_size,
                    "ext": ext.lstrip(".").upper() or "FILE",
                    "preview_url": f"/uploads/{urllib.parse.quote(p.name)}" if kind in ("image", "video") else "",
                    "updated_at": stat.st_mtime,
                }
            )
    except OSError:
        pass

    # 2. Artifacts (HTML / SVG / substantial code blocks) from saved conversations
    fence_re = re.compile(r"```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```")
    for p in CONV_DIR.glob("*.json"):
        try:
            conv = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue
        cid = conv.get("id", "")
        ctitle = conv.get("title", "未命名对话")
        for msg in conv.get("messages", []):
            if msg.get("role") != "assistant":
                continue
            content = msg.get("content") or ""
            for idx, m in enumerate(fence_re.finditer(content)):
                lang = (m.group(1) or "text").strip().lower()
                code = m.group(2).strip()
                if len(code) < 50:
                    continue
                is_preview = lang in ("html", "svg")
                if not is_preview and len(code) < 120:
                    continue
                items.append(
                    {
                        "id": f"art-{cid}-{msg.get('id', 'm')}-{idx}",
                        "kind": "artifact",
                        "title": f"{ctitle} · {lang.upper()}",
                        "lang": lang,
                        "code": code,
                        "is_previewable": is_preview,
                        "conv_id": cid,
                        "conv_title": ctitle,
                        "updated_at": msg.get("timestamp") or conv.get("updated_at") or 0,
                    }
                )

    items.sort(key=lambda x: x.get("updated_at", 0), reverse=True)
    return items



def scan_customizations(cwd_str: str = "") -> Dict[str, Any]:
    """Discovers local Antigravity Skills, Rules, and Plugins safely."""
    home = Path.home()
    skills: List[Dict[str, str]] = []
    rules: List[Dict[str, str]] = []
    plugins: List[Dict[str, str]] = []

    skill_roots = [home / ".gemini" / "config" / "skills"]
    plugin_roots = [home / ".gemini" / "config" / "plugins"]
    rule_files: List[Tuple[str, Path]] = []

    if cwd_str:
        ws = Path(cwd_str)
        skill_roots.insert(0, ws / ".agents" / "skills")
        plugin_roots.insert(0, ws / ".agents" / "plugins")
        for rf in (ws / "GEMINI.md", ws / "AGENTS.md"):
            rule_files.append(("工作区规则", rf))
        ws_rules = ws / ".agents" / "rules"
        try:
            if ws_rules.is_dir():
                for p in sorted(ws_rules.glob("*.md")):
                    rule_files.append(("工作区规则", p))
        except OSError:
            pass

    global_rules = home / ".gemini" / "config" / "rules"
    try:
        if global_rules.is_dir():
            for p in sorted(global_rules.glob("*.md")):
                rule_files.append(("全局规则", p))
    except OSError:
        pass

    for root in skill_roots:
        try:
            if not root.is_dir():
                continue
            for d in sorted(root.iterdir()):
                md = d / "SKILL.md"
                if _safe_is_file(md):
                    preview = md.read_text(encoding="utf-8", errors="replace")[:320]
                    skills.append({"name": d.name, "path": str(md), "scope": "工作区" if cwd_str and str(root).startswith(cwd_str) else "全局", "preview": preview})
        except OSError:
            pass

    for root in plugin_roots:
        try:
            if not root.is_dir():
                continue
            for d in sorted(root.iterdir()):
                pj = d / "plugin.json"
                if _safe_is_file(pj):
                    try:
                        meta = json.loads(pj.read_text(encoding="utf-8", errors="replace"))
                    except Exception:
                        meta = {}
                    plugins.append({"name": meta.get("name") or d.name, "description": meta.get("description", ""), "path": str(d)})
        except OSError:
            pass

    for scope, rf in rule_files:
        if _safe_is_file(rf):
            try:
                preview = rf.read_text(encoding="utf-8", errors="replace")[:320]
                rules.append({"name": rf.name, "path": str(rf), "scope": scope, "preview": preview})
            except OSError:
                pass

    return {
        "skills": skills,
        "rules": rules,
        "plugins": plugins,
        "custom_instructions": load_settings().get("custom_instructions", ""),
    }


def list_local_directories(target_path: str = "") -> Dict[str, Any]:
    home = Path.home()
    shortcuts: List[Dict[str, str]] = []
    for label, p in (
        ("当前 Harness", BASE_DIR),
        ("用户目录", home),
        ("桌面", home / "Desktop"),
        ("文档", home / "Documents"),
        ("下载", home / "Downloads"),
    ):
        try:
            if p.is_dir():
                shortcuts.append({"label": label, "path": str(p)})
        except OSError:
            pass

    drives: List[str] = []
    if os.name == "nt":
        for ch in string.ascii_uppercase:
            dp = f"{ch}:\\"
            try:
                if os.path.exists(dp):
                    drives.append(dp)
            except OSError:
                pass
    else:
        drives.append("/")

    raw = (target_path or "").strip()
    if raw:
        cur = Path(os.path.expandvars(os.path.expanduser(raw)))
        if not cur.is_dir():
            cur = home
    else:
        cur = Path(load_settings().get("default_cwd") or str(home))
        if not cur.is_dir():
            cur = home

    try:
        cur = cur.resolve()
    except OSError:
        pass

    parent = str(cur.parent) if cur.parent != cur else ""
    dirs: List[Dict[str, str]] = []
    try:
        entries = list(cur.iterdir())
        for entry in entries:
            name = entry.name
            if name.startswith("$") or name in ("System Volume Information", "Recovery"):
                continue
            try:
                if entry.is_dir():
                    dirs.append({"name": name, "path": str(entry)})
            except OSError:
                continue
        dirs.sort(key=lambda d: (d["name"].startswith("."), d["name"].lower()))
    except OSError:
        pass

    return {
        "current": str(cur),
        "parent": parent,
        "shortcuts": shortcuts,
        "drives": drives,
        "dirs": dirs[:250],
    }


_INVALID_WIN_NAME_RE = re.compile(r'[<>:"|?*\x00-\x1f]')


def _is_protected_system_dir(p: Path) -> bool:
    try:
        resolved = p.resolve()
    except OSError:
        resolved = p
    if resolved.parent == resolved:
        return True
    home = Path.home().resolve()
    protected = {
        home,
        (home / "Desktop").resolve(),
        (home / "Documents").resolve(),
        (home / "Downloads").resolve(),
        BASE_DIR.resolve(),
    }
    if resolved in protected:
        return True
    if os.name == "nt":
        # Protect top-level drive children like C:\Windows, C:\Users, C:\Program Files
        if len(resolved.parts) <= 2:
            return True
    return False


def create_local_directory(parent_dir: str, name: str) -> Dict[str, Any]:
    """Create a new folder inside `parent_dir` from the local folder browser modal."""
    raw_parent = (parent_dir or "").strip()
    raw_name = (name or "").strip().replace("\\", "/").strip("/")
    if not raw_parent:
        return {"ok": False, "error": "父目录路径不能为空"}
    if not raw_name:
        return {"ok": False, "error": "文件夹名称不能为空"}
    if _INVALID_WIN_NAME_RE.search(raw_name):
        return {"ok": False, "error": "文件夹名称包含非法字符"}

    parts = [seg.strip() for seg in raw_name.split("/") if seg.strip()]
    if not parts or any(seg in (".", "..") for seg in parts):
        return {"ok": False, "error": "文件夹名称不合法"}

    parent = Path(os.path.expandvars(os.path.expanduser(raw_parent)))
    if not parent.is_dir():
        return {"ok": False, "error": "父目录不存在"}
    try:
        parent = parent.resolve()
        target = parent.joinpath(*parts).resolve()
        target.relative_to(parent)
    except Exception:
        return {"ok": False, "error": "目标路径超出当前目录范围"}

    if target.exists():
        return {"ok": False, "error": "同名文件夹或文件已存在"}

    try:
        target.mkdir(parents=True, exist_ok=False)
        return {"ok": True, "path": str(target), "name": target.name}
    except OSError as exc:
        return {"ok": False, "error": f"创建失败: {exc}"}


def rename_local_directory(target_path: str, new_name: str) -> Dict[str, Any]:
    """Rename a local folder from the folder browser modal."""
    raw_target = (target_path or "").strip()
    raw_new = (new_name or "").strip()
    if not raw_target or not raw_new:
        return {"ok": False, "error": "路径与新名称不能为空"}
    if "/" in raw_new or "\\" in raw_new or raw_new in (".", "..") or _INVALID_WIN_NAME_RE.search(raw_new):
        return {"ok": False, "error": "新名称不能包含路径分隔符或非法字符"}

    src = Path(os.path.expandvars(os.path.expanduser(raw_target)))
    if not src.is_dir():
        return {"ok": False, "error": "目标文件夹不存在"}
    if _is_protected_system_dir(src):
        return {"ok": False, "error": "为保证安全，不允许重命名根目录或系统关键目录"}

    dst = src.parent / raw_new
    if dst.exists() and str(dst).lower() != str(src).lower():
        return {"ok": False, "error": "同级目录下已存在同名项"}

    try:
        src.rename(dst)
        return {"ok": True, "old_path": str(src), "path": str(dst), "name": dst.name}
    except OSError as exc:
        return {"ok": False, "error": f"重命名失败: {exc}"}


def delete_local_directory(target_path: str) -> Dict[str, Any]:
    """Safely delete a non-system folder from the folder browser modal."""
    raw_target = (target_path or "").strip()
    if not raw_target:
        return {"ok": False, "error": "目录路径不能为空"}

    target = Path(os.path.expandvars(os.path.expanduser(raw_target)))
    if not target.is_dir():
        return {"ok": False, "error": "目标文件夹不存在"}
    if _is_protected_system_dir(target):
        return {"ok": False, "error": "为保证安全，不允许删除根目录、用户目录或系统关键目录"}

    try:
        shutil.rmtree(target)
        return {"ok": True, "path": str(target)}
    except OSError as exc:
        return {"ok": False, "error": f"删除失败: {exc}"}


def search_workspace_files(cwd_str: str, query: str = "", limit: int = 100) -> List[Dict[str, Any]]:
    root = Path(cwd_str) if cwd_str else Path.home()
    if not root.is_dir():
        return []
    q = (query or "").strip().lower()
    results: List[Dict[str, Any]] = []
    root_parts = len(root.parts)

    for dirpath, dirnames, filenames in os.walk(root):
        cur = Path(dirpath)
        depth = len(cur.parts) - root_parts
        dirnames[:] = [
            d for d in sorted(dirnames)
            if d not in SKIP_DIRS and not d.startswith(".") and depth < 4
        ]
        for fn in sorted(filenames):
            if fn.startswith("."):
                continue
            full = cur / fn
            try:
                rel = str(full.relative_to(root)).replace("\\", "/")
            except ValueError:
                rel = fn
            if q and q not in rel.lower() and q not in fn.lower():
                continue
            try:
                size = full.stat().st_size
            except OSError:
                size = 0
            ext = full.suffix.lower()
            results.append(
                {
                    "name": fn,
                    "rel_path": rel,
                    "path": str(full),
                    "size": size,
                    "is_image": ext in IMAGE_EXTS,
                }
            )
            if len(results) >= limit:
                return results
    return results



def _resolve_workspace_root(cwd_str: str = "") -> Path:
    raw = (cwd_str or "").strip()
    if raw:
        p = Path(os.path.expandvars(os.path.expanduser(raw)))
        if p.is_dir():
            try:
                return p.resolve()
            except OSError:
                return p
    fallback = Path(load_settings().get("default_cwd") or str(BASE_DIR))
    if fallback.is_dir():
        try:
            return fallback.resolve()
        except OSError:
            return fallback
    return BASE_DIR.resolve()


def _safe_resolve_inside(root: Path, rel_path: str) -> Optional[Path]:
    clean = (rel_path or "").strip().replace("\\", "/").lstrip("/")
    if not clean:
        return root
    try:
        candidate = (root / clean).resolve()
        root_resolved = root.resolve()
        candidate.relative_to(root_resolved)
        return candidate
    except Exception:
        return None


def list_workspace_tree(cwd_str: str, rel_dir: str = "") -> Dict[str, Any]:
    root = _resolve_workspace_root(cwd_str)
    target = _safe_resolve_inside(root, rel_dir)
    if not target or not target.is_dir():
        return {"ok": False, "error": "目录不存在或无权访问", "root": str(root), "rel_dir": rel_dir, "entries": []}

    entries: List[Dict[str, Any]] = []
    try:
        for item in target.iterdir():
            name = item.name
            if name in ("System Volume Information", "Recovery") or name.startswith("$"):
                continue
            try:
                is_dir = item.is_dir()
            except OSError:
                continue
            if is_dir and name in SKIP_DIRS:
                continue
            try:
                rel = str(item.relative_to(root)).replace("\\", "/")
            except ValueError:
                rel = name
            try:
                st = item.stat()
                size = 0 if is_dir else st.st_size
                mtime = st.st_mtime
            except OSError:
                size = 0
                mtime = 0.0
            ext = "" if is_dir else item.suffix.lower()
            entries.append(
                {
                    "name": name,
                    "rel_path": rel,
                    "path": str(item),
                    "is_dir": is_dir,
                    "size": size,
                    "ext": ext,
                    "is_image": (not is_dir) and (ext in IMAGE_EXTS),
                    "mtime": mtime,
                }
            )
    except OSError as exc:
        return {"ok": False, "error": str(exc), "root": str(root), "rel_dir": rel_dir, "entries": []}

    entries.sort(key=lambda e: (not e["is_dir"], e["name"].startswith("."), e["name"].lower()))
    return {
        "ok": True,
        "root": str(root),
        "rel_dir": rel_dir.replace("\\", "/").strip("/"),
        "entries": entries[:400],
    }


AUDIO_EXTS = {".mp3", ".wav", ".ogg", ".m4a", ".flac"}
PURE_VIDEO_EXTS = {".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v"}


def _col_letters_to_idx(col_ref: str) -> int:
    idx = 0
    for ch in col_ref:
        if "A" <= ch <= "Z":
            idx = idx * 26 + (ord(ch) - ord("A") + 1)
    return max(0, idx - 1)


def _parse_docx_to_markdown(path: Path) -> str:
    ns_w = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    blocks: List[str] = []
    with zipfile.ZipFile(path, "r") as zf:
        if "word/document.xml" not in zf.namelist():
            return ""
        root = ET.fromstring(zf.read("word/document.xml"))
    body = root.find(f"{ns_w}body")
    if body is None:
        return ""

    for child in body:
        tag = child.tag
        if tag == f"{ns_w}p":
            pstyle = ""
            ppr = child.find(f"{ns_w}pPr")
            if ppr is not None:
                st = ppr.find(f"{ns_w}pStyle")
                if st is not None:
                    pstyle = st.attrib.get(f"{ns_w}val", "")
            parts: List[str] = []
            for r in child.findall(f".//{ns_w}r"):
                texts = [t.text or "" for t in r.findall(f"{ns_w}t")]
                chunk = "".join(texts)
                if not chunk:
                    continue
                rpr = r.find(f"{ns_w}rPr")
                is_bold = rpr is not None and rpr.find(f"{ns_w}b") is not None
                if is_bold and chunk.strip():
                    parts.append(f"**{chunk}**")
                else:
                    parts.append(chunk)
            line = "".join(parts).strip()
            if not line:
                continue
            low_st = pstyle.lower()
            if "heading1" in low_st or low_st == "1" or "title" in low_st:
                blocks.append(f"# {line}")
            elif "heading2" in low_st or low_st == "2":
                blocks.append(f"## {line}")
            elif "heading3" in low_st or low_st == "3":
                blocks.append(f"### {line}")
            else:
                blocks.append(line)
        elif tag == f"{ns_w}tbl":
            rows: List[List[str]] = []
            for tr in child.findall(f"{ns_w}tr"):
                row_vals: List[str] = []
                for tc in tr.findall(f"{ns_w}tc"):
                    cell_txt = " ".join(t.text or "" for t in tc.findall(f".//{ns_w}t")).strip()
                    row_vals.append(cell_txt.replace("|", "\\|"))
                if row_vals:
                    rows.append(row_vals)
            if rows:
                cols = max(len(r) for r in rows)
                norm_rows = [r + [""] * (cols - len(r)) for r in rows]
                md_tbl = [
                    "| " + " | ".join(norm_rows[0]) + " |",
                    "| " + " | ".join(["---"] * cols) + " |",
                ]
                for r in norm_rows[1:]:
                    md_tbl.append("| " + " | ".join(r) + " |")
                blocks.append("\n".join(md_tbl))
    return "\n\n".join(blocks[:1500])


def _parse_xlsx_sheets(path: Path) -> List[Dict[str, Any]]:
    sheets_out: List[Dict[str, Any]] = []
    with zipfile.ZipFile(path, "r") as zf:
        names = zf.namelist()
        shared: List[str] = []
        if "xl/sharedStrings.xml" in names:
            sroot = ET.fromstring(zf.read("xl/sharedStrings.xml"))
            for si in sroot:
                txt = "".join(t.text or "" for t in si.iter() if t.tag.endswith("}t") or t.tag == "t")
                shared.append(txt)

        sheet_names: List[str] = []
        if "xl/workbook.xml" in names:
            wroot = ET.fromstring(zf.read("xl/workbook.xml"))
            for el in wroot.iter():
                if el.tag.endswith("}sheet") and "name" in el.attrib:
                    sheet_names.append(el.attrib["name"])

        sheet_files = sorted(
            [n for n in names if re.match(r"^xl/worksheets/sheet\d+\.xml$", n)],
            key=lambda s: int(re.search(r"(\d+)", s).group(1)),
        )[:8]

        for idx, sf in enumerate(sheet_files):
            root = ET.fromstring(zf.read(sf))
            rows: List[List[str]] = []
            max_cols = 0
            for row_el in root.iter():
                if not row_el.tag.endswith("}row"):
                    continue
                row_map: Dict[int, str] = {}
                cur_c = 0
                for c_el in row_el:
                    if not c_el.tag.endswith("}c"):
                        continue
                    ref = c_el.attrib.get("r", "")
                    m_col = re.match(r"^([A-Z]+)", ref)
                    col_idx = _col_letters_to_idx(m_col.group(1)) if m_col else cur_c
                    cur_c = col_idx + 1
                    if col_idx >= 40:
                        continue
                    ctype = c_el.attrib.get("t", "")
                    val = ""
                    if ctype == "inlineStr":
                        val = "".join(t.text or "" for t in c_el.iter() if t.tag.endswith("}t"))
                    else:
                        v_el = next((ch for ch in c_el if ch.tag.endswith("}v")), None)
                        raw_v = (v_el.text or "") if v_el is not None else ""
                        if ctype == "s" and raw_v.isdigit():
                            si_idx = int(raw_v)
                            val = shared[si_idx] if 0 <= si_idx < len(shared) else raw_v
                        else:
                            val = raw_v
                    row_map[col_idx] = val
                    if col_idx + 1 > max_cols:
                        max_cols = col_idx + 1
                if row_map:
                    row_arr = [row_map.get(i, "") for i in range(max_cols)]
                    rows.append(row_arr)
                if len(rows) >= 400:
                    break
            norm_rows = [r + [""] * (max_cols - len(r)) for r in rows]
            sname = sheet_names[idx] if idx < len(sheet_names) else f"Sheet {idx + 1}"
            sheets_out.append({"name": sname, "rows": norm_rows, "cols": max_cols})
    return sheets_out


def _parse_pptx_slides(path: Path) -> List[Dict[str, Any]]:
    slides: List[Dict[str, Any]] = []
    with zipfile.ZipFile(path, "r") as zf:
        slide_files = sorted(
            [n for n in zf.namelist() if re.match(r"^ppt/slides/slide\d+\.xml$", n)],
            key=lambda s: int(re.search(r"(\d+)", s).group(1)),
        )[:80]
        for idx, sf in enumerate(slide_files, 1):
            root = ET.fromstring(zf.read(sf))
            paras: List[str] = []
            for p_el in root.iter():
                if p_el.tag.endswith("}p"):
                    txt = "".join(t.text or "" for t in p_el.iter() if t.tag.endswith("}t")).strip()
                    if txt:
                        paras.append(txt)
            slides.append({"index": idx, "paragraphs": paras})
    return slides


def _parse_ipynb_cells(path: Path) -> List[Dict[str, Any]]:
    nb = json.loads(path.read_text(encoding="utf-8", errors="replace"))
    cells_out: List[Dict[str, Any]] = []
    for idx, cell in enumerate(nb.get("cells", [])[:200], 1):
        ctype = cell.get("cell_type", "code")
        src = cell.get("source", "")
        if isinstance(src, list):
            src = "".join(src)
        outputs: List[str] = []
        for out in cell.get("outputs", [])[:6]:
            if "text" in out:
                t = out["text"]
                outputs.append("".join(t) if isinstance(t, list) else str(t))
            elif "data" in out and isinstance(out["data"], dict):
                plain = out["data"].get("text/plain")
                if plain:
                    outputs.append("".join(plain) if isinstance(plain, list) else str(plain))
            elif "evalue" in out:
                outputs.append(f"{out.get('ename', 'Error')}: {out.get('evalue', '')}")
        cells_out.append(
            {
                "index": idx,
                "cell_type": ctype,
                "source": src,
                "output": "\n".join(outputs).strip()[:4000],
            }
        )
    return cells_out


def read_workspace_file(cwd_str: str, rel_path: str) -> Dict[str, Any]:
    root = _resolve_workspace_root(cwd_str)
    target = _safe_resolve_inside(root, rel_path)
    if not target or not _safe_is_file(target):
        return {"ok": False, "error": "文件不存在或无法读取"}

    ext = target.suffix.lower()
    try:
        st = target.stat()
        size = st.st_size
    except OSError as exc:
        return {"ok": False, "error": str(exc)}

    try:
        rel_norm = str(target.relative_to(root)).replace("\\", "/")
    except ValueError:
        rel_norm = target.name

    raw_url = f"/api/workspace/raw?cwd={urllib.parse.quote(str(root))}&path={urllib.parse.quote(rel_norm)}"
    base_meta = {
        "ok": True,
        "name": target.name,
        "rel_path": rel_norm,
        "abs_path": str(target),
        "size": size,
        "ext": ext,
        "raw_url": raw_url,
    }

    if ext in IMAGE_EXTS or ext == ".ico":
        return {**base_meta, "kind": "image", "preview_url": raw_url}

    if ext == ".pdf":
        return {**base_meta, "kind": "pdf", "preview_url": raw_url}

    if ext in PURE_VIDEO_EXTS:
        return {**base_meta, "kind": "video", "preview_url": raw_url}

    if ext in AUDIO_EXTS:
        return {**base_meta, "kind": "audio", "preview_url": raw_url}

    if ext == ".docx":
        try:
            md_text = _parse_docx_to_markdown(target)
            return {**base_meta, "kind": "docx", "content": md_text, "lines": md_text.count("\n") + 1}
        except Exception as exc:
            return {**base_meta, "kind": "binary", "parse_error": str(exc)}

    if ext == ".xlsx":
        try:
            sheets = _parse_xlsx_sheets(target)
            return {**base_meta, "kind": "table", "sheets": sheets}
        except Exception as exc:
            return {**base_meta, "kind": "binary", "parse_error": str(exc)}

    if ext in (".csv", ".tsv"):
        try:
            raw_txt = target.read_bytes()[:512 * 1024].decode("utf-8-sig", errors="replace")
            delim = "\t" if ext == ".tsv" else ","
            reader = csv.reader(io.StringIO(raw_txt), delimiter=delim)
            rows: List[List[str]] = []
            max_cols = 0
            for row in reader:
                rows.append(row[:40])
                max_cols = max(max_cols, min(len(row), 40))
                if len(rows) >= 500:
                    break
            norm_rows = [r + [""] * (max_cols - len(r)) for r in rows]
            return {
                **base_meta,
                "kind": "table",
                "sheets": [{"name": target.name, "rows": norm_rows, "cols": max_cols}],
                "content": raw_txt,
                "lines": raw_txt.count("\n") + 1,
            }
        except Exception:
            pass

    if ext == ".pptx":
        try:
            slides = _parse_pptx_slides(target)
            return {**base_meta, "kind": "pptx", "slides": slides}
        except Exception as exc:
            return {**base_meta, "kind": "binary", "parse_error": str(exc)}

    if ext == ".ipynb":
        try:
            cells = _parse_ipynb_cells(target)
            return {**base_meta, "kind": "ipynb", "cells": cells}
        except Exception:
            pass

    if ext == ".zip":
        try:
            with zipfile.ZipFile(target, "r") as zf:
                entries = [
                    {"name": info.filename, "size": info.file_size, "is_dir": info.is_dir()}
                    for info in zf.infolist()[:300]
                ]
            return {**base_meta, "kind": "archive", "entries": entries}
        except Exception as exc:
            return {**base_meta, "kind": "binary", "parse_error": str(exc)}

    max_bytes = 512 * 1024
    try:
        with target.open("rb") as fh:
            raw = fh.read(max_bytes + 1)
    except OSError as exc:
        return {"ok": False, "error": str(exc)}

    if b"\x00" in raw[:4096]:
        return {**base_meta, "kind": "binary"}

    truncated = len(raw) > max_bytes
    text = raw[:max_bytes].decode("utf-8", errors="replace")
    line_count = text.count("\n") + (1 if text else 0)
    return {
        **base_meta,
        "kind": "text",
        "lines": line_count,
        "content": text,
        "truncated": truncated,
    }



def run_workspace_terminal(command: str, cwd_str: str, session_id: str = "default") -> Dict[str, Any]:
    cmd = (command or "").strip()
    root = _resolve_workspace_root(cwd_str)
    if not cmd:
        return {"ok": False, "error": "命令不能为空", "cwd": str(root), "new_cwd": str(root)}

    # Handle standalone `cd <path>` to preserve working directory seamlessly across commands
    cd_match = re.match(r"^(?:cd|chdir|set-location|sl)\s+(.+)$", cmd, re.IGNORECASE)
    if cd_match and not any(sep in cmd for sep in ("&&", "||", ";", "|")):
        target_arg = cd_match.group(1).strip().strip('"').strip("'")
        if target_arg in ("~",):
            cand = Path.home()
        else:
            cand = Path(os.path.expandvars(os.path.expanduser(target_arg)))
            if not cand.is_absolute():
                cand = root / cand
        try:
            cand = cand.resolve()
        except OSError:
            pass
        if cand.is_dir():
            return {
                "ok": True,
                "exit_code": 0,
                "stdout": f"工作目录已切换至: {cand}",
                "stderr": "",
                "cwd": str(root),
                "new_cwd": str(cand),
                "elapsed_ms": 2,
                "truncated": False,
            }
        return {
            "ok": True,
            "exit_code": 1,
            "stdout": "",
            "stderr": f"目录不存在: {cand}",
            "cwd": str(root),
            "new_cwd": str(root),
            "elapsed_ms": 2,
            "truncated": False,
        }

    started = time.time()
    env = os.environ.copy()
    env["PYTHONUTF8"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"

    if os.name == "nt":
        ps_script = (
            "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; "
            "$OutputEncoding = [System.Text.Encoding]::UTF8; "
            + cmd
        )
        shell_cmd = ["powershell.exe", "-NoLogo", "-NoProfile", "-Command", ps_script]
    else:
        shell_cmd = ["/bin/sh", "-c", cmd]

    try:
        proc = subprocess.Popen(
            shell_cmd,
            cwd=str(root),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            creationflags=_no_window_flags(),
        )
    except Exception as exc:
        return {"ok": False, "error": f"无法启动终端进程: {exc}", "cwd": str(root), "new_cwd": str(root)}

    with TERM_LOCK:
        ACTIVE_TERM_PROCS[session_id] = proc

    try:
        out_b, err_b = proc.communicate(timeout=30)
        rc = proc.returncode
        timed_out = False
    except subprocess.TimeoutExpired:
        try:
            proc.kill()
        except Exception:
            pass
        out_b, err_b = proc.communicate()
        rc = -1
        timed_out = True
    finally:
        with TERM_LOCK:
            if ACTIVE_TERM_PROCS.get(session_id) is proc:
                ACTIVE_TERM_PROCS.pop(session_id, None)

    max_len = 120 * 1024
    truncated = len(out_b) > max_len or len(err_b) > max_len
    stdout_txt = out_b[:max_len].decode("utf-8", errors="replace")
    stderr_txt = err_b[:max_len].decode("utf-8", errors="replace")
    if timed_out:
        stderr_txt = (stderr_txt + "\n[命令执行超过 30 秒已自动中止]").strip()

    return {
        "ok": True,
        "exit_code": rc,
        "stdout": stdout_txt,
        "stderr": stderr_txt,
        "cwd": str(root),
        "new_cwd": str(root),
        "elapsed_ms": int((time.time() - started) * 1000),
        "truncated": truncated,
    }


def open_native_folder_dialog(initial_dir: str = "") -> Dict[str, Any]:
    """Opens the OS native folder chooser dialog on Windows via PowerShell WinForms."""
    if os.name != "nt":
        return {"cancelled": True, "error": "Native folder dialog only implemented for Windows"}
    safe_init = (initial_dir or str(Path.home())).replace("'", "''")
    ps_script = (
        "Add-Type -AssemblyName System.Windows.Forms; "
        "$owner = New-Object System.Windows.Forms.Form; "
        "$owner.TopMost = $true; $owner.StartPosition = 'Manual'; $owner.Location = New-Object System.Drawing.Point(-32000, -32000); "
        "$dlg = New-Object System.Windows.Forms.FolderBrowserDialog; "
        "$dlg.Description = '选择工作区 / 项目文件夹'; "
        "$dlg.UseDescriptionForTitle = $true; "
        f"if (Test-Path '{safe_init}') {{ $dlg.SelectedPath = '{safe_init}' }}; "
        "$res = $dlg.ShowDialog($owner); "
        "$owner.Dispose(); "
        "if ($res -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dlg.SelectedPath }"
    )
    try:
        proc = subprocess.run(
            ["powershell", "-NoProfile", "-STA", "-Command", ps_script],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=120,
        )
        chosen = (proc.stdout or "").strip()
        if chosen and os.path.isdir(chosen):
            return {"path": chosen, "cancelled": False}
        return {"path": "", "cancelled": True}
    except Exception as exc:
        return {"path": "", "cancelled": True, "error": str(exc)}


def save_uploaded_file(name: str, data_base64: str, mime: str = "") -> Dict[str, Any]:
    raw_name = Path(name or "attachment.bin").name
    safe_name = re.sub(r"[^A-Za-z0-9._\-\u4e00-\u9fff]+", "_", raw_name).strip("_") or "file.bin"
    uid = uuid.uuid4().hex[:8]
    stored_name = f"{uid}_{safe_name}"
    dest = UPLOAD_DIR / stored_name

    # Strip data URL prefix if sent directly
    b64_payload = data_base64.split(",", 1)[1] if "," in data_base64 and data_base64.startswith("data:") else data_base64
    raw_bytes = base64.b64decode(b64_payload)
    if len(raw_bytes) > 25 * 1024 * 1024:
        raise ValueError("单个文件大小不能超过 25 MB")
    dest.write_bytes(raw_bytes)

    ext = dest.suffix.lower()
    is_img = ext in IMAGE_EXTS or (mime or "").startswith("image/")
    return {
        "id": uid,
        "name": raw_name,
        "stored_name": stored_name,
        "path": str(dest),
        "size": len(raw_bytes),
        "mime": mime or mimetypes.guess_type(raw_name)[0] or "application/octet-stream",
        "is_image": is_img,
        "preview_url": f"/uploads/{urllib.parse.quote(stored_name)}" if is_img else "",
        "source": "upload",
    }


