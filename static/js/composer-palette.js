/* ==========================================================================
   Antigravity Studio — Unified Composer Palette (`@` File Mention & `/` Commands + Skills)
   Zero-mouse keyboard navigation: ↑/↓ select, Enter/Tab confirm, Esc dismiss.
   ========================================================================== */

import { escapeHtml, formatBytes } from './markdown-utils.js';

const PALETTE_ICONS = {
  review:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15l2 2 4-4"/></svg>',
  plan:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2.5"/><line x1="8" y1="9" x2="8.01" y2="9"/><line x1="12" y1="9" x2="16" y2="9"/><line x1="8" y1="14" x2="8.01" y2="14"/><line x1="12" y1="14" x2="16" y2="14"/></svg>',
  compact:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 5 12 10 17 5"/><polyline points="7 19 12 14 17 19"/></svg>',
  clear:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
  worktree:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2.2"/><circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="18" r="2.2"/><path d="M12 7.2V12"/><path d="M6 15.8V14a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1.8"/></svg>',
  skill:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  file:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
};

const BUILTIN_SLASH_COMMANDS = [
  {
    kind: 'command',
    slug: 'review',
    name: 'review',
    iconKey: 'review',
    desc: '打开右侧 Git Review 面板，审查当前工作区代码变更',
    keywords: ['review', 'diff', 'git', '审查', '代码'],
  },
  {
    kind: 'command',
    slug: 'plan',
    name: 'plan',
    iconKey: 'plan',
    desc: '将执行权限切换为「先做规划」，先输出实现方案再改文件',
    keywords: ['plan', '规划', '方案', '模式'],
  },
  {
    kind: 'command',
    slug: 'compact',
    name: 'compact',
    iconKey: 'compact',
    desc: '将当前对话提炼为紧凑进展摘要，释放上下文窗口',
    keywords: ['compact', 'summary', '压缩', '总结', '精简'],
  },
  {
    kind: 'command',
    slug: 'clear',
    name: 'clear',
    iconKey: 'clear',
    desc: '清空当前对话舞台，立即开启全新空白聊天',
    keywords: ['clear', 'new', 'reset', '清空', '新聊天'],
  },
  {
    kind: 'command',
    slug: 'worktree',
    name: 'worktree',
    iconKey: 'worktree',
    desc: '打开 Git Worktree 面板，管理多分支并行工作目录',
    keywords: ['worktree', 'branch', '分支', '隔离'],
  },
];

export function createComposerPaletteController({
  composerInput,
  menuEl,
  state,
  actions,
}) {
  let isOpen = false;
  let mode = null; // 'slash' | 'mention'
  let items = [];
  let selectedIdx = 0;
  let tokenStart = -1;
  let currentQuery = '';

  let mentionTimer = null;
  let cachedCwd = '';
  let cachedRootFiles = null;
  let cachedAt = 0;

  const positionMenu = () => {
    if (!menuEl || !isOpen) return;
    const shell = menuEl.closest('.composer-shell') || menuEl.parentElement;
    const scrollArea = menuEl.closest('.claude-scroll-area');
    const stage = menuEl.closest('.claude-stage');
    if (!shell) return;

    const shellRect = shell.getBoundingClientRect();
    const rawBounds = scrollArea
      ? scrollArea.getBoundingClientRect()
      : { top: 52, bottom: window.innerHeight };
    const topBound = Math.max(0, rawBounds.top);
    const bottomBound = Math.min(window.innerHeight, rawBounds.bottom);

    const spaceAbove = Math.max(0, shellRect.top - topBound - 12);
    const spaceBelow = Math.max(0, bottomBound - shellRect.bottom - 14);
    const isEmptyLanding = Boolean(stage && stage.classList.contains('is-empty'));
    const openBelow = (isEmptyLanding && spaceBelow >= 150) || (spaceAbove < 240 && spaceBelow > spaceAbove);

    menuEl.classList.toggle('is-below', openBelow);
    const avail = openBelow ? spaceBelow : spaceAbove;
    const listEl = menuEl.querySelector('.slash-menu-list');
    if (listEl) {
      listEl.style.maxHeight = `${Math.max(108, Math.min(296, Math.floor(avail - 10)))}px`;
    }
  };

  const closeMenu = () => {
    isOpen = false;
    mode = null;
    items = [];
    selectedIdx = 0;
    tokenStart = -1;
    currentQuery = '';
    if (menuEl) {
      menuEl.style.display = 'none';
      menuEl.classList.remove('is-below');
    }
  };

  const invalidateFileCache = () => {
    cachedCwd = '';
    cachedRootFiles = null;
    cachedAt = 0;
  };

  const replaceActiveToken = (replacement = '') => {
    if (!composerInput) return;
    const val = composerInput.value;
    const caret = composerInput.selectionStart ?? val.length;
    if (tokenStart >= 0 && tokenStart <= caret) {
      const before = val.slice(0, tokenStart);
      const after = val.slice(caret);
      const nextVal = before + replacement + (replacement ? after : after.replace(/^\s*/, ''));
      composerInput.value = nextVal;
      const nextCaret = before.length + replacement.length;
      composerInput.selectionStart = composerInput.selectionEnd = nextCaret;
      composerInput.dispatchEvent(new Event('input'));
    }
  };

  const executeBuiltinCommand = (slug) => {
    replaceActiveToken('');
    closeMenu();
    switch (slug) {
      case 'review':
        actions.openToolTab('changes');
        if (actions.switchReviewSubTab) actions.switchReviewSubTab('changes');
        if (!composerInput.value.trim()) {
          composerInput.value = '请审查当前工作区的最新 Git 变更，重点检查潜在 Bug、边界情况和可优化之处。';
          composerInput.dispatchEvent(new Event('input'));
        }
        actions.showAppToast('已打开代码审查面板，按回车即可发起审查', { duration: 2600 });
        composerInput.focus();
        break;
      case 'plan':
        actions.setSelectedMode('plan');
        actions.showAppToast('已切换为「先做规划 (Plan)」模式', { duration: 2400 });
        composerInput.focus();
        break;
      case 'compact':
        if (!state.activeConv || !Array.isArray(state.activeConv.messages) || !state.activeConv.messages.length) {
          actions.showAppToast('当前对话暂无历史消息可压缩', { duration: 2200 });
          composerInput.focus();
          return;
        }
        actions.sendMessage(
          '请将我们到目前为止的对话目标、已完成改动、关键技术决策、遗留问题和下一步计划，压缩整理成一份结构紧凑、信息无损的上下文交接摘要，方便我后续继续推进。',
          false
        );
        break;
      case 'clear':
        actions.startNewChatView();
        actions.showAppToast('已开启全新对话', { duration: 1800 });
        break;
      case 'worktree':
        actions.openToolTab('changes');
        if (actions.switchReviewSubTab) actions.switchReviewSubTab('worktrees');
        actions.showAppToast('已打开 Git Worktree 分支隔离面板', { duration: 2400 });
        break;
    }
  };

  const applySelection = (entry) => {
    if (!entry) return;
    if (entry.kind === 'command') {
      executeBuiltinCommand(entry.slug);
      return;
    }
    if (entry.kind === 'skill') {
      replaceActiveToken('');
      actions.mountSkill(entry.skill.id, true);
      closeMenu();
      composerInput.focus();
      return;
    }
    if (entry.kind === 'file') {
      const f = entry.file;
      replaceActiveToken(`@${f.rel_path} `);
      if (!state.pendingAttachments.some((a) => a.path === f.path)) {
        state.pendingAttachments.push({
          id: `at-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: f.name,
          rel_path: f.rel_path,
          path: f.path,
          size: f.size,
          is_image: f.is_image,
          preview_url: f.is_image ? `/api/local-image?path=${encodeURIComponent(f.path)}` : '',
          source: 'workspace',
        });
        actions.renderPendingAttachments();
      }
      closeMenu();
      composerInput.focus();
    }
  };

  const renderMenu = () => {
    if (!menuEl) return;
    if (!items.length) {
      if (mode === 'mention') {
        isOpen = true;
        menuEl.style.display = 'block';
        menuEl.innerHTML = `<div class="slash-menu-empty">未找到匹配「${escapeHtml(currentQuery)}」的文件</div>`;
        return;
      }
      closeMenu();
      return;
    }

    isOpen = true;
    menuEl.style.display = 'block';

    if (mode === 'mention') {
      menuEl.innerHTML = `
        <div class="slash-menu-list">
          ${items
            .map((it, idx) => {
              const f = it.file;
              return `
                <button type="button" class="slash-menu-item ${idx === selectedIdx ? 'active' : ''}" data-pal-idx="${idx}">
                  <span class="slash-item-icon">${PALETTE_ICONS.file}</span>
                  <span class="slash-item-key mention-key">${escapeHtml(f.rel_path)}</span>
                  <span class="slash-item-meta">${escapeHtml(formatBytes(f.size))}</span>
                </button>
              `;
            })
            .join('')}
        </div>
      `;
    } else {
      let prevKind = '';
      const rowsHtml = items
        .map((it, idx) => {
          const sep = prevKind && prevKind !== it.kind ? '<div class="slash-menu-sep"></div>' : '';
          prevKind = it.kind;
          if (it.kind === 'command') {
            return (
              sep +
              `
              <button type="button" class="slash-menu-item ${idx === selectedIdx ? 'active' : ''}" data-pal-idx="${idx}">
                <span class="slash-item-icon">${PALETTE_ICONS[it.iconKey] || PALETTE_ICONS.skill}</span>
                <span class="slash-item-key">${escapeHtml(it.slug)}</span>
                <span class="slash-item-desc">${escapeHtml(it.desc)}</span>
              </button>`
            );
          }
          const sk = it.skill;
          const descParts = [sk.name, sk.description || sk.category || ''].filter(Boolean);
          const descText = descParts.length > 1 ? `${descParts[0]} · ${descParts[1]}` : descParts[0] || '';
          return (
            sep +
            `
            <button type="button" class="slash-menu-item ${idx === selectedIdx ? 'active' : ''}" data-pal-idx="${idx}">
              <span class="slash-item-icon">${PALETTE_ICONS.skill}</span>
              <span class="slash-item-key">${escapeHtml(sk.slug)}</span>
              <span class="slash-item-desc">${escapeHtml(descText)}</span>
            </button>`
          );
        })
        .join('');

      menuEl.innerHTML = `<div class="slash-menu-list">${rowsHtml}</div>`;
    }

    menuEl.querySelectorAll('[data-pal-idx]').forEach((btn) => {
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const i = Number(btn.dataset.palIdx);
        if (items[i]) applySelection(items[i]);
      });
    });

    positionMenu();

    const activeEl = menuEl.querySelector('.slash-menu-item.active');
    if (activeEl && activeEl.scrollIntoView) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  };

  const updateSlashList = (query) => {
    const q = (query || '').toLowerCase();
    const cmdMatches = BUILTIN_SLASH_COMMANDS.filter((c) => {
      if (!q) return true;
      return (
        c.slug.includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.desc.toLowerCase().includes(q) ||
        c.keywords.some((k) => k.includes(q))
      );
    });

    const allSkills = (actions.getSkills ? actions.getSkills() : []).filter((s) => s.enabled);
    const skillMatches = allSkills
      .filter((s) => {
        if (!q) return true;
        return (
          s.slug.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q) ||
          (s.category || '').toLowerCase().includes(q) ||
          (s.triggers || []).some((t) => t.toLowerCase().includes(q))
        );
      })
      .slice(0, 8)
      .map((skill) => ({ kind: 'skill', skill }));

    mode = 'slash';
    currentQuery = query;
    items = [...cmdMatches, ...skillMatches];
    selectedIdx = 0;
    renderMenu();
  };

  const fetchAndRenderMentionFiles = async (query) => {
    const cwd = state.activeCwd || '';
    const q = (query || '').trim();
    const now = Date.now();

    if (!q && cachedRootFiles && cachedCwd === cwd && now - cachedAt < 10000) {
      if (mode !== 'mention' || currentQuery !== query) return;
      items = cachedRootFiles.slice(0, 10).map((file) => ({ kind: 'file', file }));
      selectedIdx = 0;
      renderMenu();
      return;
    }

    try {
      const url = `/api/fs/files?cwd=${encodeURIComponent(cwd)}&q=${encodeURIComponent(q)}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      const files = data.files || [];
      if (!q) {
        cachedCwd = cwd;
        cachedRootFiles = files;
        cachedAt = Date.now();
      }
      if (mode !== 'mention' || currentQuery !== query) return;
      items = files.slice(0, 10).map((file) => ({ kind: 'file', file }));
      selectedIdx = 0;
      renderMenu();
    } catch {
      // ignore transient errors
    }
  };

  const updatePalette = () => {
    if (!composerInput || !menuEl) return;
    const caret = composerInput.selectionStart;
    if (caret === null || caret === undefined) {
      closeMenu();
      return;
    }
    const textUpToCaret = composerInput.value.slice(0, caret);

    // 1. Check `@` workspace file mention
    const atMatch = textUpToCaret.match(/(^|\s)@([^\s@]*)$/);
    if (atMatch) {
      const q = atMatch[2] || '';
      tokenStart = textUpToCaret.length - q.length - 1;
      mode = 'mention';
      currentQuery = q;
      clearTimeout(mentionTimer);
      if (!q && cachedRootFiles && cachedCwd === (state.activeCwd || '')) {
        fetchAndRenderMentionFiles(q);
      } else {
        mentionTimer = setTimeout(() => fetchAndRenderMentionFiles(q), 70);
      }
      return;
    }

    // 2. Check `/` slash commands & skills
    const slashMatch = textUpToCaret.match(/(^|\s)\/([a-zA-Z0-9_\-\u4e00-\u9fff]*)$/);
    if (slashMatch) {
      const q = slashMatch[2] || '';
      tokenStart = textUpToCaret.length - q.length - 1;
      updateSlashList(q);
      return;
    }

    closeMenu();
  };

  if (composerInput) {
    composerInput.addEventListener('input', updatePalette);
    composerInput.addEventListener(
      'keydown',
      (e) => {
        if (!isOpen) return;
        if (e.key === 'ArrowDown' && items.length) {
          e.preventDefault();
          selectedIdx = (selectedIdx + 1) % items.length;
          renderMenu();
        } else if (e.key === 'ArrowUp' && items.length) {
          e.preventDefault();
          selectedIdx = (selectedIdx - 1 + items.length) % items.length;
          renderMenu();
        } else if ((e.key === 'Enter' || e.key === 'Tab') && items.length) {
          e.preventDefault();
          e.stopImmediatePropagation();
          if (items[selectedIdx]) applySelection(items[selectedIdx]);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          closeMenu();
        }
      },
      true
    );
  }

  document.addEventListener('click', (e) => {
    if (isOpen && menuEl && !menuEl.contains(e.target) && e.target !== composerInput) {
      closeMenu();
    }
  });

  window.addEventListener('resize', () => {
    if (isOpen) positionMenu();
  });

  const openTriggerChar = (ch) => {
    if (!composerInput) return;
    const cur = composerInput.value;
    const prefix = cur && !/\s$/.test(cur) ? `${cur} ${ch}` : `${cur}${ch}`;
    composerInput.value = prefix;
    composerInput.focus();
    composerInput.selectionStart = composerInput.selectionEnd = prefix.length;
    updatePalette();
  };

  return {
    isOpen: () => isOpen,
    closeMenu,
    invalidateFileCache,
    openSlashMenuNow: () => openTriggerChar('/'),
    openMentionMenuNow: () => openTriggerChar('@'),
  };
}
