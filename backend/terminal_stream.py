# -*- coding: utf-8 -*-
"""Real-time SSE streaming workspace terminal runner (pure Python stdlib)."""

from __future__ import annotations

import json
import os
import queue
import re
import subprocess
import threading
import time
from pathlib import Path
from typing import Any, Callable, Dict, Tuple


def _no_window_flags() -> int:
    return getattr(subprocess, "CREATE_NO_WINDOW", 0) if os.name == "nt" else 0


def stream_workspace_terminal(
    command: str,
    cwd_str: str,
    session_id: str,
    resolve_root: Callable[[str], Path],
    active_procs: Dict[str, subprocess.Popen],
    term_lock: threading.Lock,
    emit_bytes: Callable[[bytes], bool],
    timeout_sec: int = 180,
) -> None:
    """Run a shell command and push real-time stdout/stderr chunks as SSE events."""
    cmd = (command or "").strip()
    root = resolve_root(cwd_str)

    def emit(ev: Dict[str, Any]) -> bool:
        frame = f"data: {json.dumps(ev, ensure_ascii=False)}\n\n".encode("utf-8")
        return emit_bytes(frame)

    if not cmd:
        emit({"type": "error", "message": "命令不能为空"})
        emit({"type": "done", "exit_code": 1, "elapsed_ms": 0, "new_cwd": str(root), "aborted": False})
        return

    # Handle standalone `cd <path>` immediately
    cd_match = re.match(r"^(?:cd|chdir|set-location|sl)\s+(.+)$", cmd, re.IGNORECASE)
    if cd_match and not any(sep in cmd for sep in ("&&", "||", ";", "|")):
        target_arg = cd_match.group(1).strip().strip('"').strip("'")
        if target_arg == "~":
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
            emit({"type": "start", "cwd": str(root), "session_id": session_id})
            emit({"type": "stdout", "chunk": f"工作目录已切换至: {cand}\n"})
            emit({"type": "done", "exit_code": 0, "elapsed_ms": 2, "new_cwd": str(cand), "aborted": False})
        else:
            emit({"type": "start", "cwd": str(root), "session_id": session_id})
            emit({"type": "stderr", "chunk": f"目录不存在: {cand}\n"})
            emit({"type": "done", "exit_code": 1, "elapsed_ms": 2, "new_cwd": str(root), "aborted": False})
        return

    started = time.time()
    env = os.environ.copy()
    env["PYTHONUTF8"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONUNBUFFERED"] = "1"

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
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            creationflags=_no_window_flags(),
        )
    except Exception as exc:
        emit({"type": "error", "message": f"无法启动终端进程: {exc}"})
        emit({"type": "done", "exit_code": 1, "elapsed_ms": 0, "new_cwd": str(root), "aborted": False})
        return

    with term_lock:
        active_procs[session_id] = proc

    emit({"type": "start", "cwd": str(root), "session_id": session_id})

    q: "queue.Queue[Tuple[str, str]]" = queue.Queue()

    def _pump(pipe, tag: str) -> None:
        try:
            while True:
                line = pipe.readline()
                if not line:
                    break
                text = line.decode("utf-8", errors="replace")
                q.put((tag, text))
        except Exception as exc:
            q.put(("stderr", f"\n[读取流异常: {exc}]\n"))
        finally:
            q.put((f"{tag}_eof", ""))

    t_out = threading.Thread(target=_pump, args=(proc.stdout, "stdout"), daemon=True)
    t_err = threading.Thread(target=_pump, args=(proc.stderr, "stderr"), daemon=True)
    t_out.start()
    t_err.start()

    eof_count = 0
    total_chars = 0
    max_chars = 200_000
    truncated_notice_sent = False
    timed_out = False
    client_gone = False

    try:
        while eof_count < 2:
            remaining = timeout_sec - (time.time() - started)
            if remaining <= 0:
                timed_out = True
                try:
                    proc.kill()
                except Exception:
                    pass
                emit({"type": "stderr", "chunk": f"\n[命令运行超过 {timeout_sec} 秒，已自动中止]\n"})
                break
            try:
                tag, chunk = q.get(timeout=min(0.4, remaining))
            except queue.Empty:
                continue

            if tag in ("stdout_eof", "stderr_eof"):
                eof_count += 1
                continue

            if total_chars >= max_chars:
                if not truncated_notice_sent:
                    truncated_notice_sent = True
                    emit({"type": "stderr", "chunk": "\n[输出超过 200KB，后续内容已折叠]\n"})
                continue

            total_chars += len(chunk)
            if not emit({"type": tag, "chunk": chunk}):
                client_gone = True
                try:
                    proc.terminate()
                except Exception:
                    pass
                break
    finally:
        with term_lock:
            was_removed = active_procs.get(session_id) is not proc
            if active_procs.get(session_id) is proc:
                active_procs.pop(session_id, None)
        try:
            rc = proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            try:
                proc.kill()
                rc = proc.wait(timeout=2)
            except Exception:
                rc = -1
        for pipe in (proc.stdout, proc.stderr):
            try:
                if pipe:
                    pipe.close()
            except Exception:
                pass
        elapsed_ms = int((time.time() - started) * 1000)
        if not client_gone:
            emit(
                {
                    "type": "done",
                    "exit_code": rc,
                    "elapsed_ms": elapsed_ms,
                    "new_cwd": str(root),
                    "aborted": bool(was_removed or timed_out),
                    "timed_out": timed_out,
                }
            )
