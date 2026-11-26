# -*- coding: utf-8 -*-
"""Git workspace operations, AI commit generation, Native GitHub OAuth Device Flow, and GitHub REST API."""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from backend.agy_runtime import find_agy_binary
from backend.config import (
    BASE_DIR,
    DEFAULT_GITHUB_OAUTH_CLIENT_ID,
    _no_window_flags,
    _safe_is_file,
    load_settings,
    save_settings,
)
from backend.workspace_files import _resolve_workspace_root, _safe_resolve_inside

def _find_git_binary() -> Optional[str]:
    found = shutil.which("git")
    if found:
        return found
    for cand in (
        r"C:\Program Files\Git\cmd\git.exe",
        r"C:\Program Files (x86)\Git\cmd\git.exe",
        r"C:\msys64\usr\bin\git.exe",
    ):
        if _safe_is_file(Path(cand)):
            return cand
    return None


def _run_git(
    root: Optional[Path],
    git_args: List[str],
    timeout: int = 12,
    env_extra: Optional[Dict[str, str]] = None,
) -> Tuple[int, str, str]:
    git_bin = _find_git_binary()
    if not git_bin:
        return -1, "", "未检测到 git 可执行文件"
    cmd = [git_bin]
    if root is not None:
        cmd += ["-C", str(root)]
    cmd += git_args
    env = os.environ.copy()
    env.setdefault("GIT_TERMINAL_PROMPT", "0")
    if env_extra:
        env.update(env_extra)
    try:
        res = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            env=env,
            creationflags=_no_window_flags(),
        )
        return res.returncode, res.stdout or "", res.stderr or ""
    except subprocess.TimeoutExpired:
        return -1, "", f"Git 命令执行超时（>{timeout}s）"
    except Exception as exc:
        return -1, "", str(exc)


def _parse_github_repo(remote_url: str) -> str:
    """Extract 'owner/repo' from HTTPS, SSH, or slug GitHub references."""
    s = (remote_url or "").strip()
    if not s:
        return ""
    # Strip any embedded credentials
    s = re.sub(r"https?://[^@/\s]+@", "https://", s, flags=re.I)
    m = re.match(r"^(?:https?://)?github\.com[:/]([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+?)(?:\.git)?/?$", s, flags=re.I)
    if m:
        return m.group(1)
    m2 = re.match(r"^(?:ssh://)?git@github\.com[:/]([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+?)(?:\.git)?/?$", s, flags=re.I)
    if m2:
        return m2.group(1)
    m3 = re.match(r"^([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)$", s)
    if m3:
        return m3.group(1)
    return ""


def _inject_github_token_url(url: str, token: str) -> str:
    tok = (token or "").strip()
    s = (url or "").strip()
    if not tok or not s:
        return s
    if re.match(r"^https://github\.com/", s, flags=re.I) and "@" not in s.split("://", 1)[1].split("/", 1)[0]:
        return "https://x-access-token:" + urllib.parse.quote(tok, safe="") + "@" + s[len("https://"):]
    return s


def _scrub_token(text: str, token: str) -> str:
    if not text or not token:
        return text
    tok = token.strip()
    if not tok:
        return text
    return text.replace(tok, "***").replace(urllib.parse.quote(tok, safe=""), "***")


def get_workspace_git_status(cwd_str: str) -> Dict[str, Any]:
    root = _resolve_workspace_root(cwd_str)
    rc, top_out, err = _run_git(root, ["rev-parse", "--show-toplevel"])
    if rc != 0 or not top_out.strip():
        return {
            "ok": True,
            "is_git": False,
            "root": str(root),
            "branch": "",
            "remote_url": "",
            "github_repo": "",
            "ahead": 0,
            "behind": 0,
            "branches": [],
            "files": [],
            "note": err.strip(),
        }

    repo_root = top_out.strip()
    _, branch_out, _ = _run_git(root, ["branch", "--show-current"])
    branch = branch_out.strip()
    if not branch:
        _, rev_out, _ = _run_git(root, ["rev-parse", "--short", "HEAD"])
        branch = rev_out.strip() or "main"

    _, remote_out, _ = _run_git(root, ["remote", "get-url", "origin"])
    remote_url = re.sub(r"https?://[^@/\s]+@", "https://", remote_out.strip(), flags=re.I)
    github_repo = _parse_github_repo(remote_url)

    ahead, behind = 0, 0
    rc_ab, ab_out, _ = _run_git(root, ["rev-list", "--left-right", "--count", "HEAD...@{u}"])
    if rc_ab == 0 and ab_out.strip():
        parts = ab_out.strip().split()
        if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
            ahead, behind = int(parts[0]), int(parts[1])

    branches: List[str] = []
    rc_br, br_out, _ = _run_git(root, ["branch", "--format=%(refname:short)"])
    if rc_br == 0 and br_out:
        branches = [b.strip() for b in br_out.splitlines() if b.strip()][:50]
    if branch and branch not in branches:
        branches.insert(0, branch)

    rc_st, st_out, _ = _run_git(root, ["-c", "core.quotepath=false", "status", "--porcelain=v1", "-uall"])
    files: List[Dict[str, Any]] = []
    if rc_st == 0 and st_out:
        for line in st_out.splitlines():
            if len(line) < 4:
                continue
            xy = line[:2]
            raw_path = line[3:].strip()
            if " -> " in raw_path:
                raw_path = raw_path.split(" -> ", 1)[1].strip()
            if raw_path.startswith('"') and raw_path.endswith('"'):
                raw_path = raw_path[1:-1]
            x, y = xy[0], xy[1]
            if xy == "??":
                label = "U"
            elif "D" in xy:
                label = "D"
            elif "A" in xy:
                label = "A"
            elif "R" in xy:
                label = "R"
            else:
                label = "M"
            files.append(
                {
                    "path": raw_path.replace("\\", "/"),
                    "code": xy,
                    "label": label,
                    "staged": x not in (" ", "?"),
                    "unstaged": y not in (" ",),
                }
            )

    return {
        "ok": True,
        "is_git": True,
        "root": str(root),
        "repo_root": repo_root,
        "branch": branch,
        "remote_url": remote_url,
        "github_repo": github_repo,
        "ahead": ahead,
        "behind": behind,
        "branches": branches,
        "files": files[:300],
    }


def get_workspace_git_diff(cwd_str: str, rel_path: str = "") -> Dict[str, Any]:
    root = _resolve_workspace_root(cwd_str)
    st_info = get_workspace_git_status(str(root))
    if not st_info.get("is_git"):
        return {"ok": True, "is_git": False, "path": rel_path, "diff": "", "additions": 0, "deletions": 0}

    repo_root = Path(st_info["repo_root"])
    clean_path = (rel_path or "").strip().replace("\\", "/")

    # Check if this specific file is untracked so we can synthesize a unified preview
    is_untracked = False
    if clean_path:
        for f in st_info.get("files", []):
            if f["path"] == clean_path and f["code"] == "??":
                is_untracked = True
                break

    diff_text = ""
    if is_untracked and clean_path:
        file_obj = _safe_resolve_inside(repo_root, clean_path)
        if file_obj and _safe_is_file(file_obj):
            try:
                raw = file_obj.read_bytes()[:128 * 1024]
                if b"\x00" in raw[:4096]:
                    diff_text = f"--- /dev/null\n+++ b/{clean_path}\n@@ -0,0 +1 @@\n+[Binary file ({file_obj.stat().st_size} bytes)]"
                else:
                    lines = raw.decode("utf-8", errors="replace").splitlines()
                    preview_lines = lines[:400]
                    body = "\n".join("+" + ln for ln in preview_lines)
                    suffix = f"\n+... (共 {len(lines)} 行，仅预览前 400 行)" if len(lines) > 400 else ""
                    diff_text = f"--- /dev/null\n+++ b/{clean_path}\n@@ -0,0 +1,{len(preview_lines)} @@\n{body}{suffix}"
            except OSError as exc:
                diff_text = f"无法读取新增文件: {exc}"
    else:
        args = ["-c", "core.quotepath=false", "diff", "HEAD"]
        if clean_path:
            args += ["--", clean_path]
        rc, out, _ = _run_git(repo_root, args, timeout=10)
        if rc != 0:
            # Repo may not have an initial commit yet
            fallback_args = ["-c", "core.quotepath=false", "diff"]
            if clean_path:
                fallback_args += ["--", clean_path]
            _, out, _ = _run_git(repo_root, fallback_args, timeout=10)
        if not out.strip() and clean_path:
            # Maybe only staged changes exist
            cached_args = ["-c", "core.quotepath=false", "diff", "--cached", "--", clean_path]
            _, out, _ = _run_git(repo_root, cached_args, timeout=10)
        diff_text = out

    lines_all = diff_text.splitlines()
    truncated = len(lines_all) > 1800
    if truncated:
        lines_all = lines_all[:1800]
        diff_text = "\n".join(lines_all)

    adds = sum(1 for ln in lines_all if ln.startswith("+") and not ln.startswith("+++"))
    dels = sum(1 for ln in lines_all if ln.startswith("-") and not ln.startswith("---"))
    return {
        "ok": True,
        "is_git": True,
        "path": clean_path,
        "diff": diff_text,
        "additions": adds,
        "deletions": dels,
        "truncated": truncated,
    }


# =========================================================================
# Git Write Operations & Zero-Dependency GitHub REST API Integration
# =========================================================================

def _git_identity_args(repo_root: Path) -> List[str]:
    """Supply fallback user.name/user.email if git config has none set."""
    _, cur_name, _ = _run_git(repo_root, ["config", "user.name"])
    _, cur_email, _ = _run_git(repo_root, ["config", "user.email"])
    if cur_name.strip() and cur_email.strip():
        return []
    settings = load_settings()
    gh_user = settings.get("github_user") or {}
    fallback_name = (
        cur_name.strip()
        or (settings.get("git_user_name") or "").strip()
        or (gh_user.get("name") or gh_user.get("login") or "").strip()
        or (settings.get("profile_name") or "Antigravity User").strip()
    )
    fallback_email = (
        cur_email.strip()
        or (settings.get("git_user_email") or "").strip()
        or (f"{gh_user['login']}@users.noreply.github.com" if gh_user.get("login") else "")
        or "antigravity-studio@users.noreply.github.com"
    )
    return ["-c", f"user.name={fallback_name}", "-c", f"user.email={fallback_email}"]


def git_init_workspace(cwd_str: str, remote_url: str = "", create_gitignore: bool = False) -> Dict[str, Any]:
    root = _resolve_workspace_root(cwd_str)
    rc, out, err = _run_git(root, ["init", "-b", "main"])
    if rc != 0:
        rc, out, err = _run_git(root, ["init"])
        if rc != 0:
            return {"ok": False, "error": err.strip() or out.strip() or "git init 失败"}
    if create_gitignore:
        gi = root / ".gitignore"
        if not gi.exists():
            gi.write_text(
                "__pycache__/\n*.pyc\n.DS_Store\nThumbs.db\nnode_modules/\ndata/\n.env\n",
                encoding="utf-8",
            )
    clean_remote = (remote_url or "").strip()
    if clean_remote:
        slug = _parse_github_repo(clean_remote)
        final_remote = f"https://github.com/{slug}.git" if slug and not clean_remote.startswith(("http", "git@", "ssh://")) else clean_remote
        rc_r, _, _ = _run_git(root, ["remote", "get-url", "origin"])
        if rc_r == 0:
            _run_git(root, ["remote", "set-url", "origin", final_remote])
        else:
            _run_git(root, ["remote", "add", "origin", final_remote])
    return {"ok": True, "status": get_workspace_git_status(str(root))}


def git_stage_files(cwd_str: str, paths: Optional[List[str]] = None, stage_all: bool = False, unstage: bool = False) -> Dict[str, Any]:
    st = get_workspace_git_status(cwd_str)
    if not st.get("is_git"):
        return {"ok": False, "error": "当前工作区不是 Git 仓库"}
    repo_root = Path(st["repo_root"])
    if stage_all:
        args = ["reset", "HEAD"] if unstage else ["add", "-A"]
    else:
        clean_paths = [p.strip().replace("\\", "/") for p in (paths or []) if p and p.strip()]
        if not clean_paths:
            return {"ok": False, "error": "未指定文件"}
        args = (["reset", "HEAD", "--"] if unstage else ["add", "--"]) + clean_paths
    rc, out, err = _run_git(repo_root, args, timeout=15)
    if rc != 0:
        return {"ok": False, "error": err.strip() or out.strip() or "暂存操作失败"}
    return {"ok": True, "status": get_workspace_git_status(str(repo_root))}


def git_sync_workspace(cwd_str: str, action: str = "push", set_upstream: bool = True) -> Dict[str, Any]:
    st = get_workspace_git_status(cwd_str)
    if not st.get("is_git"):
        return {"ok": False, "error": "当前工作区不是 Git 仓库"}
    repo_root = Path(st["repo_root"])
    remote_url = st.get("remote_url") or ""
    if not remote_url:
        return {"ok": False, "error": "尚未配置 origin 远程仓库地址，请先绑定 GitHub 仓库"}

    settings = load_settings()
    token = (settings.get("github_token") or "").strip()
    auth_url = _inject_github_token_url(remote_url, token) if token else remote_url
    branch = st.get("branch") or "main"

    if action == "pull":
        args = ["pull", "--rebase", auth_url, branch] if auth_url != remote_url else ["pull", "--rebase"]
    elif action == "fetch":
        args = ["fetch", auth_url] if auth_url != remote_url else ["fetch", "origin"]
    else:
        if auth_url != remote_url:
            args = ["push", auth_url, f"HEAD:refs/heads/{branch}"]
        elif set_upstream:
            args = ["push", "-u", "origin", branch]
        else:
            args = ["push"]

    rc, out, err = _run_git(repo_root, args, timeout=45)
    safe_out = _scrub_token((out + "\n" + err).strip(), token)
    if rc != 0:
        return {"ok": False, "error": safe_out or f"git {action} 失败"}
    return {"ok": True, "output": safe_out, "status": get_workspace_git_status(str(repo_root))}


def git_commit_workspace(cwd_str: str, message: str, stage_all: bool = False, push: bool = False) -> Dict[str, Any]:
    msg = (message or "").strip()
    if not msg:
        return {"ok": False, "error": "请输入 Commit 提交信息"}
    st = get_workspace_git_status(cwd_str)
    if not st.get("is_git"):
        return {"ok": False, "error": "当前工作区不是 Git 仓库"}
    repo_root = Path(st["repo_root"])

    has_staged = any(f.get("staged") for f in st.get("files", []))
    if stage_all or not has_staged:
        rc_a, out_a, err_a = _run_git(repo_root, ["add", "-A"], timeout=15)
        if rc_a != 0:
            return {"ok": False, "error": err_a.strip() or out_a.strip() or "git add 失败"}

    id_args = _git_identity_args(repo_root)
    rc, out, err = _run_git(repo_root, id_args + ["commit", "-m", msg], timeout=20)
    if rc != 0:
        return {"ok": False, "error": err.strip() or out.strip() or "git commit 失败"}

    result: Dict[str, Any] = {
        "ok": True,
        "commit_output": (out or err).strip(),
        "pushed": False,
    }
    if push:
        sync_res = git_sync_workspace(str(repo_root), action="push", set_upstream=True)
        if not sync_res.get("ok"):
            result["push_error"] = sync_res.get("error", "推送失败")
        else:
            result["pushed"] = True
            result["push_output"] = sync_res.get("output", "")
    result["status"] = get_workspace_git_status(str(repo_root))
    return result


def git_branch_action(cwd_str: str, action: str = "switch", name: str = "") -> Dict[str, Any]:
    br = (name or "").strip()
    if not br or any(ch in br for ch in (" ", "..", "~", "^", ":", "\\")):
        return {"ok": False, "error": "分支名称不合法"}
    st = get_workspace_git_status(cwd_str)
    if not st.get("is_git"):
        return {"ok": False, "error": "当前工作区不是 Git 仓库"}
    repo_root = Path(st["repo_root"])
    args = ["checkout", "-b", br] if action == "create" else ["checkout", br]
    rc, out, err = _run_git(repo_root, args, timeout=15)
    if rc != 0:
        return {"ok": False, "error": err.strip() or out.strip() or "切换分支失败"}
    return {"ok": True, "status": get_workspace_git_status(str(repo_root))}


def git_ai_generate_commit_message(cwd_str: str) -> Dict[str, Any]:
    st = get_workspace_git_status(cwd_str)
    if not st.get("is_git"):
        return {"ok": False, "error": "当前工作区不是 Git 仓库"}
    files = st.get("files") or []
    if not files:
        return {"ok": False, "error": "当前没有待提交的文件改动"}

    repo_root = Path(st["repo_root"])
    has_staged = any(f.get("staged") for f in files)
    _, stat_out, _ = _run_git(repo_root, ["diff", "--cached", "--stat"] if has_staged else ["diff", "--stat"])
    _, diff_out, _ = _run_git(repo_root, ["diff", "--cached"] if has_staged else ["diff"], timeout=10)
    file_list_str = "\n".join(f"- [{f['label']}] {f['path']}" for f in files[:30])
    diff_snippet = (diff_out or "")[:10000]

    # Deterministic fallback message if agy is unavailable or slow
    first_names = ", ".join(Path(f["path"]).name for f in files[:3])
    more_suffix = f" 等 {len(files)} 个文件" if len(files) > 3 else ""
    fallback_msg = f"chore: update {first_names}{more_suffix}"

    settings = load_settings()
    agy_bin = find_agy_binary(settings.get("agy_path", ""))
    if not agy_bin:
        return {"ok": True, "message": fallback_msg, "source": "fallback"}

    prompt = (
        "请根据以下 Git 变更摘要与 Diff，生成一条简洁规范的 Conventional Commit 提交信息（如 feat: ... / fix: ... / refactor: ... / style: ... / docs: ...）。\n"
        "要求：\n"
        "1. 仅输出最终提交信息本身（1 行标题即可，不超过 72 字符，使用中文描述改动核心），不要加代码块、引号、前缀说明或多余解释。\n\n"
        f"改动文件：\n{file_list_str}\n\n"
        f"Diff Stat：\n{(stat_out or '')[:2000]}\n\n"
        f"Diff 片段：\n{diff_snippet}"
    )
    try:
        res = subprocess.run(
            [agy_bin, "-p", prompt, "--output-format", "text"],
            cwd=str(repo_root),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=35,
            creationflags=_no_window_flags(),
        )
        raw = (res.stdout or "").strip()
        if res.returncode == 0 and raw:
            # Take the first clean non-empty line, stripping quotes/backticks
            lines = [ln.strip().strip("`\"' ") for ln in raw.splitlines() if ln.strip() and not ln.strip().startswith("```")]
            if lines:
                return {"ok": True, "message": lines[0][:120], "source": "agy"}
    except Exception:
        pass
    return {"ok": True, "message": fallback_msg, "source": "fallback"}


def _github_api(
    endpoint: str,
    method: str = "GET",
    body: Optional[Dict[str, Any]] = None,
    token: Optional[str] = None,
    accept: str = "application/vnd.github+json",
    timeout: int = 16,
) -> Tuple[int, Any, str]:
    url = endpoint if endpoint.startswith("http") else f"https://api.github.com{endpoint}"
    tok = token if token is not None else (load_settings().get("github_token") or "").strip()
    headers = {
        "User-Agent": "Antigravity-Studio/1.0",
        "Accept": accept,
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if tok:
        headers["Authorization"] = f"Bearer {tok}"
    data_bytes = None
    if body is not None:
        headers["Content-Type"] = "application/json; charset=utf-8"
        data_bytes = json.dumps(body).encode("utf-8")

    req = urllib.request.Request(url, data=data_bytes, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            status = getattr(resp, "status", 200)
            raw = resp.read().decode("utf-8", errors="replace")
            if "json" in accept:
                try:
                    return status, json.loads(raw) if raw else {}, ""
                except json.JSONDecodeError:
                    return status, raw, ""
            return status, raw, ""
    except urllib.error.HTTPError as he:
        err_raw = ""
        try:
            err_raw = he.read().decode("utf-8", errors="replace")
        except Exception:
            pass
        err_msg = f"GitHub API 错误 ({he.code})"
        try:
            ej = json.loads(err_raw)
            if isinstance(ej, dict) and ej.get("message"):
                err_msg = f"GitHub ({he.code}): {ej['message']}"
                if ej.get("errors") and isinstance(ej["errors"], list):
                    first_e = ej["errors"][0]
                    if isinstance(first_e, dict) and first_e.get("message"):
                        err_msg += f" — {first_e['message']}"
        except Exception:
            pass
        if he.code == 401:
            err_msg = "GitHub Token 无效或已过期，请在设置中重新验证"
        elif he.code == 403 and "rate limit" in err_raw.lower():
            err_msg = "未登录 GitHub 达到匿名请求限额，请在「设置 → GitHub」连接 Token"
        elif he.code == 404:
            err_msg = "未找到该 GitHub 仓库或无访问权限（私有仓库需先连接具备 repo 权限的 Token）"
        return he.code, None, err_msg
    except Exception as exc:
        return 0, None, f"无法连接 GitHub：{exc}"


GH_OAUTH_LOCK = threading.Lock()
GH_OAUTH_STATE: Dict[str, Any] = {
    "device_code": "",
    "client_id": "",
    "user_code": "",
    "verification_uri": "https://github.com/login/device",
    "interval": 5,
    "expires_at": 0.0,
}


def _github_oauth_post(url: str, fields: Dict[str, str], timeout: int = 16) -> Tuple[int, Any, str]:
    body = urllib.parse.urlencode(fields).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "Antigravity-Studio/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            return getattr(resp, "status", 200), (json.loads(raw) if raw else {}), ""
    except urllib.error.HTTPError as he:
        err_raw = ""
        try:
            err_raw = he.read().decode("utf-8", errors="replace")
        except Exception:
            pass
        try:
            return he.code, json.loads(err_raw), ""
        except Exception:
            return he.code, None, f"GitHub OAuth HTTP {he.code}: {err_raw[:160]}"
    except Exception as exc:
        return 0, None, f"无法连接 GitHub OAuth 服务：{exc}"


def github_oauth_start(data: Dict[str, Any]) -> Dict[str, Any]:
    settings = load_settings()
    custom_cid = (data.get("client_id") or "").strip()
    cid = custom_cid or (settings.get("github_oauth_client_id") or "").strip() or DEFAULT_GITHUB_OAUTH_CLIENT_ID
    if not cid:
        return {
            "ok": False,
            "error": "请先在高级选项中填写你的 GitHub OAuth App Client ID",
        }
    if custom_cid and custom_cid != (settings.get("github_oauth_client_id") or "").strip():
        save_settings({"github_oauth_client_id": custom_cid})

    status, payload, err = _github_oauth_post(
        "https://github.com/login/device/code",
        {"client_id": cid, "scope": "repo read:user"},
    )
    if err or not isinstance(payload, dict):
        return {"ok": False, "error": err or f"申请设备验证码失败 (HTTP {status})"}
    if payload.get("error"):
        code = str(payload.get("error") or "")
        desc = str(payload.get("error_description") or code)
        if code in ("unauthorized_client", "unsupported_grant_type") or "device flow" in desc.lower():
            return {
                "ok": False,
                "error": "该 OAuth App 尚未开启 Device Flow：请进入 GitHub OAuth App 设置页面勾选「Enable Device Flow」并保存后重试。",
            }
        if code == "Not Found" or status == 404 or "client_id" in desc.lower():
            return {"ok": False, "error": f"Client ID 无效（{desc}），请核对后重试。"}
        return {"ok": False, "error": f"GitHub OAuth 错误：{desc}"}

    device_code = str(payload.get("device_code") or "").strip()
    user_code = str(payload.get("user_code") or "").strip()
    verify_uri = str(payload.get("verification_uri") or "https://github.com/login/device").strip()
    expires_in = int(payload.get("expires_in") or 900)
    interval = max(5, int(payload.get("interval") or 5))
    if not device_code or not user_code:
        return {"ok": False, "error": "GitHub 未返回有效的设备验证码，请检查 Client ID 是否正确"}

    with GH_OAUTH_LOCK:
        GH_OAUTH_STATE.update(
            {
                "device_code": device_code,
                "client_id": cid,
                "user_code": user_code,
                "verification_uri": verify_uri,
                "interval": interval,
                "expires_at": time.time() + expires_in,
            }
        )

    return {
        "ok": True,
        "status": "pending",
        "user_code": user_code,
        "verification_uri": verify_uri,
        "expires_in": expires_in,
        "interval": interval,
    }


def github_oauth_cancel() -> Dict[str, Any]:
    with GH_OAUTH_LOCK:
        GH_OAUTH_STATE.update(
            {
                "device_code": "",
                "user_code": "",
                "expires_at": 0.0,
            }
        )
    return {"ok": True, "status": "cancelled"}


def github_oauth_poll() -> Dict[str, Any]:
    with GH_OAUTH_LOCK:
        dev_code = GH_OAUTH_STATE.get("device_code") or ""
        cid = GH_OAUTH_STATE.get("client_id") or ""
        interval = int(GH_OAUTH_STATE.get("interval") or 5)
        expires_at = float(GH_OAUTH_STATE.get("expires_at") or 0.0)

    if not dev_code or not cid:
        return {"ok": False, "status": "idle", "error": "当前没有进行中的浏览器授权"}
    if expires_at and time.time() > expires_at:
        github_oauth_cancel()
        return {"ok": False, "status": "expired", "error": "授权验证码已过期，请重新点击「浏览器一键登录」"}

    status, payload, err = _github_oauth_post(
        "https://github.com/login/oauth/access_token",
        {
            "client_id": cid,
            "device_code": dev_code,
            "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
        },
    )
    if err or not isinstance(payload, dict):
        return {"ok": True, "status": "pending", "interval": interval, "note": err}

    access_token = (payload.get("access_token") or "").strip()
    if access_token:
        github_oauth_cancel()
        st_u, user_payload, err_u = _github_api("/user", token=access_token)
        if st_u != 200 or not isinstance(user_payload, dict) or not user_payload.get("login"):
            return {"ok": False, "status": "error", "error": err_u or "授权成功但读取用户信息失败"}
        user_info = {
            "login": user_payload.get("login", ""),
            "name": user_payload.get("name") or user_payload.get("login", ""),
            "avatar_url": user_payload.get("avatar_url", ""),
            "html_url": user_payload.get("html_url", ""),
            "public_repos": user_payload.get("public_repos", 0),
            "total_private_repos": user_payload.get("total_private_repos", 0),
        }
        cur = load_settings()
        patch: Dict[str, Any] = {
            "github_token": access_token,
            "github_user": user_info,
            "github_oauth_client_id": cid,
        }
        if not (cur.get("git_user_name") or "").strip():
            patch["git_user_name"] = user_info["name"]
        if not (cur.get("git_user_email") or "").strip():
            patch["git_user_email"] = f"{user_info['login']}@users.noreply.github.com"
        save_settings(patch)
        return {"ok": True, "status": "success", "user": user_info}

    err_code = str(payload.get("error") or "")
    if err_code == "authorization_pending":
        return {"ok": True, "status": "pending", "interval": interval}
    if err_code == "slow_down":
        next_iv = int(payload.get("interval") or (interval + 5))
        with GH_OAUTH_LOCK:
            GH_OAUTH_STATE["interval"] = next_iv
        return {"ok": True, "status": "slow_down", "interval": next_iv}
    if err_code == "expired_token":
        github_oauth_cancel()
        return {"ok": False, "status": "expired", "error": "验证码已过期，请重新点击「浏览器一键登录」"}
    if err_code == "access_denied":
        github_oauth_cancel()
        return {"ok": False, "status": "denied", "error": "你已在浏览器页面取消了授权"}
    github_oauth_cancel()
    return {"ok": False, "status": "error", "error": str(payload.get("error_description") or err_code or "授权失败")}


def github_get_status(cwd_str: str = "") -> Dict[str, Any]:
    settings = load_settings()
    tok = (settings.get("github_token") or "").strip()
    user = settings.get("github_user") if tok else None
    git_st = get_workspace_git_status(cwd_str) if cwd_str else {}
    return {
        "ok": True,
        "connected": bool(tok and user),
        "token_set": bool(tok),
        "oauth_client_id": (settings.get("github_oauth_client_id") or "").strip(),
        "user": user,
        "has_git": bool(_find_git_binary()),
        "git_user_name": settings.get("git_user_name", ""),
        "git_user_email": settings.get("git_user_email", ""),
        "active_github_repo": git_st.get("github_repo", ""),
        "default_clone_dir": str(BASE_DIR.parent),
    }


def github_auth_action(data: Dict[str, Any]) -> Dict[str, Any]:
    if data.get("disconnect"):
        github_oauth_cancel()
        save_settings({"github_token": "", "github_user": None})
        return {"ok": True, "connected": False, "user": None}

    patch: Dict[str, Any] = {}
    if "git_user_name" in data:
        patch["git_user_name"] = (data.get("git_user_name") or "").strip()
    if "git_user_email" in data:
        patch["git_user_email"] = (data.get("git_user_email") or "").strip()
    if "oauth_client_id" in data:
        patch["github_oauth_client_id"] = (data.get("oauth_client_id") or "").strip()

    token = (data.get("token") or "").strip()
    if not token:
        if patch:
            save_settings(patch)
            return github_get_status()
        return {"ok": False, "error": "请输入 GitHub Personal Access Token"}

    status, payload, err = _github_api("/user", token=token)
    if status != 200 or not isinstance(payload, dict) or not payload.get("login"):
        return {"ok": False, "error": err or "Token 校验失败"}

    user_info = {
        "login": payload.get("login", ""),
        "name": payload.get("name") or payload.get("login", ""),
        "avatar_url": payload.get("avatar_url", ""),
        "html_url": payload.get("html_url", ""),
        "public_repos": payload.get("public_repos", 0),
        "total_private_repos": payload.get("total_private_repos", 0),
    }
    patch["github_token"] = token
    patch["github_user"] = user_info
    if not patch.get("git_user_name") and not (load_settings().get("git_user_name") or "").strip():
        patch["git_user_name"] = user_info["name"]
    if not patch.get("git_user_email") and not (load_settings().get("git_user_email") or "").strip():
        patch["git_user_email"] = f"{user_info['login']}@users.noreply.github.com"
    save_settings(patch)
    return {"ok": True, "connected": True, "user": user_info}


def github_list_repos(query: str = "", page: int = 1) -> Dict[str, Any]:
    settings = load_settings()
    tok = (settings.get("github_token") or "").strip()
    q = (query or "").strip()
    items: List[Dict[str, Any]] = []

    def _pack(r: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "full_name": r.get("full_name", ""),
            "name": r.get("name", ""),
            "description": (r.get("description") or "")[:140],
            "private": bool(r.get("private", False)),
            "html_url": r.get("html_url", ""),
            "clone_url": r.get("clone_url", ""),
            "default_branch": r.get("default_branch", "main"),
            "language": r.get("language") or "",
            "stars": r.get("stargazers_count", 0),
            "updated_at": r.get("updated_at", ""),
        }

    if q and ("/" in q or not tok):
        # Search GitHub public/accessible repositories directly
        enc_q = urllib.parse.quote(q)
        st, data, err = _github_api(f"/search/repositories?q={enc_q}&sort=stars&per_page=20&page={page}")
        if st != 200 or not isinstance(data, dict):
            return {"ok": False, "error": err or "搜索仓库失败", "repos": []}
        items = [_pack(r) for r in (data.get("items") or [])]
        return {"ok": True, "source": "search", "connected": bool(tok), "repos": items}

    if tok:
        st, data, err = _github_api(
            f"/user/repos?sort=updated&per_page=50&page={page}&affiliation=owner,collaborator,organization_member"
        )
        if st != 200 or not isinstance(data, list):
            return {"ok": False, "error": err or "获取仓库列表失败", "repos": []}
        items = [_pack(r) for r in data]
        if q:
            ql = q.lower()
            filtered = [r for r in items if ql in r["full_name"].lower() or ql in r["description"].lower()]
            if filtered:
                return {"ok": True, "source": "user", "connected": True, "repos": filtered}
            # Fallback to global GitHub search if no personal repo matches
            enc_q = urllib.parse.quote(q)
            st2, data2, _ = _github_api(f"/search/repositories?q={enc_q}&sort=stars&per_page=15")
            if st2 == 200 and isinstance(data2, dict):
                return {"ok": True, "source": "search", "connected": True, "repos": [_pack(r) for r in (data2.get("items") or [])]}
        return {"ok": True, "source": "user", "connected": True, "repos": items}

    return {"ok": True, "source": "none", "connected": False, "repos": []}


def github_clone_repo(url_or_slug: str, parent_dir: str = "", folder_name: str = "") -> Dict[str, Any]:
    raw = (url_or_slug or "").strip()
    if not raw:
        return {"ok": False, "error": "请输入 GitHub 仓库地址或 owner/repo"}
    slug = _parse_github_repo(raw)
    clean_url = f"https://github.com/{slug}.git" if slug and not raw.startswith(("http://", "https://", "git@", "ssh://")) else raw
    clean_url = re.sub(r"https?://[^@/\s]+@", "https://", clean_url, flags=re.I)

    base_parent = Path(parent_dir.strip()).expanduser() if (parent_dir or "").strip() else BASE_DIR.parent
    try:
        base_parent.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        return {"ok": False, "error": f"目标目录不可写：{exc}"}

    derived_name = (folder_name or "").strip()
    if not derived_name:
        tail = slug.split("/")[-1] if slug else clean_url.rstrip("/").split("/")[-1]
        derived_name = re.sub(r"\.git$", "", tail, flags=re.I) or "github-repo"
    derived_name = re.sub(r'[<>:"/\\|?*]+', "-", derived_name).strip(". ")
    target_dir = base_parent / derived_name
    if target_dir.exists():
        return {"ok": False, "error": f"目标文件夹已存在：{target_dir}"}

    settings = load_settings()
    token = (settings.get("github_token") or "").strip()
    clone_url = _inject_github_token_url(clean_url, token) if token else clean_url

    rc, out, err = _run_git(None, ["clone", "--progress", clone_url, str(target_dir)], timeout=120)
    if rc != 0:
        msg = _scrub_token((err or out).strip(), token)
        return {"ok": False, "error": msg or "git clone 失败"}

    # Guarantee zero token persisted in .git/config
    if clone_url != clean_url:
        _run_git(target_dir, ["remote", "set-url", "origin", clean_url])

    # Auto-pin cloned project in sidebar
    projects = list(settings.get("projects") or [])
    norm_t = str(target_dir.resolve()).lower()
    if not any(str(Path(p.get("path", "")).resolve()).lower() == norm_t for p in projects if p.get("path")):
        projects.append({"name": target_dir.name, "path": str(target_dir.resolve())})
        save_settings({"projects": projects, "default_cwd": str(target_dir.resolve())})

    return {
        "ok": True,
        "path": str(target_dir.resolve()),
        "name": target_dir.name,
        "github_repo": slug or _parse_github_repo(clean_url),
        "projects": projects,
    }


def _resolve_github_repo_for_request(cwd_str: str, repo_override: str = "") -> str:
    if (repo_override or "").strip():
        return _parse_github_repo(repo_override)
    st = get_workspace_git_status(cwd_str)
    return st.get("github_repo", "")


def github_list_pulls(cwd_str: str, repo_override: str = "", state_filter: str = "open") -> Dict[str, Any]:
    repo = _resolve_github_repo_for_request(cwd_str, repo_override)
    if not repo:
        return {"ok": True, "repo": "", "pulls": [], "note": "当前工作区尚未关联 GitHub 远程仓库"}
    sf = state_filter if state_filter in ("open", "closed", "all") else "open"
    st, data, err = _github_api(f"/repos/{repo}/pulls?state={sf}&per_page=25")
    if st != 200 or not isinstance(data, list):
        return {"ok": False, "repo": repo, "error": err or "获取 PR 列表失败", "pulls": []}
    pulls = [
        {
            "number": pr.get("number"),
            "title": pr.get("title", ""),
            "state": pr.get("state", "open"),
            "draft": bool(pr.get("draft", False)),
            "user": (pr.get("user") or {}).get("login", ""),
            "head": (pr.get("head") or {}).get("ref", ""),
            "base": (pr.get("base") or {}).get("ref", ""),
            "html_url": pr.get("html_url", ""),
            "updated_at": pr.get("updated_at", ""),
            "body": (pr.get("body") or "")[:1200],
        }
        for pr in data
    ]
    return {"ok": True, "repo": repo, "pulls": pulls}


def github_get_pull_detail(cwd_str: str, number: int, repo_override: str = "") -> Dict[str, Any]:
    repo = _resolve_github_repo_for_request(cwd_str, repo_override)
    if not repo:
        return {"ok": False, "error": "当前工作区未关联 GitHub 仓库"}
    st, pr, err = _github_api(f"/repos/{repo}/pulls/{number}")
    if st != 200 or not isinstance(pr, dict):
        return {"ok": False, "error": err or "读取 PR 详情失败"}
    st_d, diff_raw, _ = _github_api(f"/repos/{repo}/pulls/{number}", accept="application/vnd.github.v3.diff", timeout=20)
    diff_text = diff_raw if (st_d == 200 and isinstance(diff_raw, str)) else ""
    truncated = len(diff_text) > 28000
    if truncated:
        diff_text = diff_text[:28000] + "\n... [Diff 过长已截断]"
    return {
        "ok": True,
        "repo": repo,
        "pull": {
            "number": pr.get("number"),
            "title": pr.get("title", ""),
            "body": pr.get("body") or "",
            "state": pr.get("state", "open"),
            "draft": bool(pr.get("draft", False)),
            "user": (pr.get("user") or {}).get("login", ""),
            "head": (pr.get("head") or {}).get("ref", ""),
            "base": (pr.get("base") or {}).get("ref", ""),
            "additions": pr.get("additions", 0),
            "deletions": pr.get("deletions", 0),
            "changed_files": pr.get("changed_files", 0),
            "html_url": pr.get("html_url", ""),
        },
        "diff": diff_text,
        "truncated": truncated,
    }


def github_create_pull(
    cwd_str: str,
    title: str,
    body: str = "",
    head: str = "",
    base: str = "",
    repo_override: str = "",
) -> Dict[str, Any]:
    if not (title or "").strip():
        return {"ok": False, "error": "请填写 PR 标题"}
    if not (load_settings().get("github_token") or "").strip():
        return {"ok": False, "error": "创建 PR 需要先在「设置 → GitHub」连接 Token"}
    st_git = get_workspace_git_status(cwd_str)
    repo = _resolve_github_repo_for_request(cwd_str, repo_override)
    if not repo:
        return {"ok": False, "error": "当前工作区未关联 GitHub 仓库"}
    head_br = (head or "").strip() or st_git.get("branch") or ""
    if not head_br:
        return {"ok": False, "error": "无法识别当前源分支"}
    base_br = (base or "").strip()
    if not base_br:
        st_r, repo_info, _ = _github_api(f"/repos/{repo}")
        base_br = (repo_info.get("default_branch") if (st_r == 200 and isinstance(repo_info, dict)) else "") or "main"
    st, pr, err = _github_api(
        f"/repos/{repo}/pulls",
        method="POST",
        body={"title": title.strip(), "body": body or "", "head": head_br, "base": base_br},
    )
    if st not in (200, 201) or not isinstance(pr, dict):
        return {"ok": False, "error": err or "创建 PR 失败（请确认当前分支已 Push 到远程且与目标分支不同）"}
    return {
        "ok": True,
        "pull": {
            "number": pr.get("number"),
            "title": pr.get("title", ""),
            "html_url": pr.get("html_url", ""),
        },
    }


def github_list_issues(cwd_str: str, repo_override: str = "", state_filter: str = "open") -> Dict[str, Any]:
    repo = _resolve_github_repo_for_request(cwd_str, repo_override)
    if not repo:
        return {"ok": True, "repo": "", "issues": [], "note": "当前工作区尚未关联 GitHub 远程仓库"}
    sf = state_filter if state_filter in ("open", "closed", "all") else "open"
    st, data, err = _github_api(f"/repos/{repo}/issues?state={sf}&per_page=30")
    if st != 200 or not isinstance(data, list):
        return {"ok": False, "repo": repo, "error": err or "获取 Issue 列表失败", "issues": []}
    issues = []
    for it in data:
        if "pull_request" in it:
            continue
        issues.append(
            {
                "number": it.get("number"),
                "title": it.get("title", ""),
                "state": it.get("state", "open"),
                "user": (it.get("user") or {}).get("login", ""),
                "comments": it.get("comments", 0),
                "labels": [
                    {"name": lb.get("name", ""), "color": lb.get("color", "888888")}
                    for lb in (it.get("labels") or [])
                    if isinstance(lb, dict)
                ][:4],
                "html_url": it.get("html_url", ""),
                "updated_at": it.get("updated_at", ""),
                "body": (it.get("body") or "")[:3000],
            }
        )
    return {"ok": True, "repo": repo, "issues": issues}

