# -*- coding: utf-8 -*-
"""Standard HTTP static and JSON REST API route dispatcher."""

from __future__ import annotations

import json
import mimetypes
import os
import subprocess
import sys
import time
import urllib.parse
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from backend.agy_runtime import (
    fetch_agy_models,
    fetch_agy_usage,
    find_agy_binary,
    get_engine_registry,
)
from backend.agy_sync import (
    mark_agy_conversation_deleted,
    refresh_single_agy_conversation,
    sync_agy_conversations,
)
from backend.chat_service import (
    CHECKPOINTS,
    SKILLS_REPO,
    execute_scheduled_task_async,
)
from backend.config import (
    ACTIVE_LOCK,
    ACTIVE_PROCESSES,
    ACTIVE_TERM_PROCS,
    BASE_DIR,
    CUSTOM_CSS_FILE,
    DATA_DIR,
    DEFAULT_WORKSPACE_DIR,
    IMAGE_EXTS,
    MIME_OVERRIDES,
    STATIC_DIR,
    TERM_LOCK,
    UPLOAD_DIR,
    _public_settings,
    _safe_is_file,
    get_custom_css_mtime,
    load_settings,
    save_settings,
)
from backend.engines import list_engines_status
from backend.git_github import (
    _run_git,
    get_workspace_git_diff,
    get_workspace_git_status,
    git_ai_generate_commit_message,
    git_branch_action,
    git_commit_workspace,
    git_init_workspace,
    git_stage_files,
    git_sync_workspace,
    github_auth_action,
    github_clone_repo,
    github_create_pull,
    github_get_pull_detail,
    github_get_status,
    github_list_issues,
    github_list_pulls,
    github_list_repos,
    github_oauth_cancel,
    github_oauth_poll,
    github_oauth_start,
)
from backend.git_worktree import git_add_worktree, git_list_worktrees, git_remove_worktree
from backend.storage import (
    conv_path,
    create_conversation,
    export_conversation_markdown,
    fork_conversation,
    list_conversations,
    load_conversation,
    load_schedules,
    save_conversation,
    save_schedules,
    search_conversations,
    truncate_conversation,
)
from backend.workspace_files import (
    _resolve_workspace_root,
    _safe_resolve_inside,
    collect_library_items,
    create_local_directory,
    delete_local_directory,
    list_local_directories,
    list_workspace_tree,
    open_native_folder_dialog,
    read_workspace_file,
    rename_local_directory,
    run_workspace_terminal,
    save_uploaded_file,
    scan_customizations,
    search_workspace_files,
)
from backend.workspace_io import (
    create_workspace_entry,
    delete_workspace_entry,
    rename_workspace_entry,
    write_workspace_file,
)


def dispatch_standard_request(
    method: str,
    path: str,
    body_bytes: bytes = b"",
    query: Optional[Dict[str, List[str]]] = None,
) -> Tuple[int, str, bytes]:
    """Handles all non-SSE static and JSON API routes."""
    query = query or {}

    def qparam(key: str, default: str = "") -> str:
        vals = query.get(key)
        return vals[0] if vals else default

    def json_resp(data: Any, status: int = 200) -> Tuple[int, str, bytes]:
        return status, "application/json; charset=utf-8", json.dumps(data, ensure_ascii=False).encode("utf-8")

    def file_resp(file_path: Path) -> Tuple[int, str, bytes]:
        if not _safe_is_file(file_path):
            return json_resp({"error": "Not found"}, 404)
        ext = file_path.suffix.lower()
        ctype = MIME_OVERRIDES.get(ext) or mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
        return 200, ctype, file_path.read_bytes()

    def parse_json_body() -> Dict[str, Any]:
        if not body_bytes:
            return {}
        try:
            return json.loads(body_bytes.decode("utf-8"))
        except Exception:
            return {}

    # Static & Custom CSS
    if method == "GET" and path == "/":
        return file_resp(STATIC_DIR / "index.html")

    if method == "GET" and path == "/favicon.ico":
        return file_resp(STATIC_DIR / "icon.ico")

    if method == "GET" and path == "/custom.css":
        if not CUSTOM_CSS_FILE.exists():
            CUSTOM_CSS_FILE.write_text("/* User Custom CSS */\n", encoding="utf-8")
        return file_resp(CUSTOM_CSS_FILE)

    if method == "GET" and path.startswith("/static/"):
        rel = path[len("/static/"):]
        candidate = (STATIC_DIR / rel).resolve()
        if str(candidate).startswith(str(STATIC_DIR.resolve())):
            return file_resp(candidate)
        return json_resp({"error": "Forbidden"}, 404)

    if method == "GET" and path.startswith("/uploads/"):
        rel = path[len("/uploads/"):]
        candidate = (UPLOAD_DIR / rel).resolve()
        if str(candidate).startswith(str(UPLOAD_DIR.resolve())):
            return file_resp(candidate)
        return json_resp({"error": "Forbidden"}, 404)

    if method == "GET" and path == "/api/local-image":
        raw_p = qparam("path").strip()
        if raw_p.startswith("file:///"):
            raw_p = urllib.parse.unquote(raw_p[8:])
        cand = Path(raw_p)
        if cand.suffix.lower() in IMAGE_EXTS and _safe_is_file(cand):
            if qparam("download") in ("1", "true", "yes"):
                mime, _ = mimetypes.guess_type(str(cand))
                data = cand.read_bytes()
                fname = urllib.parse.quote(cand.name)
                return (
                    200,
                    {
                        "Content-Type": mime or "application/octet-stream",
                        "Content-Disposition": f"attachment; filename*=UTF-8''{fname}",
                        "Cache-Control": "no-store",
                    },
                    data,
                )
            return file_resp(cand)
        return json_resp({"error": "Image not found"}, 404)

    # Filesystem Browser, Workspace File Search, Native Dialog & Uploads
    if method == "GET" and path == "/api/fs/list":
        return json_resp(list_local_directories(qparam("path")))

    if method == "POST" and path == "/api/fs/mkdir":
        data = parse_json_body()
        res = create_local_directory(data.get("parent", ""), data.get("name", ""))
        return json_resp(res, 200 if res.get("ok") else 400)

    if method == "POST" and path == "/api/fs/rename":
        data = parse_json_body()
        res = rename_local_directory(data.get("path", ""), data.get("new_name", ""))
        return json_resp(res, 200 if res.get("ok") else 400)

    if method == "POST" and path == "/api/fs/delete":
        data = parse_json_body()
        res = delete_local_directory(data.get("path", ""))
        return json_resp(res, 200 if res.get("ok") else 400)

    if method == "GET" and path == "/api/fs/files":
        return json_resp({"files": search_workspace_files(qparam("cwd"), qparam("q"))})

    # Right Developer Sidebar APIs (Files Tree, Reader, Git Diff, Terminal)
    if method == "GET" and path == "/api/workspace/tree":
        return json_resp(list_workspace_tree(qparam("cwd"), qparam("path")))

    if method == "GET" and path == "/api/workspace/read":
        return json_resp(read_workspace_file(qparam("cwd"), qparam("path")))

    if method == "POST" and path == "/api/workspace/write":
        data = parse_json_body()
        res = write_workspace_file(
            data.get("cwd", ""),
            data.get("path", ""),
            data.get("content", ""),
            _resolve_workspace_root,
            _safe_resolve_inside,
        )
        return json_resp(res, 200 if res.get("ok") else 400)

    if method == "POST" and path == "/api/workspace/create":
        data = parse_json_body()
        res = create_workspace_entry(
            data.get("cwd", ""),
            data.get("path", ""),
            data.get("kind", "file"),
            _resolve_workspace_root,
            _safe_resolve_inside,
        )
        return json_resp(res, 200 if res.get("ok") else 400)

    if method == "POST" and path == "/api/workspace/rename":
        data = parse_json_body()
        res = rename_workspace_entry(
            data.get("cwd", ""),
            data.get("old_path", ""),
            data.get("new_path", ""),
            _resolve_workspace_root,
            _safe_resolve_inside,
        )
        return json_resp(res, 200 if res.get("ok") else 400)

    if method == "POST" and path == "/api/workspace/delete":
        data = parse_json_body()
        res = delete_workspace_entry(
            data.get("cwd", ""),
            data.get("path", ""),
            _resolve_workspace_root,
            _safe_resolve_inside,
        )
        return json_resp(res, 200 if res.get("ok") else 400)

    if method == "GET" and path == "/api/workspace/git-worktrees":
        return json_resp(git_list_worktrees(qparam("cwd"), _resolve_workspace_root, _run_git))

    if method == "POST" and path == "/api/workspace/git-worktrees":
        data = parse_json_body()
        act = (data.get("action") or "add").strip().lower()
        if act == "remove":
            return json_resp(
                git_remove_worktree(
                    data.get("cwd", ""),
                    data.get("path", ""),
                    bool(data.get("force", False)),
                    _resolve_workspace_root,
                    _run_git,
                )
            )
        return json_resp(
            git_add_worktree(
                data.get("cwd", ""),
                data.get("branch", ""),
                bool(data.get("create_branch", True)),
                data.get("target_dir", ""),
                _resolve_workspace_root,
                _run_git,
            )
        )

    # Workspace Checkpoints & Rollback
    if method == "POST" and path == "/api/checkpoints/gc":
        data = parse_json_body()
        res = CHECKPOINTS.garbage_collect(
            max_checkpoints=int(data.get("max_checkpoints", 60)),
            max_age_days=int(data.get("max_age_days", 30)),
        )
        return json_resp(res)

    if method == "GET" and path == "/api/checkpoints":
        return json_resp({"checkpoints": CHECKPOINTS.list_checkpoints(qparam("conversation_id"))})

    if method == "POST" and path == "/api/checkpoints":
        data = parse_json_body()
        cp = CHECKPOINTS.create_checkpoint(
            data.get("cwd", ""),
            conv_id=data.get("conversation_id", ""),
            label=data.get("label", "手动检查点"),
            kind="manual",
        )
        if not cp:
            return json_resp({"ok": False, "error": "工作区无效，无法创建检查点"}, 400)
        return json_resp({"ok": True, "checkpoint": cp}, 201)

    if path.startswith("/api/checkpoints/"):
        rest = path[len("/api/checkpoints/"):].strip("/")
        if method == "GET" and rest.endswith("/preview"):
            cp_id = rest[:-len("/preview")].strip("/")
            res = CHECKPOINTS.preview_restore(cp_id)
            return json_resp(res, 200 if res.get("ok") else 404)
        if method == "POST" and rest.endswith("/restore"):
            cp_id = rest[:-len("/restore")].strip("/")
            data = parse_json_body()
            res = CHECKPOINTS.restore_checkpoint(cp_id, create_backup=bool(data.get("create_backup", True)))
            return json_resp(res, 200 if res.get("ok") else 400)

    if method == "GET" and path == "/api/workspace/raw":
        root = _resolve_workspace_root(qparam("cwd"))
        target = _safe_resolve_inside(root, qparam("path"))
        if target and _safe_is_file(target):
            return file_resp(target)
        return json_resp({"error": "File not found"}, 404)

    if method == "POST" and path == "/api/workspace/open-external":
        data = parse_json_body()
        raw_p = (data.get("path") or "").strip()
        reveal = bool(data.get("reveal", False))
        if raw_p.lower().startswith("file:///"):
            raw_p = urllib.parse.unquote(raw_p[8:])
        elif raw_p.lower().startswith("file://"):
            raw_p = urllib.parse.unquote(raw_p[7:])
        # Strip optional markdown line anchor (#L10-L20)
        if "#" in raw_p and not Path(raw_p).exists():
            raw_p = raw_p.split("#", 1)[0]
        if raw_p == "__DATA_DIR__":
            target = DATA_DIR
        else:
            root = _resolve_workspace_root(data.get("cwd", ""))
            cand = Path(raw_p) if raw_p and Path(raw_p).is_absolute() else _safe_resolve_inside(root, raw_p)
            target = cand if (cand and cand.exists()) else None
        if not target:
            return json_resp({"ok": False, "error": "路径不存在"}, 404)
        try:
            if os.name == "nt":
                if reveal and target.is_file():
                    subprocess.Popen(["explorer", f"/select,{target}"])
                else:
                    os.startfile(str(target))
            elif sys.platform == "darwin":
                if reveal and target.is_file():
                    subprocess.Popen(["open", "-R", str(target)])
                else:
                    subprocess.Popen(["open", str(target)])
            else:
                subprocess.Popen(["xdg-open", str(target.parent if (reveal and target.is_file()) else target)])
            return json_resp({"ok": True, "path": str(target)})
        except Exception as exc:
            return json_resp({"ok": False, "error": str(exc)}, 500)

    if method == "GET" and path == "/api/server-log":
        settings = load_settings()
        agy_bin = find_agy_binary(settings.get("agy_path", ""))
        sections: List[str] = [
            "\n".join(
                [
                    "================================================================",
                    "  Antigravity Studio · 本地运行日志",
                    f"  程序根目录 : {BASE_DIR}",
                    f"  本地数据   : {DATA_DIR}",
                    f"  当前进程   : PID {os.getpid()}",
                    f"  agy CLI    : {agy_bin or '未检测到'}",
                    "================================================================",
                ]
            )
        ]
        log_candidates = [
            ("studio-server.log", "后端启动记录 (data/studio-server.log)"),
            ("desktop-server.log", "桌面端后端输出 (data/desktop-server.log)"),
            ("desktop-launcher.log", "桌面外壳日志 (data/desktop-launcher.log)"),
        ]
        primary_log = DATA_DIR / "desktop-server.log"
        found_any = False
        for fname, label in log_candidates:
            lp = DATA_DIR / fname
            if _safe_is_file(lp):
                try:
                    raw = lp.read_text(encoding="utf-8", errors="replace").strip()
                except Exception:
                    raw = ""
                if raw:
                    found_any = True
                    if not _safe_is_file(primary_log):
                        primary_log = lp
                    tail_lines = raw.splitlines()[-240:]
                    sections.append(f"\n--- {label} ---\n" + "\n".join(tail_lines))
        if not found_any:
            sections.append(
                "\n（当前暂无落盘日志文件；通过桌面端 AntigravityStudio.exe 或 server.py 启动后的输出将自动记录于此。）"
            )
        full_text = "\n".join(sections).strip() + "\n"
        return json_resp(
            {
                "ok": True,
                "kind": "text",
                "name": "本地运行日志",
                "rel_path": "data/desktop-server.log",
                "abs_path": str(primary_log),
                "ext": ".log",
                "size": len(full_text.encode("utf-8")),
                "lines": len(full_text.splitlines()),
                "content": full_text,
                "truncated": False,
                "read_only": True,
            }
        )

    if method == "GET" and path == "/api/workspace/git-status":
        return json_resp(get_workspace_git_status(qparam("cwd")))

    if method == "GET" and path == "/api/workspace/git-diff":
        return json_resp(get_workspace_git_diff(qparam("cwd"), qparam("path")))

    if method == "POST" and path == "/api/workspace/git-init":
        data = parse_json_body()
        return json_resp(
            git_init_workspace(
                data.get("cwd", ""),
                data.get("remote_url", ""),
                bool(data.get("create_gitignore", False)),
            )
        )

    if method == "POST" and path == "/api/workspace/git-stage":
        data = parse_json_body()
        return json_resp(
            git_stage_files(
                data.get("cwd", ""),
                data.get("paths"),
                bool(data.get("all", False)),
                bool(data.get("unstage", False)),
            )
        )

    if method == "POST" and path == "/api/workspace/git-commit":
        data = parse_json_body()
        return json_resp(
            git_commit_workspace(
                data.get("cwd", ""),
                data.get("message", ""),
                bool(data.get("stage_all", False)),
                bool(data.get("push", False)),
            )
        )

    if method == "POST" and path == "/api/workspace/git-sync":
        data = parse_json_body()
        return json_resp(
            git_sync_workspace(
                data.get("cwd", ""),
                data.get("action", "push"),
                bool(data.get("set_upstream", True)),
            )
        )

    if method == "POST" and path == "/api/workspace/git-branch":
        data = parse_json_body()
        return json_resp(
            git_branch_action(
                data.get("cwd", ""),
                data.get("action", "switch"),
                data.get("name", ""),
            )
        )

    if method == "POST" and path == "/api/workspace/git-ai-commit":
        data = parse_json_body()
        return json_resp(git_ai_generate_commit_message(data.get("cwd", "")))

    # GitHub REST API Integration (Native OAuth Device Flow, Auth, Repos, Clone, Pull Requests, Issues)
    if method == "GET" and path == "/api/github/status":
        return json_resp(github_get_status(qparam("cwd")))

    if method == "POST" and path == "/api/github/auth":
        return json_resp(github_auth_action(parse_json_body()))

    if method == "POST" and path == "/api/github/oauth/start":
        return json_resp(github_oauth_start(parse_json_body()))

    if method == "POST" and path == "/api/github/oauth/poll":
        return json_resp(github_oauth_poll())

    if method == "POST" and path == "/api/github/oauth/cancel":
        return json_resp(github_oauth_cancel())

    if method == "GET" and path == "/api/github/repos":
        try:
            pg = max(1, int(qparam("page") or "1"))
        except ValueError:
            pg = 1
        return json_resp(github_list_repos(qparam("q"), pg))

    if method == "POST" and path == "/api/github/clone":
        data = parse_json_body()
        return json_resp(
            github_clone_repo(
                data.get("url", ""),
                data.get("parent_dir", ""),
                data.get("folder_name", ""),
            )
        )

    if method == "GET" and path == "/api/github/pulls":
        return json_resp(github_list_pulls(qparam("cwd"), qparam("repo"), qparam("state") or "open"))

    if method == "GET" and path == "/api/github/pull-detail":
        try:
            num = int(qparam("number") or "0")
        except ValueError:
            num = 0
        if num <= 0:
            return json_resp({"ok": False, "error": "缺少有效的 PR 编号"}, 400)
        return json_resp(github_get_pull_detail(qparam("cwd"), num, qparam("repo")))

    if method == "POST" and path == "/api/github/pulls":
        data = parse_json_body()
        return json_resp(
            github_create_pull(
                data.get("cwd", ""),
                data.get("title", ""),
                data.get("body", ""),
                data.get("head", ""),
                data.get("base", ""),
                data.get("repo", ""),
            )
        )

    if method == "GET" and path == "/api/github/issues":
        return json_resp(github_list_issues(qparam("cwd"), qparam("repo"), qparam("state") or "open"))

    if method == "POST" and path == "/api/workspace/terminal":
        data = parse_json_body()
        return json_resp(
            run_workspace_terminal(
                data.get("command", ""),
                data.get("cwd", ""),
                data.get("session_id", "default"),
            )
        )

    if method == "POST" and path == "/api/workspace/terminal/abort":
        data = parse_json_body()
        sid = data.get("session_id", "default")
        killed = False
        with TERM_LOCK:
            proc = ACTIVE_TERM_PROCS.pop(sid, None)
        if proc and proc.poll() is None:
            try:
                proc.kill()
                killed = True
            except Exception:
                pass
        return json_resp({"ok": True, "aborted": killed})

    if method == "POST" and path == "/api/dialog/folder":
        data = parse_json_body()
        return json_resp(open_native_folder_dialog(data.get("initial_dir", "")))

    if method == "POST" and path == "/api/upload":
        data = parse_json_body()
        try:
            saved = save_uploaded_file(
                data.get("name", "file.bin"),
                data.get("data_base64", ""),
                data.get("mime", ""),
            )
            return json_resp({"file": saved}, 201)
        except Exception as exc:
            return json_resp({"error": str(exc)}, 400)

    if method == "POST" and path == "/api/avatar":
        data = parse_json_body()
        try:
            saved = save_uploaded_file(
                data.get("name", "avatar.png"),
                data.get("data_base64", ""),
                data.get("mime", "image/png"),
            )
            avatar_url = saved.get("preview_url") or ""
            updated = save_settings({"profile_avatar": avatar_url})
            return json_resp({"ok": True, "profile_avatar": avatar_url, "settings": updated}, 201)
        except Exception as exc:
            return json_resp({"error": str(exc)}, 400)

    # Library, Scheduled Tasks & Customizations
    if method == "GET" and path == "/api/library":
        return json_resp({"items": collect_library_items()})

    if method == "DELETE" and path.startswith("/api/library/upload/"):
        fname = path[len("/api/library/upload/"):].strip("/")
        target = (UPLOAD_DIR / fname).resolve()
        if str(target).startswith(str(UPLOAD_DIR.resolve())) and _safe_is_file(target):
            target.unlink()
            return json_resp({"ok": True})
        return json_resp({"error": "Not found"}, 404)

    if method == "GET" and path == "/api/schedules":
        return json_resp({"schedules": load_schedules()})

    if method == "POST" and path == "/api/schedules":
        data = parse_json_body()
        tasks = load_schedules()
        new_task = {
            "id": uuid.uuid4().hex[:10],
            "name": (data.get("name") or "排定任务").strip(),
            "prompt": (data.get("prompt") or "").strip(),
            "cwd": data.get("cwd") or load_settings().get("default_cwd", str(BASE_DIR)),
            "model": data.get("model") or "default",
            "mode": data.get("mode") or "default",
            "skill_ids": data.get("skill_ids") or [],
            "schedule_type": data.get("schedule_type") or "daily",
            "daily_time": data.get("daily_time") or "09:00",
            "interval_minutes": int(data.get("interval_minutes") or 60),
            "enabled": bool(data.get("enabled", True)),
            "created_at": time.time(),
            "last_run_at": 0,
            "last_status": "idle",
            "last_conversation_id": None,
        }
        if not new_task["prompt"]:
            return json_resp({"error": "任务指令不能为空"}, 400)
        tasks.insert(0, new_task)
        save_schedules(tasks)
        return json_resp({"schedule": new_task}, 201)

    if path.startswith("/api/schedules/"):
        rest = path[len("/api/schedules/"):].strip("/")
        if method == "POST" and rest.endswith("/run"):
            tid = rest[:-4].strip("/")
            ok = execute_scheduled_task_async(tid)
            return json_resp({"ok": ok}) if ok else json_resp({"error": "Not found"}, 404)
        tid = rest
        if method == "PATCH":
            data = parse_json_body()
            tasks = load_schedules()
            updated_item = None
            for t in tasks:
                if t["id"] == tid:
                    for k in ("name", "prompt", "cwd", "model", "mode", "skill_ids", "schedule_type", "daily_time", "interval_minutes", "enabled"):
                        if k in data:
                            t[k] = data[k]
                    updated_item = t
                    break
            if not updated_item:
                return json_resp({"error": "Not found"}, 404)
            save_schedules(tasks)
            return json_resp({"schedule": updated_item})
        if method == "DELETE":
            tasks = [t for t in load_schedules() if t["id"] != tid]
            save_schedules(tasks)
            return json_resp({"ok": True})

    if method == "GET" and path == "/api/customizations":
        return json_resp(scan_customizations(qparam("cwd")))

    # Dedicated Skill Repository & Dispatcher APIs
    if method == "GET" and path == "/api/skills":
        settings = load_settings()
        inc_body = qparam("include_body") in ("1", "true", "yes")
        return json_resp(
            {
                "skills": SKILLS_REPO.list_skills(cwd_str=qparam("cwd"), include_body=inc_body),
                "repo_dir": str(SKILLS_REPO.repo_dir),
                "auto_dispatch_skills": bool(settings.get("auto_dispatch_skills", True)),
            }
        )

    if method == "POST" and path == "/api/skills":
        res = SKILLS_REPO.upsert_skill(parse_json_body())
        return json_resp(res, 200 if res.get("ok") else 400)

    if method == "POST" and path == "/api/skills/import":
        data = parse_json_body()
        res = SKILLS_REPO.import_skill(
            url=data.get("url", ""),
            local_path=data.get("local_path", ""),
            raw_markdown=data.get("raw_markdown", ""),
            slug_override=data.get("slug", ""),
        )
        return json_resp(res, 200 if res.get("ok") else 400)

    if method == "POST" and path == "/api/skills/dispatch-preview":
        data = parse_json_body()
        res = SKILLS_REPO.dispatch_for_prompt(
            prompt=data.get("prompt", ""),
            explicit_skill_ids=data.get("skill_ids") or [],
            auto_dispatch=bool(data.get("auto_dispatch", True)),
            cwd_str=data.get("cwd", ""),
        )
        return json_resp({"ok": True, "skills": res["skills"], "cleaned_prompt": res["cleaned_prompt"]})

    if method == "POST" and path == "/api/skills/sync":
        data = parse_json_body()
        res = SKILLS_REPO.sync_skill_to_agy(
            data.get("id", ""),
            target=data.get("target", "global"),
            cwd_str=data.get("cwd", ""),
        )
        return json_resp(res, 200 if res.get("ok") else 400)

    if path.startswith("/api/skills/"):
        sid = path[len("/api/skills/"):].strip("/")
        if method == "GET":
            sk = SKILLS_REPO.get_skill(sid, cwd_str=qparam("cwd"))
            return json_resp({"ok": True, "skill": sk}) if sk else json_resp({"ok": False, "error": "Not found"}, 404)
        if method == "PATCH":
            data = parse_json_body()
            res = SKILLS_REPO.toggle_skill_flags(sid, data, cwd_str=data.get("cwd", ""))
            return json_resp(res, 200 if res.get("ok") else 404)
        if method == "DELETE":
            res = SKILLS_REPO.delete_skill(sid)
            return json_resp(res, 200 if res.get("ok") else 400)

    # Status & Config
    if method == "GET" and path == "/api/engines":
        return json_resp({"engines": list_engines_status(get_engine_registry(), load_settings())})

    if method == "GET" and path == "/api/status":
        settings = load_settings()
        agy_bin = find_agy_binary(settings.get("agy_path", ""))
        engines = list_engines_status(get_engine_registry(), settings)
        return json_resp(
            {
                "agy_installed": bool(agy_bin),
                "agy_path": agy_bin or "",
                "active_engine": settings.get("cli_engine", "agy"),
                "engines": engines,
                "python_version": sys.version.split()[0],
                "settings": _public_settings(settings),
                "custom_css_mtime": get_custom_css_mtime(),
                "custom_css_path": str(CUSTOM_CSS_FILE),
                "project_dir": str(BASE_DIR),
                "default_workspace_dir": str(DEFAULT_WORKSPACE_DIR),
            }
        )

    if method == "GET" and path == "/api/models":
        return json_resp({"models": fetch_agy_models()})

    if method == "GET" and path == "/api/usage":
        force = qparam("refresh") in ("1", "true", "yes")
        return json_resp(fetch_agy_usage(force=force))

    if method == "GET" and path == "/api/css":
        css_text = CUSTOM_CSS_FILE.read_text(encoding="utf-8") if CUSTOM_CSS_FILE.exists() else ""
        return json_resp(
            {"css": css_text, "mtime": get_custom_css_mtime(), "path": str(CUSTOM_CSS_FILE)}
        )

    if method == "POST" and path == "/api/css":
        data = parse_json_body()
        CUSTOM_CSS_FILE.write_text(data.get("css", ""), encoding="utf-8")
        return json_resp(
            {"ok": True, "mtime": get_custom_css_mtime(), "path": str(CUSTOM_CSS_FILE)}
        )

    if method == "POST" and path == "/api/settings":
        patch = parse_json_body()
        # Prevent accidental blank overwrite of stored github_token from general settings saves
        if "github_token" in patch and not patch["github_token"]:
            patch.pop("github_token", None)
        updated = save_settings(patch)
        agy_bin = find_agy_binary(updated.get("agy_path", ""))
        return json_resp(
            {
                "ok": True,
                "settings": _public_settings(updated),
                "agy_installed": bool(agy_bin),
                "agy_path": agy_bin or "",
                "active_engine": updated.get("cli_engine", "agy"),
                "engines": list_engines_status(get_engine_registry(), updated),
            }
        )

    # Conversations CRUD, Local AGY Sync, Full-Text Search, Pin & Markdown Export
    if method == "POST" and path == "/api/conversations/sync":
        sync_res = sync_agy_conversations(force=True)
        return json_resp({**sync_res, "conversations": list_conversations()})

    if method == "GET" and path == "/api/conversations/search":
        if load_settings().get("sync_agy_conversations", True):
            sync_agy_conversations(force=False)
        return json_resp({"conversations": search_conversations(qparam("q"))})

    if method == "GET" and path == "/api/conversations":
        if load_settings().get("sync_agy_conversations", True) and qparam("sync") != "0":
            sync_agy_conversations(force=qparam("sync") == "1")
        return json_resp({"conversations": list_conversations()})

    if method == "POST" and path == "/api/conversations":
        return json_resp({"conversation": create_conversation(parse_json_body())}, 201)

    if path.startswith("/api/conversations/"):
        rest = path[len("/api/conversations/"):].strip("/")
        if method == "GET" and rest.endswith("/export"):
            cid = rest[:-len("/export")].strip("/")
            exported = export_conversation_markdown(cid)
            if not exported:
                return json_resp({"ok": False, "error": "对话不存在"}, 404)
            fname, md_text = exported
            if qparam("format") == "json":
                return json_resp({"ok": True, "filename": fname, "markdown": md_text})
            quoted = urllib.parse.quote(fname)
            return (
                200,
                {
                    "Content-Type": "text/markdown; charset=utf-8",
                    "Content-Disposition": f"attachment; filename*=UTF-8''{quoted}",
                    "Cache-Control": "no-store",
                },
                md_text.encode("utf-8"),
            )
        if method == "POST" and rest.endswith("/fork"):
            cid = rest[:-len("/fork")].strip("/")
            data = parse_json_body()
            up_to = data.get("up_to_index")
            forked = fork_conversation(cid, up_to_index=int(up_to) if up_to is not None else None)
            if not forked:
                return json_resp({"ok": False, "error": "对话不存在"}, 404)
            return json_resp({"ok": True, "conversation": forked}, 201)
        if method == "POST" and rest.endswith("/truncate"):
            cid = rest[:-len("/truncate")].strip("/")
            data = parse_json_body()
            keep_count = int(data.get("keep_count", 0))
            updated_conv = truncate_conversation(cid, keep_count)
            if not updated_conv:
                return json_resp({"ok": False, "error": "对话不存在"}, 404)
            return json_resp({"ok": True, "conversation": updated_conv})

        cid = rest
        if method == "GET":
            conv = load_conversation(cid)
            if conv and load_settings().get("sync_agy_conversations", True):
                conv = refresh_single_agy_conversation(conv)
            return json_resp({"conversation": conv}) if conv else json_resp({"error": "Not found"}, 404)
        if method == "PATCH":
            conv = load_conversation(cid)
            if not conv:
                return json_resp({"error": "Not found"}, 404)
            updates = parse_json_body()
            only_pin = set(updates.keys()) <= {"pinned"}
            for k in ("title", "cwd", "model", "mode", "effort", "engine", "pinned"):
                if k in updates:
                    conv[k] = bool(updates[k]) if k == "pinned" else updates[k]
            save_conversation(conv, touch_updated=not only_pin)
            return json_resp({"conversation": conv})
        if method == "DELETE":
            conv = load_conversation(cid)
            if conv and conv.get("agy_conversation_id"):
                mark_agy_conversation_deleted(
                    str(conv["agy_conversation_id"]),
                    int(conv.get("agy_sync_size") or 0),
                )
            p = conv_path(cid)
            if p.exists():
                p.unlink()
            return json_resp({"ok": True})

    if method == "POST" and path == "/api/chat/abort":
        data = parse_json_body()
        cid = data.get("conversation_id", "")
        aborted = False
        with ACTIVE_LOCK:
            proc = ACTIVE_PROCESSES.get(cid)
        if proc and proc.poll() is None:
            try:
                proc.terminate()
                aborted = True
            except Exception:
                pass
        return json_resp({"ok": True, "aborted": aborted})

    return json_resp({"error": f"Unknown route: {method} {path}"}, 404)


