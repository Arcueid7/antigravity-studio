# -*- coding: utf-8 -*-
"""Conversation and scheduled-task JSON persistence."""

from __future__ import annotations

import json
import re
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from backend.config import (
    ACTIVE_LOCK,
    ACTIVE_PROCESSES,
    CONV_DIR,
    SCHEDULES_FILE,
    SCHEDULES_LOCK,
    _safe_is_file,
    load_settings,
)

def load_schedules() -> List[Dict[str, Any]]:
    with SCHEDULES_LOCK:
        if SCHEDULES_FILE.exists():
            try:
                data = json.loads(SCHEDULES_FILE.read_text(encoding="utf-8"))
                if isinstance(data, list):
                    return data
            except Exception:
                pass
        return []


def save_schedules(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    with SCHEDULES_LOCK:
        SCHEDULES_FILE.write_text(
            json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        return items



def conv_path(conv_id: str) -> Path:
    safe_id = "".join(c for c in conv_id if c.isalnum() or c in "-_")
    return CONV_DIR / f"{safe_id}.json"


def list_conversations() -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    with ACTIVE_LOCK:
        running_ids = {cid for cid, proc in ACTIVE_PROCESSES.items() if proc and proc.poll() is None}
    for p in CONV_DIR.glob("*.json"):
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            cid = data["id"]
            items.append(
                {
                    "id": cid,
                    "title": data.get("title", "新对话"),
                    "agy_conversation_id": data.get("agy_conversation_id"),
                    "engine": data.get("engine", "agy"),
                    "cwd": data.get("cwd", ""),
                    "model": data.get("model", "default"),
                    "mode": data.get("mode", "default"),
                    "effort": data.get("effort", "default"),
                    "created_at": data.get("created_at", 0),
                    "updated_at": data.get("updated_at", 0),
                    "message_count": len(data.get("messages", [])),
                    "pinned": bool(data.get("pinned", False)),
                    "running": cid in running_ids,
                }
            )
        except Exception:
            continue
    items.sort(key=lambda x: (1 if x.get("pinned") else 0, x["updated_at"]), reverse=True)
    return items


def _extract_snippet(text: str, query_lower: str, radius: int = 36) -> str:
    clean = re.sub(r"\s+", " ", text or "").strip()
    if not clean:
        return ""
    idx = clean.lower().find(query_lower)
    if idx < 0:
        return clean[: radius * 2]
    start = max(0, idx - radius)
    end = min(len(clean), idx + len(query_lower) + radius)
    prefix = "…" if start > 0 else ""
    suffix = "…" if end < len(clean) else ""
    return f"{prefix}{clean[start:end]}{suffix}"


def search_conversations(query: str, limit: int = 50) -> List[Dict[str, Any]]:
    """Full-text search across conversation titles, workspaces, and message bodies."""
    q = (query or "").strip()
    if not q:
        return list_conversations()
    q_lower = q.lower()

    with ACTIVE_LOCK:
        running_ids = {cid for cid, proc in ACTIVE_PROCESSES.items() if proc and proc.poll() is None}

    matches: List[Dict[str, Any]] = []
    for p in CONV_DIR.glob("*.json"):
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            cid = data["id"]
            title = data.get("title", "新对话") or "新对话"
            cwd = data.get("cwd", "") or ""
            msgs = data.get("messages") or []

            title_hit = q_lower in title.lower()
            cwd_hit = q_lower in cwd.lower()
            body_hit_count = 0
            first_snippet = ""
            first_msg_idx = -1

            for idx, m in enumerate(msgs):
                body = str(m.get("content") or "")
                if not body:
                    continue
                cnt = body.lower().count(q_lower)
                if cnt > 0:
                    body_hit_count += cnt
                    if not first_snippet:
                        first_snippet = _extract_snippet(body, q_lower)
                        first_msg_idx = idx

            if not (title_hit or cwd_hit or body_hit_count > 0):
                continue

            matches.append(
                {
                    "id": cid,
                    "title": title,
                    "agy_conversation_id": data.get("agy_conversation_id"),
                    "engine": data.get("engine", "agy"),
                    "cwd": cwd,
                    "model": data.get("model", "default"),
                    "mode": data.get("mode", "default"),
                    "effort": data.get("effort", "default"),
                    "created_at": data.get("created_at", 0),
                    "updated_at": data.get("updated_at", 0),
                    "message_count": len(msgs),
                    "pinned": bool(data.get("pinned", False)),
                    "running": cid in running_ids,
                    "match_in_title": title_hit,
                    "match_in_body": body_hit_count > 0,
                    "match_count": body_hit_count + (1 if title_hit else 0),
                    "match_snippet": first_snippet,
                    "match_msg_index": first_msg_idx,
                }
            )
        except Exception:
            continue

    matches.sort(
        key=lambda x: (
            1 if x.get("pinned") else 0,
            1 if x.get("match_in_title") else 0,
            x.get("match_count", 0),
            x.get("updated_at", 0),
        ),
        reverse=True,
    )
    return matches[: max(1, int(limit))]


def export_conversation_markdown(conv_id: str) -> Optional[Tuple[str, str]]:
    """Export a conversation into a clean, readable Markdown note."""
    conv = load_conversation(conv_id)
    if not conv:
        return None
    title = (conv.get("title") or "新对话").strip()
    created_ts = conv.get("created_at") or time.time()
    updated_ts = conv.get("updated_at") or created_ts
    created_str = datetime.fromtimestamp(created_ts).strftime("%Y-%m-%d %H:%M")
    updated_str = datetime.fromtimestamp(updated_ts).strftime("%Y-%m-%d %H:%M")

    lines: List[str] = [
        f"# {title}",
        "",
        f"> **导出时间**：{datetime.now().strftime('%Y-%m-%d %H:%M')}  ",
        f"> **创建时间**：{created_str} · **最近更新**：{updated_str}  ",
        f"> **引擎 / 模型**：`{conv.get('engine', 'agy')}` / `{conv.get('model', 'default')}` · **工作区**：`{conv.get('cwd', '')}`",
        "",
        "---",
        "",
    ]

    for idx, m in enumerate(conv.get("messages") or [], start=1):
        role = m.get("role", "user")
        content = (m.get("content") or "").strip()
        if role == "user":
            lines.append(f"## 用户 #{idx}")
            lines.append("")
            atts = m.get("attachments") or []
            if atts:
                att_names = ", ".join(f"`{a.get('rel_path') or a.get('name') or 'file'}`" for a in atts if isinstance(a, dict))
                if att_names:
                    lines.append(f"*附件*：{att_names}")
                    lines.append("")
            lines.append(content or "（空消息）")
            lines.append("")
        else:
            lines.append(f"## Antigravity 助手")
            lines.append("")
            skills = m.get("dispatched_skills") or []
            if skills:
                sk_names = "、".join(f"`{s.get('name') or s.get('slug')}`" for s in skills if isinstance(s, dict))
                if sk_names:
                    lines.append(f"*调度 Skills*：{sk_names}")
                    lines.append("")
            thinking = (m.get("thinking") or "").strip()
            if thinking:
                lines.append("<details>")
                lines.append("<summary>思考过程</summary>")
                lines.append("")
                lines.append(thinking)
                lines.append("")
                lines.append("</details>")
                lines.append("")
            tools = m.get("tools") or []
            if tools:
                lines.append("<details>")
                lines.append(f"<summary>工具调用（{len(tools)} 项）</summary>")
                lines.append("")
                for t in tools:
                    if not isinstance(t, dict):
                        continue
                    tname = t.get("name") or "tool"
                    tstat = t.get("status") or ""
                    lines.append(f"- **`{tname}`** ({tstat})")
                lines.append("")
                lines.append("</details>")
                lines.append("")
            lines.append(content or "（无文本输出）")
            lines.append("")
        lines.append("---")
        lines.append("")

    safe_title = re.sub(r'[\\/:*?"<>|\r\n]+', "_", title).strip(" ._") or f"chat_{conv_id}"
    filename = f"{safe_title[:48]}.md"
    return filename, "\n".join(lines).rstrip() + "\n"


def load_conversation(conv_id: str) -> Optional[Dict[str, Any]]:
    p = conv_path(conv_id)
    if not _safe_is_file(p):
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None


def save_conversation(conv: Dict[str, Any], touch_updated: bool = True) -> Dict[str, Any]:
    if touch_updated or not conv.get("updated_at"):
        conv["updated_at"] = time.time()
    p = conv_path(conv["id"])
    p.write_text(json.dumps(conv, ensure_ascii=False, indent=2), encoding="utf-8")
    return conv


def create_conversation(payload: Dict[str, Any]) -> Dict[str, Any]:
    settings = load_settings()
    now = time.time()
    conv = {
        "id": uuid.uuid4().hex[:12],
        "title": payload.get("title") or "新对话",
        "agy_conversation_id": None,
        "engine": payload.get("engine") or settings.get("cli_engine", "agy"),
        "cwd": payload.get("cwd") or settings.get("default_cwd") or str(Path.home()),
        "model": payload.get("model") or settings.get("default_model", "default"),
        "mode": payload.get("mode") or settings.get("default_mode", "default"),
        "effort": payload.get("effort") or settings.get("default_effort", "default"),
        "pinned": bool(payload.get("pinned", False)),
        "created_at": now,
        "updated_at": now,
        "messages": [],
    }
    return save_conversation(conv)


def fork_conversation(conv_id: str, up_to_index: Optional[int] = None) -> Optional[Dict[str, Any]]:
    """Fork a conversation up to (and including) `up_to_index` into a brand-new thread."""
    orig = load_conversation(conv_id)
    if not orig:
        return None
    orig_msgs = list(orig.get("messages") or [])
    if up_to_index is not None:
        idx = max(0, min(int(up_to_index), len(orig_msgs) - 1)) if orig_msgs else -1
        sliced = orig_msgs[: idx + 1] if idx >= 0 else []
    else:
        sliced = orig_msgs

    now = time.time()
    base_title = (orig.get("title") or "新对话").strip()
    if not base_title.endswith("(分支)"):
        fork_title = f"{base_title[:30]} (分支)"
    else:
        fork_title = base_title

    forked = {
        "id": uuid.uuid4().hex[:12],
        "title": fork_title,
        "agy_conversation_id": None,
        "engine": orig.get("engine", "agy"),
        "cwd": orig.get("cwd", ""),
        "model": orig.get("model", "default"),
        "mode": orig.get("mode", "default"),
        "effort": orig.get("effort", "default"),
        "forked_from": conv_id,
        "context_carryover": len(sliced) > 0,
        "created_at": now,
        "updated_at": now,
        "messages": json.loads(json.dumps(sliced, ensure_ascii=False)),
    }
    return save_conversation(forked)


def truncate_conversation(conv_id: str, keep_count: int) -> Optional[Dict[str, Any]]:
    """Truncate a conversation's messages to `keep_count` for edit-and-resend workflows."""
    conv = load_conversation(conv_id)
    if not conv:
        return None
    n = max(0, int(keep_count))
    conv["messages"] = list(conv.get("messages") or [])[:n]
    conv["agy_conversation_id"] = None
    conv["context_carryover"] = n > 0
    return save_conversation(conv)

