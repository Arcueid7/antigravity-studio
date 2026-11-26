# -*- coding: utf-8 -*-
"""
Unified Multi-Engine CLI Adapter architecture (`agy`, `claude`, `codex`, `gemini`).
Keeps `agy` as the primary first-class engine while making optional CLI backends
pluggable via a uniform command builder and NDJSON stream parser interface.
"""

from __future__ import annotations

import json
import os
import shlex
import shutil
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional


def _safe_is_file(p: Path) -> bool:
    try:
        return p.is_file()
    except OSError:
        return False


def _which_any(names: List[str], extra_candidates: Optional[List[Path]] = None) -> Optional[str]:
    for n in names:
        found = shutil.which(n)
        if found:
            return found
    for cand in (extra_candidates or []):
        if _safe_is_file(cand):
            return str(cand)
    return None


class BaseStreamParser:
    """Normalizes stdout NDJSON / text lines from a CLI into unified UI SSE events."""

    def __init__(self) -> None:
        self.session_id: Optional[str] = None
        self.emitted_any_text: bool = False

    def feed_line(self, raw_line: str) -> List[Dict[str, Any]]:
        line = raw_line.strip()
        if not line:
            return []
        self.emitted_any_text = True
        return [{"type": "text_delta", "delta": raw_line}]


class ClaudeStreamParser(BaseStreamParser):
    """Parses `claude -p ... --output-format stream-json --verbose` events."""

    def feed_line(self, raw_line: str) -> List[Dict[str, Any]]:
        line = raw_line.strip()
        if not line:
            return []
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            self.emitted_any_text = True
            return [{"type": "text_delta", "delta": raw_line}]
        if not isinstance(obj, dict):
            return []

        out: List[Dict[str, Any]] = []
        sid = obj.get("session_id")
        if sid and sid != self.session_id:
            self.session_id = str(sid)
            out.append({"type": "meta", "agy_conversation_id": self.session_id})

        etype = obj.get("type") or ""
        if etype == "assistant":
            msg = obj.get("message") or {}
            for blk in (msg.get("content") or []):
                if not isinstance(blk, dict):
                    continue
                btype = blk.get("type")
                if btype == "thinking" and blk.get("thinking"):
                    out.append({"type": "thinking_delta", "delta": str(blk["thinking"])})
                elif btype == "text" and blk.get("text"):
                    self.emitted_any_text = True
                    out.append({"type": "text_delta", "delta": str(blk["text"])})
                elif btype == "tool_use":
                    out.append(
                        {
                            "type": "tool_update",
                            "tool": {
                                "id": str(blk.get("id") or "tool"),
                                "name": str(blk.get("name") or "tool"),
                                "args": blk.get("input") or {},
                                "status": "ACTIVE",
                            },
                        }
                    )
        elif etype == "result":
            res_text = obj.get("result")
            if isinstance(res_text, str) and res_text and not self.emitted_any_text:
                self.emitted_any_text = True
                out.append({"type": "text_delta", "delta": res_text})
            if obj.get("is_error"):
                out.append({"type": "error", "message": str(obj.get("result") or "Claude CLI 执行出错")})
        return out


class CodexStreamParser(BaseStreamParser):
    """Parses `codex exec --json` JSONL events."""

    def feed_line(self, raw_line: str) -> List[Dict[str, Any]]:
        line = raw_line.strip()
        if not line:
            return []
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            self.emitted_any_text = True
            return [{"type": "text_delta", "delta": raw_line}]
        if not isinstance(obj, dict):
            return []

        out: List[Dict[str, Any]] = []
        tid = obj.get("thread_id")
        if tid and tid != self.session_id:
            self.session_id = str(tid)
            out.append({"type": "meta", "agy_conversation_id": self.session_id})

        etype = obj.get("type") or ""
        item = obj.get("item") if isinstance(obj.get("item"), dict) else {}
        if etype in ("item.completed", "item.updated"):
            itype = item.get("type") or ""
            if itype == "reasoning" and item.get("text"):
                out.append({"type": "thinking_delta", "delta": str(item["text"])})
            elif itype in ("agent_message", "message") and item.get("text"):
                self.emitted_any_text = True
                out.append({"type": "text_delta", "delta": str(item["text"])})
            elif itype in ("command_execution", "mcp_tool_call", "file_change"):
                out.append(
                    {
                        "type": "tool_update",
                        "tool": {
                            "id": str(item.get("id") or itype),
                            "name": str(item.get("command") or item.get("tool") or itype),
                            "args": item.get("arguments") or {},
                            "output": item.get("aggregated_output") or item.get("result"),
                            "status": "DONE" if etype == "item.completed" else "ACTIVE",
                        },
                    }
                )
        elif etype == "error":
            out.append({"type": "error", "message": str(obj.get("message") or obj)})
        return out


class GeminiStreamParser(BaseStreamParser):
    """Parses `gemini -p ... --output-format stream-json` NDJSON events."""

    def feed_line(self, raw_line: str) -> List[Dict[str, Any]]:
        line = raw_line.strip()
        if not line:
            return []
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            self.emitted_any_text = True
            return [{"type": "text_delta", "delta": raw_line}]
        if not isinstance(obj, dict):
            return []

        out: List[Dict[str, Any]] = []
        sid = obj.get("session_id")
        if sid and sid != self.session_id:
            self.session_id = str(sid)
            out.append({"type": "meta", "agy_conversation_id": self.session_id})

        etype = obj.get("type") or ""
        if etype == "message" and obj.get("role") == "assistant":
            txt = obj.get("content") or obj.get("delta") or ""
            if isinstance(txt, str) and txt:
                self.emitted_any_text = True
                out.append({"type": "text_delta", "delta": txt})
        elif etype == "tool_use":
            out.append(
                {
                    "type": "tool_update",
                    "tool": {
                        "id": str(obj.get("tool_id") or obj.get("id") or "tool"),
                        "name": str(obj.get("tool_name") or obj.get("name") or "tool"),
                        "args": obj.get("parameters") or obj.get("args") or {},
                        "status": "ACTIVE",
                    },
                }
            )
        elif etype == "tool_result":
            out.append(
                {
                    "type": "tool_update",
                    "tool": {
                        "id": str(obj.get("tool_id") or obj.get("id") or "tool"),
                        "name": str(obj.get("tool_name") or "tool"),
                        "output": obj.get("output"),
                        "status": "ERROR" if obj.get("status") == "error" else "DONE",
                    },
                }
            )
        elif etype == "error":
            out.append({"type": "error", "message": str(obj.get("message") or obj)})
        return out


class EngineSpec:
    """Metadata and invocation spec for an AI CLI engine."""

    def __init__(
        self,
        engine_id: str,
        label: str,
        desc: str,
        install_hint: str,
        finder: Callable[[Dict[str, Any]], Optional[str]],
        build_command: Callable[[str, str, Dict[str, Any], Dict[str, Any], List[str]], List[str]],
        make_parser: Callable[[], Any],
    ) -> None:
        self.id = engine_id
        self.label = label
        self.desc = desc
        self.install_hint = install_hint
        self.finder = finder
        self.build_command = build_command
        self.make_parser = make_parser


def _append_extra_flags(cmd: List[str], settings: Dict[str, Any]) -> None:
    extra = (settings.get("extra_flags") or "").strip()
    if not extra:
        return
    try:
        cmd.extend(shlex.split(extra))
    except ValueError:
        cmd.extend(extra.split())


def build_engine_registry(
    find_agy_fn: Callable[[str], Optional[str]],
    agy_parser_cls: Any,
) -> Dict[str, EngineSpec]:
    """Construct the registry of supported CLI engines (agy primary + optional peers)."""
    home = Path.home()
    appdata_npm = Path(os.environ.get("APPDATA", home / "AppData" / "Roaming")) / "npm"

    def _build_agy(
        binary: str,
        prompt: str,
        conv: Dict[str, Any],
        settings: Dict[str, Any],
        add_dirs: List[str],
    ) -> List[str]:
        cmd = [binary, "-p", prompt, "--output-format", "stream-json"]
        for d in add_dirs:
            cmd.extend(["--add-dir", d])
        if conv.get("agy_conversation_id") and (conv.get("engine") or "agy") == "agy":
            cmd.extend(["--conversation", str(conv["agy_conversation_id"])])
        model = conv.get("model") or settings.get("default_model", "default")
        if model and model != "default":
            cmd.extend(["--model", model])
        mode = conv.get("mode") or settings.get("default_mode", "default")
        if mode and mode != "default":
            cmd.extend(["--mode", mode])
        effort = conv.get("effort") or settings.get("default_effort", "default")
        if effort and effort != "default":
            cmd.extend(["--effort", effort])
        _append_extra_flags(cmd, settings)
        return cmd

    def _build_claude(
        binary: str,
        prompt: str,
        conv: Dict[str, Any],
        settings: Dict[str, Any],
        add_dirs: List[str],
    ) -> List[str]:
        cmd = [binary, "-p", prompt, "--output-format", "stream-json", "--verbose"]
        for d in add_dirs:
            cmd.extend(["--add-dir", d])
        if conv.get("agy_conversation_id") and conv.get("engine") == "claude":
            cmd.extend(["--resume", str(conv["agy_conversation_id"])])
        _append_extra_flags(cmd, settings)
        return cmd

    def _build_codex(
        binary: str,
        prompt: str,
        conv: Dict[str, Any],
        settings: Dict[str, Any],
        add_dirs: List[str],
    ) -> List[str]:
        cmd = [binary, "exec", "--json", prompt]
        _append_extra_flags(cmd, settings)
        return cmd

    def _build_gemini(
        binary: str,
        prompt: str,
        conv: Dict[str, Any],
        settings: Dict[str, Any],
        add_dirs: List[str],
    ) -> List[str]:
        cmd = [binary, "-p", prompt, "--output-format", "stream-json"]
        _append_extra_flags(cmd, settings)
        return cmd

    return {
        "agy": EngineSpec(
            engine_id="agy",
            label="Antigravity CLI (agy)",
            desc="默认主力引擎 · 完整支持模型切换、配额查询、多模态与权限模式",
            install_hint="irm https://antigravity.google/cli/install.ps1 | iex",
            finder=lambda s: find_agy_fn(s.get("agy_path", "")),
            build_command=_build_agy,
            make_parser=agy_parser_cls,
        ),
        "claude": EngineSpec(
            engine_id="claude",
            label="Claude Code CLI (claude)",
            desc="可选引擎 · 检测到本机 Claude Code CLI 后可直接驱动",
            install_hint="npm install -g @anthropic-ai/claude-code",
            finder=lambda s: _which_any(
                ["claude", "claude.exe", "claude.cmd"],
                [appdata_npm / "claude.cmd", home / ".local" / "bin" / "claude.exe"],
            ),
            build_command=_build_claude,
            make_parser=ClaudeStreamParser,
        ),
        "codex": EngineSpec(
            engine_id="codex",
            label="OpenAI Codex CLI (codex)",
            desc="可选引擎 · 检测到本机 Codex CLI 后支持 JSONL 流式执行",
            install_hint="npm install -g @openai/codex",
            finder=lambda s: _which_any(
                ["codex", "codex.exe", "codex.cmd"],
                [appdata_npm / "codex.cmd"],
            ),
            build_command=_build_codex,
            make_parser=CodexStreamParser,
        ),
        "gemini": EngineSpec(
            engine_id="gemini",
            label="Gemini CLI (gemini)",
            desc="可选引擎 · 检测到本机 Gemini CLI 后支持流式输出",
            install_hint="npm install -g @google/gemini-cli",
            finder=lambda s: _which_any(
                ["gemini", "gemini.exe", "gemini.cmd"],
                [appdata_npm / "gemini.cmd"],
            ),
            build_command=_build_gemini,
            make_parser=GeminiStreamParser,
        ),
    }


def list_engines_status(
    registry: Dict[str, EngineSpec],
    settings: Dict[str, Any],
) -> List[Dict[str, Any]]:
    active = settings.get("cli_engine") or "agy"
    if active not in registry:
        active = "agy"
    items: List[Dict[str, Any]] = []
    for eid, spec in registry.items():
        bin_path = spec.finder(settings)
        items.append(
            {
                "id": eid,
                "label": spec.label,
                "desc": spec.desc,
                "install_hint": spec.install_hint,
                "installed": bool(bin_path),
                "path": bin_path or "",
                "active": eid == active,
            }
        )
    return items
