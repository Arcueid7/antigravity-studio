# -*- coding: utf-8 -*-
"""
Dedicated Skill Repository & On-Demand / Auto / Scheduled Dispatcher.
Stores managed skills in standard `SKILL.md` (YAML frontmatter + Markdown body)
under `<data_dir>/skills/<slug>/SKILL.md` and aggregates local Antigravity skills.
Pure Python stdlib — zero external dependencies.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


STARTER_SKILLS: List[Dict[str, Any]] = [
    {
        "slug": "code-architect",
        "name": "代码架构评审",
        "category": "工程开发",
        "description": "深度审查代码结构、边界条件、安全隐患与性能瓶颈，输出按优先级排序的重构方案。",
        "triggers": ["架构评审", "code review", "代码审查", "重构建议", "review", "架构优化"],
        "tags": ["architecture", "review", "refactor"],
        "enabled": True,
        "auto_dispatch": True,
        "pinned": True,
        "body": (
            "# 代码架构评审专家\n\n"
            "请以资深系统架构师视角审视当前代码或改动，按以下结构输出：\n"
            "1. **高优先级风险（P0）**：逻辑缺陷、并发竞争、安全越界、资源泄漏或数据损坏风险，附具体文件名与行号。\n"
            "2. **结构与可维护性（P1）**：耦合过重、职责不清、重复逻辑及可模块化拆分点。\n"
            "3. **性能与体验（P2）**：冗余计算、I/O 阻塞、内存占用或交互边界细节。\n"
            "4. **最小化落地修改建议**：给出可直接执行的改进步骤或补丁片段，避免泛泛而谈。\n"
        ),
    },
    {
        "slug": "bug-hunter",
        "name": "根因排错专家",
        "category": "工程开发",
        "description": "系统化定位报错堆栈与复现路径，先锁定根因再给出最小化精准修复补丁。",
        "triggers": ["报错", "排查", "debug", "bug", "traceback", "异常", "闪退", "为什么失败", "修复"],
        "tags": ["debug", "troubleshooting", "fix"],
        "enabled": True,
        "auto_dispatch": True,
        "pinned": True,
        "body": (
            "# 根因排错工作流\n\n"
            "面对报错、异常或非预期行为时，请严格遵循：\n"
            "1. **先读证据再下结论**：优先检查报错堆栈、触发路径和相关源码上下文，禁止猜测性盲改。\n"
            "2. **拆解根因链**：明确指出「表象 → 直接触发点 → 真正根因」。\n"
            "3. **最小化精准修复**：只修改根因涉及的最小范围，不顺带破坏无关功能。\n"
            "4. **验证与防回归**：说明如何复现验证修复生效，并指出同类边界条件是否一并覆盖。\n"
        ),
    },
    {
        "slug": "paper-digest",
        "name": "论文与技术精读",
        "category": "研究学习",
        "description": "按研究问题、核心创新、关键方法/实验与局限性提炼论文或长文档的结构化笔记。",
        "triggers": ["论文", "精读", "paper", "文献", "arxiv", "研报", "读书笔记"],
        "tags": ["research", "study", "paper"],
        "enabled": True,
        "auto_dispatch": True,
        "pinned": False,
        "body": (
            "# 论文与长文档精读模板\n\n"
            "请提炼核心脉络并输出结构化精读笔记：\n"
            "- **一句话核心贡献（TL;DR）**：解决什么痛点、核心思路是什么。\n"
            "- **研究动机与现有局限**：为什么旧方法不够好。\n"
            "- **核心方法拆解**：用通俗直觉 + 关键步骤/公式说明机制。\n"
            "- **关键实验结论**：核心指标对比与消融实验说明了什么。\n"
            "- **局限性与可借鉴启发**：有哪些边界限制，能如何迁移到实际工程中。\n"
        ),
    },
    {
        "slug": "git-release-notes",
        "name": "版本日志与 PR 生成",
        "category": "效率写作",
        "description": "根据工作区改动或提交历史自动整理规范的 Changelog、Commit 与 PR 说明。",
        "triggers": ["changelog", "发布日志", "发版说明", "release notes", "pr 描述", "提交说明"],
        "tags": ["git", "release", "writing"],
        "enabled": True,
        "auto_dispatch": True,
        "pinned": False,
        "body": (
            "# 版本变更日志 & PR 说明助手\n\n"
            "请梳理近期代码改动并按清晰分组生成中文文档：\n"
            "- **新增功能 (Features)**：面向用户价值的一句话描述。\n"
            "- **体验优化 (Improvements)**：性能、交互、视觉或稳定性改进。\n"
            "- **问题修复 (Fixes)**：已解决的缺陷与边界问题。\n"
            "- **验证清单 (Verification)**：列出关键回归检查点。\n"
        ),
    },
    {
        "slug": "ui-polish",
        "name": "界面美学打磨",
        "category": "设计前端",
        "description": "从视觉层级、留白节奏、配色对比度与微交互切入，给出可直接落地的 UI/CSS 精修建议。",
        "triggers": ["ui 优化", "界面美化", "排版", "配色", "css 调整", "视觉打磨", "美观"],
        "tags": ["design", "css", "ux"],
        "enabled": True,
        "auto_dispatch": False,
        "pinned": False,
        "body": (
            "# 界面美学与交互精修规范\n\n"
            "在设计或优化前端界面时请遵循：\n"
            "1. **呼吸感与克制**：减少冗余边框、多余工具栏和视觉噪音，突出核心内容区。\n"
            "2. **层级清晰**：通过字号、字重、语义色彩与留白拉开主次，兼顾浅色与深色模式对比度。\n"
            "3. **状态完整**：补全悬停、聚焦、禁用、加载中、空状态和窄屏自适应。\n"
            "4. **零破坏微调**：尽量复用现有 CSS 变量（`var(--accent)`、`var(--bg-surface)` 等），保持全套主题兼容。\n"
        ),
    },
    {
        "slug": "prompt-refiner",
        "name": "提示词工程优化",
        "category": "效率写作",
        "description": "将模糊想法转化为结构清晰、约束明确、可直接复用的高质量 Prompt 或 SKILL.md。",
        "triggers": ["优化提示词", "写 prompt", "润色 prompt", "设计 skill", "写一个 skill"],
        "tags": ["prompt", "skill", "productivity"],
        "enabled": True,
        "auto_dispatch": True,
        "pinned": False,
        "body": (
            "# 提示词与 Skill 设计专家\n\n"
            "请把用户的模糊需求转化为高质量、可直接复用的指令模板：\n"
            "1. 明确 **角色定位** 与 **目标产物**。\n"
            "2. 列出清晰的 **执行步骤** 与 **输出格式约束**。\n"
            "3. 补充关键 **边界限制 / 禁止事项** 防止跑偏。\n"
            "4. 若用户想沉淀为长期 Skill，直接给出标准 `SKILL.md`（含 YAML frontmatter 与触发词建议）。\n"
        ),
    },
]


def slugify_skill_name(raw: str) -> str:
    """Convert a name or slug into a clean filesystem-safe slug."""
    s = (raw or "").strip().lower()
    s = re.sub(r"[^a-z0-9_\-\u4e00-\u9fff]+", "-", s).strip("-_")
    if not s:
        return f"skill-{int(time.time()) % 100000}"
    # Prefer ASCII slug when mixed, keep CJK fallback safely
    return s[:48]


def _parse_list_val(val: str) -> List[str]:
    v = val.strip()
    if v.startswith("[") and v.endswith("]"):
        inner = v[1:-1].strip()
        if not inner:
            return []
        parts = [p.strip().strip('"').strip("'") for p in inner.split(",")]
        return [p for p in parts if p]
    parts = [p.strip().strip('"').strip("'") for p in re.split(r"[,，]+", v)]
    return [p for p in parts if p]


def _parse_bool_val(val: str, default: bool = True) -> bool:
    low = (val or "").strip().lower()
    if low in ("true", "yes", "1", "on"):
        return True
    if low in ("false", "no", "0", "off"):
        return False
    return default


def parse_skill_markdown(raw_text: str, fallback_slug: str = "skill") -> Dict[str, Any]:
    """Parse standard SKILL.md YAML frontmatter + Markdown body without PyYAML."""
    text = (raw_text or "").replace("\r\n", "\n")
    meta: Dict[str, Any] = {}
    body = text

    if text.startswith("---\n"):
        end_idx = text.find("\n---", 4)
        if end_idx != -1:
            fm_block = text[4:end_idx]
            body = text[end_idx + 4:].lstrip("\n")
            cur_list_key: Optional[str] = None
            for raw_ln in fm_block.splitlines():
                ln = raw_ln.rstrip()
                if not ln.strip() or ln.strip().startswith("#"):
                    continue
                if cur_list_key and re.match(r"^\s+-\s+(.+)$", ln):
                    item = re.sub(r"^\s+-\s+", "", ln).strip().strip('"').strip("'")
                    if item:
                        meta.setdefault(cur_list_key, []).append(item)
                    continue
                cur_list_key = None
                if ":" in ln:
                    k, v = ln.split(":", 1)
                    key = k.strip().lower()
                    val = v.strip()
                    if not val:
                        meta[key] = []
                        cur_list_key = key
                    elif key in ("triggers", "tags", "keywords"):
                        meta[key] = _parse_list_val(val)
                    elif key in ("enabled", "auto_dispatch", "pinned"):
                        meta[key] = _parse_bool_val(val, True)
                    else:
                        meta[key] = val.strip('"').strip("'")

    # Derive description from first non-heading line if absent
    desc = str(meta.get("description") or "").strip()
    if not desc:
        for ln in body.splitlines():
            clean = ln.strip().lstrip("#").strip()
            if clean:
                desc = clean[:140]
                break

    triggers = meta.get("triggers") or meta.get("keywords") or []
    if isinstance(triggers, str):
        triggers = _parse_list_val(triggers)
    tags = meta.get("tags") or []
    if isinstance(tags, str):
        tags = _parse_list_val(tags)

    return {
        "slug": fallback_slug,
        "name": str(meta.get("name") or fallback_slug).strip(),
        "description": desc,
        "category": str(meta.get("category") or "通用技能").strip() or "通用技能",
        "triggers": [str(x).strip() for x in triggers if str(x).strip()],
        "tags": [str(x).strip() for x in tags if str(x).strip()],
        "enabled": bool(meta.get("enabled", True)),
        "auto_dispatch": bool(meta.get("auto_dispatch", True)),
        "pinned": bool(meta.get("pinned", False)),
        "body": body.strip(),
        "raw": raw_text,
    }


def render_skill_markdown(skill: Dict[str, Any]) -> str:
    """Serialize a skill dictionary into clean standard SKILL.md text."""
    def _q(s: str) -> str:
        clean = str(s or "").replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ").strip()
        return f'"{clean}"'

    def _arr(items: List[str]) -> str:
        cleaned = [_q(str(x)) for x in (items or []) if str(x).strip()]
        return "[" + ", ".join(cleaned) + "]"

    lines = [
        "---",
        f"name: {_q(skill.get('name') or skill.get('slug') or 'Untitled Skill')}",
        f"description: {_q(skill.get('description') or '')}",
        f"category: {_q(skill.get('category') or '通用技能')}",
        f"triggers: {_arr(skill.get('triggers') or [])}",
        f"tags: {_arr(skill.get('tags') or [])}",
        f"enabled: {'true' if skill.get('enabled', True) else 'false'}",
        f"auto_dispatch: {'true' if skill.get('auto_dispatch', True) else 'false'}",
        f"pinned: {'true' if skill.get('pinned', False) else 'false'}",
        "---",
        "",
        (skill.get("body") or "").strip(),
        "",
    ]
    return "\n".join(lines)


class SkillRepository:
    """Manages Studio's Skill Repository (`data/skills/`) + local skill discovery + auto-dispatch."""

    def __init__(self, data_dir: Path) -> None:
        self.repo_dir = data_dir / "skills"
        self.meta_file = data_dir / "skills_meta.json"
        self.repo_dir.mkdir(parents=True, exist_ok=True)
        self._ensure_seeded()

    def _load_meta(self) -> Dict[str, Any]:
        if self.meta_file.is_file():
            try:
                return json.loads(self.meta_file.read_text(encoding="utf-8"))
            except Exception:
                pass
        return {"seeded": False, "usage_counts": {}, "overrides": {}}

    def _save_meta(self, meta: Dict[str, Any]) -> None:
        self.meta_file.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    def _ensure_seeded(self) -> None:
        meta = self._load_meta()
        if meta.get("seeded"):
            return
        # Seed curated starter skills once on initial setup
        existing = [d for d in self.repo_dir.iterdir() if d.is_dir() and (d / "SKILL.md").is_file()]
        if not existing:
            for item in STARTER_SKILLS:
                sdir = self.repo_dir / item["slug"]
                sdir.mkdir(parents=True, exist_ok=True)
                (sdir / "SKILL.md").write_text(render_skill_markdown(item), encoding="utf-8")
        meta["seeded"] = True
        self._save_meta(meta)

    def _skill_md_path(self, slug: str) -> Path:
        safe = slugify_skill_name(slug)
        return self.repo_dir / safe / "SKILL.md"

    def record_usage(self, skill_ids: List[str]) -> None:
        if not skill_ids:
            return
        meta = self._load_meta()
        counts = meta.setdefault("usage_counts", {})
        last_used = meta.setdefault("last_used", {})
        now = time.time()
        for sid in skill_ids:
            counts[sid] = int(counts.get(sid, 0)) + 1
            last_used[sid] = now
        self._save_meta(meta)

    def _read_skill_dir(
        self,
        skill_dir: Path,
        source: str,
        scope_label: str,
        editable: bool,
        meta: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        md = skill_dir / "SKILL.md"
        if not md.is_file():
            return None
        try:
            raw = md.read_text(encoding="utf-8", errors="replace")
            st = md.stat()
        except OSError:
            return None
        slug = skill_dir.name
        parsed = parse_skill_markdown(raw, fallback_slug=slug)
        skill_id = f"{source}:{slug}"
        overrides = (meta.get("overrides") or {}).get(skill_id) or {}
        if not editable and overrides:
            if "enabled" in overrides:
                parsed["enabled"] = bool(overrides["enabled"])
            if "auto_dispatch" in overrides:
                parsed["auto_dispatch"] = bool(overrides["auto_dispatch"])
            if "pinned" in overrides:
                parsed["pinned"] = bool(overrides["pinned"])
        parsed.update(
            {
                "id": skill_id,
                "slug": slug,
                "source": source,
                "scope_label": scope_label,
                "editable": editable,
                "path": str(md),
                "updated_at": st.st_mtime,
                "usage_count": int((meta.get("usage_counts") or {}).get(skill_id, 0)),
                "last_used": float((meta.get("last_used") or {}).get(skill_id, 0)),
            }
        )
        return parsed

    def list_skills(self, cwd_str: str = "", include_body: bool = False) -> List[Dict[str, Any]]:
        """List all Studio repository skills plus discovered workspace/global skills."""
        meta = self._load_meta()
        items: List[Dict[str, Any]] = []
        seen_slugs = set()

        # 1. Studio managed repository (highest priority, fully editable)
        try:
            for d in sorted(self.repo_dir.iterdir(), key=lambda p: p.name.lower()):
                if not d.is_dir():
                    continue
                sk = self._read_skill_dir(d, "repo", "我的仓库", True, meta)
                if sk:
                    seen_slugs.add(sk["slug"].lower())
                    items.append(sk)
        except OSError:
            pass

        # 2. Workspace local `.agents/skills`
        if cwd_str:
            ws_skills = Path(cwd_str) / ".agents" / "skills"
            if ws_skills.is_dir():
                try:
                    for d in sorted(ws_skills.iterdir(), key=lambda p: p.name.lower()):
                        if not d.is_dir():
                            continue
                        sk = self._read_skill_dir(d, "workspace", "当前工作区", False, meta)
                        if sk:
                            items.append(sk)
                except OSError:
                    pass

        # 3. User global `~/.gemini/config/skills` & `~/.gemini/antigravity/skills`
        home = Path.home()
        for src_id, label, root in (
            ("global", "全局配置", home / ".gemini" / "config" / "skills"),
            ("antigravity", "Antigravity 本地", home / ".gemini" / "antigravity" / "skills"),
        ):
            if root.is_dir():
                try:
                    for d in sorted(root.iterdir(), key=lambda p: p.name.lower()):
                        if not d.is_dir():
                            continue
                        sk = self._read_skill_dir(d, src_id, label, False, meta)
                        if sk:
                            items.append(sk)
                except OSError:
                    pass

        # Sort: pinned first, then repo before external, then usage desc, then name
        items.sort(
            key=lambda x: (
                0 if x.get("pinned") else 1,
                0 if x.get("source") == "repo" else 1,
                -int(x.get("usage_count") or 0),
                x.get("name", "").lower(),
            )
        )

        if not include_body:
            slim: List[Dict[str, Any]] = []
            for it in items:
                copy = dict(it)
                copy["preview"] = (copy.get("body") or "")[:260]
                copy.pop("raw", None)
                slim.append(copy)
            return slim
        return items

    def get_skill(self, skill_id_or_slug: str, cwd_str: str = "") -> Optional[Dict[str, Any]]:
        key = (skill_id_or_slug or "").strip()
        if not key:
            return None
        all_items = self.list_skills(cwd_str=cwd_str, include_body=True)
        for it in all_items:
            if it["id"] == key or it["slug"].lower() == key.lower():
                return it
        return None

    def upsert_skill(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Create or update a managed skill in `<data_dir>/skills/<slug>/SKILL.md`."""
        name = (data.get("name") or "").strip()
        raw_slug = (data.get("slug") or name or "").strip()
        if not name and not raw_slug:
            return {"ok": False, "error": "Skill 名称不能为空"}
        slug = slugify_skill_name(raw_slug)
        if not name:
            name = slug

        raw_md = data.get("raw_markdown")
        if isinstance(raw_md, str) and raw_md.strip():
            parsed = parse_skill_markdown(raw_md, fallback_slug=slug)
            if not data.get("slug") and parsed.get("name"):
                slug = slugify_skill_name(parsed["name"])
            md_text = raw_md.strip() + "\n"
        else:
            triggers = data.get("triggers")
            if isinstance(triggers, str):
                triggers = _parse_list_val(triggers)
            tags = data.get("tags")
            if isinstance(tags, str):
                tags = _parse_list_val(tags)
            skill_obj = {
                "slug": slug,
                "name": name,
                "description": (data.get("description") or "").strip(),
                "category": (data.get("category") or "通用技能").strip() or "通用技能",
                "triggers": triggers or [],
                "tags": tags or [],
                "enabled": bool(data.get("enabled", True)),
                "auto_dispatch": bool(data.get("auto_dispatch", True)),
                "pinned": bool(data.get("pinned", False)),
                "body": (data.get("body") or "").strip(),
            }
            if not skill_obj["body"]:
                return {"ok": False, "error": "Skill 指令正文不能为空"}
            md_text = render_skill_markdown(skill_obj)

        # If renaming an existing managed skill slug, remove old dir cleanly
        orig_slug = (data.get("original_slug") or "").strip()
        if orig_slug and orig_slug != slug:
            old_dir = self.repo_dir / slugify_skill_name(orig_slug)
            if old_dir.is_dir() and str(old_dir.resolve()).startswith(str(self.repo_dir.resolve())):
                shutil.rmtree(old_dir, ignore_errors=True)

        target_dir = self.repo_dir / slug
        target_dir.mkdir(parents=True, exist_ok=True)
        (target_dir / "SKILL.md").write_text(md_text, encoding="utf-8")

        saved = self.get_skill(f"repo:{slug}")
        return {"ok": True, "skill": saved}

    def toggle_skill_flags(self, skill_id: str, updates: Dict[str, Any], cwd_str: str = "") -> Dict[str, Any]:
        """Toggle enabled / auto_dispatch / pinned flags for repo or external skills."""
        sk = self.get_skill(skill_id, cwd_str=cwd_str)
        if not sk:
            return {"ok": False, "error": "未找到该 Skill"}

        if sk["editable"]:
            for flag in ("enabled", "auto_dispatch", "pinned"):
                if flag in updates:
                    sk[flag] = bool(updates[flag])
            md_text = render_skill_markdown(sk)
            Path(sk["path"]).write_text(md_text, encoding="utf-8")
        else:
            meta = self._load_meta()
            ov = meta.setdefault("overrides", {}).setdefault(sk["id"], {})
            for flag in ("enabled", "auto_dispatch", "pinned"):
                if flag in updates:
                    ov[flag] = bool(updates[flag])
            self._save_meta(meta)

        return {"ok": True, "skill": self.get_skill(sk["id"], cwd_str=cwd_str)}

    def delete_skill(self, slug_or_id: str) -> Dict[str, Any]:
        slug = slug_or_id.split(":", 1)[1] if ":" in slug_or_id else slug_or_id
        safe = slugify_skill_name(slug)
        target_dir = (self.repo_dir / safe).resolve()
        if not str(target_dir).startswith(str(self.repo_dir.resolve())) or not target_dir.is_dir():
            return {"ok": False, "error": "仅支持删除「我的仓库」中托管的 Skill"}
        shutil.rmtree(target_dir, ignore_errors=True)
        return {"ok": True, "deleted": safe}

    def import_skill(
        self,
        url: str = "",
        local_path: str = "",
        raw_markdown: str = "",
        slug_override: str = "",
    ) -> Dict[str, Any]:
        """Import a SKILL.md from raw markdown, local file/folder, or GitHub URL."""
        content = ""
        inferred_slug = slug_override.strip()

        if raw_markdown and raw_markdown.strip():
            content = raw_markdown.strip()
        elif local_path and local_path.strip():
            p = Path(os.path.expandvars(os.path.expanduser(local_path.strip())))
            if p.is_dir():
                if not inferred_slug:
                    inferred_slug = p.name
                p = p / "SKILL.md"
            elif not inferred_slug:
                inferred_slug = p.parent.name if p.name.upper() == "SKILL.MD" else p.stem
            if not p.is_file():
                return {"ok": False, "error": f"找不到文件：{p}"}
            content = p.read_text(encoding="utf-8", errors="replace")
        elif url and url.strip():
            fetch_url = url.strip()
            # Convert github.com/.../blob/... -> raw.githubusercontent.com/...
            m = re.match(r"^https?://github\.com/([^/]+)/([^/]+)/blob/([^/]+)/(.+)$", fetch_url)
            if m:
                fetch_url = f"https://raw.githubusercontent.com/{m.group(1)}/{m.group(2)}/{m.group(3)}/{m.group(4)}"
            if not inferred_slug:
                parts = [x for x in urllib.parse.urlsplit(fetch_url).path.split("/") if x]
                if len(parts) >= 2 and parts[-1].upper() == "SKILL.MD":
                    inferred_slug = parts[-2]
                elif parts:
                    inferred_slug = Path(parts[-1]).stem
            req = urllib.request.Request(fetch_url, headers={"User-Agent": "Antigravity-Studio/1.0"})
            try:
                with urllib.request.urlopen(req, timeout=16) as resp:
                    raw_b = resp.read(512 * 1024)
                    content = raw_b.decode("utf-8", errors="replace")
            except Exception as exc:
                return {"ok": False, "error": f"拉取远程 Skill 失败：{exc}"}
        else:
            return {"ok": False, "error": "请提供 SKILL.md 正文、本地路径或 GitHub 链接"}

        parsed = parse_skill_markdown(content, fallback_slug=inferred_slug or "imported-skill")
        final_slug = slugify_skill_name(inferred_slug or parsed.get("name") or "imported-skill")
        parsed["slug"] = final_slug
        return self.upsert_skill(
            {
                "slug": final_slug,
                "name": parsed["name"],
                "description": parsed["description"],
                "category": parsed["category"],
                "triggers": parsed["triggers"],
                "tags": parsed["tags"],
                "enabled": True,
                "auto_dispatch": parsed["auto_dispatch"],
                "pinned": parsed["pinned"],
                "body": parsed["body"] or content,
            }
        )

    def sync_skill_to_agy(self, slug_or_id: str, target: str = "global", cwd_str: str = "") -> Dict[str, Any]:
        """Export a repository skill into `~/.gemini/config/skills/` or `<workspace>/.agents/skills/`."""
        sk = self.get_skill(slug_or_id, cwd_str=cwd_str)
        if not sk:
            return {"ok": False, "error": "未找到该 Skill"}
        if target == "workspace":
            if not cwd_str or not Path(cwd_str).is_dir():
                return {"ok": False, "error": "当前工作区目录无效"}
            dest_root = Path(cwd_str) / ".agents" / "skills"
        else:
            dest_root = Path.home() / ".gemini" / "config" / "skills"
        dest_dir = dest_root / slugify_skill_name(sk["slug"])
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest_md = dest_dir / "SKILL.md"
        dest_md.write_text(render_skill_markdown(sk), encoding="utf-8")
        return {"ok": True, "path": str(dest_md), "target": target}

    # -----------------------------------------------------------------------
    # Skill Dispatcher: Explicit Selection + `/slug` Detection + Auto Routing
    # -----------------------------------------------------------------------

    def dispatch_for_prompt(
        self,
        prompt: str,
        explicit_skill_ids: Optional[List[str]] = None,
        auto_dispatch: bool = True,
        cwd_str: str = "",
        max_auto: int = 2,
    ) -> Dict[str, Any]:
        """
        Resolve all skills to apply for a user prompt:
        1. Explicit skill IDs pinned by user in UI or scheduled task.
        2. Inline `/slug` slash invocations at the start of the prompt.
        3. Automatic zero-token trigger/keyword routing across enabled auto_dispatch skills.
        """
        all_skills = self.list_skills(cwd_str=cwd_str, include_body=True)
        by_id = {s["id"]: s for s in all_skills}
        by_slug = {s["slug"].lower(): s for s in all_skills}

        chosen: List[Dict[str, Any]] = []
        chosen_ids = set()

        def _add(sk: Dict[str, Any], reason: str, matched_terms: Optional[List[str]] = None, score: int = 100) -> None:
            if sk["id"] in chosen_ids:
                return
            chosen_ids.add(sk["id"])
            chosen.append(
                {
                    "id": sk["id"],
                    "slug": sk["slug"],
                    "name": sk["name"],
                    "category": sk.get("category", ""),
                    "description": sk.get("description", ""),
                    "body": sk.get("body", ""),
                    "reason": reason,
                    "matched_terms": matched_terms or [],
                    "score": score,
                }
            )

        # 1. Explicit IDs from UI pills or scheduled tasks
        for sid in (explicit_skill_ids or []):
            sk = by_id.get(sid) or by_slug.get(str(sid).lower())
            if sk:
                _add(sk, "manual")

        # 2. Inline `/slug` commands inside prompt (e.g. `/code-architect 请检查 server.py`)
        cleaned_prompt = prompt or ""
        slash_matches = re.findall(r"(?:^|\s)/([a-zA-Z0-9_\-\u4e00-\u9fff]{2,48})(?=\s|$)", cleaned_prompt)
        for token in slash_matches:
            sk = by_slug.get(token.lower())
            if sk:
                _add(sk, "slash", [f"/{token}"])
                cleaned_prompt = re.sub(rf"(^|\s)/{re.escape(token)}(?=\s|$)", r"\1", cleaned_prompt, count=1).strip()

        # 3. Auto-dispatch matching by trigger phrases, tags, and name
        if auto_dispatch and cleaned_prompt.strip():
            low_prompt = cleaned_prompt.lower()
            candidates: List[Tuple[int, List[str], Dict[str, Any]]] = []
            for sk in all_skills:
                if sk["id"] in chosen_ids:
                    continue
                if not sk.get("enabled", True) or not sk.get("auto_dispatch", False):
                    continue
                score = 0
                hits: List[str] = []
                for trig in sk.get("triggers") or []:
                    t = trig.strip().lower()
                    if not t:
                        continue
                    if t in low_prompt:
                        # Longer exact phrases get stronger weight
                        score += 12 if len(t) >= 4 else 8
                        hits.append(trig.strip())
                for tag in sk.get("tags") or []:
                    tg = tag.strip().lower()
                    if len(tg) >= 3 and re.search(rf"(?<![a-z0-9]){re.escape(tg)}(?![a-z0-9])", low_prompt):
                        score += 5
                        if tag.strip() not in hits:
                            hits.append(tag.strip())
                sname = (sk.get("name") or "").strip().lower()
                if len(sname) >= 3 and sname in low_prompt:
                    score += 14
                    hits.append(sk["name"])

                if score >= 8:
                    candidates.append((score, hits, sk))

            candidates.sort(key=lambda item: (-item[0], -int(item[2].get("usage_count") or 0)))
            for sc, hits, sk in candidates[:max_auto]:
                _add(sk, "auto", hits, sc)

        # Build clean directive blocks for CLI prompt injection
        directive_blocks: List[str] = []
        for sk in chosen:
            if sk["body"]:
                mode_tag = {"manual": "用户指定", "slash": "斜杠调用", "auto": "自动调度"}.get(sk["reason"], "调度")
                directive_blocks.append(f"【Skill 调度 · {sk['name']} ({mode_tag})】\n{sk['body']}")

        return {
            "skills": [
                {
                    "id": s["id"],
                    "slug": s["slug"],
                    "name": s["name"],
                    "category": s["category"],
                    "reason": s["reason"],
                    "matched_terms": s["matched_terms"],
                    "score": s["score"],
                }
                for s in chosen
            ],
            "directive_blocks": directive_blocks,
            "cleaned_prompt": cleaned_prompt or prompt,
        }
