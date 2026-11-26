/* ==========================================================================
   Antigravity Studio — Raycast / VS Code Style Global Command Palette (Ctrl+Shift+P)
   Instant fuzzy search across commands, projects, conversations, themes, fonts & skills.
   ========================================================================== */

import { COLOR_SCHEMES, FONT_PRESETS, resolveSchemeKey } from './themes.js';
import { escapeHtml, folderBasename, shortenPath } from './markdown-utils.js';
import { SUPPORTED_LANGUAGES, getLanguage } from './i18n.js';

const svg = (inner) =>
  `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const CMD_ICONS = {
  chat: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>'),
  terminal: svg('<rect x="3" y="4" width="18" height="16" rx="2.5"/><polyline points="7 9 10 12 7 15"/><line x1="12" y1="15" x2="17" y2="15"/>'),
  review: svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15l2 2 4-4"/>'),
  branch: svg('<circle cx="12" cy="5" r="2.2"/><circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="18" r="2.2"/><path d="M12 7.2V12"/><path d="M6 15.8V14a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1.8"/>'),
  folder: svg('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>'),
  split: svg('<rect x="3" y="3" width="18" height="18" rx="3"/><line x1="12" y1="3" x2="12" y2="21"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>'),
  moon: svg('<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'),
  skill: svg('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/>'),
  study: svg('<path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/>'),
  palette: svg('<circle cx="13.5" cy="6.5" r="0.8" fill="currentColor"/><circle cx="17.5" cy="10.5" r="0.8" fill="currentColor"/><circle cx="8.5" cy="7.5" r="0.8" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.6-.7 1.6-1.6 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16c3.3 0 6-2.7 6-6 0-4.9-4.5-8.6-10-8.6z"/>'),
  code: svg('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>'),
  git: svg('<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2l8.5 5v10L12 22l-8.5-5V7L12 2z"/>'),
  chart: svg('<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>'),
  trash: svg('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>'),
  sidebarLeft: svg('<rect x="3" y="3" width="18" height="18" rx="3"/><line x1="9" y1="3" x2="9" y2="21"/>'),
  sidebarRight: svg('<rect x="3" y="3" width="18" height="18" rx="3"/><line x1="15" y1="3" x2="15" y2="21"/>'),
  outline: svg('<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>'),
  download: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'),
  pin: svg('<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>'),
  message: svg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
  font: svg('<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>'),
  globe: svg('<circle cx="12" cy="12" r="9"/><line x1="3" y1="12" x2="21" y2="12"/><path d="M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'),
};

function scoreFuzzyMatch(haystack, tokens) {
  if (!tokens.length) return 10;
  const h = haystack.toLowerCase();
  let total = 0;
  for (const tok of tokens) {
    const idx = h.indexOf(tok);
    if (idx >= 0) {
      total += idx === 0 ? 120 : 60 - Math.min(idx, 40);
      continue;
    }
    // Lightweight ordered subsequence fallback (e.g. "wt" -> "worktree")
    let ti = 0;
    for (let hi = 0; hi < h.length && ti < tok.length; hi++) {
      if (h[hi] === tok[ti]) ti++;
    }
    if (ti === tok.length) {
      total += 22;
    } else {
      return -1;
    }
  }
  return total;
}

export function createCommandPaletteController({
  state,
  modalEl,
  inputEl,
  listEl,
  actions,
}) {
  let isOpen = false;
  let allCommands = [];
  let filtered = [];
  let selectedIdx = 0;

  const buildCommandCatalog = () => {
    const list = [];
    const mode = state.settings.theme === 'dark' ? 'dark' : 'light';
    const activeScheme = resolveSchemeKey(state.settings.color_scheme || 'claude');
    const activeFont = FONT_PRESETS[state.settings.font_style] ? state.settings.font_style : 'serif';

    // 1. Core Actions & Navigation
    const core = [
      {
        section: '常用指令',
        iconKey: 'chat',
        title: '新建空白聊天',
        desc: '开启一条新的对话会话',
        kbd: 'Ctrl+N',
        keywords: 'new chat clear 新建 对话 聊天',
        run: () => {
          actions.startNewChatView();
          actions.navigateToView('chat');
        },
      },
      {
        section: '常用指令',
        iconKey: 'terminal',
        title: '打开工作区终端 (Terminal)',
        desc: '在右侧面板启动实时流式 SSE 终端',
        kbd: 'Ctrl+J',
        keywords: 'terminal shell bash powershell 终端 命令',
        run: () => actions.openToolTab('terminal'),
      },
      {
        section: '常用指令',
        iconKey: 'review',
        title: '打开 Git 变更审查 (Review)',
        desc: '查看工作区 Diff、暂存提交、GitHub PR 与 Issue',
        kbd: 'Ctrl+Shift+G',
        keywords: 'git diff review commit pr issue 变更 审查 提交',
        run: () => {
          actions.openToolTab('changes');
          actions.switchReviewSubTab('changes');
        },
      },
      {
        section: '常用指令',
        iconKey: 'branch',
        title: '打开 Git Worktree 分支隔离',
        desc: '管理独立分支工作目录，多任务并行互不干扰',
        kbd: '',
        keywords: 'git worktree branch 分支 隔离 并行',
        run: () => {
          actions.openToolTab('changes');
          actions.switchReviewSubTab('worktrees');
        },
      },
      {
        section: '常用指令',
        iconKey: 'folder',
        title: '打开右侧文件目录 (Explorer)',
        desc: '浏览、新建、重命名与编辑工作区文件',
        kbd: 'Ctrl+P',
        keywords: 'explorer files tree 文件 目录 新建 编辑',
        run: () => actions.openToolTab('explorer'),
      },
      {
        section: '常用指令',
        iconKey: 'split',
        title: '切换并排双文件分屏阅读',
        desc: '在右侧同时对照阅读两个文件或 PDF/代码',
        kbd: 'Ctrl+Shift+\\',
        keywords: 'split pane side by side 分屏 并排 双文件',
        run: () => actions.toggleSplitReading(),
      },
      {
        section: '常用指令',
        iconKey: mode === 'dark' ? 'sun' : 'moon',
        title: mode === 'dark' ? '切换为浅色主题 (Light)' : '切换为深色主题 (Dark)',
        desc: '立即切换全局浅色 / 深色外观模式',
        kbd: 'Ctrl+Shift+L',
        keywords: 'theme dark light 浅色 深色 暗黑 主题 切换',
        run: () => actions.toggleTheme(),
      },
      {
        section: '常用指令',
        iconKey: 'skill',
        title: '打开 Skill 仓库与智能调度器',
        desc: '管理内置与本机自定义 Skills、触发词与自动路由测试',
        kbd: '',
        keywords: 'skills hub repo dispatch 技能 仓库 调度',
        run: () => actions.navigateToView('skills'),
      },
      {
        section: '常用指令',
        iconKey: 'clock',
        title: '打开已排定任务 (Scheduled)',
        desc: '管理本地定时自动运行的 AI 任务与绑定 Skill',
        kbd: '',
        keywords: 'schedule cron timer 定时 排定 任务',
        run: () => actions.navigateToView('scheduled'),
      },
      {
        section: '常用指令',
        iconKey: 'study',
        title: '进入学生 / 论文精读模式',
        desc: '苏格拉底引导、概念精讲、互动测验与论文精读',
        kbd: '',
        keywords: 'study paper learning 学生 论文 精读 学习',
        run: () => actions.navigateToView('study'),
      },
      {
        section: '常用指令',
        iconKey: 'palette',
        title: '打开自定义与自由调色盘',
        desc: '编辑全局偏好指令、配色、字体与本机扩展',
        kbd: '',
        keywords: 'customize colors palette 自定义 调色盘 偏好',
        run: () => actions.navigateToView('customize'),
      },
      {
        section: '常用指令',
        iconKey: 'code',
        title: '打开 Custom CSS 实时工作台',
        desc: '实时编写并热重载自定义界面样式',
        kbd: '',
        keywords: 'css style custom 样式 自定义',
        run: () => actions.openCssStudio(),
      },
      {
        section: '常用指令',
        iconKey: 'git',
        title: '从 GitHub 克隆仓库…',
        desc: '浏览你的 GitHub 仓库或粘贴 URL 一键克隆并打开项目',
        kbd: '',
        keywords: 'github clone repo 克隆 仓库 拉取',
        run: () => actions.openGithubCloneModal(),
      },
      {
        section: '常用指令',
        iconKey: 'folder',
        title: '浏览并切换本地工作区目录…',
        desc: '打开可视化目录选择器切换项目文件夹',
        kbd: 'Ctrl+O',
        keywords: 'folder open workspace cwd 打开 文件夹 目录 切换项目',
        run: () => actions.openFolderBrowserModal('switch'),
      },
      {
        section: '常用指令',
        iconKey: 'settings',
        title: '打开偏好设置 (Settings)',
        desc: '配置 CLI 引擎、模型、头像资料、GitHub 授权与通知',
        kbd: 'Ctrl+,',
        keywords: 'settings preferences config 设置 偏好 引擎 模型',
        run: () => actions.openSettingsModal('general'),
      },
      {
        section: '常用指令',
        iconKey: 'chart',
        title: '查看实时配额 (View Usage)',
        desc: '查看各模型配额余量与重置倒计时',
        kbd: 'Ctrl+Shift+U',
        keywords: 'usage quota limits 配额 额度 用量',
        run: () => actions.runCodexAction('view-usage'),
      },
      {
        section: '常用指令',
        iconKey: 'trash',
        title: '立即清理旧检查点快照 (GC)',
        desc: '回收超过保留上限的旧快照并清理孤儿 Blob 释放磁盘空间',
        kbd: '',
        keywords: 'checkpoint gc clean garbage collect 检查点 清理 垃圾回收',
        run: async () => {
          try {
            const res = await fetch('/api/checkpoints/gc', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ max_checkpoints: 60, max_age_days: 30 }),
            });
            const d = await res.json();
            if (d.ok) {
              const kb = Math.round((d.freed_bytes || 0) / 1024);
              actions.showAppToast(
                `检查点 GC 完成：清理 ${d.removed_manifests} 个快照 / ${d.removed_blobs} 个对象（释放 ${kb} KB）`
              );
            }
          } catch (err) {
            actions.showAppToast(`GC 失败：${err.message}`);
          }
        },
      },
      {
        section: '常用指令',
        iconKey: 'sidebarLeft',
        title: '展开 / 收起左侧边栏',
        desc: '切换导航侧栏显示状态',
        kbd: 'Ctrl+B',
        keywords: 'sidebar left toggle 侧边栏 展开 收起',
        run: () => actions.toggleSidebar(),
      },
      {
        section: '常用指令',
        iconKey: 'sidebarRight',
        title: '展开 / 收起右侧多标签工作区',
        desc: '切换右侧文件/终端/审查多标签面板',
        kbd: 'Ctrl+\\',
        keywords: 'right pane toggle 右侧 面板',
        run: () => actions.toggleRightPane(),
      },
    ];

    if (state.activeConv && state.activeConv.id) {
      core.splice(1, 0,
        {
          section: '常用指令',
          iconKey: 'outline',
          title: '定位当前对话轮次目录',
          desc: '打开时间轴浮层，按时间戳与问题一键跳转到任意对话轮次',
          kbd: 'Ctrl+Shift+O',
          keywords: 'turn locate timeline outline jump 定位 跳转 目录 时间轴 轮次',
          run: () => actions.toggleTurnNavigator && actions.toggleTurnNavigator(),
        },
        {
          section: '常用指令',
          iconKey: 'download',
          title: '导出当前对话为 Markdown (.md)',
          desc: `导出「${state.activeConv.title || '新对话'}」为带思考过程与工具摘要的 .md 笔记`,
          kbd: '',
          keywords: 'export markdown md note download 导出 笔记',
          run: () => actions.exportActiveConversationMarkdown(),
        }
      );
    }

    list.push(...core);

    // 2. Pinned Projects
    for (const proj of state.settings.projects || []) {
      const name = proj.name || folderBasename(proj.path);
      list.push({
        section: '切换项目工作区',
        iconKey: 'folder',
        title: `切换项目：${name}`,
        desc: shortenPath(proj.path),
        kbd: '',
        keywords: `project workspace 切换项目 ${name} ${proj.path}`,
        run: () => actions.setActiveWorkspace(proj.path, true),
      });
    }

    // 3. Conversations
    for (const conv of (state.conversations || []).slice(0, 30)) {
      list.push({
        section: '跳转对话',
        iconKey: conv.pinned ? 'pin' : 'message',
        title: conv.title || '新聊天',
        desc: `${folderBasename(conv.cwd || '')} · ${conv.message_count || 0} 条消息`,
        kbd: '',
        keywords: `conversation chat 对话 历史 ${conv.title || ''} ${conv.cwd || ''}`,
        run: () => actions.selectConversation(conv.id),
      });
    }

    // 4. Color Themes (All 8 Schemes)
    for (const [key, item] of Object.entries(COLOR_SCHEMES)) {
      const pal = item[mode];
      const isCur = key === activeScheme;
      list.push({
        section: '主题配色',
        swatch: pal.accent,
        title: `配色：${item.name}${isCur ? '（当前）' : ''}`,
        desc: item.desc,
        kbd: '',
        keywords: `theme color scheme palette 主题 配色 颜色 ${key} ${item.name} ${item.desc}`,
        run: () => {
          actions.selectColorScheme(key);
          actions.showAppToast(`已切换配色「${item.name}」`, { duration: 2000 });
        },
      });
    }

    // 5. Typography / Fonts (All 9 Presets)
    for (const [key, item] of Object.entries(FONT_PRESETS)) {
      const isCur = key === activeFont;
      list.push({
        section: '字体排版',
        iconKey: 'font',
        title: `字体：${item.name}${isCur ? '（当前）' : ''}`,
        desc: item.desc,
        kbd: '',
        keywords: `font typography 字体 排版 ${key} ${item.name} ${item.desc}`,
        run: () => {
          actions.selectFontStyle(key);
          actions.showAppToast(`已切换字体「${item.name}」`, { duration: 2000 });
        },
      });
    }

    // 5.5 Interface Language
    const curLang = getLanguage();
    const langExtraKw = {
      'zh-CN': 'chinese zh cn 中文 简体中文 汉语 语言 切换',
      en: 'english en us uk 英文 英语 语言 切换',
      ja: 'japanese ja jp 日本語 日语 日文 语言 切换',
      ko: 'korean ko kr 한국어 韩语 韩文 语言 切换',
    };
    for (const langItem of SUPPORTED_LANGUAGES) {
      const isCur = langItem.code === curLang;
      list.push({
        section: '界面语言',
        iconKey: 'globe',
        title: `${langItem.label}${isCur ? '（当前）' : ''}`,
        desc: '实时切换工作台界面语言，不影响对话内容与代码文件。',
        kbd: '',
        keywords: `language lang locale i18n ${langItem.code} ${langItem.label} ${langExtraKw[langItem.code] || ''}`,
        run: () => actions.setAppLanguage && actions.setAppLanguage(langItem.code, true),
      });
    }

    // 6. Enabled Skills
    const skills = (actions.getSkills ? actions.getSkills() : []).filter((s) => s.enabled);
    for (const sk of skills) {
      list.push({
        section: '挂载 Skill',
        iconKey: 'skill',
        title: `挂载 Skill：${sk.name}`,
        desc: `/${sk.slug} · ${sk.description || sk.category || ''}`,
        kbd: '',
        keywords: `skill 技能 挂载 ${sk.slug} ${sk.name} ${(sk.triggers || []).join(' ')}`,
        run: () => {
          actions.mountSkill(sk.id, false);
          actions.navigateToView('chat');
          actions.focusComposer();
        },
      });
    }

    return list;
  };

  const renderList = () => {
    if (!listEl) return;
    if (!filtered.length) {
      listEl.innerHTML = '<div class="cmdpal-empty">未找到匹配的指令、项目、配色或对话</div>';
      return;
    }

    let lastSec = '';
    const html = filtered
      .map((item, idx) => {
        let secHtml = '';
        if (item.section !== lastSec) {
          lastSec = item.section;
          secHtml = `<div class="cmdpal-section">${escapeHtml(item.section)}</div>`;
        }
        const iconMarkup = item.swatch
          ? `<span class="cmdpal-swatch" style="background:${escapeHtml(item.swatch)};"></span>`
          : `<span class="cmdpal-icon">${CMD_ICONS[item.iconKey] || CMD_ICONS.chat}</span>`;
        return (
          secHtml +
          `
          <button type="button" class="cmdpal-item ${idx === selectedIdx ? 'active' : ''}" data-cmd-idx="${idx}">
            ${iconMarkup}
            <div class="cmdpal-item-main">
              <div class="cmdpal-item-title">${escapeHtml(item.title)}</div>
              <div class="cmdpal-item-desc">${escapeHtml(item.desc || '')}</div>
            </div>
            ${item.kbd ? `<kbd class="cmdpal-kbd">${escapeHtml(item.kbd)}</kbd>` : ''}
          </button>`
        );
      })
      .join('');

    listEl.innerHTML = html;
    listEl.querySelectorAll('[data-cmd-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.cmdIdx);
        executeIndex(i);
      });
      btn.addEventListener('mousemove', () => {
        const i = Number(btn.dataset.cmdIdx);
        if (i !== selectedIdx) {
          selectedIdx = i;
          listEl.querySelectorAll('.cmdpal-item.active').forEach((el) => el.classList.remove('active'));
          btn.classList.add('active');
        }
      });
    });

    const activeEl = listEl.querySelector('.cmdpal-item.active');
    if (activeEl && activeEl.scrollIntoView) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  };

  const applyFilter = (rawQuery) => {
    const tokens = String(rawQuery || '')
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    if (!tokens.length) {
      // Show concise default list: all core commands + projects + top 6 convs + first 4 themes
      const coreItems = allCommands.filter((c) => c.section === '常用指令');
      const projItems = allCommands.filter((c) => c.section === '切换项目工作区');
      const convItems = allCommands.filter((c) => c.section === '跳转对话').slice(0, 6);
      const themeItems = allCommands.filter((c) => c.section === '主题配色').slice(0, 4);
      filtered = [...coreItems, ...projItems, ...convItems, ...themeItems];
    } else {
      const scored = [];
      for (const item of allCommands) {
        const hay = `${item.title} ${item.desc} ${item.section} ${item.keywords}`;
        const sc = scoreFuzzyMatch(hay, tokens);
        if (sc >= 0) scored.push({ item, sc });
      }
      scored.sort((a, b) => b.sc - a.sc);
      filtered = scored.slice(0, 36).map((x) => x.item);
    }
    selectedIdx = 0;
    renderList();
  };

  const executeIndex = (idx) => {
    const item = filtered[idx];
    if (!item) return;
    close();
    try {
      item.run();
    } catch (err) {
      actions.showAppToast(`执行指令出错：${err.message}`);
    }
  };

  const open = (initialQuery = '') => {
    if (!modalEl || !inputEl) return;
    allCommands = buildCommandCatalog();
    isOpen = true;
    modalEl.classList.add('open');
    modalEl.setAttribute('aria-hidden', 'false');
    inputEl.value = initialQuery;
    applyFilter(initialQuery);
    setTimeout(() => {
      inputEl.focus();
      inputEl.select();
    }, 15);
  };

  const close = () => {
    if (!modalEl) return;
    isOpen = false;
    modalEl.classList.remove('open');
    modalEl.setAttribute('aria-hidden', 'true');
  };

  const toggle = () => {
    if (isOpen) close();
    else open('');
  };

  if (inputEl) {
    inputEl.addEventListener('input', () => applyFilter(inputEl.value));
    inputEl.addEventListener('keydown', (e) => {
      if (!isOpen) return;
      if (e.key === 'ArrowDown' && filtered.length) {
        e.preventDefault();
        selectedIdx = (selectedIdx + 1) % filtered.length;
        renderList();
      } else if (e.key === 'ArrowUp' && filtered.length) {
        e.preventDefault();
        selectedIdx = (selectedIdx - 1 + filtered.length) % filtered.length;
        renderList();
      } else if (e.key === 'Enter' && filtered.length) {
        e.preventDefault();
        executeIndex(selectedIdx);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    });
  }

  if (modalEl) {
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) close();
    });
  }

  return { open, close, toggle, isOpen: () => isOpen };
}
