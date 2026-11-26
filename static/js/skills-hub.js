/* ==========================================================================
   Antigravity Studio — Dedicated Skill Repository & Dispatcher Controller
   Handles Skill CRUD, Import, Sync, Auto-Dispatch Router Tester,
   Composer `/` Slash Autocomplete, Active Skill Pills, and Schedule Binding.
   ========================================================================== */

import { escapeHtml } from './markdown-utils.js';

const ICON_BOLT_13 =
  '<svg class="ui-line-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>';
const ICON_CLOCK_13 =
  '<svg class="ui-line-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>';
const ICON_PIN_OUTLINE =
  '<svg class="ui-line-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>';

export function createSkillsHubController({
  getActiveCwd,
  getAutoDispatchEnabled,
  onToggleAutoDispatch,
  onUseSkillInChat,
  onScheduleSkill,
  composerInput,
  composerCard,
  activeSkillPillsEl,
  slashMenuEl,
  schedSkillSelectEl,
  showToast,
}) {
  const $ = (id) => document.getElementById(id);

  let skills = [];
  let filterMode = 'all'; // 'all' | 'repo' | 'external' | 'auto' | 'disabled'
  let searchQuery = '';
  let activeSkillIds = new Set(); // Mounted skills for next chat turn

  // Editor modal state
  let editingOriginalSlug = '';

  const gridEl = $('skills-repo-grid');
  const countMetaEl = $('skills-repo-meta');
  const searchInputEl = $('skills-search-input');
  const autoToggleEl = $('toggle-auto-dispatch-skills');
  const routerTestInput = $('skill-router-test-input');
  const routerTestBtn = $('btn-skill-router-test');
  const routerTestResult = $('skill-router-test-result');

  // Editor modal elements
  const editorModal = $('skill-editor-modal');
  const editorTitle = $('skill-editor-title');
  const edName = $('skill-ed-name');
  const edSlug = $('skill-ed-slug');
  const edCategory = $('skill-ed-category');
  const edDesc = $('skill-ed-desc');
  const edTriggers = $('skill-ed-triggers');
  const edTags = $('skill-ed-tags');
  const edEnabled = $('skill-ed-enabled');
  const edAuto = $('skill-ed-auto');
  const edPinned = $('skill-ed-pinned');
  const edBody = $('skill-ed-body');
  const edStatus = $('skill-ed-status');
  const edSaveBtn = $('btn-skill-ed-save');

  // Import modal elements
  const importModal = $('skill-import-modal');
  const impUrl = $('skill-imp-url');
  const impPath = $('skill-imp-path');
  const impRaw = $('skill-imp-raw');
  const impSlug = $('skill-imp-slug');
  const impStatus = $('skill-imp-status');
  const impSubmitBtn = $('btn-skill-imp-submit');

  const getSkillById = (id) => skills.find((s) => s.id === id || s.slug === id) || null;

  // -------------------------------------------------------------------------
  // Active Mounted Skill Pills inside Chat Composer
  // -------------------------------------------------------------------------

  const renderActiveSkillPills = () => {
    if (!activeSkillPillsEl) return;
    activeSkillPillsEl.innerHTML = '';
    for (const sid of activeSkillIds) {
      const sk = getSkillById(sid);
      if (!sk) continue;
      const pill = document.createElement('span');
      pill.className = 'cap-pill skill-mounted-pill';
      pill.title = `${sk.name} (/${sk.slug}) — 本轮对话将显式调度此 Skill`;
      pill.innerHTML = `
        <span class="skill-pill-inner">${ICON_BOLT_13}<span>${escapeHtml(sk.name)}</span></span>
        <button type="button" class="cap-pill-x" data-unmount-skill="${escapeHtml(sk.id)}" title="取消挂载">×</button>
      `;
      pill.querySelector('[data-unmount-skill]').addEventListener('click', (e) => {
        e.stopPropagation();
        activeSkillIds.delete(sk.id);
        renderActiveSkillPills();
      });
      activeSkillPillsEl.appendChild(pill);
    }
  };

  const mountSkill = (skillId, silent = false) => {
    const sk = getSkillById(skillId);
    if (!sk) return;
    activeSkillIds.add(sk.id);
    renderActiveSkillPills();
    if (!silent && showToast) {
      showToast(`已挂载 Skill「${sk.name}」，发送消息即可生效`, { duration: 2400 });
    }
  };

  const clearMountedSkills = () => {
    if (!activeSkillIds.size) return;
    activeSkillIds.clear();
    renderActiveSkillPills();
  };

  const getMountedSkillIds = () => Array.from(activeSkillIds);

  // -------------------------------------------------------------------------
  // Schedule Dropdown Sync (`已排定` Skill Binding)
  // -------------------------------------------------------------------------

  const syncScheduleSkillSelect = () => {
    if (!schedSkillSelectEl) return;
    const prev = schedSkillSelectEl.value;
    schedSkillSelectEl.innerHTML = '<option value="">不绑定特定 Skill（走默认或自动调度）</option>';
    for (const sk of skills) {
      if (!sk.enabled) continue;
      const opt = document.createElement('option');
      opt.value = sk.id;
      opt.textContent = `${sk.name} (/${sk.slug})`;
      opt.dataset.skillName = sk.name || '';
      opt.dataset.skillSlug = sk.slug || '';
      opt.dataset.skillCat = sk.category || '';
      if (sk.id === prev) opt.selected = true;
      schedSkillSelectEl.appendChild(opt);
    }
    schedSkillSelectEl.dispatchEvent(new CustomEvent('studio:sync-options'));
  };

  // -------------------------------------------------------------------------
  // Load & Render Skill Repository Grid
  // -------------------------------------------------------------------------

  const loadSkills = async (silent = false) => {
    try {
      const cwd = getActiveCwd ? getActiveCwd() : '';
      const res = await fetch(`/api/skills?cwd=${encodeURIComponent(cwd || '')}`);
      const data = await res.json();
      skills = data.skills || [];
      if (autoToggleEl && typeof data.auto_dispatch_skills === 'boolean') {
        autoToggleEl.checked = data.auto_dispatch_skills;
      }
      if (countMetaEl) {
        const repoCnt = skills.filter((s) => s.source === 'repo').length;
        const autoCnt = skills.filter((s) => s.enabled && s.auto_dispatch).length;
        countMetaEl.innerHTML = `
          <span class="skill-meta-chip">共 <strong>${skills.length}</strong> 个 Skill</span>
          <span class="skill-meta-dot">·</span>
          <span class="skill-meta-chip">仓库托管 <strong>${repoCnt}</strong></span>
          <span class="skill-meta-dot">·</span>
          <span class="skill-meta-chip">自动调度就绪 <strong>${autoCnt}</strong></span>
        `;
      }
      renderSkillsGrid();
      renderActiveSkillPills();
      syncScheduleSkillSelect();
    } catch (err) {
      if (!silent && gridEl) {
        gridEl.innerHTML = `
          <div class="feature-card feature-state-card is-error" style="grid-column:1/-1;">
            <div class="feature-state-title">暂时无法连接到本地 Skill 仓库</div>
            <div class="feature-state-desc">${escapeHtml(err.message || '网络请求失败')}，请确认本地后端服务正在运行后重试。</div>
            <button type="button" class="topbar-pill-btn" data-sk-retry="1">重新加载</button>
          </div>
        `;
        const retryBtn = gridEl.querySelector('[data-sk-retry]');
        if (retryBtn) retryBtn.addEventListener('click', () => loadSkills(false));
      }
    }
  };

  const renderSkillsGrid = () => {
    if (!gridEl) return;
    const q = (searchQuery || '').trim().toLowerCase();
    const filtered = skills.filter((sk) => {
      if (filterMode === 'repo' && sk.source !== 'repo') return false;
      if (filterMode === 'external' && sk.source === 'repo') return false;
      if (filterMode === 'auto' && !(sk.enabled && sk.auto_dispatch)) return false;
      if (filterMode === 'disabled' && sk.enabled) return false;
      if (q) {
        const hay = [
          sk.name,
          sk.slug,
          sk.description,
          sk.category,
          ...(sk.triggers || []),
          ...(sk.tags || []),
        ]
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      }
      return true;
    });

    gridEl.innerHTML = '';
    if (!filtered.length) {
      gridEl.innerHTML = `
        <div class="feature-card" style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:34px;">
          ${q ? '没有匹配该关键词的 Skill。' : '当前筛选下暂无 Skill，可点击右上角「+ 新建 Skill」或「导入 Skill」添加。'}
        </div>
      `;
      return;
    }

    for (const sk of filtered) {
      const card = document.createElement('div');
      card.className = 'skill-card' + (!sk.enabled ? ' is-disabled' : '') + (sk.pinned ? ' is-pinned' : '');

      const triggersHtml = (sk.triggers || [])
        .slice(0, 6)
        .map((t) => `<span class="skill-trigger-chip">${escapeHtml(t)}</span>`)
        .join('');

      const usageLabel = sk.usage_count > 0 ? `已调度 ${sk.usage_count} 次` : '尚未调度';

      card.innerHTML = `
        <div class="skill-card-head">
          <div class="skill-card-title-wrap">
            <div class="skill-card-title-row">
              <span class="skill-card-name">${escapeHtml(sk.name)}</span>
              <code class="skill-slug-badge">/${escapeHtml(sk.slug)}</code>
            </div>
            <div class="skill-card-meta-row">
              <span class="skill-scope-pill ${sk.source === 'repo' ? 'repo' : 'ext'}">${escapeHtml(sk.scope_label || sk.source)}</span>
              <span class="skill-cat-pill">${escapeHtml(sk.category || '通用技能')}</span>
              <span class="skill-usage-text">${escapeHtml(usageLabel)}</span>
            </div>
          </div>
          <button type="button" class="icon-btn skill-pin-btn ${sk.pinned ? 'active' : ''}" data-sk-pin="1" title="${sk.pinned ? '取消置顶' : '置顶此 Skill'}">${ICON_PIN_OUTLINE}</button>
        </div>

        <p class="skill-card-desc">${escapeHtml(sk.description || '（无描述）')}</p>

        ${triggersHtml ? `<div class="skill-triggers-row">${triggersHtml}</div>` : ''}

        <div class="skill-switches-row">
          <label class="skill-mini-toggle" title="启用后可通过 /${escapeHtml(sk.slug)} 或按钮调用">
            <input type="checkbox" class="skill-switch-input" data-sk-enabled="1" ${sk.enabled ? 'checked' : ''} />
            <span class="skill-switch-track" aria-hidden="true"></span>
            <span>启用</span>
          </label>
          <label class="skill-mini-toggle" title="开启后发送相关消息时由调度器自动匹配挂载">
            <input type="checkbox" class="skill-switch-input" data-sk-auto="1" ${sk.auto_dispatch ? 'checked' : ''} ${!sk.enabled ? 'disabled' : ''} />
            <span class="skill-switch-track" aria-hidden="true"></span>
            <span>自动调度</span>
          </label>
        </div>

        <div class="skill-card-actions">
          <button type="button" class="primary-btn skill-use-btn" data-sk-use="1">${ICON_BOLT_13}<span>立即使用</span></button>
          <button type="button" class="topbar-pill-btn skill-act-btn" data-sk-sched="1" title="在「已排定」中绑定此 Skill 创建定时任务">${ICON_CLOCK_13}<span>定时</span></button>
          <button type="button" class="topbar-pill-btn skill-act-btn" data-sk-edit="1">${sk.editable ? '编辑' : '克隆编辑'}</button>
          <button type="button" class="topbar-pill-btn skill-act-btn" data-sk-sync="1" title="同步导出为标准 ~/.gemini/config/skills/${escapeHtml(sk.slug)}/SKILL.md">同步 CLI</button>
          ${sk.editable ? '<button type="button" class="footer-mini-btn skill-del-btn" data-sk-del="1">删除</button>' : ''}
        </div>
      `;

      // Events
      card.querySelector('[data-sk-use]').addEventListener('click', () => {
        mountSkill(sk.id, true);
        if (onUseSkillInChat) onUseSkillInChat(sk);
      });

      card.querySelector('[data-sk-sched]').addEventListener('click', () => {
        if (onScheduleSkill) onScheduleSkill(sk);
      });

      card.querySelector('[data-sk-edit]').addEventListener('click', () => openSkillEditor(sk));

      card.querySelector('[data-sk-sync]').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          const res = await fetch('/api/skills/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: sk.id, target: 'global', cwd: getActiveCwd ? getActiveCwd() : '' }),
          });
          const d = await res.json();
          if (d.ok) {
            if (showToast) showToast(`已同步到全局 agy Skills 目录 ✓`);
            btn.textContent = '已同步 ✓';
            setTimeout(() => {
              btn.textContent = '同步 CLI';
              btn.disabled = false;
            }, 1400);
          } else {
            if (showToast) showToast(d.error || '同步失败');
            btn.disabled = false;
          }
        } catch (err) {
          if (showToast) showToast(`同步出错：${err.message}`);
          btn.disabled = false;
        }
      });

      card.querySelector('[data-sk-pin]').addEventListener('click', async () => {
        await fetch(`/api/skills/${encodeURIComponent(sk.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pinned: !sk.pinned, cwd: getActiveCwd ? getActiveCwd() : '' }),
        });
        await loadSkills(true);
      });

      card.querySelector('[data-sk-enabled]').addEventListener('change', async (e) => {
        await fetch(`/api/skills/${encodeURIComponent(sk.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: e.target.checked, cwd: getActiveCwd ? getActiveCwd() : '' }),
        });
        await loadSkills(true);
      });

      card.querySelector('[data-sk-auto]').addEventListener('change', async (e) => {
        await fetch(`/api/skills/${encodeURIComponent(sk.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ auto_dispatch: e.target.checked, cwd: getActiveCwd ? getActiveCwd() : '' }),
        });
        await loadSkills(true);
      });

      const delBtn = card.querySelector('[data-sk-del]');
      if (delBtn) {
        delBtn.addEventListener('click', async () => {
          await fetch(`/api/skills/${encodeURIComponent(sk.id)}`, { method: 'DELETE' });
          activeSkillIds.delete(sk.id);
          await loadSkills(true);
          if (showToast) showToast(`已删除 Skill「${sk.name}」`);
        });
      }

      gridEl.appendChild(card);
    }
  };

  // -------------------------------------------------------------------------
  // Skill Editor Modal (Create / Edit / Clone)
  // -------------------------------------------------------------------------

  const openSkillEditor = async (skillObj = null) => {
    if (!editorModal) return;
    if (edStatus) edStatus.textContent = '';

    let full = skillObj;
    if (skillObj && skillObj.id) {
      try {
        const res = await fetch(`/api/skills/${encodeURIComponent(skillObj.id)}?cwd=${encodeURIComponent(getActiveCwd ? getActiveCwd() : '')}`);
        const d = await res.json();
        if (d.ok && d.skill) full = d.skill;
      } catch {
        // fallback to summary
      }
    }

    const isCloningExternal = Boolean(full && !full.editable);
    editingOriginalSlug = full && full.editable ? full.slug : '';

    if (editorTitle) {
      editorTitle.textContent = !full ? '新建 Skill' : isCloningExternal ? `克隆到我的仓库：${full.name}` : `编辑 Skill：${full.name}`;
    }
    if (edName) edName.value = full ? (isCloningExternal ? `${full.name} (副本)` : full.name) : '';
    if (edSlug) edSlug.value = full ? (isCloningExternal ? `${full.slug}-custom` : full.slug) : '';
    if (edCategory) edCategory.value = (full && full.category) || '工程开发';
    if (edDesc) edDesc.value = (full && full.description) || '';
    if (edTriggers) edTriggers.value = full && Array.isArray(full.triggers) ? full.triggers.join(', ') : '';
    if (edTags) edTags.value = full && Array.isArray(full.tags) ? full.tags.join(', ') : '';
    if (edEnabled) edEnabled.checked = full ? Boolean(full.enabled) : true;
    if (edAuto) edAuto.checked = full ? Boolean(full.auto_dispatch) : true;
    if (edPinned) edPinned.checked = full ? Boolean(full.pinned) : false;
    if (edBody) edBody.value = (full && full.body) || '';

    editorModal.classList.add('open');
    if (edName) edName.focus();
  };

  const closeSkillEditor = () => {
    if (editorModal) editorModal.classList.remove('open');
  };

  if (edSaveBtn) {
    edSaveBtn.addEventListener('click', async () => {
      const payload = {
        original_slug: editingOriginalSlug,
        name: (edName && edName.value || '').trim(),
        slug: (edSlug && edSlug.value || '').trim(),
        category: (edCategory && edCategory.value || '').trim() || '通用技能',
        description: (edDesc && edDesc.value || '').trim(),
        triggers: (edTriggers && edTriggers.value || '').trim(),
        tags: (edTags && edTags.value || '').trim(),
        enabled: edEnabled ? edEnabled.checked : true,
        auto_dispatch: edAuto ? edAuto.checked : true,
        pinned: edPinned ? edPinned.checked : false,
        body: (edBody && edBody.value || '').trim(),
      };
      if (!payload.name || !payload.body) {
        if (edStatus) edStatus.textContent = '请填写 Skill 名称与指令正文';
        return;
      }
      edSaveBtn.disabled = true;
      edSaveBtn.textContent = '保存中…';
      try {
        const res = await fetch('/api/skills', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const d = await res.json();
        if (!d.ok) {
          if (edStatus) edStatus.textContent = d.error || '保存失败';
        } else {
          closeSkillEditor();
          await loadSkills(true);
          if (showToast) showToast(`Skill「${d.skill.name}」已保存到仓库 ✓`);
        }
      } catch (err) {
        if (edStatus) edStatus.textContent = `保存失败：${err.message}`;
      } finally {
        edSaveBtn.disabled = false;
        edSaveBtn.textContent = '保存 Skill';
      }
    });
  }

  // -------------------------------------------------------------------------
  // Skill Import Modal (GitHub URL / Local Path / Raw SKILL.md)
  // -------------------------------------------------------------------------

  const openSkillImport = () => {
    if (!importModal) return;
    if (impUrl) impUrl.value = '';
    if (impPath) impPath.value = '';
    if (impRaw) impRaw.value = '';
    if (impSlug) impSlug.value = '';
    if (impStatus) impStatus.textContent = '';
    importModal.classList.add('open');
    if (impUrl) impUrl.focus();
  };

  const closeSkillImport = () => {
    if (importModal) importModal.classList.remove('open');
  };

  if (impSubmitBtn) {
    impSubmitBtn.addEventListener('click', async () => {
      const payload = {
        url: (impUrl && impUrl.value || '').trim(),
        local_path: (impPath && impPath.value || '').trim(),
        raw_markdown: (impRaw && impRaw.value || '').trim(),
        slug: (impSlug && impSlug.value || '').trim(),
      };
      if (!payload.url && !payload.local_path && !payload.raw_markdown) {
        if (impStatus) impStatus.textContent = '请至少填写 GitHub 链接、本地路径或直接粘贴 SKILL.md 内容';
        return;
      }
      impSubmitBtn.disabled = true;
      impSubmitBtn.textContent = '导入中…';
      if (impStatus) impStatus.textContent = '正在解析并入库…';
      try {
        const res = await fetch('/api/skills/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const d = await res.json();
        if (!d.ok) {
          if (impStatus) impStatus.textContent = d.error || '导入失败';
        } else {
          closeSkillImport();
          await loadSkills(true);
          if (showToast) showToast(`已导入 Skill「${d.skill.name}」到仓库 ✓`);
        }
      } catch (err) {
        if (impStatus) impStatus.textContent = `导入出错：${err.message}`;
      } finally {
        impSubmitBtn.disabled = false;
        impSubmitBtn.textContent = '解析并导入';
      }
    });
  }

  // -------------------------------------------------------------------------
  // Auto-Dispatch Router Preview Tester
  // -------------------------------------------------------------------------

  const runRouterPreview = async () => {
    const sample = (routerTestInput && routerTestInput.value || '').trim();
    if (!sample || !routerTestResult) return;
    routerTestResult.style.display = 'flex';
    routerTestResult.innerHTML = '<span class="form-hint">正在试算路由调度…</span>';
    try {
      const res = await fetch('/api/skills/dispatch-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: sample,
          auto_dispatch: true,
          cwd: getActiveCwd ? getActiveCwd() : '',
        }),
      });
      const d = await res.json();
      const matched = (d && d.skills) || [];
      if (!matched.length) {
        routerTestResult.innerHTML = '<span class="form-hint">未自动命中任何 Skill（仍可通过输入 <code>/slug</code> 手动点名调度）。</span>';
        return;
      }
      const modeName = { auto: '自动命中', slash: '斜杠点名', manual: '手动挂载' };
      routerTestResult.innerHTML = matched
        .map((m) => {
          const hits = (m.matched_terms || []).length ? ` · 关键词: ${m.matched_terms.join('、')}` : '';
          return `<span class="skill-dispatch-result-pill">${ICON_BOLT_13}<strong>${escapeHtml(m.name)}</strong><span>(${escapeHtml(modeName[m.reason] || m.reason)}${escapeHtml(hits)})</span></span>`;
        })
        .join('');
    } catch (err) {
      routerTestResult.innerHTML = `<span class="form-hint" style="color:var(--danger);">试算失败：${escapeHtml(err.message)}</span>`;
    }
  };

  // Bind Skills Hub View Events (Composer `/` & `@` handled by composer-palette.js)
  if (searchInputEl) {
    searchInputEl.addEventListener('input', () => {
      searchQuery = searchInputEl.value || '';
      renderSkillsGrid();
    });
  }

  const filterTabs = $('skills-filter-tabs');
  if (filterTabs) {
    filterTabs.querySelectorAll('[data-skill-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        filterMode = btn.dataset.skillFilter || 'all';
        filterTabs.querySelectorAll('[data-skill-filter]').forEach((b) =>
          b.classList.toggle('active', b === btn)
        );
        renderSkillsGrid();
      });
    });
  }

  if (autoToggleEl) {
    autoToggleEl.addEventListener('change', () => {
      if (onToggleAutoDispatch) onToggleAutoDispatch(autoToggleEl.checked);
    });
  }

  if (routerTestBtn) routerTestBtn.addEventListener('click', runRouterPreview);
  if (routerTestInput) {
    routerTestInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        runRouterPreview();
      }
    });
  }

  if ($('btn-new-skill')) $('btn-new-skill').addEventListener('click', () => openSkillEditor(null));
  if ($('btn-open-skill-import')) $('btn-open-skill-import').addEventListener('click', openSkillImport);
  if ($('btn-skill-ed-cancel')) $('btn-skill-ed-cancel').addEventListener('click', closeSkillEditor);
  if ($('btn-skill-imp-cancel')) $('btn-skill-imp-cancel').addEventListener('click', closeSkillImport);
  if (editorModal) {
    editorModal.addEventListener('click', (e) => {
      if (e.target === editorModal) closeSkillEditor();
    });
  }
  if (importModal) {
    importModal.addEventListener('click', (e) => {
      if (e.target === importModal) closeSkillImport();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSkillEditor();
      closeSkillImport();
    }
  });

  return {
    loadSkills,
    getSkills: () => skills,
    mountSkill,
    clearMountedSkills,
    getMountedSkillIds,
    openSkillEditor,
    openSkillImport,
  };
}
