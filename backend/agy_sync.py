# -*- coding: utf-8 -*-
"""
Read-only incremental conversation sync with local Antigravity App (~/.gemini/antigravity)
and Antigravity CLI (~/.gemini/antigravity-cli).

Safety guarantees:
- NEVER writes to or locks official ~/.gemini/antigravity* files (strictly read-only).
- Skips internal subagent transcripts (nesting_depth > 0, parent_conversation_id != "", or no USER_INPUT).
- Uses mtime + file size caching plus fast substring pre-filtering before json.loads() so
  even multi-megabyte transcripts sync in milliseconds.
- Preserves Studio-specific metadata (pinned, custom title, attachments, checkpoints, skills).
"""

from __future__ import annotations

import json
import re
import sqlite3
import threading
import time
import urllib.parse
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from backend.config import CONV_DIR, DATA_DIR, DEFAULT_WORKSPACE_DIR, _safe_is_file
from backend.storage import load_conversation, save_conversation

# Overridable in tests to isolate from real ~/.gemini directories
AGY_SYNC_ROOTS: Optional[List[Tuple[str, Path]]] = None

SYNC_LOCK = threading.Lock()
_LAST_AUTO_SYNC_TS = 0.0
_AUTO_SYNC_INTERVAL_SEC = 4.0
AGY_SYNC_PARSER_VERSION = 3

_USER_REQ_RE = re.compile(r"<USER_REQUEST>\s*([\s\S]*?)\s*</USER_REQUEST>", re.IGNORECASE)
_META_BLOCK_RE = re.compile(
    r"<(?:ADDITIONAL_METADATA|USER_SETTINGS_CHANGE|CONTEXT_SUMMARY|SYSTEM_MESSAGE)>[\s\S]*?</(?:ADDITIONAL_METADATA|USER_SETTINGS_CHANGE|CONTEXT_SUMMARY|SYSTEM_MESSAGE)>",
    re.IGNORECASE,
)
_TRANSIENT_RETRY_ERR_RE = re.compile(r"^API error \(attempt \d+\):", re.IGNORECASE)


def _sync_state_file() -> Path:
    return DATA_DIR / "agy_sync_state.json"


def _load_sync_state() -> Dict[str, Any]:
    p = _sync_state_file()
    if _safe_is_file(p):
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return data
        except Exception:
            pass
    return {"deleted": {}}


def _save_sync_state(state: Dict[str, Any]) -> None:
    try:
        _sync_state_file().write_text(
            json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    except Exception:
        pass


def mark_agy_conversation_deleted(agy_cid: str, synced_size: int = 0) -> None:
    """Remember user-deleted external agy chats so auto-sync does not re-import them immediately."""
    cid = (agy_cid or "").strip()
    if not cid:
        return
    with SYNC_LOCK:
        st = _load_sync_state()
        deleted = st.get("deleted")
        if not isinstance(deleted, dict):
            deleted = {}
            st["deleted"] = deleted
        deleted[cid] = {"deleted_at": time.time(), "size": int(synced_size or 0)}
        _save_sync_state(st)


def get_agy_sync_roots() -> List[Tuple[str, Path]]:
    if AGY_SYNC_ROOTS is not None:
        return list(AGY_SYNC_ROOTS)
    home = Path.home()
    return [
        ("app", home / ".gemini" / "antigravity"),
        ("cli", home / ".gemini" / "antigravity-cli"),
    ]


def _parse_iso_ts(raw: Any) -> float:
    if isinstance(raw, (int, float)):
        val = float(raw)
        return val / 1e9 if val > 1e14 else (val / 1e3 if val > 1e11 else val)
    s = str(raw or "").strip()
    if not s or s.startswith("0001-01-01"):
        return 0.0
    try:
        # Normalize RFC3339 / SQLite timestamps with up to 9 fractional digits
        norm = s.replace(" ", "T")
        if norm.endswith("Z"):
            norm = norm[:-1] + "+00:00"
        m = re.match(r"^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(.*)$", norm)
        if m:
            frac = (m.group(2) or "")[:6].ljust(6, "0") if m.group(2) else ""
            tz = m.group(3) or "+00:00"
            norm = f"{m.group(1)}.{frac}{tz}" if frac else f"{m.group(1)}{tz}"
        dt = datetime.fromisoformat(norm)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.timestamp()
    except Exception:
        return 0.0


def _decode_workspace_uri(raw_uris: str) -> str:
    txt = (raw_uris or "").strip()
    if not txt:
        return ""
    candidates: List[str] = []
    if txt.startswith("["):
        try:
            arr = json.loads(txt)
            if isinstance(arr, list):
                candidates.extend(str(x) for x in arr if x)
        except Exception:
            pass
    else:
        candidates.append(txt)

    for uri in candidates:
        u = uri.strip()
        if not u:
            continue
        if u.lower().startswith("file://"):
            parsed = urllib.parse.urlparse(u)
            p = urllib.parse.unquote(parsed.path or "")
            if len(p) >= 3 and p[0] == "/" and p[2] == ":":
                p = p[1:]
            p = p.replace("/", "\\") if (len(p) >= 2 and p[1] == ":") else p
            if p:
                return p
        elif Path(u).is_absolute():
            return u
    return ""


def _clean_user_prompt(raw: str) -> str:
    txt = str(raw or "")
    m = _USER_REQ_RE.search(txt)
    if m:
        txt = m.group(1)
    else:
        txt = _META_BLOCK_RE.sub("", txt)
    txt = txt.strip()
    if not txt:
        return ""

    # Strip Studio-injected directive prefix blocks when reading back synced Studio turns
    markers = (
        "【用户全局自定义指令】",
        "[用户附加了以下本地文件/图片",
        "[以下是本次分支/编辑前的历史对话上下文",
    )
    if any(txt.startswith(mk) for mk in markers):
        parts = [p.strip() for p in re.split(r"\n{2,}", txt) if p.strip()]
        filtered: List[str] = []
        skip_next_for_inst = False
        for part in parts:
            if part.startswith("【用户全局自定义指令】") or part.startswith("【学习模式") or part.startswith("【视频工坊") or part.startswith("【网页搜索模式】") or part.startswith("【深度研究模式】") or part.startswith("【创建图像模式】") or part.startswith("【深度思考模式】"):
                continue
            if part.startswith("[用户附加了以下本地文件/图片") or part.startswith("[以下是本次分支/编辑前的历史对话上下文"):
                continue
            if skip_next_for_inst:
                skip_next_for_inst = False
                continue
            filtered.append(part)
        if filtered:
            txt = "\n\n".join(filtered).strip()
    return txt


def _clean_tool_args(raw_args: Any) -> Dict[str, Any]:
    if not isinstance(raw_args, dict):
        return {}
    cleaned: Dict[str, Any] = {}
    for k, v in raw_args.items():
        if isinstance(v, str):
            s = v.strip()
            if len(s) >= 2 and s[0] == '"' and s[-1] == '"':
                try:
                    unq = json.loads(s)
                    if isinstance(unq, str):
                        s = unq
                except Exception:
                    pass
            cleaned[k] = s
        else:
            cleaned[k] = v
    return cleaned


def parse_agy_transcript(tr_path: Path) -> Dict[str, Any]:
    """Stream-parse an Antigravity transcript.jsonl into Studio conversation messages."""
    messages: List[Dict[str, Any]] = []
    current_assistant: Optional[Dict[str, Any]] = None
    latest_model = "default"
    first_ts = 0.0
    last_ts = 0.0
    first_user_text = ""

    def flush_assistant() -> None:
        nonlocal current_assistant
        if not current_assistant:
            return
        if (
            current_assistant.get("content")
            or current_assistant.get("thinking")
            or current_assistant.get("tools")
            or current_assistant.get("errors")
        ):
            messages.append(current_assistant)
        current_assistant = None

    try:
        with tr_path.open("r", encoding="utf-8", errors="replace") as f:
            for raw_line in f:
                # Fast pre-filter skips 90%+ massive GENERIC tool-output lines without JSON parsing
                if (
                    '"USER_INPUT"' not in raw_line
                    and '"PLANNER_RESPONSE"' not in raw_line
                    and '"ERROR_MESSAGE"' not in raw_line
                ):
                    continue
                try:
                    obj = json.loads(raw_line)
                except Exception:
                    continue
                if not isinstance(obj, dict):
                    continue

                stype = obj.get("type") or ""
                source = obj.get("source") or ""
                ts = _parse_iso_ts(obj.get("created_at"))
                if ts:
                    if not first_ts:
                        first_ts = ts
                    last_ts = max(last_ts, ts)

                if stype == "USER_INPUT" and source == "USER_EXPLICIT":
                    clean = _clean_user_prompt(obj.get("content") or "")
                    if not clean:
                        continue
                    flush_assistant()
                    if not first_user_text:
                        first_user_text = clean
                    messages.append(
                        {
                            "id": f"u-{obj.get('step_index', len(messages))}",
                            "role": "user",
                            "content": clean,
                            "attachments": [],
                            "capabilities": [],
                            "timestamp": ts or time.time(),
                        }
                    )
                elif stype == "PLANNER_RESPONSE" and source == "MODEL":
                    if obj.get("model"):
                        latest_model = str(obj["model"])
                    if current_assistant is None:
                        current_assistant = {
                            "id": f"a-{obj.get('step_index', len(messages))}",
                            "role": "assistant",
                            "content": "",
                            "thinking": "",
                            "tools": [],
                            "errors": [],
                            "timestamp": ts or time.time(),
                        }
                    if ts:
                        current_assistant["timestamp"] = ts

                    # A subsequent successful MODEL response means prior transient retry errors recovered cleanly
                    if current_assistant["errors"]:
                        current_assistant["errors"] = [
                            e for e in current_assistant["errors"]
                            if not _TRANSIENT_RETRY_ERR_RE.match(str(e or "").strip())
                        ]

                    thought = str(obj.get("thinking") or "").strip()
                    if thought:
                        if current_assistant["thinking"]:
                            current_assistant["thinking"] += "\n\n" + thought
                        else:
                            current_assistant["thinking"] = thought

                    raw_tcs = obj.get("tool_calls")
                    if isinstance(raw_tcs, list):
                        for idx, tc in enumerate(raw_tcs):
                            if not isinstance(tc, dict):
                                continue
                            tname = str(tc.get("name") or tc.get("tool_name") or "tool")
                            targs = _clean_tool_args(tc.get("args") or tc.get("arguments") or {})
                            current_assistant["tools"].append(
                                {
                                    "id": f"s{obj.get('step_index', 0)}-t{idx}",
                                    "name": tname,
                                    "args": targs,
                                    "status": "DONE",
                                }
                            )

                    txt = str(obj.get("content") or "").strip()
                    if txt:
                        if current_assistant["content"]:
                            current_assistant["content"] += "\n\n" + txt
                        else:
                            current_assistant["content"] = txt
                elif stype == "ERROR_MESSAGE":
                    err_txt = str(obj.get("content") or obj.get("error") or "").strip()
                    if err_txt:
                        if current_assistant is None:
                            current_assistant = {
                                "id": f"a-{obj.get('step_index', len(messages))}",
                                "role": "assistant",
                                "content": "",
                                "thinking": "",
                                "tools": [],
                                "errors": [],
                                "timestamp": ts or time.time(),
                            }
                        current_assistant["errors"].append(err_txt[:500])
    except OSError:
        return {"messages": [], "model": "default", "first_user_text": "", "created_at": 0.0, "updated_at": 0.0}

    flush_assistant()
    return {
        "messages": messages,
        "model": latest_model,
        "first_user_text": first_user_text,
        "created_at": first_ts,
        "updated_at": last_ts,
    }


def _resolve_transcript_in_brain_dir(brain_conv_dir: Path) -> Optional[Path]:
    """Prefer untruncated transcript_full.jsonl over compact transcript.jsonl when present."""
    logs_dir = brain_conv_dir / ".system_generated" / "logs"
    for fname in ("transcript_full.jsonl", "transcript.jsonl"):
        cand = logs_dir / fname
        if _safe_is_file(cand):
            return cand
    return None


def _discover_external_records() -> Dict[str, Dict[str, Any]]:
    """Read SQLite summaries + brain transcript paths across local Antigravity App & CLI roots."""
    roots = get_agy_sync_roots()
    root_by_dirname: Dict[str, Tuple[str, Path]] = {}
    for src_kind, root_path in roots:
        root_by_dirname[root_path.name] = (src_kind, root_path)

    records: Dict[str, Dict[str, Any]] = {}

    def find_transcript(cid: str, preferred_dir_name: str = "") -> Tuple[Optional[Path], str]:
        checked: List[Tuple[str, Path]] = []
        if preferred_dir_name and preferred_dir_name in root_by_dirname:
            checked.append(root_by_dirname[preferred_dir_name])
        for pair in roots:
            if pair not in checked:
                checked.append(pair)
        for kind, rpath in checked:
            cand = _resolve_transcript_in_brain_dir(rpath / "brain" / cid)
            if cand is not None:
                return cand, kind
        return None, ("app" if preferred_dir_name == "antigravity" else "cli")

    # 1. Read SQLite conversation_summaries.db in strict read-only mode
    for src_kind, root_path in roots:
        db_path = root_path / "conversation_summaries.db"
        if not _safe_is_file(db_path):
            continue
        con = None
        try:
            con = sqlite3.connect(f"file:{db_path.as_posix()}?mode=ro", uri=True, timeout=1.5)
            cur = con.cursor()
            rows = cur.execute(
                """
                SELECT conversation_id, title, preview, step_count, last_modified_time,
                       workspace_uris, parent_conversation_id, nesting_depth, app_data_dir, killed
                FROM conversation_summaries
                """
            ).fetchall()
            for row in rows:
                cid, title, preview, steps, lmt, ws_uris, parent_cid, depth, adir, killed = row
                cid = str(cid or "").strip()
                if not cid:
                    continue
                # Skip internal subagents & empty killed stubs
                if (parent_cid and str(parent_cid).strip()) or int(depth or 0) > 0:
                    continue
                if int(steps or 0) <= 0 and killed:
                    continue

                tr_path, resolved_kind = find_transcript(cid, str(adir or "").strip())
                if not tr_path:
                    continue
                try:
                    st = tr_path.stat()
                except OSError:
                    continue

                ts = _parse_iso_ts(lmt) or st.st_mtime
                db_title = str(title or "").strip()
                db_preview = str(preview or "").strip()
                cwd = _decode_workspace_uri(str(ws_uris or ""))

                existing = records.get(cid)
                if existing:
                    # Merge richer metadata from whichever DB has newer step_count / title / cwd
                    if int(steps or 0) > existing["step_count"] or ts > existing["updated_at"]:
                        existing["step_count"] = max(existing["step_count"], int(steps or 0))
                        existing["updated_at"] = max(existing["updated_at"], ts)
                    if not existing["title"] and db_title:
                        existing["title"] = db_title
                    if not existing.get("preview") and db_preview:
                        existing["preview"] = db_preview
                    if not existing["cwd"] and cwd:
                        existing["cwd"] = cwd
                    if st.st_size > existing["tr_size"]:
                        existing["tr_path"] = tr_path
                        existing["tr_size"] = st.st_size
                        existing["tr_mtime"] = st.st_mtime
                        existing["source"] = resolved_kind
                else:
                    records[cid] = {
                        "agy_cid": cid,
                        "source": resolved_kind,
                        "title": db_title,
                        "preview": db_preview,
                        "cwd": cwd,
                        "step_count": int(steps or 0),
                        "updated_at": ts,
                        "tr_path": tr_path,
                        "tr_size": st.st_size,
                        "tr_mtime": st.st_mtime,
                    }
        except Exception:
            pass
        finally:
            if con is not None:
                try:
                    con.close()
                except Exception:
                    pass

    # 2. Fallback: scan brain/*/.system_generated/logs/transcript.jsonl not yet indexed in SQLite
    subagent_ids = set()
    for src_kind, root_path in roots:
        db_path = root_path / "conversation_summaries.db"
        if _safe_is_file(db_path):
            con = None
            try:
                con = sqlite3.connect(f"file:{db_path.as_posix()}?mode=ro", uri=True, timeout=1.0)
                for (cid,) in con.execute(
                    "SELECT conversation_id FROM conversation_summaries WHERE parent_conversation_id != '' OR nesting_depth > 0"
                ).fetchall():
                    if cid:
                        subagent_ids.add(str(cid))
            except Exception:
                pass
            finally:
                if con is not None:
                    try:
                        con.close()
                    except Exception:
                        pass

    for src_kind, root_path in roots:
        brain_dir = root_path / "brain"
        try:
            if not brain_dir.is_dir():
                continue
            entries = list(brain_dir.iterdir())
        except OSError:
            continue
        for cdir in entries:
            try:
                if not cdir.is_dir():
                    continue
            except OSError:
                continue
            cid = cdir.name
            if cid in records or cid in subagent_ids:
                continue
            tr_path = _resolve_transcript_in_brain_dir(cdir)
            if tr_path is None:
                continue
            try:
                st = tr_path.stat()
            except OSError:
                continue
            records[cid] = {
                "agy_cid": cid,
                "source": src_kind,
                "title": "",
                "cwd": "",
                "step_count": 0,
                "updated_at": st.st_mtime,
                "tr_path": tr_path,
                "tr_size": st.st_size,
                "tr_mtime": st.st_mtime,
            }

    return records


def _merge_messages(
    existing_msgs: List[Dict[str, Any]], parsed_msgs: List[Dict[str, Any]]
) -> Tuple[List[Dict[str, Any]], bool]:
    """Append/update turns from transcript while keeping Studio-rich metadata on prior turns."""
    if not existing_msgs:
        return list(parsed_msgs), bool(parsed_msgs)

    merged = list(existing_msgs)
    changed = False

    # Refresh existing synced assistant messages when an in-progress turn continues
    # or when parser upgrades clean recovered transient retry errors
    overlap = min(len(merged), len(parsed_msgs))
    for idx in range(overlap):
        old_m = merged[idx]
        new_m = parsed_msgs[idx]
        if (
            not isinstance(old_m, dict)
            or not isinstance(new_m, dict)
            or old_m.get("role") != "assistant"
            or new_m.get("role") != "assistant"
        ):
            continue

        updated_m = dict(old_m)
        m_changed = False

        old_content = str(old_m.get("content") or "")
        new_content = str(new_m.get("content") or "")
        if len(new_content) > len(old_content):
            updated_m["content"] = new_content
            m_changed = True

        old_thinking = str(old_m.get("thinking") or "")
        new_thinking = str(new_m.get("thinking") or "")
        if len(new_thinking) > len(old_thinking):
            updated_m["thinking"] = new_thinking
            m_changed = True

        old_tools = old_m.get("tools") if isinstance(old_m.get("tools"), list) else []
        new_tools = new_m.get("tools") if isinstance(new_m.get("tools"), list) else []
        if len(new_tools) > len(old_tools):
            updated_m["tools"] = new_tools
            m_changed = True

        old_errs = old_m.get("errors") if isinstance(old_m.get("errors"), list) else []
        new_errs = new_m.get("errors") if isinstance(new_m.get("errors"), list) else []
        if old_errs != new_errs and (
            any(_TRANSIENT_RETRY_ERR_RE.match(str(e or "").strip()) for e in old_errs)
            or idx == overlap - 1
        ):
            updated_m["errors"] = new_errs
            m_changed = True

        if m_changed:
            if new_m.get("timestamp"):
                updated_m["timestamp"] = new_m["timestamp"]
            merged[idx] = updated_m
            changed = True

    if len(parsed_msgs) > len(existing_msgs):
        for idx in range(len(existing_msgs), len(parsed_msgs)):
            merged.append(parsed_msgs[idx])
        changed = True

    return merged, changed


def _make_clean_title(db_title: str, first_user_text: str, preview: str = "") -> str:
    candidate = _clean_user_prompt(db_title) if (db_title or "").strip() else ""
    if not candidate and first_user_text:
        candidate = " ".join(first_user_text.splitlines()).strip()
    if not candidate and preview:
        candidate = _clean_user_prompt(preview)
    if not candidate:
        return "Antigravity 对话"
    candidate = " ".join(candidate.splitlines()).strip()
    return candidate[:42] + ("…" if len(candidate) > 42 else "")


def sync_agy_conversations(force: bool = False) -> Dict[str, Any]:
    """Incrementally sync conversations from local Antigravity App & agy CLI into CONV_DIR."""
    global _LAST_AUTO_SYNC_TS
    now = time.time()
    if not force and (now - _LAST_AUTO_SYNC_TS) < _AUTO_SYNC_INTERVAL_SEC:
        return {"ok": True, "imported": 0, "updated": 0, "skipped": 0, "throttled": True}

    with SYNC_LOCK:
        now = time.time()
        if not force and (now - _LAST_AUTO_SYNC_TS) < _AUTO_SYNC_INTERVAL_SEC:
            return {"ok": True, "imported": 0, "updated": 0, "skipped": 0, "throttled": True}
        _LAST_AUTO_SYNC_TS = now

        records = _discover_external_records()
        if not records:
            return {"ok": True, "imported": 0, "updated": 0, "skipped": 0, "total_external": 0}

        sync_state = _load_sync_state()
        deleted_map = sync_state.get("deleted") if isinstance(sync_state.get("deleted"), dict) else {}
        if force and deleted_map:
            # Manual sync clears delete tombstones only for chats that still exist when explicitly forced?
            # Keep user deletions respected unless the transcript grew with new activity!
            pass

        # Index existing Studio conversations by agy_conversation_id
        by_agy_id: Dict[str, Dict[str, Any]] = {}
        for p in CONV_DIR.glob("*.json"):
            try:
                data = json.loads(p.read_text(encoding="utf-8"))
                agid = str(data.get("agy_conversation_id") or "").strip()
                if agid:
                    by_agy_id[agid] = data
            except Exception:
                continue

        imported = 0
        updated = 0
        skipped = 0

        for cid, rec in records.items():
            tr_path: Path = rec["tr_path"]
            tr_mtime: float = float(rec["tr_mtime"])
            tr_size: int = int(rec["tr_size"])

            existing = by_agy_id.get(cid)
            if existing is not None:
                prev_mtime = float(existing.get("agy_sync_mtime") or 0.0)
                prev_size = int(existing.get("agy_sync_size") or 0)
                prev_pver = int(existing.get("agy_sync_parser_ver") or 0)
                if not force and prev_mtime == tr_mtime and prev_size == tr_size and prev_pver >= AGY_SYNC_PARSER_VERSION:
                    skipped += 1
                    continue

                parsed = parse_agy_transcript(tr_path)
                p_msgs = parsed["messages"]
                if not p_msgs:
                    skipped += 1
                    continue

                old_msgs = existing.get("messages") or []
                new_msgs, msgs_changed = _merge_messages(old_msgs, p_msgs)
                changed = False
                if msgs_changed:
                    existing["messages"] = new_msgs
                    changed = True
                if not existing.get("agy_source"):
                    existing["agy_source"] = rec["source"]
                    changed = True
                cur_title = str(existing.get("title") or "").strip()
                needs_title_fix = (
                    not cur_title
                    or cur_title in ("新对话", "新聊天")
                    or cur_title.startswith(("[用户附加了以下本地文件", "【用户全局自定义指令"))
                )
                if needs_title_fix:
                    better_title = _make_clean_title(rec["title"], parsed["first_user_text"], rec.get("preview", ""))
                    if better_title and better_title != cur_title:
                        existing["title"] = better_title
                        changed = True
                if (
                    changed
                    or existing.get("agy_sync_mtime") != tr_mtime
                    or existing.get("agy_sync_size") != tr_size
                    or prev_pver < AGY_SYNC_PARSER_VERSION
                ):
                    existing["agy_sync_mtime"] = tr_mtime
                    existing["agy_sync_size"] = tr_size
                    existing["agy_sync_parser_ver"] = AGY_SYNC_PARSER_VERSION
                    if changed and rec["updated_at"] > float(existing.get("updated_at") or 0):
                        existing["updated_at"] = rec["updated_at"]
                    save_conversation(existing, touch_updated=False)
                    if changed:
                        updated += 1
                    else:
                        skipped += 1
                else:
                    skipped += 1
                continue

            # Brand-new external conversation: check delete tombstone
            tomb = deleted_map.get(cid)
            if isinstance(tomb, dict) and not force:
                if tr_size <= int(tomb.get("size") or 0):
                    skipped += 1
                    continue

            parsed = parse_agy_transcript(tr_path)
            p_msgs = parsed["messages"]
            # Must contain at least one explicit user prompt (filters out raw subagent transcripts)
            if not p_msgs or not parsed["first_user_text"]:
                skipped += 1
                continue

            local_id = f"agy_{re.sub(r'[^a-zA-Z0-9]', '', cid)[:12] or uuid.uuid4().hex[:12]}"
            cwd = rec["cwd"] or str(DEFAULT_WORKSPACE_DIR)
            created_ts = parsed["created_at"] or rec["updated_at"] or tr_mtime
            updated_ts = max(parsed["updated_at"] or 0.0, rec["updated_at"] or 0.0, tr_mtime)

            conv_obj: Dict[str, Any] = {
                "id": local_id,
                "title": _make_clean_title(rec["title"], parsed["first_user_text"], rec.get("preview", "")),
                "agy_conversation_id": cid,
                "agy_source": rec["source"],
                "agy_sync_mtime": tr_mtime,
                "agy_sync_size": tr_size,
                "agy_sync_parser_ver": AGY_SYNC_PARSER_VERSION,
                "engine": "agy",
                "cwd": cwd,
                "model": parsed["model"] or "default",
                "mode": "default",
                "effort": "default",
                "created_at": created_ts,
                "updated_at": updated_ts,
                "messages": p_msgs,
            }
            save_conversation(conv_obj, touch_updated=False)
            imported += 1

        return {
            "ok": True,
            "imported": imported,
            "updated": updated,
            "skipped": skipped,
            "total_external": len(records),
        }


def refresh_single_agy_conversation(conv: Dict[str, Any]) -> Dict[str, Any]:
    """Fast single-conversation refresh when opening a chat bound to an agy_conversation_id."""
    cid = str(conv.get("agy_conversation_id") or "").strip()
    if not cid or (conv.get("engine") or "agy") != "agy":
        return conv

    roots = get_agy_sync_roots()
    tr_path: Optional[Path] = None
    src_kind = conv.get("agy_source") or ""
    # Prefer matching source root first
    ordered = sorted(roots, key=lambda pair: 0 if pair[0] == src_kind else 1)
    for kind, rpath in ordered:
        cand = _resolve_transcript_in_brain_dir(rpath / "brain" / cid)
        if cand is not None:
            tr_path = cand
            if not src_kind:
                src_kind = kind
            break
    if not tr_path:
        return conv

    try:
        st = tr_path.stat()
    except OSError:
        return conv

    if (
        float(conv.get("agy_sync_mtime") or 0.0) == st.st_mtime
        and int(conv.get("agy_sync_size") or 0) == st.st_size
        and int(conv.get("agy_sync_parser_ver") or 0) >= AGY_SYNC_PARSER_VERSION
    ):
        return conv

    parsed = parse_agy_transcript(tr_path)
    p_msgs = parsed["messages"]
    if not p_msgs:
        return conv

    old_msgs = conv.get("messages") or []
    new_msgs, msgs_changed = _merge_messages(old_msgs, p_msgs)
    conv["agy_sync_mtime"] = st.st_mtime
    conv["agy_sync_size"] = st.st_size
    conv["agy_sync_parser_ver"] = AGY_SYNC_PARSER_VERSION
    if src_kind and not conv.get("agy_source"):
        conv["agy_source"] = src_kind
    if msgs_changed:
        conv["messages"] = new_msgs
        if parsed["updated_at"] > float(conv.get("updated_at") or 0):
            conv["updated_at"] = parsed["updated_at"]
    save_conversation(conv, touch_updated=False)
    return conv
