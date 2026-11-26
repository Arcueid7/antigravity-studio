# -*- coding: utf-8 -*-
"""Git Worktree management for parallel multi-branch development."""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any, Callable, Dict, List, Tuple


def _msys_to_win_path(p: str) -> str:
    raw = (p or "").strip()
    if os.name == "nt":
        m = re.match(r"^/([a-zA-Z])/(.*)$", raw)
        if m:
            return f"{m.group(1).upper()}:/{m.group(2)}"
    return raw


def _norm_path(p: str) -> str:
    conv = _msys_to_win_path(p)
    try:
        return str(Path(conv).resolve()).replace("\\", "/").rstrip("/").lower()
    except OSError:
        return conv.replace("\\", "/").rstrip("/").lower()


def git_list_worktrees(
    cwd_str: str,
    resolve_root: Callable[[str], Path],
    run_git: Callable[..., Tuple[int, str, str]],
) -> Dict[str, Any]:
    """Return all Git worktrees for the active repository."""
    root = resolve_root(cwd_str)
    rc, top_out, _ = run_git(root, ["rev-parse", "--show-toplevel"], timeout=8)
    if rc != 0 or not top_out.strip():
        return {"ok": True, "is_git": False, "worktrees": [], "current_root": str(root)}

    repo_root = Path(_msys_to_win_path(top_out.strip()))
    rc2, out, err = run_git(repo_root, ["worktree", "list", "--porcelain"], timeout=10)
    if rc2 != 0:
        return {"ok": False, "is_git": True, "error": err.strip() or "无法列出 Git Worktrees", "worktrees": []}

    worktrees: List[Dict[str, Any]] = []
    cur: Dict[str, Any] = {}
    cur_norm = _norm_path(str(repo_root))

    def _flush() -> None:
        if not cur.get("path"):
            return
        wt_path = str(Path(_msys_to_win_path(cur["path"])))
        branch_raw = cur.get("branch", "")
        branch = branch_raw[len("refs/heads/"):] if branch_raw.startswith("refs/heads/") else branch_raw
        worktrees.append(
            {
                "path": wt_path,
                "name": Path(wt_path).name,
                "head": (cur.get("head") or "")[:8],
                "branch": branch or ("(bare)" if cur.get("bare") else "(detached)"),
                "bare": bool(cur.get("bare")),
                "detached": bool(cur.get("detached")),
                "locked": bool(cur.get("locked")),
                "is_main": len(worktrees) == 0,
                "is_current": _norm_path(wt_path) == cur_norm,
            }
        )

    for raw_ln in out.splitlines():
        ln = raw_ln.strip()
        if not ln:
            _flush()
            cur = {}
            continue
        if ln.startswith("worktree "):
            cur["path"] = ln[9:].strip()
        elif ln.startswith("HEAD "):
            cur["head"] = ln[5:].strip()
        elif ln.startswith("branch "):
            cur["branch"] = ln[7:].strip()
        elif ln == "bare":
            cur["bare"] = True
        elif ln == "detached":
            cur["detached"] = True
        elif ln.startswith("locked"):
            cur["locked"] = True
    _flush()

    return {
        "ok": True,
        "is_git": True,
        "repo_root": str(repo_root),
        "worktrees": worktrees,
    }


def git_add_worktree(
    cwd_str: str,
    branch: str,
    create_branch: bool,
    target_dir: str,
    resolve_root: Callable[[str], Path],
    run_git: Callable[..., Tuple[int, str, str]],
) -> Dict[str, Any]:
    """Create a sibling Git worktree on a new or existing branch."""
    br = (branch or "").strip()
    if not br:
        return {"ok": False, "error": "请输入分支名称"}
    if not re.match(r"^[A-Za-z0-9._/\-]+$", br):
        return {"ok": False, "error": "分支名仅支持字母、数字、点、斜杠与连字符"}

    root = resolve_root(cwd_str)
    rc, top_out, _ = run_git(root, ["rev-parse", "--show-toplevel"], timeout=8)
    if rc != 0 or not top_out.strip():
        return {"ok": False, "error": "当前工作区不是 Git 仓库"}

    repo_root = Path(_msys_to_win_path(top_out.strip())).resolve()
    safe_slug = re.sub(r"[^A-Za-z0-9._\-]+", "-", br).strip("-") or "wt"

    if target_dir and target_dir.strip():
        dest = Path(target_dir.strip()).expanduser()
        if not dest.is_absolute():
            dest = repo_root.parent / dest
    else:
        dest = repo_root.parent / f"{repo_root.name}-wt-{safe_slug}"

    if dest.exists():
        return {"ok": False, "error": f"目标目录已存在: {dest}"}

    # Auto-detect whether branch already exists locally
    rc_chk, _, _ = run_git(repo_root, ["show-ref", "--verify", "--quiet", f"refs/heads/{br}"], timeout=6)
    branch_exists = rc_chk == 0

    if branch_exists:
        args = ["worktree", "add", str(dest), br]
    elif create_branch:
        args = ["worktree", "add", "-b", br, str(dest)]
    else:
        args = ["worktree", "add", str(dest), br]

    rc_add, out_add, err_add = run_git(repo_root, args, timeout=30)
    if rc_add != 0:
        return {"ok": False, "error": (err_add or out_add or "创建 Worktree 失败").strip()}

    listed = git_list_worktrees(str(repo_root), resolve_root, run_git)
    return {
        "ok": True,
        "worktree_path": str(dest.resolve()),
        "branch": br,
        "worktrees": listed.get("worktrees", []),
    }


def git_remove_worktree(
    cwd_str: str,
    worktree_path: str,
    force: bool,
    resolve_root: Callable[[str], Path],
    run_git: Callable[..., Tuple[int, str, str]],
) -> Dict[str, Any]:
    """Remove a secondary Git worktree cleanly."""
    wt = (worktree_path or "").strip()
    if not wt:
        return {"ok": False, "error": "缺少 Worktree 路径"}

    root = resolve_root(cwd_str)
    rc, top_out, _ = run_git(root, ["rev-parse", "--show-toplevel"], timeout=8)
    if rc != 0 or not top_out.strip():
        return {"ok": False, "error": "当前工作区不是 Git 仓库"}

    repo_root = Path(_msys_to_win_path(top_out.strip())).resolve()
    args = ["worktree", "remove"]
    if force:
        args.append("--force")
    args.append(wt)

    rc_rm, out_rm, err_rm = run_git(repo_root, args, timeout=20)
    if rc_rm != 0:
        return {"ok": False, "error": (err_rm or out_rm or "移除 Worktree 失败（可勾选强制移除或先清理未提交改动）").strip()}

    run_git(repo_root, ["worktree", "prune"], timeout=10)
    listed = git_list_worktrees(str(repo_root), resolve_root, run_git)
    return {"ok": True, "worktrees": listed.get("worktrees", [])}
