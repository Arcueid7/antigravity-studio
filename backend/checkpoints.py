# -*- coding: utf-8 -*-
"""
Lightweight content-addressed workspace Checkpoints & one-click Rollback.
Uses SHA-256 deduplicated blobs so snapshots take minimal disk space and
never mutate Git index/stash/history.
"""

from __future__ import annotations

import hashlib
import json
import os
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

IGNORED_DIRS: Set[str] = {
    ".git",
    "node_modules",
    "__pycache__",
    ".venv",
    "venv",
    "env",
    "dist",
    "build",
    ".next",
    ".nuxt",
    ".cache",
    "target",
    "data",
    "lib",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    ".idea",
    ".vs",
}

IGNORED_EXTS: Set[str] = {
    ".exe",
    ".dll",
    ".pdb",
    ".so",
    ".dylib",
    ".bin",
    ".zip",
    ".tar",
    ".gz",
    ".7z",
    ".rar",
    ".mp4",
    ".mov",
    ".avi",
    ".mkv",
    ".mp3",
    ".wav",
    ".pdf",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".ico",
    ".woff",
    ".woff2",
    ".ttf",
    ".pyc",
    ".pyo",
    ".sqlite",
    ".db",
}

MAX_FILE_BYTES = 1_500_000  # 1.5 MB per tracked text/code file
MAX_TRACKED_FILES = 600
MAX_WALK_DEPTH = 6


def _safe_rel(root: Path, p: Path) -> str:
    return p.relative_to(root).as_posix()


def _scan_workspace_files(root: Path) -> Tuple[List[Tuple[str, Path, int]], bool]:
    """Walk workspace files safely with depth, ignore, and count bounds."""
    results: List[Tuple[str, Path, int]] = []
    truncated = False
    if not root.is_dir():
        return results, False

    root_depth = len(root.parts)
    for dirpath, dirnames, filenames in os.walk(root):
        cur = Path(dirpath)
        depth = len(cur.parts) - root_depth
        # Prune ignored directories and overly deep trees
        dirnames[:] = [
            d for d in sorted(dirnames)
            if d not in IGNORED_DIRS and not d.startswith(".git")
        ]
        if depth >= MAX_WALK_DEPTH:
            dirnames[:] = []

        for fn in sorted(filenames):
            if len(results) >= MAX_TRACKED_FILES:
                truncated = True
                return results, truncated
            fp = cur / fn
            if fp.suffix.lower() in IGNORED_EXTS:
                continue
            try:
                if fp.is_symlink() or not fp.is_file():
                    continue
                st = fp.stat()
                if st.st_size > MAX_FILE_BYTES:
                    continue
                rel = _safe_rel(root, fp)
                results.append((rel, fp, st.st_size))
            except OSError:
                continue
    return results, truncated


class CheckpointManager:
    """Manages content-addressed checkpoints under `<data_dir>/checkpoints`."""

    def __init__(self, data_dir: Path) -> None:
        self.base_dir = data_dir / "checkpoints"
        self.blobs_dir = self.base_dir / "_blobs"
        self.manifests_dir = self.base_dir / "manifests"
        self.blobs_dir.mkdir(parents=True, exist_ok=True)
        self.manifests_dir.mkdir(parents=True, exist_ok=True)

    def _manifest_path(self, cp_id: str) -> Path:
        safe = "".join(c for c in cp_id if c.isalnum() or c in "-_")
        return self.manifests_dir / f"{safe}.json"

    def _store_blob(self, raw: bytes) -> str:
        digest = hashlib.sha256(raw).hexdigest()
        sub = self.blobs_dir / digest[:2]
        blob_path = sub / digest
        if not blob_path.exists():
            sub.mkdir(parents=True, exist_ok=True)
            blob_path.write_bytes(raw)
        return digest

    def _read_blob(self, digest: str) -> Optional[bytes]:
        if not digest or len(digest) < 4:
            return None
        blob_path = self.blobs_dir / digest[:2] / digest
        if blob_path.is_file():
            return blob_path.read_bytes()
        return None

    def create_checkpoint(
        self,
        cwd_str: str,
        conv_id: str = "",
        label: str = "",
        kind: str = "turn",
    ) -> Optional[Dict[str, Any]]:
        """Capture a deduplicated snapshot of the workspace before a turn."""
        if not cwd_str:
            return None
        root = Path(cwd_str).expanduser()
        try:
            root = root.resolve()
        except OSError:
            pass
        if not root.is_dir():
            return None

        files_found, truncated = _scan_workspace_files(root)
        manifest_files: Dict[str, Dict[str, Any]] = {}
        total_bytes = 0

        for rel, fp, size in files_found:
            try:
                raw = fp.read_bytes()
                # Skip files containing NUL bytes (binary)
                if b"\x00" in raw[:4096]:
                    continue
                digest = self._store_blob(raw)
                manifest_files[rel] = {"sha256": digest, "size": len(raw)}
                total_bytes += len(raw)
            except OSError:
                continue

        cp_id = f"cp-{int(time.time())}-{uuid.uuid4().hex[:6]}"
        manifest = {
            "id": cp_id,
            "conversation_id": conv_id,
            "cwd": str(root),
            "label": (label or "对话检查点")[:80],
            "kind": kind,
            "created_at": time.time(),
            "file_count": len(manifest_files),
            "total_bytes": total_bytes,
            "truncated": truncated,
            "files": manifest_files,
        }
        self._manifest_path(cp_id).write_text(
            json.dumps(manifest, ensure_ascii=False), encoding="utf-8"
        )
        return {
            "id": cp_id,
            "conversation_id": conv_id,
            "cwd": str(root),
            "label": manifest["label"],
            "kind": kind,
            "created_at": manifest["created_at"],
            "file_count": manifest["file_count"],
            "truncated": truncated,
        }

    def load_manifest(self, cp_id: str) -> Optional[Dict[str, Any]]:
        mp = self._manifest_path(cp_id)
        if not mp.is_file():
            return None
        try:
            return json.loads(mp.read_text(encoding="utf-8"))
        except Exception:
            return None

    def list_checkpoints(self, conv_id: str = "") -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        for mp in self.manifests_dir.glob("*.json"):
            try:
                m = json.loads(mp.read_text(encoding="utf-8"))
                if conv_id and m.get("conversation_id") != conv_id:
                    continue
                out.append(
                    {
                        "id": m["id"],
                        "conversation_id": m.get("conversation_id", ""),
                        "cwd": m.get("cwd", ""),
                        "label": m.get("label", ""),
                        "kind": m.get("kind", "turn"),
                        "created_at": m.get("created_at", 0),
                        "file_count": m.get("file_count", 0),
                    }
                )
            except Exception:
                continue
        out.sort(key=lambda x: x["created_at"], reverse=True)
        return out[:60]

    def _compute_diff(self, manifest: Dict[str, Any]) -> Dict[str, Any]:
        root = Path(manifest["cwd"])
        if not root.is_dir():
            return {"ok": False, "error": f"工作区目录不存在: {root}"}

        snap_files: Dict[str, Dict[str, Any]] = manifest.get("files") or {}
        current_list, _ = _scan_workspace_files(root)
        current_map: Dict[str, Path] = {rel: fp for rel, fp, _ in current_list}

        to_restore_modified: List[str] = []
        to_restore_deleted: List[str] = []
        to_remove_created: List[str] = []

        for rel, meta in snap_files.items():
            fp = root / rel
            if not fp.is_file():
                to_restore_deleted.append(rel)
            else:
                try:
                    raw = fp.read_bytes()
                    cur_hash = hashlib.sha256(raw).hexdigest()
                    if cur_hash != meta["sha256"]:
                        to_restore_modified.append(rel)
                except OSError:
                    to_restore_modified.append(rel)

        # Files created since checkpoint (only if snapshot was not truncated)
        if not manifest.get("truncated"):
            for rel, fp in current_map.items():
                if rel not in snap_files:
                    try:
                        head = fp.read_bytes()[:4096]
                        if b"\x00" not in head:
                            to_remove_created.append(rel)
                    except OSError:
                        continue

        return {
            "ok": True,
            "id": manifest["id"],
            "cwd": str(root),
            "label": manifest.get("label", ""),
            "created_at": manifest.get("created_at", 0),
            "modified": sorted(to_restore_modified),
            "deleted": sorted(to_restore_deleted),
            "created": sorted(to_remove_created),
            "total_changes": len(to_restore_modified) + len(to_restore_deleted) + len(to_remove_created),
        }

    def preview_restore(self, cp_id: str) -> Dict[str, Any]:
        manifest = self.load_manifest(cp_id)
        if not manifest:
            return {"ok": False, "error": "未找到该检查点快照"}
        return self._compute_diff(manifest)

    def restore_checkpoint(self, cp_id: str, create_backup: bool = True) -> Dict[str, Any]:
        manifest = self.load_manifest(cp_id)
        if not manifest:
            return {"ok": False, "error": "未找到该检查点快照"}

        diff = self._compute_diff(manifest)
        if not diff.get("ok"):
            return diff

        root = Path(manifest["cwd"]).resolve()
        backup_meta = None
        if create_backup and diff["total_changes"] > 0:
            backup_meta = self.create_checkpoint(
                str(root),
                conv_id=manifest.get("conversation_id", ""),
                label=f"回滚前自动备份 ({manifest.get('label', cp_id)[:24]})",
                kind="backup",
            )

        snap_files: Dict[str, Dict[str, Any]] = manifest.get("files") or {}
        restored = 0
        removed = 0
        errors: List[str] = []

        for rel in diff["modified"] + diff["deleted"]:
            meta = snap_files.get(rel)
            if not meta:
                continue
            blob = self._read_blob(meta["sha256"])
            if blob is None:
                errors.append(f"缺少快照对象: {rel}")
                continue
            target = (root / rel).resolve()
            if not str(target).startswith(str(root)):
                continue
            try:
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(blob)
                restored += 1
            except OSError as exc:
                errors.append(f"恢复失败 {rel}: {exc}")

        for rel in diff["created"]:
            target = (root / rel).resolve()
            if not str(target).startswith(str(root)):
                continue
            try:
                if target.is_file():
                    target.unlink()
                    removed += 1
            except OSError as exc:
                errors.append(f"移除新文件失败 {rel}: {exc}")

        return {
            "ok": len(errors) == 0,
            "restored": restored,
            "removed": removed,
            "total_changes": diff["total_changes"],
            "backup_checkpoint": backup_meta,
            "errors": errors,
        }

    def garbage_collect(
        self,
        max_checkpoints: int = 60,
        max_age_days: int = 30,
    ) -> Dict[str, Any]:
        """
        Prune expired/excess checkpoint manifests and sweep unreferenced orphan
        SHA-256 blobs so `<data_dir>/checkpoints/_blobs` stays bounded over time.
        """
        now = time.time()
        cutoff_ts = now - max(1, int(max_age_days)) * 86400 if max_age_days > 0 else 0.0
        keep_limit = max(1, int(max_checkpoints))

        records: List[Tuple[float, Path, Optional[Dict[str, Any]]]] = []
        for mp in self.manifests_dir.glob("*.json"):
            try:
                data = json.loads(mp.read_text(encoding="utf-8"))
                ts = float(data.get("created_at") or mp.stat().st_mtime)
                records.append((ts, mp, data))
            except Exception:
                # Corrupt manifest -> treat as expired so it is cleaned up
                records.append((0.0, mp, None))

        records.sort(key=lambda item: item[0], reverse=True)

        referenced_hashes: Set[str] = set()
        removed_manifests = 0
        kept_manifests = 0
        freed_bytes = 0

        for idx, (ts, mp, data) in enumerate(records):
            expired = (cutoff_ts > 0 and ts > 0 and ts < cutoff_ts)
            is_corrupt = data is None
            over_limit = idx >= keep_limit
            if is_corrupt or over_limit or expired:
                try:
                    freed_bytes += mp.stat().st_size
                except OSError:
                    pass
                try:
                    mp.unlink(missing_ok=True)
                    removed_manifests += 1
                except OSError:
                    pass
            else:
                kept_manifests += 1
                files_map = data.get("files") or {}
                if isinstance(files_map, dict):
                    for meta in files_map.values():
                        if isinstance(meta, dict) and meta.get("sha256"):
                            referenced_hashes.add(str(meta["sha256"]))

        removed_blobs = 0
        remaining_blobs = 0
        if self.blobs_dir.is_dir():
            for shard in list(self.blobs_dir.iterdir()):
                if not shard.is_dir():
                    continue
                for blob_file in list(shard.iterdir()):
                    if not blob_file.is_file():
                        continue
                    if blob_file.name not in referenced_hashes:
                        try:
                            freed_bytes += blob_file.stat().st_size
                        except OSError:
                            pass
                        try:
                            blob_file.unlink(missing_ok=True)
                            removed_blobs += 1
                        except OSError:
                            pass
                    else:
                        remaining_blobs += 1
                # Remove empty 2-char shard directory
                try:
                    if not any(shard.iterdir()):
                        shard.rmdir()
                except OSError:
                    pass

        return {
            "ok": True,
            "removed_manifests": removed_manifests,
            "removed_blobs": removed_blobs,
            "freed_bytes": freed_bytes,
            "remaining_manifests": kept_manifests,
            "remaining_blobs": remaining_blobs,
        }
