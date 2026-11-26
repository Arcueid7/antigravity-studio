/* ==========================================================================
   Antigravity Studio — Dedicated Sidebar Views (Library/Scheduled/Study/Customize/Video)
   ========================================================================== */

import { escapeHtml } from './markdown-utils.js';

const SVG_BOLT_MINI =
  '<svg class="ui-line-icon" width="12.5" height="12.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>';

const VIEW_TITLES = {
  library: '库',
  skills: 'Skill 仓库',
  scheduled: '已排定',
  study: '学生',
  customize: '自定义',
  video: '视频',
};

export function createFeatureViewsController({ state, dom, actions }) {
  const $ = (id) => document.getElementById(id);
  const { scrollArea, headerTitle, composerInput } = dom;

  function switchMainView(viewName) {
    state.activeView = viewName;
    scrollArea.style.display = viewName === 'chat' ? 'flex' : 'none';
    for (const v of ['library', 'skills', 'scheduled', 'study', 'customize', 'video']) {
      const el = $(`view-${v}`);
      if (el) el.style.display = viewName === v ? 'block' : 'none';
    }

    document.querySelectorAll('.codex-nav-item[data-nav]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.nav === viewName);
    });

    if (viewName === 'chat') {
      headerTitle.textContent = (state.activeConv && state.activeConv.title) || '新聊天';
    } else {
      headerTitle.textContent = VIEW_TITLES[viewName] || viewName;
    }

    if (viewName === 'library') loadLibraryView();
    if (viewName === 'skills') actions.loadSkillsHub(false);
    if (viewName === 'scheduled') {
      actions.loadSkillsHub(true);
      loadSchedulesView();
    }
    if (viewName === 'customize') loadCustomizeView();
    if (actions.syncExportButton) actions.syncExportButton();
    if (actions.refreshTurnNavigator) actions.refreshTurnNavigator();
  }

  async function loadLibraryView() {
    const res = await fetch('/api/library');
    const data = await res.json();
    state.libraryItems = data.items || [];
    renderLibraryGrid();
  }

  function renderLibraryGrid() {
    const grid = $('library-grid');
    const filter = state.libraryFilter;
    const filtered = state.libraryItems.filter((it) => {
      if (filter === 'all') return true;
      if (filter === 'file') return it.kind === 'file' || it.kind === 'video';
      return it.kind === filter;
    });

    grid.innerHTML = '';
    if (!filtered.length) {
      grid.innerHTML =
        '<div class="feature-card" style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:32px;">暂无内容。上传文件、手绘草图或在对话中生成代码/HTML Artifact 后会自动收录到这里。</div>';
      return;
    }

    for (const item of filtered) {
      const card = document.createElement('div');
      card.className = 'lib-card';

      let thumbHtml = '';
      if (item.kind === 'image' && item.preview_url) {
        thumbHtml = `<img src="${escapeHtml(item.preview_url)}" alt="${escapeHtml(item.title)}" />`;
      } else if (item.kind === 'artifact') {
        thumbHtml = `<pre class="lib-code-snippet">${escapeHtml((item.code || '').slice(0, 320))}</pre>`;
      } else {
        thumbHtml = `<span class="att-ext-badge" style="width:48px;height:48px;font-size:13px;">${escapeHtml(item.ext || 'FILE')}</span>`;
      }

      const primaryLabel = item.kind === 'artifact' ? (item.is_previewable ? '✦ 预览' : '查看代码') : '附加到聊天';
      const secondaryLabel = item.kind === 'artifact' ? '原对话' : '删除';

      card.innerHTML = `
        <div class="lib-thumb-area">${thumbHtml}</div>
        <div class="lib-card-body">
          <div class="lib-card-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
          <div class="lib-card-actions">
            <button type="button" class="topbar-pill-btn" data-lib-primary="1" style="padding:4px 9px;font-size:12px;">${primaryLabel}</button>
            <button type="button" class="footer-mini-btn" data-lib-secondary="1">${secondaryLabel}</button>
          </div>
        </div>
      `;

      card.querySelector('[data-lib-primary]').addEventListener('click', () => {
        if (item.kind === 'artifact') {
          actions.openArtifactPane({ lang: item.lang, code: item.code, title: item.title });
        } else {
          state.pendingAttachments.push({
            id: item.id,
            name: item.title,
            path: item.path,
            size: item.size,
            is_image: item.kind === 'image',
            preview_url: item.preview_url || '',
            source: 'upload',
          });
          switchMainView('chat');
          actions.renderPendingAttachments();
          composerInput.focus();
        }
      });

      card.querySelector('[data-lib-secondary]').addEventListener('click', async () => {
        if (item.kind === 'artifact' && item.conv_id) {
          await actions.selectConversation(item.conv_id);
        } else if (item.stored_name) {
          await fetch(`/api/library/upload/${encodeURIComponent(item.stored_name)}`, { method: 'DELETE' });
          await loadLibraryView();
        }
      });

      grid.appendChild(card);
    }
  }

  async function loadSchedulesView() {
    const container = $('schedule-list');
    const summaryPill = $('sched-summary-pill');
    let list = [];
    try {
      const res = await fetch('/api/schedules');
      const data = await res.json();
      list = data.schedules || [];
    } catch (err) {
      if (summaryPill) summaryPill.textContent = '连接异常';
      if (container) {
        container.innerHTML = `
          <div class="feature-card feature-state-card is-error">
            <div class="feature-state-title">暂时无法加载排定任务</div>
            <div class="feature-state-desc">${escapeHtml(err.message || '网络请求失败')}，请确认本地后端服务正在运行后重试。</div>
            <button type="button" class="topbar-pill-btn" data-sched-retry="1">重新加载</button>
          </div>
        `;
        const retryBtn = container.querySelector('[data-sched-retry]');
        if (retryBtn) retryBtn.addEventListener('click', () => loadSchedulesView());
      }
      return;
    }

    if (summaryPill) {
      const activeCnt = list.filter((t) => t.enabled).length;
      summaryPill.textContent = list.length ? `共 ${list.length} 项 · ${activeCnt} 项启用` : '本地守护就绪';
    }

    container.innerHTML = '';

    if (!list.length) {
      container.innerHTML = `
        <div class="feature-card feature-state-card">
          <div class="feature-state-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="9"></circle>
              <polyline points="12 7 12 12 15 14"></polyline>
            </svg>
          </div>
          <div class="feature-state-title">暂无排定任务</div>
          <div class="feature-state-desc">在上方填写任务名称、触发频率与执行提示词，即可创建本地定时任务。</div>
        </div>
      `;
      return;
    }

    const statusText = { idle: '等待触发', running: '运行中…', done: '上次成功', error: '上次异常' };
    for (const task of list) {
      const row = document.createElement('div');
      row.className = 'sched-row' + (!task.enabled ? ' is-paused' : '');
      const timing = task.schedule_type === 'daily'
        ? `每天 ${task.daily_time || '09:00'}`
        : `每 ${task.interval_minutes || 60} 分钟`;
      const st = task.last_status || 'idle';

      const boundSkillsHtml = Array.isArray(task.skill_ids) && task.skill_ids.length
        ? task.skill_ids
            .map((sid) => `<span class="sched-badge is-skill">${SVG_BOLT_MINI}<span>${escapeHtml(String(sid).split(':').pop())}</span></span>`)
            .join('')
        : '';

      row.innerHTML = `
        <div class="sched-info">
          <div class="sched-name-line">
            <span class="sched-status-dot ${task.enabled ? 'is-active' : 'is-paused'}" title="${task.enabled ? '已启用' : '已暂停'}"></span>
            <span class="sched-name-text">${escapeHtml(task.name)}</span>
            <span class="sched-badge is-time">${escapeHtml(timing)}</span>
            ${boundSkillsHtml}
            <span class="sched-badge st-${escapeHtml(st)}">${escapeHtml(statusText[st] || st)}</span>
          </div>
          <div class="sched-prompt-preview" title="${escapeHtml(task.prompt)}">${escapeHtml(task.prompt)}</div>
        </div>
        <div class="sched-actions">
          ${task.last_conversation_id ? '<button type="button" class="topbar-pill-btn" data-sched-view="1">查看结果</button>' : ''}
          <button type="button" class="topbar-pill-btn" data-sched-run="1">立即运行</button>
          <button type="button" class="topbar-pill-btn" data-sched-toggle="1">${task.enabled ? '暂停' : '启用'}</button>
          <button type="button" class="footer-mini-btn" data-sched-del="1">删除</button>
        </div>
      `;

      const viewBtn = row.querySelector('[data-sched-view]');
      if (viewBtn) {
        viewBtn.addEventListener('click', () => actions.selectConversation(task.last_conversation_id));
      }
      row.querySelector('[data-sched-run]').addEventListener('click', async () => {
        await fetch(`/api/schedules/${task.id}/run`, { method: 'POST' });
        await loadSchedulesView();
        setTimeout(() => {
          if (state.activeView === 'scheduled') loadSchedulesView();
          actions.refreshConversationList();
        }, 3500);
      });
      row.querySelector('[data-sched-toggle]').addEventListener('click', async () => {
        await fetch(`/api/schedules/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: !task.enabled }),
        });
        await loadSchedulesView();
      });
      row.querySelector('[data-sched-del]').addEventListener('click', async () => {
        await fetch(`/api/schedules/${task.id}`, { method: 'DELETE' });
        await loadSchedulesView();
      });

      container.appendChild(row);
    }
  }

  async function loadCustomizeView() {
    const res = await fetch(`/api/customizations?cwd=${encodeURIComponent(state.activeCwd || '')}`);
    const data = await res.json();
    $('custom-instructions-input').value = data.custom_instructions || '';
    $('custom-inst-status').textContent = '已同步本地配置';
    actions.applyAppearance(state.settings.theme, state.settings.font_style);

    const summary = $('cust-discovered-summary');
    summary.innerHTML = '';

    const sections = [
      { label: 'Skills', items: data.skills || [] },
      { label: 'Rules', items: data.rules || [] },
      { label: 'Plugins', items: data.plugins || [] },
    ];
    let total = 0;
    for (const sec of sections) {
      for (const it of sec.items) {
        total++;
        const pill = document.createElement('div');
        pill.className = 'cust-item-pill';
        pill.title = it.path || '';
        pill.innerHTML = `
          <span style="font-weight:500;color:var(--text-primary);">${escapeHtml(it.name)}</span>
          <span class="sched-badge">${escapeHtml(sec.label)}${it.scope ? ' · ' + escapeHtml(it.scope) : ''}</span>
        `;
        summary.appendChild(pill);
      }
    }
    if (!total) {
      summary.innerHTML =
        '<div style="color:var(--text-muted);line-height:1.6;">当前工作区与 <code>~/.gemini/config/</code> 下暂未发现自定义 Skills / Rules / Plugins；你可在左侧直接保存全局偏好指令，或点击左侧按钮编辑 <code>custom.css</code>。</div>';
    }
  }

  function bindEvents() {
    $('library-filter-tabs').querySelectorAll('[data-lib-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.libraryFilter = btn.dataset.libFilter;
        $('library-filter-tabs').querySelectorAll('[data-lib-filter]').forEach((b) =>
          b.classList.toggle('active', b === btn)
        );
        renderLibraryGrid();
      });
    });

    const syncSchedTypeUI = () => {
      const val = ($('sched-type') && $('sched-type').value) || 'daily';
      const isDaily = val === 'daily';
      if ($('sched-daily-wrap')) $('sched-daily-wrap').style.display = isDaily ? 'flex' : 'none';
      if ($('sched-interval-wrap')) $('sched-interval-wrap').style.display = isDaily ? 'none' : 'flex';
      const typeTabs = $('sched-type-tabs');
      if (typeTabs) {
        typeTabs.querySelectorAll('[data-sched-type]').forEach((btn) => {
          btn.classList.toggle('active', btn.dataset.schedType === val);
        });
      }
    };

    const schedTypeTabs = $('sched-type-tabs');
    if (schedTypeTabs) {
      schedTypeTabs.querySelectorAll('[data-sched-type]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const sel = $('sched-type');
          if (!sel) return;
          sel.value = btn.dataset.schedType || 'daily';
          sel.dispatchEvent(new Event('change'));
        });
      });
    }
    $('sched-type').addEventListener('change', syncSchedTypeUI);
    syncSchedTypeUI();

    // Custom Studio Dropdown for Binding Skill on Scheduled View
    const skillSelectEl = $('sched-skill-select');
    const skillPickerEl = $('sched-skill-picker');
    const skillTriggerEl = $('sched-skill-trigger');
    const skillTriggerLabel = $('sched-skill-trigger-label');
    const skillMenuEl = $('sched-skill-menu');

    const closeSkillPicker = () => {
      if (!skillPickerEl) return;
      skillPickerEl.classList.remove('open');
      if (skillTriggerEl) skillTriggerEl.setAttribute('aria-expanded', 'false');
    };

    const syncSkillPickerUI = () => {
      if (!skillSelectEl || !skillMenuEl || !skillTriggerLabel) return;
      const curVal = skillSelectEl.value || '';
      const opts = Array.from(skillSelectEl.options || []);
      const curOpt = opts.find((o) => o.value === curVal) || opts[0];
      skillTriggerLabel.textContent = (curOpt && curOpt.textContent) || '不绑定特定 Skill（走默认或自动调度）';
      skillTriggerLabel.classList.toggle('is-placeholder', !curVal);

      skillMenuEl.innerHTML = '';
      for (const opt of opts) {
        const isSelected = opt.value === curVal;
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'studio-select-option' + (isSelected ? ' active' : '');
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        const slug = opt.dataset.skillSlug || '';
        const name = opt.dataset.skillName || '';
        const cat = opt.dataset.skillCat || '';
        if (opt.value && name) {
          item.innerHTML = `
            <span class="studio-opt-main">
              <span class="studio-opt-title">${SVG_BOLT_MINI}<span>${escapeHtml(name)}</span></span>
              <span class="studio-opt-sub">/${escapeHtml(slug)}${cat ? ' · ' + escapeHtml(cat) : ''}</span>
            </span>
            <span class="studio-opt-check">${isSelected ? '✓' : ''}</span>
          `;
        } else {
          item.innerHTML = `
            <span class="studio-opt-main">
              <span class="studio-opt-title">不绑定特定 Skill</span>
              <span class="studio-opt-sub">走默认或自动调度</span>
            </span>
            <span class="studio-opt-check">${isSelected ? '✓' : ''}</span>
          `;
        }
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          skillSelectEl.value = opt.value;
          skillSelectEl.dispatchEvent(new Event('change'));
          closeSkillPicker();
        });
        skillMenuEl.appendChild(item);
      }
    };

    if (skillTriggerEl && skillPickerEl) {
      skillTriggerEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const willOpen = !skillPickerEl.classList.contains('open');
        if (willOpen) syncSkillPickerUI();
        skillPickerEl.classList.toggle('open', willOpen);
        skillTriggerEl.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      });
      document.addEventListener('click', (e) => {
        if (skillPickerEl.classList.contains('open') && !skillPickerEl.contains(e.target)) {
          closeSkillPicker();
        }
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeSkillPicker();
      });
    }
    if (skillSelectEl) {
      skillSelectEl.addEventListener('change', syncSkillPickerUI);
      skillSelectEl.addEventListener('studio:sync-options', syncSkillPickerUI);
      syncSkillPickerUI();
    }

    $('btn-create-schedule').addEventListener('click', async () => {
      const name = $('sched-name').value.trim() || '排定任务';
      const prompt = $('sched-prompt').value.trim();
      if (!prompt) {
        $('sched-prompt').focus();
        return;
      }
      const resolved = actions.getResolvedModelAndEffort();
      const boundSkill = ($('sched-skill-select') && $('sched-skill-select').value) || '';
      await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          prompt,
          cwd: state.activeCwd || state.settings.default_cwd,
          model: resolved.model,
          mode: state.selectedMode,
          skill_ids: boundSkill ? [boundSkill] : [],
          schedule_type: $('sched-type').value,
          daily_time: $('sched-daily-time').value || '09:00',
          interval_minutes: Number($('sched-interval-mins').value) || 60,
          enabled: true,
        }),
      });
      $('sched-name').value = '';
      $('sched-prompt').value = '';
      if ($('sched-skill-select')) {
        $('sched-skill-select').value = '';
        $('sched-skill-select').dispatchEvent(new Event('change'));
      }
      await loadSchedulesView();
    });

    $('study-mode-cards').querySelectorAll('[data-study-mode]').forEach((card) => {
      card.addEventListener('click', () => {
        state.selectedStudyMode = card.dataset.studyMode;
        $('study-mode-cards').querySelectorAll('[data-study-mode]').forEach((c) =>
          c.classList.toggle('active', c === card)
        );
      });
    });
    $('btn-start-study').addEventListener('click', () => {
      const topic = $('study-topic-input').value.trim();
      if (!topic) {
        $('study-topic-input').focus();
        return;
      }
      $('study-topic-input').value = '';
      state.activeCapabilities.clear();
      state.activeCapabilities.add(state.selectedStudyMode);
      actions.renderActiveCapabilityPills();
      actions.startNewChatView();
      actions.sendMessage(topic, false);
    });

    $('btn-save-custom-inst').addEventListener('click', async () => {
      const val = $('custom-instructions-input').value.trim();
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ custom_instructions: val }),
      });
      const data = await res.json();
      state.settings = { ...state.settings, ...(data.settings || {}) };
      $('custom-inst-status').textContent = '已保存并将在下次对话生效 ✓';
    });
    document.querySelectorAll('[data-cust-theme]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        state.settings.theme = btn.dataset.custTheme;
        actions.applyAppearance(state.settings.theme, state.settings.font_style);
        await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ theme: state.settings.theme }),
        });
      });
    });
    $('btn-open-css-from-customize').addEventListener('click', () => {
      actions.loadCustomCssIntoEditor();
      actions.openCssStudio();
    });

    const videoDropzone = $('video-dropzone');
    const videoFileInput = $('video-file-input');
    videoDropzone.addEventListener('click', () => {
      videoFileInput.value = '';
      videoFileInput.click();
    });
    const handleVideoFiles = async (files) => {
      if (!files || !files.length) return;
      await actions.uploadLocalFiles(files);
      state.activeCapabilities.clear();
      state.activeCapabilities.add('video_analyze');
      actions.renderActiveCapabilityPills();
      switchMainView('chat');
      composerInput.focus();
    };
    videoFileInput.addEventListener('change', (e) => handleVideoFiles(e.target.files));
    videoDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      videoDropzone.classList.add('drag-over');
    });
    videoDropzone.addEventListener('dragleave', () => videoDropzone.classList.remove('drag-over'));
    videoDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      videoDropzone.classList.remove('drag-over');
      handleVideoFiles(e.dataTransfer && e.dataTransfer.files);
    });
    $('video-mode-cards').querySelectorAll('[data-video-mode]').forEach((card) => {
      card.addEventListener('click', () => {
        state.selectedVideoMode = card.dataset.videoMode;
        $('video-mode-cards').querySelectorAll('[data-video-mode]').forEach((c) =>
          c.classList.toggle('active', c === card)
        );
      });
    });
    $('btn-start-video').addEventListener('click', () => {
      const prompt = $('video-prompt-input').value.trim();
      if (!prompt) {
        $('video-prompt-input').focus();
        return;
      }
      $('video-prompt-input').value = '';
      state.activeCapabilities.clear();
      state.activeCapabilities.add(state.selectedVideoMode);
      actions.renderActiveCapabilityPills();
      actions.startNewChatView();
      actions.sendMessage(prompt, false);
    });
  }

  return {
    switchMainView,
    loadLibraryView,
    renderLibraryGrid,
    loadSchedulesView,
    loadCustomizeView,
    bindEvents,
  };
}
