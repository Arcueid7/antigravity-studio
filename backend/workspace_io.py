# -*- coding: utf-8 -*-
"""Safe workspace file writing, creation, renaming, and deletion for the right pane."""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any, Callable, Dict, Optional

MAX_WRITE_BYTES = 4 * 1024 * 1024  # 4 MB safety limit


def _validate_target(
    cwd_str: str,
    rel_path: str,
    resolve_root: Callable[[str], Path],
    safe_resolve: Callable[[Path, str], Optional[Path]],
) -> tuple[Optional[Path], Optional[Path], Optional[str]]:
    clean_rel = (rel_path or "").strip().replace("\\", "/").strip("/")
    if not clean_rel:
        return None, None, "文件路径不能为空"

    root = resolve_root(cwd_str)
    target = safe_resolve(root, clean_rel)
    if target is None:
        return None, None, "路径越界，已拒绝操作"

    try:
        rel_parts = target.relative_to(root).parts
    except ValueError:
        return None, None, "路径不在工作区内"

    if not rel_parts:
        return None, None, "不允许操作工作区根目录本身"

    if any(part == ".git" for part in rel_parts):
        return None, None, "不允许直接修改 .git 内部文件"

    return root, target, None


def write_workspace_file(
    cwd_str: str,
    rel_path: str,
    content: str,
    resolve_root: Callable[[str], Path],
    safe_resolve: Callable[[Path, str], Optional[Path]],
) -> Dict[str, Any]:
    """Safely save UTF-8 text content into a file inside the active workspace."""
    root, target, err = _validate_target(cwd_str, rel_path, resolve_root, safe_resolve)
    if err or root is None or target is None:
        return {"ok": False, "error": err or "路径无效"}

    raw_bytes = (content if isinstance(content, str) else "").encode("utf-8")
    if len(raw_bytes) > MAX_WRITE_BYTES:
        return {"ok": False, "error": "文件内容超过 4 MB 安全限制"}

    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(raw_bytes)
        st = target.stat()
        lines = content.count("\n") + 1 if content else 0
        return {
            "ok": True,
            "rel_path": target.relative_to(root).as_posix(),
            "abs_path": str(target),
            "size": st.st_size,
            "lines": lines,
            "mtime": st.st_mtime,
        }
    except OSError as exc:
        return {"ok": False, "error": f"保存失败: {exc}"}


def create_workspace_entry(
    cwd_str: str,
    rel_path: str,
    kind: str,
    resolve_root: Callable[[str], Path],
    safe_resolve: Callable[[Path, str], Optional[Path]],
) -> Dict[str, Any]:
    """Safely create a new file or folder inside the active workspace."""
    root, target, err = _validate_target(cwd_str, rel_path, resolve_root, safe_resolve)
    if err or root is None or target is None:
        return {"ok": False, "error": err or "路径无效"}

    if target.exists():
        return {"ok": False, "error": "目标文件或文件夹已存在"}

    is_dir = (kind or "file").strip().lower() in ("dir", "folder", "directory")
    try:
        if is_dir:
            target.mkdir(parents=True, exist_ok=False)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(b"")
        return {
            "ok": True,
            "rel_path": target.relative_to(root).as_posix(),
            "abs_path": str(target),
            "name": target.name,
            "is_dir": is_dir,
        }
    except OSError as exc:
        return {"ok": False, "error": f"创建失败: {exc}"}


def rename_workspace_entry(
    cwd_str: str,
    old_rel_path: str,
    new_rel_path: str,
    resolve_root: Callable[[str], Path],
    safe_resolve: Callable[[Path, str], Optional[Path]],
) -> Dict[str, Any]:
    """Safely rename or move a file/folder inside the active workspace."""
    root, src, err1 = _validate_target(cwd_str, old_rel_path, resolve_root, safe_resolve)
    if err1 or root is None or src is None:
        return {"ok": False, "error": err1 or "源路径无效"}
    if not src.exists():
        return {"ok": False, "error": "源文件或文件夹不存在"}

    _, dst, err2 = _validate_target(cwd_str, new_rel_path, resolve_root, safe_resolve)
    if err2 or dst is None:
        return {"ok": False, "error": err2 or "目标路径无效"}

    same_case_insensitive = str(src).lower() == str(dst).lower()
    if dst.exists() and not same_case_insensitive:
        return {"ok": False, "error": "目标名称已存在"}

    try:
        dst.parent.mkdir(parents=True, exist_ok=True)
        src.rename(dst)
        return {
            "ok": True,
            "old_rel_path": src.relative_to(root).as_posix(),
            "new_rel_path": dst.relative_to(root).as_posix(),
            "abs_path": str(dst),
            "name": dst.name,
            "is_dir": dst.is_dir(),
        }
    except OSError as exc:
        return {"ok": False, "error": f"重命名失败: {exc}"}


def delete_workspace_entry(
    cwd_str: str,
    rel_path: str,
    resolve_root: Callable[[str], Path],
    safe_resolve: Callable[[Path, str], Optional[Path]],
) -> Dict[str, Any]:
    """Safely delete a file or folder inside the active workspace."""
    root, target, err = _validate_target(cwd_str, rel_path, resolve_root, safe_resolve)
    if err or root is None or target is None:
        return {"ok": False, "error": err or "路径无效"}

    if not target.exists():
        return {"ok": False, "error": "目标不存在"}

    is_dir = target.is_dir()
    rel_posix = target.relative_to(root).as_posix()
    try:
        if is_dir:
            shutil.rmtree(target)
        else:
            target.unlink()
        return {"ok": True, "rel_path": rel_posix, "is_dir": is_dir}
    except OSError as exc:
        return {"ok": False, "error": f"删除失败: {exc}"}
