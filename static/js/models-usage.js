/* ==========================================================================
   Antigravity Studio — Grouped Model Families, Mode/Effort Pickers & Usage
   ========================================================================== */

import { escapeHtml } from './markdown-utils.js';

const EFFORT_ORDER = ['low', 'medium', 'high', 'xhigh', 'max'];
const EFFORT_LABELS = { default: 'Auto', low: 'Low', medium: 'Medium', high: 'High', xhigh: 'XHigh', max: 'Max' };
const EFFORT_DESCS = {
  default: '跟随 CLI 默认推理深度',
  low: '快速直接响应',
  medium: '速度与思考深度均衡',
  high: '深度思考与复杂推理',
  xhigh: '极致深度推理',
  max: '最大思考预算',
};

const MODE_OPTIONS = [
  { key: 'default', label: '请求批准', desc: '按 CLI 默认策略执行，敏感操作先确认' },
  { key: 'plan', label: '先做规划', desc: '先输出方案并确认后再修改文件' },
  { key: 'accept-edits', label: '自动编辑', desc: '自动批准文件读写与代码修改' },
  { key: 'auto', label: '完全自动', desc: '全自动执行工具与终端命令' },
];

export function inferModelMeta(name) {
  const lower = name.toLowerCase();
  if (lower.includes('opus')) return { desc: '旗舰推理与复杂架构', rank: 10 };
  if (lower.includes('sonnet')) return { desc: '高效编程与日常主力', rank: 20 };
  if (lower.includes('neon')) return { desc: 'Gemini 4 前沿深度推理', rank: 30 };
  if (lower.includes('hydrogen')) return { desc: 'Gemini 4 高阶复杂任务', rank: 35 };
  if (lower.includes('carbon')) return { desc: 'Gemini 4 全能均衡模型', rank: 40 };
  if (lower.includes('argon')) return { desc: 'Gemini 4 轻量稳定输出', rank: 45 };
  if (lower.includes('flash')) return { desc: '极速低延迟响应', rank: 55 };
  if (lower.includes('orchestrator')) return { desc: '多步骤任务编排引擎', rank: 60 };
  if (lower.includes('gpt')) return { desc: '开源大模型', rank: 70 };
  return { desc: '自定义 agy CLI 模型', rank: 80 };
}

export function formatResetCountdown(isoStr) {
  if (!isoStr || isoStr.startsWith('1970-01-01')) return '';
  const target = Date.parse(isoStr);
  if (Number.isNaN(target)) return '';
  const diffMs = target - Date.now();
  if (diffMs <= 0) return '即将重置';
  const totalMins = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMins / (60 * 24));
  const hours = Math.floor((totalMins % (60 * 24)) / 60);
  const mins = totalMins % 60;
  if (days > 0) return `Resets in ${days}d ${hours}h`;
  if (hours > 0) return `Resets in ${hours}h ${mins}m`;
  return `Resets in ${Math.max(1, mins)}m`;
}

export function buildUsageRingSvg(fraction) {
  const clamped = Math.max(0, Math.min(1, Number(fraction)));
  const r = 8.2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clamped);
  let color = '#3F8E47';
  if (clamped <= 0.15) color = '#DC2626';
  else if (clamped <= 0.4) color = '#D97706';
  return `
    <svg class="usage-ring-svg" viewBox="0 0 22 22">
      <circle class="usage-ring-track" cx="11" cy="11" r="${r}"></circle>
      <circle class="usage-ring-fill" cx="11" cy="11" r="${r}"
        stroke="${color}"
        stroke-dasharray="${c.toFixed(2)}"
        stroke-dashoffset="${offset.toFixed(2)}"></circle>
    </svg>
  `;
}

export function createModelsUsageController({
  state,
  dom,
  closeAllPopovers,
  onModelChanged,
}) {
  const $ = (id) => document.getElementById(id);
  const {
    modePickerLabel,
    popoverMode,
    modelPickerLabel,
    popoverModel,
    btnEffortPicker,
    effortPickerLabel,
    popoverEffort,
  } = dom;

  function setSelectedMode(modeKey) {
    const found = MODE_OPTIONS.find((m) => m.key === modeKey) || MODE_OPTIONS[0];
    state.selectedMode = found.key;
    modePickerLabel.textContent = found.label;
    renderModePopover();
  }

  function renderModePopover() {
    popoverMode.innerHTML = '<div class="popover-group-label">执行权限 Mode</div>';
    for (const opt of MODE_OPTIONS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'popover-item' + (state.selectedMode === opt.key ? ' active' : '');
      btn.innerHTML = `
        <div class="popover-item-main">
          <span class="popover-item-title">${escapeHtml(opt.label)}</span>
          <span class="popover-item-desc">${escapeHtml(opt.desc)}</span>
        </div>
        ${state.selectedMode === opt.key ? '<span class="popover-check">✓</span>' : ''}
      `;
      btn.addEventListener('click', () => {
        setSelectedMode(opt.key);
        closeAllPopovers();
      });
      popoverMode.appendChild(btn);
    }
  }

  function getActiveFamily() {
    return (
      state.modelFamilies.find((f) => f.key === state.selectedFamilyKey) ||
      state.modelFamilies[0] || {
        key: 'default',
        name: 'agy Default',
        fixedSlug: 'default',
        efforts: [{ key: 'default', label: 'Auto', slug: null }],
      }
    );
  }

  function updatePickerButtons() {
    const fam = getActiveFamily();
    modelPickerLabel.textContent = fam.name;
    if (!fam.efforts.length) {
      btnEffortPicker.disabled = true;
      effortPickerLabel.textContent = 'Fixed';
      btnEffortPicker.classList.remove('is-high');
    } else {
      btnEffortPicker.disabled = false;
      const activeEff = fam.efforts.find((e) => e.key === state.selectedEffortKey) || fam.efforts[0];
      effortPickerLabel.textContent = activeEff.label;
      btnEffortPicker.classList.toggle('is-high', ['high', 'xhigh', 'max'].includes(activeEff.key));
    }
  }

  function renderUsageFlyoutContent() {
    const card = $('usage-flyout-card');
    if (!card) return;
    const u = state.usageState;
    const headerHtml = `
      <div class="usage-card-header">
        <span class="usage-card-heading">Usage</span>
        <button type="button" class="usage-refresh-btn" id="btn-refresh-usage" title="刷新实时配额">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"></polyline>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
          </svg>
        </button>
      </div>
    `;
    let bodyHtml = '';
    if (u.loading && !u.data) {
      bodyHtml = '<div class="usage-empty-msg">正在通过 <code>agy -p /usage</code> 查询实时配额…</div>';
    } else if (u.data && Array.isArray(u.data.groups) && u.data.groups.length) {
      bodyHtml = u.data.groups
        .map((grp) => {
          const bucketsHtml = (grp.buckets || [])
            .map((b) => {
              const frac = typeof b.remaining_fraction === 'number' ? b.remaining_fraction : 1;
              const pct = Math.round(frac * 100);
              const winLabel = b.window === '5h' ? '5h limit' : b.window === 'weekly' ? 'Weekly limit' : (b.name || 'Limit');
              const resetTxt = frac < 0.999 ? formatResetCountdown(b.reset_time) : '';
              return `
                <div class="usage-bucket-row" title="${escapeHtml(b.description || '')}">
                  <div class="usage-bucket-left">
                    <span class="usage-bucket-label">${escapeHtml(winLabel)}</span>
                    ${resetTxt ? `<span class="usage-bucket-reset">${escapeHtml(resetTxt)}</span>` : ''}
                  </div>
                  <div class="usage-bucket-right">
                    <span class="usage-pct-text">${pct}% left</span>
                    ${buildUsageRingSvg(frac)}
                  </div>
                </div>
              `;
            })
            .join('');
          return `
            <div class="usage-group-block">
              <div class="usage-group-title" title="${escapeHtml(grp.description || '')}">${escapeHtml(grp.name)}</div>
              ${bucketsHtml}
            </div>
          `;
        })
        .join('');
    } else if (u.error) {
      bodyHtml = `<div class="usage-empty-msg">无法获取配额：${escapeHtml(u.error)}<br/>若你刚更新代码，请重启一次 <code>start.bat</code> 加载 <code>/api/usage</code> 接口。</div>`;
    } else {
      bodyHtml = '<div class="usage-empty-msg">点击右上角刷新图标获取当前账号配额。</div>';
    }
    card.innerHTML = headerHtml + bodyHtml;
    const refBtn = $('btn-refresh-usage');
    if (refBtn) {
      refBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fetchUsageQuota(true);
      });
    }
  }

  async function fetchUsageQuota(force = false) {
    if (state.usageState.loading) return;
    if (!force && state.usageState.data && Date.now() - state.usageState.fetchedAt < 45000) {
      renderUsageFlyoutContent();
      return;
    }
    state.usageState.loading = true;
    state.usageState.error = '';
    renderUsageFlyoutContent();
    try {
      const res = await fetch('/api/usage' + (force ? '?refresh=1' : ''));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.ok && json.data) {
        state.usageState.data = json.data;
        state.usageState.fetchedAt = Date.now();
        state.usageState.error = '';
      } else {
        state.usageState.error = json.error || '未返回有效配额数据';
      }
    } catch (err) {
      state.usageState.error = err.message || '请求失败';
    } finally {
      state.usageState.loading = false;
      renderUsageFlyoutContent();
    }
  }

  function renderModelPopover() {
    popoverModel.innerHTML = '';
    const scrollBox = document.createElement('div');
    scrollBox.className = 'popover-models-scroll';
    scrollBox.innerHTML = '<div class="popover-group-label">Model</div>';
    for (const fam of state.modelFamilies) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'popover-item' + (fam.key === state.selectedFamilyKey ? ' active' : '');
      const effortSummary =
        fam.key !== 'default' && fam.efforts.length
          ? `${fam.desc} · ${fam.efforts.map((e) => e.label).join(' / ')}`
          : fam.desc;
      btn.innerHTML = `
        <div class="popover-item-main">
          <span class="popover-item-title">${escapeHtml(fam.name)}</span>
          <span class="popover-item-desc">${escapeHtml(effortSummary)}</span>
        </div>
        ${fam.key === state.selectedFamilyKey ? '<span class="popover-check">✓</span>' : ''}
      `;
      btn.addEventListener('click', () => {
        selectModelFamily(fam.key);
        closeAllPopovers();
      });
      scrollBox.appendChild(btn);
    }
    popoverModel.appendChild(scrollBox);

    const footer = document.createElement('div');
    footer.className = 'popover-usage-footer';
    footer.id = 'popover-usage-footer';
    footer.innerHTML = `
      <button type="button" class="popover-usage-trigger" id="btn-view-usage">
        <span class="usage-trigger-left">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 14l4-4"></path>
            <path d="M3.34 19a10 10 0 1 1 17.32 0"></path>
          </svg>
          <span>View Usage</span>
        </span>
        <span class="usage-chevron">›</span>
      </button>
      <div class="usage-flyout-card" id="usage-flyout-card"></div>
    `;

    let openedByHoverAt = 0;
    const positionAndOpenUsage = (fromHover = false) => {
      const card = footer.querySelector('#usage-flyout-card');
      const popRect = popoverModel.getBoundingClientRect();
      const cardW = 288;
      const gap = 10;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const leftPos = popRect.right + gap + cardW <= vw - 12 ? popRect.right + gap : Math.max(12, popRect.left - gap - cardW);
      const bottomPos = Math.max(12, vh - popRect.bottom);
      card.style.left = `${Math.round(leftPos)}px`;
      card.style.bottom = `${Math.round(bottomPos)}px`;
      card.style.right = 'auto';
      card.style.top = 'auto';
      if (fromHover && !footer.classList.contains('usage-open')) openedByHoverAt = Date.now();
      footer.classList.add('usage-open');
      renderUsageFlyoutContent();
      fetchUsageQuota(false);
    };

    const triggerBtn = footer.querySelector('#btn-view-usage');
    triggerBtn.addEventListener('mouseenter', () => positionAndOpenUsage(true));
    triggerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (footer.classList.contains('usage-open') && Date.now() - openedByHoverAt > 400) {
        footer.classList.remove('usage-open');
      } else {
        positionAndOpenUsage(false);
      }
    });
    scrollBox.addEventListener('mouseenter', () => footer.classList.remove('usage-open'));

    popoverModel.appendChild(footer);
    updatePickerButtons();
  }

  function renderEffortPopover() {
    const fam = getActiveFamily();
    popoverEffort.innerHTML = '<div class="popover-group-label">推理深度 Effort</div>';
    for (const eff of fam.efforts) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'popover-item' + (eff.key === state.selectedEffortKey ? ' active' : '');
      btn.innerHTML = `
        <div class="popover-item-main">
          <span class="popover-item-title">${escapeHtml(eff.label)}</span>
          <span class="popover-item-desc">${escapeHtml(EFFORT_DESCS[eff.key] || '')}</span>
        </div>
        ${eff.key === state.selectedEffortKey ? '<span class="popover-check">✓</span>' : ''}
      `;
      btn.addEventListener('click', () => {
        selectEffortKey(eff.key);
        closeAllPopovers();
      });
      popoverEffort.appendChild(btn);
    }
    updatePickerButtons();
  }

  function buildModelFamilies(rawModels) {
    const defaultFamily = {
      key: 'default',
      name: 'agy Default',
      desc: '使用 agy CLI 默认配置模型',
      rank: 0,
      fixedSlug: 'default',
      efforts: [
        { key: 'default', label: 'Auto', slug: null },
        { key: 'low', label: 'Low', slug: null },
        { key: 'medium', label: 'Medium', slug: null },
        { key: 'high', label: 'High', slug: null },
      ],
    };

    const grouped = new Map();
    for (const item of rawModels || []) {
      const slug = typeof item === 'string' ? item : item.id;
      const label = typeof item === 'string' ? item : (item.label || item.id);
      if (!slug) continue;
      const m = label.match(/^(.*?)\s*\((Low|Medium|High|XHigh|Max)\)\s*$/i);
      if (m) {
        const baseName = m[1].trim();
        const effortKey = m[2].toLowerCase();
        const familyKey = baseName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        if (!grouped.has(familyKey)) {
          const meta = inferModelMeta(baseName);
          grouped.set(familyKey, { key: familyKey, name: baseName, desc: meta.desc, rank: meta.rank, fixedSlug: null, efforts: [] });
        }
        const fam = grouped.get(familyKey);
        if (!fam.efforts.some((e) => e.key === effortKey)) {
          fam.efforts.push({ key: effortKey, label: EFFORT_LABELS[effortKey] || m[2], slug });
        }
      } else {
        const familyKey = slug.toLowerCase();
        if (!grouped.has(familyKey)) {
          const meta = inferModelMeta(label);
          grouped.set(familyKey, { key: familyKey, name: label, desc: meta.desc, rank: meta.rank, fixedSlug: slug, efforts: [] });
        }
      }
    }

    const families = [defaultFamily, ...Array.from(grouped.values())];
    families.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
    for (const fam of families) {
      if (fam.key !== 'default' && fam.efforts.length) {
        fam.efforts.sort((a, b) => {
          const ia = EFFORT_ORDER.indexOf(a.key);
          const ib = EFFORT_ORDER.indexOf(b.key);
          return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        });
      }
    }
    state.modelFamilies = families;
    renderModelPopover();
    renderEffortPopover();
  }

  function selectModelFamily(familyKey, preferredEffort = null) {
    const fam = state.modelFamilies.find((f) => f.key === familyKey) || state.modelFamilies[0];
    if (!fam) return;
    state.selectedFamilyKey = fam.key;
    if (fam.efforts.length) {
      const target = preferredEffort || state.selectedEffortKey;
      const exact = fam.efforts.find((e) => e.key === target);
      if (exact) {
        state.selectedEffortKey = exact.key;
      } else {
        const fallback = fam.efforts.find((e) => e.key === 'high') || fam.efforts.find((e) => e.key === 'medium') || fam.efforts[0];
        state.selectedEffortKey = fallback.key;
      }
    } else {
      state.selectedEffortKey = 'default';
    }
    updatePickerButtons();
    renderModelPopover();
    renderEffortPopover();
    if (onModelChanged) onModelChanged();
  }

  function selectEffortKey(effortKey) {
    state.selectedEffortKey = effortKey;
    updatePickerButtons();
    renderEffortPopover();
  }

  function getResolvedModelAndEffort() {
    const fam = getActiveFamily();
    if (fam.key === 'default') return { model: 'default', effort: state.selectedEffortKey || 'default' };
    if (fam.efforts.length) {
      const eff = fam.efforts.find((e) => e.key === state.selectedEffortKey) || fam.efforts[0];
      return { model: eff.slug, effort: 'default' };
    }
    return { model: fam.fixedSlug || 'default', effort: 'default' };
  }

  function ensureCustomModelFamily(slug) {
    if (!slug || slug === 'default') return;
    const exists = state.modelFamilies.some((f) => f.fixedSlug === slug || f.efforts.some((e) => e.slug === slug));
    if (!exists) {
      state.modelFamilies.push({ key: slug.toLowerCase(), name: slug, desc: '自定义模型标识', rank: 90, fixedSlug: slug, efforts: [] });
      renderModelPopover();
    }
  }

  function syncPickersFromSlug(modelSlug, effortVal = 'default') {
    if (!modelSlug || modelSlug === 'default') {
      selectModelFamily('default', effortVal || 'default');
      return;
    }
    for (const fam of state.modelFamilies) {
      if (fam.fixedSlug === modelSlug) {
        selectModelFamily(fam.key, 'default');
        return;
      }
      const matchEff = fam.efforts.find((e) => e.slug === modelSlug);
      if (matchEff) {
        selectModelFamily(fam.key, matchEff.key);
        return;
      }
    }
    ensureCustomModelFamily(modelSlug);
    selectModelFamily(modelSlug.toLowerCase(), 'default');
  }

  return {
    setSelectedMode,
    renderModePopover,
    buildModelFamilies,
    getActiveFamily,
    selectModelFamily,
    selectEffortKey,
    updatePickerButtons,
    fetchUsageQuota,
    renderModelPopover,
    renderEffortPopover,
    getResolvedModelAndEffort,
    ensureCustomModelFamily,
    syncPickersFromSlug,
  };
}
