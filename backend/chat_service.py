# -*- coding: utf-8 -*-
"""Chat SSE orchestration, Skills/Checkpoints singletons, and scheduled tasks runner."""

from __future__ import annotations

import json
import os
import threading
import time
import uuid
from typing import Any, Callable, Dict, List, Optional

from backend.agy_runtime import stream_agy_cli, stream_demo_response
from backend.checkpoints import CheckpointManager
from backend.config import (
    ACTIVE_LOCK,
    ACTIVE_PROCESSES,
    BASE_DIR,
    DATA_DIR,
    DEFAULT_WORKSPACE_DIR,
    load_settings,
)
from backend.skills_repo import SkillRepository
from backend.storage import (
    create_conversation,
    load_conversation,
    load_schedules,
    save_conversation,
    save_schedules,
)

CHECKPOINTS = CheckpointManager(DATA_DIR)
SKILLS_REPO = SkillRepository(DATA_DIR)


def execute_scheduled_task_async(task_id: str) -> bool:
    tasks = load_schedules()
    target = next((t for t in tasks if t["id"] == task_id), None)
    if not target:
        return False

    def _run() -> None:
        now_ts = time.time()
        all_t = load_schedules()
        for item in all_t:
            if item["id"] == task_id:
                item["last_status"] = "running"
                item["last_run_at"] = now_ts
        save_schedules(all_t)

        final_cid = None
        had_err = False
        try:
            payload = {
                "title": f"[定时] {target.get('name') or '排定任务'}",
                "prompt": target.get("prompt", ""),
                "cwd": target.get("cwd") or load_settings().get("default_cwd", str(BASE_DIR)),
                "model": target.get("model") or "default",
                "mode": target.get("mode") or "default",
                "skill_ids": target.get("skill_ids") or [],
            }
            def _sink(chunk: bytes) -> bool:
                nonlocal final_cid, had_err
                text = chunk.decode("utf-8", errors="ignore")
                for ln in text.splitlines():
                    if ln.startswith("data: "):
                        try:
                            ev = json.loads(ln[6:])
                            if ev.get("type") == "error":
                                had_err = True
                            if ev.get("type") == "done":
                                final_cid = ev.get("conversation_id")
                        except Exception:
                            pass
                return True

            run_sse_chat(payload, _sink)
            status_val = "error" if had_err else "done"
        except Exception:
            status_val = "error"

        all_t2 = load_schedules()
        for item in all_t2:
            if item["id"] == task_id:
                item["last_status"] = status_val
                item["last_run_at"] = time.time()
                if final_cid:
                    item["last_conversation_id"] = final_cid
        save_schedules(all_t2)

    threading.Thread(target=_run, daemon=True).start()
    return True


def scheduler_daemon_loop() -> None:
    """Checks every 30s whether any enabled scheduled task is due to run."""
    while True:
        time.sleep(30)
        try:
            now = time.time()
            lt = time.localtime(now)
            cur_hhmm = f"{lt.tm_hour:02d}:{lt.tm_min:02d}"
            tasks = load_schedules()
            for t in tasks:
                if not t.get("enabled") or t.get("last_status") == "running":
                    continue
                last_run = float(t.get("last_run_at") or 0)
                stype = t.get("schedule_type", "interval")
                if stype == "daily":
                    if t.get("daily_time") == cur_hhmm and (now - last_run) > 90:
                        execute_scheduled_task_async(t["id"])
                else:
                    mins = max(1, int(t.get("interval_minutes") or 60))
                    if (now - last_run) >= mins * 60:
                        execute_scheduled_task_async(t["id"])
        except Exception:
            pass




def run_sse_chat(
    payload: Dict[str, Any],
    emit_bytes: Callable[[bytes], bool],
    fast_demo: bool = False,
) -> Optional[str]:
    """Executes a chat turn and pushes SSE frames through `emit_bytes`."""
    conv_id = payload.get("conversation_id")
    attachments = payload.get("attachments") or []
    capabilities = payload.get("capabilities") or []
    prompt = (payload.get("prompt") or "").strip()
    demo_mode = bool(payload.get("demo"))

    if not prompt and not attachments:
        return "Prompt cannot be empty"
    if not prompt and attachments:
        prompt = "请查看并分析我附加的文件内容。"

    conv = load_conversation(conv_id) if conv_id else None
    if not conv:
        conv = create_conversation(payload)

    for field in ("cwd", "model", "mode", "effort", "engine"):
        if payload.get(field):
            conv[field] = payload[field]

    if not conv["messages"] and (not conv.get("title") or conv["title"] == "新对话"):
        clean_title = " ".join(prompt.splitlines()).strip()
        conv["title"] = clean_title[:36] + ("…" if len(clean_title) > 36 else "")

    settings = load_settings()
    active_cwd = conv.get("cwd") or settings.get("default_cwd") or str(DEFAULT_WORKSPACE_DIR)
    explicit_skill_ids = payload.get("skill_ids") or []
    auto_dispatch_flag = (
        bool(payload["auto_dispatch_skills"])
        if "auto_dispatch_skills" in payload
        else bool(settings.get("auto_dispatch_skills", True))
    )
    dispatched_info = SKILLS_REPO.dispatch_for_prompt(
        prompt=prompt,
        explicit_skill_ids=explicit_skill_ids,
        auto_dispatch=auto_dispatch_flag,
        cwd_str=active_cwd,
    )
    dispatched_skills = dispatched_info["skills"]
    skill_directives = dispatched_info["directive_blocks"]
    effective_user_prompt = dispatched_info["cleaned_prompt"] or prompt
    if dispatched_skills:
        try:
            SKILLS_REPO.record_usage([s["id"] for s in dispatched_skills])
        except Exception:
            pass

    checkpoint_meta: Optional[Dict[str, Any]] = None
    if not demo_mode and active_cwd and os.path.isdir(active_cwd):
        try:
            checkpoint_meta = CHECKPOINTS.create_checkpoint(
                active_cwd,
                conv_id=conv["id"],
                label=" ".join(prompt.splitlines()).strip()[:48] or "对话前快照",
                kind="turn",
            )
        except Exception:
            checkpoint_meta = None

    user_msg_id = uuid.uuid4().hex[:10]
    user_msg_index = len(conv["messages"])
    conv["messages"].append(
        {
            "id": user_msg_id,
            "role": "user",
            "content": prompt,
            "attachments": attachments,
            "capabilities": capabilities,
            "dispatched_skills": dispatched_skills,
            "checkpoint_id": checkpoint_meta["id"] if checkpoint_meta else None,
            "timestamp": time.time(),
        }
    )
    save_conversation(conv)

    def emit(ev: Dict[str, Any]) -> bool:
        chunk = f"data: {json.dumps(ev, ensure_ascii=False)}\n\n".encode("utf-8")
        return emit_bytes(chunk)

    emit(
        {
            "type": "session",
            "conversation": {k: v for k, v in conv.items() if k != "messages"},
            "user_msg_id": user_msg_id,
            "user_msg_index": user_msg_index,
            "checkpoint": checkpoint_meta,
            "dispatched_skills": dispatched_skills,
        }
    )
    if checkpoint_meta:
        emit({"type": "checkpoint", "checkpoint": checkpoint_meta})
    if dispatched_skills:
        emit({"type": "skills_dispatched", "skills": dispatched_skills})

    started = time.time()
    acc_thinking: List[str] = []
    acc_text: List[str] = []
    tools_map: Dict[str, Dict[str, Any]] = {}
    errors: List[str] = []

    runner = (
        stream_demo_response(effective_user_prompt, fast=fast_demo)
        if demo_mode
        else stream_agy_cli(
            conv,
            effective_user_prompt,
            settings,
            attachments=attachments,
            capabilities=capabilities,
            skill_directives=skill_directives,
        )
    )

    try:
        for ev in runner:
            etype = ev.get("type")
            if etype == "meta" and ev.get("agy_conversation_id") and not demo_mode:
                conv["agy_conversation_id"] = ev["agy_conversation_id"]
                save_conversation(conv)
            elif etype == "thinking_delta":
                acc_thinking.append(ev.get("delta", ""))
            elif etype == "text_delta":
                acc_text.append(ev.get("delta", ""))
            elif etype == "tool_update":
                tool = ev["tool"]
                prev = tools_map.get(tool["id"], {})
                merged = dict(prev)
                for k, v in tool.items():
                    if v is None:
                        continue
                    if k == "args" and v in ({}, "") and prev.get("args"):
                        continue
                    if k in ("summary", "output") and v == "" and prev.get(k):
                        continue
                    merged[k] = v
                tools_map[tool["id"]] = merged
                ev = {"type": "tool_update", "tool": merged}
            elif etype == "error":
                errors.append(ev.get("message", "Unknown error"))

            if not emit(ev):
                with ACTIVE_LOCK:
                    proc = ACTIVE_PROCESSES.get(conv["id"])
                if proc and proc.poll() is None:
                    proc.terminate()
                break
    finally:
        elapsed = round(time.time() - started, 2)
        asst_msg_id = uuid.uuid4().hex[:10]
        asst_msg_index = len(conv["messages"])
        conv["messages"].append(
            {
                "id": asst_msg_id,
                "role": "assistant",
                "content": "".join(acc_text),
                "thinking": "".join(acc_thinking),
                "tools": list(tools_map.values()),
                "errors": errors,
                "elapsed_sec": elapsed,
                "demo": demo_mode,
                "dispatched_skills": dispatched_skills,
                "checkpoint_id": checkpoint_meta["id"] if checkpoint_meta else None,
                "timestamp": time.time(),
            }
        )
        save_conversation(conv)
        emit(
            {
                "type": "done",
                "elapsed_sec": elapsed,
                "conversation_id": conv["id"],
                "agy_conversation_id": conv.get("agy_conversation_id"),
                "title": conv.get("title"),
                "assistant_msg_id": asst_msg_id,
                "assistant_msg_index": asst_msg_index,
                "dispatched_skills": dispatched_skills,
                "checkpoint_id": checkpoint_meta["id"] if checkpoint_meta else None,
            }
        )
    return None
