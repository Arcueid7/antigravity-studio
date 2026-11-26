# -*- coding: utf-8 -*-
"""CLI binary discovery, model/usage queries, NDJSON parser, and streaming runners."""

from __future__ import annotations

import json
import os
import queue
import shutil
import subprocess
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional, Tuple

from backend.config import (
    ACTIVE_LOCK,
    ACTIVE_PROCESSES,
    MODELS_CACHE,
    UPLOAD_DIR,
    USAGE_CACHE,
    USAGE_LOCK,
    _safe_is_file,
    load_settings,
)
from backend.engines import build_engine_registry

def find_agy_binary(custom_path: str = "") -> Optional[str]:
    """Locate the `agy` CLI executable across PATH and common install locations."""
    if custom_path:
        expanded = os.path.expandvars(os.path.expanduser(custom_path.strip()))
        if _safe_is_file(Path(expanded)):
            return expanded
        resolved = shutil.which(expanded)
        if resolved:
            return resolved

    for name in ("agy", "agy.exe", "agy.cmd", "agy.bat"):
        found = shutil.which(name)
        if found:
            return found

    home = Path.home()
    local_app_data = Path(os.environ.get("LOCALAPPDATA", home / "AppData" / "Local"))
    candidates = [
        home / ".gemini" / "bin" / "agy.exe",
        home / ".gemini" / "antigravity" / "bin" / "agy.exe",
        home / ".antigravity" / "bin" / "agy.exe",
        home / ".antigravity" / "bin" / "agy",
        home / ".local" / "bin" / "agy.exe",
        home / ".local" / "bin" / "agy",
        local_app_data / "Programs" / "Antigravity" / "bin" / "agy.exe",
        local_app_data / "Programs" / "antigravity-cli" / "agy.exe",
        local_app_data / "Antigravity" / "bin" / "agy.exe",
        local_app_data / "antigravity-cli" / "bin" / "agy.exe",
    ]
    for candidate in candidates:
        if _safe_is_file(candidate):
            return str(candidate)
    return None


def fetch_agy_models(force: bool = False) -> List[Dict[str, str]]:
    """Query `agy models` and cache the parsed list in memory."""
    now = time.time()
    if not force and MODELS_CACHE["models"] and (now - MODELS_CACHE["fetched_at"] < 300):
        return MODELS_CACHE["models"]

    settings = load_settings()
    agy_bin = find_agy_binary(settings.get("agy_path", ""))
    discovered: List[Dict[str, str]] = []
    if agy_bin:
        try:
            res = subprocess.run(
                [agy_bin, "models"],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=18,
            )
            if res.returncode == 0 and res.stdout:
                for raw_ln in res.stdout.splitlines():
                    ln = raw_ln.strip()
                    if not ln or ln.lower().startswith(("fetching", "available", "model", "---", "===")):
                        continue
                    if "\t" in ln:
                        slug, label = ln.split("\t", 1)
                        discovered.append({"id": slug.strip(), "label": label.strip()})
                    else:
                        parts = ln.split(None, 1)
                        slug = parts[0].strip()
                        label = parts[1].strip() if len(parts) > 1 else slug
                        discovered.append({"id": slug, "label": label})
        except Exception:
            pass
    if discovered:
        MODELS_CACHE["models"] = discovered
        MODELS_CACHE["fetched_at"] = now
    return discovered


def fetch_agy_usage(force: bool = False) -> Dict[str, Any]:
    """Query `agy -p /usage --output-format json` (0 tokens) and cache quota groups."""
    now = time.time()
    if not force and USAGE_CACHE["data"] is not None and (now - USAGE_CACHE["fetched_at"] < 60):
        return {
            "ok": True,
            "data": USAGE_CACHE["data"],
            "fetched_at": USAGE_CACHE["fetched_at"],
            "cached": True,
        }

    with USAGE_LOCK:
        now = time.time()
        if not force and USAGE_CACHE["data"] is not None and (now - USAGE_CACHE["fetched_at"] < 60):
            return {
                "ok": True,
                "data": USAGE_CACHE["data"],
                "fetched_at": USAGE_CACHE["fetched_at"],
                "cached": True,
            }

        settings = load_settings()
        agy_bin = find_agy_binary(settings.get("agy_path", ""))
        if not agy_bin:
            return {"ok": False, "error": "未检测到 agy.exe 可执行文件", "data": None}

        try:
            res = subprocess.run(
                [agy_bin, "-p", "/usage", "--output-format", "json"],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=35,
            )
            if res.returncode == 0 and res.stdout:
                raw_out = res.stdout.strip()
                # Extract JSON object even if extra diagnostic lines exist
                json_start = raw_out.find("{")
                if json_start != -1:
                    parsed = json.loads(raw_out[json_start:])
                    usage_data = (
                        (parsed.get("command") or {}).get("data")
                        or parsed.get("data")
                        or {"groups": [], "raw": parsed.get("response", "")}
                    )
                    USAGE_CACHE["data"] = usage_data
                    USAGE_CACHE["fetched_at"] = time.time()
                    USAGE_CACHE["error"] = ""
                    return {
                        "ok": True,
                        "data": usage_data,
                        "fetched_at": USAGE_CACHE["fetched_at"],
                        "cached": False,
                    }
            err_detail = (res.stderr or res.stdout or f"exit {res.returncode}").strip()[:300]
            USAGE_CACHE["error"] = err_detail
            return {"ok": False, "error": err_detail, "data": USAGE_CACHE["data"]}
        except Exception as exc:
            USAGE_CACHE["error"] = str(exc)
            return {"ok": False, "error": str(exc), "data": USAGE_CACHE["data"]}



class AgyStreamState:
    """Normalizes NDJSON events from `agy --output-format stream-json` into clean UI events."""

    def __init__(self) -> None:
        self.agy_conversation_id: Optional[str] = None
        self.emitted_any_text: bool = False
        self.seen_thought_by_step: Dict[Any, str] = {}
        self.seen_text_by_step: Dict[Any, str] = {}

    def _diff_cumulative(self, tracker: Dict[Any, str], key: Any, incoming: str) -> str:
        prev = tracker.get(key, "")
        if incoming.startswith(prev):
            delta = incoming[len(prev):]
            tracker[key] = incoming
            return delta
        tracker[key] = prev + incoming
        return incoming

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

        # 1. Capture conversation_id wherever present
        conv_id = (
            obj.get("conversation_id")
            or obj.get("session_id")
            or (isinstance(obj.get("init"), dict) and obj["init"].get("conversation_id"))
            or (isinstance(obj.get("step_update"), dict) and obj["step_update"].get("conversation_id"))
            or (isinstance(obj.get("result"), dict) and obj["result"].get("conversation_id"))
        )
        if conv_id and conv_id != self.agy_conversation_id:
            self.agy_conversation_id = str(conv_id)
            out.append({"type": "meta", "agy_conversation_id": self.agy_conversation_id})

        event = obj.get("event") or obj.get("type") or ""

        # 2. Init event
        if event == "init":
            init_body = obj.get("init") if isinstance(obj.get("init"), dict) else obj
            out.append(
                {
                    "type": "meta",
                    "agy_conversation_id": self.agy_conversation_id,
                    "model": init_body.get("model"),
                    "cwd": init_body.get("cwd"),
                }
            )
            return out

        # 3. Step update event
        if event == "step_update" or "step_update" in obj:
            su = obj.get("step_update") if isinstance(obj.get("step_update"), dict) else obj
            step_idx = su.get("step_index", "default")
            step_type = str(su.get("step_type") or su.get("type") or "").lower()
            state = str(su.get("state") or su.get("status") or "ACTIVE").upper()

            # 3a. Thinking / Reasoning deltas
            t_delta = su.get("thinking_delta") or su.get("thought_delta")
            if isinstance(t_delta, str) and t_delta:
                out.append({"type": "thinking_delta", "delta": t_delta})
            elif isinstance(su.get("thinking"), str) and su["thinking"]:
                delta = self._diff_cumulative(self.seen_thought_by_step, step_idx, su["thinking"])
                if delta:
                    out.append({"type": "thinking_delta", "delta": delta})
            elif step_type in ("agent_thought", "thought", "thinking") and isinstance(su.get("text_delta"), str):
                out.append({"type": "thinking_delta", "delta": su["text_delta"]})

            # 3b. Tool calls & tool results
            raw_tools: List[Dict[str, Any]] = []
            if isinstance(su.get("tool_call"), dict):
                raw_tools.append(su["tool_call"])
            elif isinstance(su.get("tool_calls"), list):
                raw_tools.extend(t for t in su["tool_calls"] if isinstance(t, dict))
            elif "tool" in step_type and (su.get("tool_name") or su.get("name")):
                raw_tools.append(su)

            for idx, tc in enumerate(raw_tools):
                tool_id = str(tc.get("id") or tc.get("call_id") or f"step-{step_idx}-{idx}")
                tool_name = str(tc.get("name") or tc.get("tool_name") or "tool")
                raw_args = (
                    tc.get("args")
                    or tc.get("arguments")
                    or tc.get("input")
                    or tc.get("tool_input")
                    or tc.get("parameters")
                    or tc.get("params")
                    or tc.get("args_json")
                    or su.get("args")
                    or su.get("arguments")
                    or su.get("input")
                    or su.get("parameters")
                )
                if isinstance(raw_args, str):
                    stripped = raw_args.strip()
                    if stripped.startswith("{") and stripped.endswith("}"):
                        try:
                            parsed_args = json.loads(stripped)
                            if isinstance(parsed_args, dict):
                                raw_args = parsed_args
                        except Exception:
                            pass
                tool_args: Any = raw_args if raw_args else {}
                if isinstance(tool_args, dict) and not tool_args:
                    harvested: Dict[str, Any] = {}
                    for k in (
                        "path", "Path", "file_path", "TargetFile", "AbsolutePath",
                        "command", "CommandLine", "cmd", "query", "Query", "pattern", "Pattern", "url", "Url",
                    ):
                        val = tc.get(k) or su.get(k)
                        if isinstance(val, str) and val.strip():
                            harvested[k] = val.strip()
                    if harvested:
                        tool_args = harvested

                summary_candidates = [
                    tc.get("summary"),
                    tc.get("toolSummary"),
                    tc.get("tool_summary"),
                    tc.get("description"),
                    tc.get("title"),
                    tc.get("label"),
                    su.get("summary"),
                    su.get("toolSummary"),
                    su.get("description"),
                    su.get("title"),
                    su.get("label"),
                ]
                if isinstance(tool_args, dict):
                    summary_candidates.extend(
                        [
                            tool_args.get("toolSummary"),
                            tool_args.get("Description"),
                            tool_args.get("focus"),
                        ]
                    )
                tool_summary = next(
                    (str(s).strip() for s in summary_candidates if isinstance(s, str) and s.strip()),
                    "",
                )
                tool_output = tc.get("output") or tc.get("result") or su.get("tool_output") or su.get("output")
                tool_state = str(tc.get("state") or tc.get("status") or state).upper()
                tool_payload: Dict[str, Any] = {
                    "id": tool_id,
                    "name": tool_name,
                    "args": tool_args,
                    "output": tool_output,
                    "status": tool_state,
                }
                if tool_summary:
                    tool_payload["summary"] = tool_summary
                out.append({"type": "tool_update", "tool": tool_payload})

            # 3c. Assistant text response deltas
            if step_type not in ("agent_thought", "thought", "thinking"):
                txt_delta = su.get("text_delta") or su.get("content_delta") or su.get("delta")
                if isinstance(txt_delta, str) and txt_delta:
                    self.emitted_any_text = True
                    out.append({"type": "text_delta", "delta": txt_delta})
                elif isinstance(su.get("text"), str) and su["text"]:
                    delta = self._diff_cumulative(self.seen_text_by_step, step_idx, su["text"])
                    if delta:
                        self.emitted_any_text = True
                        out.append({"type": "text_delta", "delta": delta})

            return out

        # 4. Terminal result event
        if event == "result" or "result" in obj:
            res = obj.get("result") if isinstance(obj.get("result"), dict) else obj
            if not self.emitted_any_text:
                final_txt = (
                    res.get("response")
                    or res.get("text")
                    or res.get("content")
                    or obj.get("response")
                    or obj.get("text")
                )
                if isinstance(final_txt, str) and final_txt:
                    self.emitted_any_text = True
                    out.append({"type": "text_delta", "delta": final_txt})

            if res.get("error") or obj.get("error"):
                err_msg = res.get("error") or obj.get("error")
                out.append({"type": "error", "message": str(err_msg)})

            out.append(
                {
                    "type": "result_meta",
                    "usage": res.get("usage") or obj.get("usage"),
                    "duration_ms": res.get("duration_ms") or obj.get("duration_ms"),
                    "agy_conversation_id": self.agy_conversation_id,
                }
            )
            return out

        # 5. Generic fallback
        if event == "error" or obj.get("error"):
            out.append({"type": "error", "message": str(obj.get("error") or obj.get("message") or obj)})
            return out

        generic_delta = obj.get("text_delta") or obj.get("delta") or obj.get("response")
        if isinstance(generic_delta, str) and generic_delta:
            self.emitted_any_text = True
            out.append({"type": "text_delta", "delta": generic_delta})

        return out


# ---------------------------------------------------------------------------
# Subprocess & Demo Streaming Runners (Pure Threaded Generators)
# ---------------------------------------------------------------------------

CAPABILITY_DIRECTIVES: Dict[str, str] = {
    "web_search": "【网页搜索模式】请优先使用 search_web / read_url_content 检索实时、最新公开资料，并在回答中附上信息来源链接。",
    "deep_research": "【深度研究模式】请执行多轮深度检索与交叉验证（综合运用 search_web、read_url_content 或本地分析工具），最后输出一份结构清晰、论据充分、带来源引用的详尽研究报告。",
    "create_image": "【创建图像模式】请优先调用内置 generate_image 工具为用户生成高质量图像，并在最终回复中使用 Markdown 图片语法 `![描述](保存后的完整本地路径)` 展示生成的图片；若当前环境暂不可用生图工具，则输出可直接在右侧 Artifact 面板预览的高品质 SVG / HTML 视觉作品。",
    "think_deeper": "【深度思考模式】请先对问题进行全面、严谨、多角度的逐步推理与边界检查，再给出透彻、结构化的高质量解答。",
    "study_socratic": "【学习模式·苏格拉底引导】你是一位耐心的导师。不要直接抛出最终答案，而是先评估学生当前理解，提出 1~2 个启发式小问题，循序渐进引导学生自己推导得出结论。",
    "study_explain": "【学习模式·概念精讲】请用清晰直白的类比、由浅入深的知识阶梯和具体例子讲解该主题，并在结尾附上 3 条核心要点回顾。",
    "study_quiz": "【学习模式·出题与测验】请围绕该主题出 3~5 道由易到难的互动练习题（先不直接揭晓答案，等待学生作答后逐题批改讲解）。",
    "study_paper": "【学习模式·论文与资料精读】请提炼该资料的核心研究问题、方法创新、关键推导/实验结论及局限性，用结构化读书笔记呈现。",
    "video_script": "【视频工坊·脚本与分镜】请为该主题编写专业的视频脚本与分镜表（包含景别/画面描述、旁白台词、节奏时长与配乐建议）。",
    "video_analyze": "【视频工坊·视频分析与纪要】请分析附加的视频/音频或链接内容，按时间轴梳理重点内容、核心结论与可复用的金句/行动项。",
    "video_motion": "【视频工坊·动态可视化演示】请生成一个完整的单文件 HTML/CSS/SVG 动态演示动画页面（带播放/暂停/进度控制），以便用户在右侧 Artifact 面板直接观看与交互。",
}


_ENGINE_REGISTRY_CACHE: Optional[Dict[str, Any]] = None


def get_engine_registry() -> Dict[str, Any]:
    global _ENGINE_REGISTRY_CACHE
    if _ENGINE_REGISTRY_CACHE is None:
        _ENGINE_REGISTRY_CACHE = build_engine_registry(find_agy_binary, AgyStreamState)
    return _ENGINE_REGISTRY_CACHE


def _build_carryover_recap(messages: List[Dict[str, Any]]) -> str:
    """Build a compact history recap after a fork/edit so the resumed CLI retains context."""
    prior = messages[:-1]  # Exclude the newly appended current user message
    if not prior:
        return ""
    lines = ["[以下是本次分支/编辑前的历史对话上下文，请基于此继续回答用户的最新消息]"]
    for m in prior[-10:]:
        role = "用户" if m.get("role") == "user" else "助手"
        txt = (m.get("content") or "").strip()
        if txt:
            if len(txt) > 900:
                txt = txt[:900] + "…"
            lines.append(f"{role}: {txt}")
    return "\n".join(lines)


def stream_agy_cli(
    conv: Dict[str, Any],
    prompt: str,
    settings: Dict[str, Any],
    attachments: Optional[List[Dict[str, Any]]] = None,
    capabilities: Optional[List[str]] = None,
    skill_directives: Optional[List[str]] = None,
) -> Iterator[Dict[str, Any]]:
    """Spawns the active CLI engine (`agy` primary, or optional `claude`/`codex`/`gemini`) and yields normalized SSE events."""
    registry = get_engine_registry()
    engine_id = (conv.get("engine") or settings.get("cli_engine") or "agy").strip().lower()
    if engine_id not in registry:
        engine_id = "agy"
    spec = registry[engine_id]
    cli_bin = spec.finder(settings)

    if not cli_bin:
        yield {
            "type": "error",
            "code": "AGY_NOT_FOUND" if engine_id == "agy" else "ENGINE_NOT_FOUND",
            "message": (
                f"未在系统 PATH 或常见目录中检测到 `{spec.label}` 可执行文件。\n"
                f"安装命令：`{spec.install_hint}`，"
                "或在左下角「设置 → 通用」中切换 CLI 引擎 / 指定路径；你也可以点击下方「体验 UI 演示流」预览完整的交互效果。"
            ),
        }
        return

    attachments = attachments or []
    capabilities = capabilities or []
    prefix_blocks: List[str] = []
    add_dirs: List[str] = []

    if conv.get("context_carryover"):
        recap = _build_carryover_recap(conv.get("messages") or [])
        if recap:
            prefix_blocks.append(recap)
        conv["context_carryover"] = False

    custom_inst = (settings.get("custom_instructions") or "").strip()
    if custom_inst:
        prefix_blocks.append(f"【用户全局自定义指令】\n{custom_inst}")

    for s_dir in (skill_directives or []):
        if s_dir and s_dir.strip():
            prefix_blocks.append(s_dir.strip())

    for cap in capabilities:
        directive = CAPABILITY_DIRECTIVES.get(cap)
        if directive:
            prefix_blocks.append(directive)

    if attachments:
        lines = ["[用户附加了以下本地文件/图片，请结合这些文件回答；如需查看请直接读取对应路径]"]
        for att in attachments:
            att_path = att.get("path") or ""
            att_name = att.get("name") or Path(att_path).name
            if att_path:
                lines.append(f"- {att_name}: {att_path}")
                try:
                    if str(Path(att_path).resolve()).startswith(str(UPLOAD_DIR.resolve())):
                        if str(UPLOAD_DIR) not in add_dirs:
                            add_dirs.append(str(UPLOAD_DIR))
                except OSError:
                    pass
        prefix_blocks.append("\n".join(lines))

    effective_prompt = ("\n\n".join(prefix_blocks) + "\n\n" + prompt) if prefix_blocks else prompt
    cmd: List[str] = spec.build_command(cli_bin, effective_prompt, conv, settings, add_dirs)

    cwd = conv.get("cwd") or settings.get("default_cwd") or str(Path.home())
    if not os.path.isdir(cwd):
        cwd = str(Path.home())

    yield {
        "type": "meta",
        "command": " ".join(cmd[:4]) + " ...",
        "cwd": cwd,
        "agy_path": cli_bin,
        "engine": engine_id,
    }

    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"

    try:
        proc = subprocess.Popen(
            cmd,
            cwd=cwd,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
            env=env,
        )
    except Exception as exc:
        yield {"type": "error", "message": f"启动 {engine_id} 进程失败: {exc}"}
        return

    conv_id = conv["id"]
    with ACTIVE_LOCK:
        ACTIVE_PROCESSES[conv_id] = proc

    q: "queue.Queue[Tuple[str, str]]" = queue.Queue()

    def _pump(pipe, tag: str) -> None:
        try:
            for line in iter(pipe.readline, ""):
                q.put((tag, line))
        except Exception as exc:
            q.put(("err", str(exc)))
        finally:
            q.put((f"{tag}_eof", ""))

    t_out = threading.Thread(target=_pump, args=(proc.stdout, "stdout"), daemon=True)
    t_err = threading.Thread(target=_pump, args=(proc.stderr, "stderr"), daemon=True)
    t_out.start()
    t_err.start()

    parser = spec.make_parser()
    eof_count = 0
    stderr_buffer: List[str] = []

    try:
        while eof_count < 2:
            tag, payload = q.get()
            if tag in ("stdout_eof", "stderr_eof"):
                eof_count += 1
                continue
            if tag == "stdout":
                for ev in parser.feed_line(payload):
                    yield ev
            elif tag == "stderr":
                cleaned = payload.strip()
                if cleaned:
                    stderr_buffer.append(cleaned)
                    yield {"type": "stderr", "line": cleaned}
    finally:
        with ACTIVE_LOCK:
            ACTIVE_PROCESSES.pop(conv_id, None)
        rc = proc.wait()
        if rc not in (0, None) and not parser.emitted_any_text:
            detail = "\n".join(stderr_buffer[-8:]) if stderr_buffer else f"进程退出码 {rc}"
            yield {"type": "error", "message": f"{engine_id} 执行异常 (exit {rc}):\n{detail}"}


def stream_demo_response(prompt: str, fast: bool = False) -> Iterator[Dict[str, Any]]:
    """Built-in interactive demo stream to preview Antigravity Studio Thinking, Tools, and Artifacts."""
    demo_conv_id = f"demo-{uuid.uuid4().hex[:8]}"
    yield {"type": "meta", "agy_conversation_id": demo_conv_id, "demo": True}

    thoughts = [
        "正在解析用户指令并检查工作区上下文...\n",
        f"收到输入：「{prompt[:60]}」。\n",
        "1. 模拟 `agy --output-format stream-json` 的 `step_update` 思考流（Extended Thinking）。\n",
        "2. 调用工具检查项目目录与自定义样式表 `custom.css`。\n",
        "3. 输出完整的衬线排版示例、代码高亮块与右侧可预览 Artifact 组件。",
    ]
    for line in thoughts:
        step = 12
        for i in range(0, len(line), step):
            yield {"type": "thinking_delta", "delta": line[i : i + step]}
            if not fast:
                time.sleep(0.025)

    yield {
        "type": "tool_update",
        "tool": {
            "id": "demo-tool-1",
            "name": "read_file",
            "args": {"path": "custom.css"},
            "status": "ACTIVE",
        },
    }
    if not fast:
        time.sleep(0.3)
    yield {
        "type": "tool_update",
        "tool": {
            "id": "demo-tool-1",
            "name": "read_file",
            "args": {"path": "custom.css"},
            "output": "Loaded user stylesheet (live hot-reload active).",
            "status": "DONE",
        },
    }

    yield {
        "type": "tool_update",
        "tool": {
            "id": "demo-tool-2",
            "name": "agy_cli_bridge",
            "args": {"flags": ["--output-format", "stream-json", "--conversation", demo_conv_id]},
            "status": "DONE",
            "output": "NDJSON stream connected · 0ms drop",
        },
    }
    if not fast:
        time.sleep(0.15)

    reply = """你好！当前正在运行 **Antigravity Studio (`agy` CLI)** 演示流。

这套前端桌面工作台融合了现代极简阅读与开发体验：

- **温暖羊皮纸色板（Pampas & Terracotta）**：浅色采用 `#FAF9F5` 暖白画布与 `#F3F1E9` 燕麦侧栏，深色采用 `#262624` 暖炭灰，搭配标志性的赤陶橙（`#C96442`）交互强调色。
- **人文衬线正文排版**：AI 回复采用与 Tiempos / Copernicus 气质一致的衬线字体（`16.5px` / `1.72` 行高），你的提问则包裹在圆润的暖沙色卡片中。
- **100% 自由注入 CSS**：点击右上角 **「Custom CSS」** 抽屉或直接编辑项目根目录下的 `custom.css` 文件，所有样式修改都会**自动热重载**生效。

### 快捷定制示例（可直接粘贴进 Custom CSS）

```css
/* 示例：微调正文行宽与标题色彩 */
:root {
  --chat-max-width: 820px;
}

.msg-assistant-prose h3 {
  color: var(--accent);
}
```

下面是一个可直接在右侧 **Artifact 面板**实时渲染预览的交互卡片示例：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <style>
    body {
      margin: 0;
      padding: 32px;
      background: #FAF9F5;
      color: #141413;
      font-family: Georgia, "Noto Serif SC", serif;
      display: flex;
      justify-content: center;
    }
    .card {
      max-width: 440px;
      width: 100%;
      background: #FFFFFF;
      border: 1px solid rgba(20, 20, 19, 0.1);
      border-radius: 20px;
      padding: 28px;
      box-shadow: 0 8px 30px rgba(20, 20, 19, 0.05);
    }
    .badge {
      display: inline-block;
      font-family: system-ui, sans-serif;
      font-size: 12px;
      color: #C96442;
      background: rgba(201, 100, 66, 0.1);
      padding: 4px 10px;
      border-radius: 999px;
      margin-bottom: 12px;
    }
    h2 { margin: 0 0 10px; font-weight: 500; }
    p { color: #5E5D59; line-height: 1.65; font-size: 15px; }
    button {
      margin-top: 12px;
      background: #C96442;
      color: #fff;
      border: none;
      border-radius: 10px;
      padding: 10px 18px;
      font-size: 14px;
      cursor: pointer;
    }
    button:hover { background: #B55434; }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">Artifact Preview</span>
    <h2>Antigravity Studio 已就绪</h2>
    <p>当你安装并登录 <code>agy</code> CLI 后，每一次提问都会通过本地子进程实时流式返回思考链路、工具执行与代码产物。</p>
    <button onclick="this.textContent = '交互正常 ✓ (' + new Date().toLocaleTimeString() + ')'">点击测试交互</button>
  </div>
</body>
</html>
```
"""

    # Stream in smooth chunks (~2.0s total on Windows 64Hz timer)
    step = 24
    for i in range(0, len(reply), step):
        yield {"type": "text_delta", "delta": reply[i : i + step]}
        if not fast:
            time.sleep(0.02)

