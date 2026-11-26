# -*- coding: utf-8 -*-
"""Shared paths, constants, locks, and settings persistence for Antigravity Studio."""

from __future__ import annotations

import json
import os
import subprocess
import threading
from pathlib import Path
from typing import Any, Dict

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"
DATA_DIR = BASE_DIR / "data"
CONV_DIR = DATA_DIR / "conversations"
UPLOAD_DIR = DATA_DIR / "uploads"
DEFAULT_WORKSPACE_DIR = DATA_DIR / "workspace"
SETTINGS_FILE = DATA_DIR / "settings.json"
SCHEDULES_FILE = DATA_DIR / "schedules.json"
CUSTOM_CSS_FILE = BASE_DIR / "custom.css"

DATA_DIR.mkdir(parents=True, exist_ok=True)
CONV_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
DEFAULT_WORKSPACE_DIR.mkdir(parents=True, exist_ok=True)

# Active subprocesses keyed by local conversation ID for instant abort support
ACTIVE_PROCESSES: Dict[str, subprocess.Popen] = {}
ACTIVE_LOCK = threading.Lock()
ACTIVE_TERM_PROCS: Dict[str, subprocess.Popen] = {}
TERM_LOCK = threading.Lock()
SCHEDULES_LOCK = threading.Lock()
MODELS_CACHE: Dict[str, Any] = {"models": [], "fetched_at": 0.0}
USAGE_CACHE: Dict[str, Any] = {"data": None, "fetched_at": 0.0, "error": ""}
USAGE_LOCK = threading.Lock()

DEFAULT_GITHUB_OAUTH_CLIENT_ID = "Ov23lizUasOsOMCCAyjS"

DEFAULT_SETTINGS: Dict[str, Any] = {
    "cli_engine": "agy",
    "auto_dispatch_skills": True,
    "agy_path": "",
    "default_cwd": str(DEFAULT_WORKSPACE_DIR),
    "default_model": "default",
    "default_mode": "default",
    "default_effort": "default",
    "extra_flags": "",
    "custom_instructions": "",
    "profile_name": "Antigravity CLI",
    "profile_subtitle": "",
    "profile_avatar": "",
    "interface_layout": "engineering",
    "language": "zh-CN",
    "send_shortcut": "enter",
    "queued_behavior": "queue",
    "chat_width": "standard",
    "notify_desktop": False,
    "notify_sound": False,
    "theme": "light",
    "color_scheme": "claude",
    "custom_colors": {},
    "font_style": "serif",
    "github_token": "",
    "github_oauth_client_id": "",
    "github_user": None,
    "git_user_name": "",
    "git_user_email": "",
    "projects": [
        {"name": BASE_DIR.name, "path": str(BASE_DIR)},
    ],
}

MIME_OVERRIDES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".pdf": "application/pdf",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".m4v": "video/x-m4v",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".m4a": "audio/mp4",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
    ".ttf": "font/ttf",
    ".md": "text/markdown; charset=utf-8",
}


def load_settings() -> Dict[str, Any]:
    if SETTINGS_FILE.exists():
        try:
            saved = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
            return {**DEFAULT_SETTINGS, **saved}
        except Exception:
            pass
    return dict(DEFAULT_SETTINGS)


def save_settings(updates: Dict[str, Any]) -> Dict[str, Any]:
    current = load_settings()
    current.update(updates)
    SETTINGS_FILE.write_text(
        json.dumps(current, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return current


def _public_settings(settings: Dict[str, Any]) -> Dict[str, Any]:
    """Return settings safe for HTTP responses (never echoing raw GitHub PAT)."""
    out = dict(settings)
    tok = (out.get("github_token") or "").strip()
    out["github_token_set"] = bool(tok)
    out["github_token"] = ""
    return out


def _safe_is_file(path: Path) -> bool:
    try:
        return path.is_file()
    except OSError:
        return False


def get_custom_css_mtime() -> float:
    try:
        return CUSTOM_CSS_FILE.stat().st_mtime if CUSTOM_CSS_FILE.exists() else 0.0
    except OSError:
        return 0.0


# ---------------------------------------------------------------------------
# Local Filesystem Browser, Native Folder Picker & File Upload Helpers
# ---------------------------------------------------------------------------

SKIP_DIRS = {".git", "node_modules", "__pycache__", ".venv", "venv", ".next", "dist", "build", ".mypy_cache"}
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"}
VIDEO_EXTS = {".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v", ".mp3", ".wav", ".m4a"}


def _no_window_flags() -> int:
    return getattr(subprocess, "CREATE_NO_WINDOW", 0) if os.name == "nt" else 0


