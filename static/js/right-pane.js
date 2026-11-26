/* ==========================================================================
   Antigravity Studio — Dynamic Multi-Tab Right Pane Controller
   Tab Strip, Launcher, Explorer Tree, Light Editor, Side-by-Side Split,
   Focus-Wide, Artifact Viewer, Streaming Terminal, Resizer & Custom CSS Studio
   ========================================================================== */

import {
  escapeHtml,
  fileExtBadge,
  folderBasename,
  formatBytes,
  shortenPath,
} from './markdown-utils.js';
import { isEditableFileData, renderFileBodyHtmlInto } from './file-renderer.js';
import { runStreamingTerminal } from './terminal-sse.js';

const CSS_PRESETS = {
  wider: `\n:root {\n  --chat-max-width: 920px;\n}\n`,
  larger: `\n:root {\n  --font-size-body: 17.5px;\n  --line-height-body: 1.78;\n}\n`,
  rose: `\n:root {\n  --accent: #B84A62;\n  --accent-hover: #9E3B50;\n  --starburst: #C95B72;\n}\n`,
};

export function createRightPaneController({ state, dom, actions }) {
  const $ = (id) => document.getElementById(id);
  const {
    appEl,
    stageCardShell,
    sidePane,
    sidePaneResizer,
    rpDynamicTabs,
    btnToggleRightPane,
    btnRpFocusWide,
    iconRpFocusWide,
    rpFileMoreWrap,
    btnRpFileMore,
    btnRpMenuSplit,
    btnRpMenuFocus,
    btnRpFileEdit,
    btnRpFileSave,
    btnRpMenuEdit,
    paneLauncherBody,
    paneFileBody,
    paneExplorerBody,
    paneChangesBody,
    paneArtifactBody,
    paneTerminalBody,
    paneCssBody,
    rpLauncherSearch,
    rpLauncherSearchResults,
    rpLauncherDefault,
    rpLauncherCwd,
    rpLauncherTree,
    btnRpLauncherRefresh,
    rpFilesCwd,
    rpFilesSearch,
    rpFilesTree,
    btnRpExplorerRefresh,
    btnRpChangesRefresh,
    rpReaderPath,
    rpReaderMeta,
    rpReaderContent,
    btnRpReaderMdToggle,
    btnRpToggleSplit,
    btnRpReaderCite,
    btnRpReaderCopy,
    btnRpReaderExternal,
    btnRpReaderReload,
    rpSplitContainer,
    rpFileSlot1,
    rpSplitSelect,
    rpSplitMeta,
    rpSplitContent,
    btnRpSplitMdToggle,
    btnRpSplitOrient,
    btnRpSplitCite,
    btnRpSplitClose,
    rpArtifactTitle,
    rpArtifactEmpty,
    artifactTabs,
    artifactIframe,
    artifactSource,
    btnTopbarArtifact,
    rpTermCwd,
    rpTermOutput,
    rpTermInput,
    btnRpTermRun,
    btnRpTermClear,
    btnRpTermStop,
    cssEditor,
    cssSaveStatus,
    livePreviewCss,
    customCssLink,
    composerInput,
  } = dom;

  let rpSearchTimer = null;
  let rpLauncherSearchTimer = null;
  let rpLauncherLastMatches = [];
  let wsEntryPending = null;

  const treeCtxMenu = $('rp-tree-ctx-menu');
  const wsEntryModal = $('workspace-entry-modal');
  const wsEntryTitle = $('ws-entry-modal-title');
  const wsEntryHint = $('ws-entry-modal-hint');
  const wsEntryInput = $('ws-entry-modal-input');
  const wsEntryError = $('ws-entry-modal-error');
  const wsEntryConfirm = $('btn-ws-entry-confirm');

  function closeTreeCtxMenu() {
    if (treeCtxMenu) treeCtxMenu.style.display = 'none';
  }

  function closeWsEntryModal() {
    if (wsEntryModal) wsEntryModal.classList.remove('open');
    wsEntryPending = null;
  }

  function openWsEntryModal({ mode, targetPath = '', baseDir = '', isDir = false }) {
    if (!wsEntryModal) return;
    wsEntryPending = { mode, targetPath, baseDir, isDir };
    if (wsEntryError) wsEntryError.textContent = '';
    if (wsEntryConfirm) {
      wsEntryConfirm.classList.remove('danger-btn');
      wsEntryConfirm.disabled = false;
    }

    if (mode === 'new-file') {
      wsEntryTitle.textContent = '新建文件';
      wsEntryHint.textContent = baseDir ? `所在目录：${baseDir}/` : '所在目录：工作区根目录（支持子路径，如 src/utils.py）';
      wsEntryInput.style.display = 'block';
      wsEntryInput.value = baseDir ? `${baseDir}/` : '';
      wsEntryInput.placeholder = '例如：notes.md 或 src/helper.py';
      wsEntryConfirm.textContent = '创建并编辑';
    } else if (mode === 'new-folder') {
      wsEntryTitle.textContent = '新建文件夹';
      wsEntryHint.textContent = baseDir ? `所在目录：${baseDir}/` : '所在目录：工作区根目录';
      wsEntryInput.style.display = 'block';
      wsEntryInput.value = baseDir ? `${baseDir}/` : '';
      wsEntryInput.placeholder = '例如：components 或 docs/notes';
      wsEntryConfirm.textContent = '创建文件夹';
    } else if (mode === 'rename') {
      wsEntryTitle.textContent = isDir ? '重命名文件夹' : '重命名文件';
      wsEntryHint.textContent = `原路径：${targetPath}`;
      wsEntryInput.style.display = 'block';
      wsEntryInput.value = targetPath;
      wsEntryInput.placeholder = '输入新的相对路径或文件名';
      wsEntryConfirm.textContent = '确认重命名';
    } else if (mode === 'delete') {
      wsEntryTitle.textContent = isDir ? '删除文件夹' : '删除文件';
      wsEntryHint.textContent = isDir
        ? `确定要永久删除文件夹「${targetPath}」及其全部内容吗？此操作无法撤销。`
        : `确定要永久删除文件「${targetPath}」吗？此操作无法撤销。`;
      wsEntryInput.style.display = 'none';
      wsEntryConfirm.textContent = '确认删除';
      wsEntryConfirm.classList.add('danger-btn');
    }

    wsEntryModal.classList.add('open');
    if (wsEntryInput.style.display !== 'none') {
      setTimeout(() => {
        wsEntryInput.focus();
        if (mode === 'rename') {
          const slashIdx = wsEntryInput.value.lastIndexOf('/');
          const dotIdx = wsEntryInput.value.lastIndexOf('.');
          const start = slashIdx >= 0 ? slashIdx + 1 : 0;
          const end = !isDir && dotIdx > start ? dotIdx : wsEntryInput.value.length;
          wsEntryInput.setSelectionRange(start, end);
        } else {
          wsEntryInput.setSelectionRange(wsEntryInput.value.length, wsEntryInput.value.length);
        }
      }, 20);
    }
  }

  async function submitWsEntryModal() {
    if (!wsEntryPending) return;
    const { mode, targetPath, isDir } = wsEntryPending;
    const val = (wsEntryInput ? wsEntryInput.value : '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
    if (mode !== 'delete' && !val) {
      if (wsEntryError) wsEntryError.textContent = '名称不能为空';
      return;
    }

    if (wsEntryConfirm) wsEntryConfirm.disabled = true;
    try {
      let url = '';
      let body = {};
      if (mode === 'new-file' || mode === 'new-folder') {
        url = '/api/workspace/create';
        body = { cwd: state.activeCwd || '', path: val, kind: mode === 'new-folder' ? 'dir' : 'file' };
      } else if (mode === 'rename') {
        if (val === targetPath) {
          closeWsEntryModal();
          return;
        }
        url = '/api/workspace/rename';
        body = { cwd: state.activeCwd || '', old_path: targetPath, new_path: val };
      } else if (mode === 'delete') {
        url = '/api/workspace/delete';
        body = { cwd: state.activeCwd || '', path: targetPath };
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.ok) {
        if (wsEntryError) wsEntryError.textContent = data.error || '操作失败';
        if (wsEntryConfirm) wsEntryConfirm.disabled = false;
        return;
      }

      closeWsEntryModal();
      state.rightPane.dirCache.clear();
      if (actions.invalidateFileCache) actions.invalidateFileCache();

      if (mode === 'new-file') {
        const parentRel = data.rel_path.includes('/') ? data.rel_path.slice(0, data.rel_path.lastIndexOf('/')) : '';
        if (parentRel) state.rightPane.expandedDirs.add(parentRel);
        await reloadExpandedWorkspaceTrees();
        await openFileInRightPane(data.rel_path, true);
        const curTab = getActiveRightTab();
        if (curTab && curTab.kind === 'file' && !curTab.editing) {
          curTab.editing = true;
          curTab.draftContent = '';
          syncRightPaneView();
          renderActiveFileTab(curTab);
        }
        actions.showAppToast(`已创建 ${data.rel_path} ✓`, { duration: 2200 });
      } else if (mode === 'new-folder') {
        state.rightPane.expandedDirs.add(data.rel_path);
        const parentRel = data.rel_path.includes('/') ? data.rel_path.slice(0, data.rel_path.lastIndexOf('/')) : '';
        if (parentRel) state.rightPane.expandedDirs.add(parentRel);
        await reloadExpandedWorkspaceTrees();
        actions.showAppToast(`已创建文件夹 ${data.rel_path} ✓`, { duration: 2200 });
      } else if (mode === 'rename') {
        // Sync any open Right Pane file tabs matching the renamed path or folder prefix
        for (const tab of state.rightPane.tabs) {
          if (tab.kind !== 'file') continue;
          if (tab.relPath === data.old_rel_path) {
            const oldId = tab.id;
            tab.relPath = data.new_rel_path;
            tab.id = `file:${data.new_rel_path}`;
            tab.title = data.name;
            const dot = data.name.lastIndexOf('.');
            tab.ext = dot !== -1 ? data.name.slice(dot).toLowerCase() : '';
            tab.fileData = null;
            if (state.rightPane.activeTabId === oldId) state.rightPane.activeTabId = tab.id;
            if (state.rightPane.splitTabId === oldId) state.rightPane.splitTabId = tab.id;
          } else if (isDir && tab.relPath.startsWith(data.old_rel_path + '/')) {
            const oldId = tab.id;
            const suffix = tab.relPath.slice(data.old_rel_path.length);
            tab.relPath = data.new_rel_path + suffix;
            tab.id = `file:${tab.relPath}`;
            tab.fileData = null;
            if (state.rightPane.activeTabId === oldId) state.rightPane.activeTabId = tab.id;
            if (state.rightPane.splitTabId === oldId) state.rightPane.splitTabId = tab.id;
          }
        }
        await reloadExpandedWorkspaceTrees();
        const active = getActiveRightTab();
        if (active && active.kind === 'file' && !active.fileData) await fetchFileTabContent(active);
        renderRightTabBar();
        actions.showAppToast(`已重命名为 ${data.new_rel_path} ✓`, { duration: 2200 });
      } else if (mode === 'delete') {
        const toClose = state.rightPane.tabs
          .filter(
            (t) =>
              t.kind === 'file' &&
              (t.relPath === targetPath || (isDir && t.relPath.startsWith(targetPath + '/')))
          )
          .map((t) => t.id);
        for (const tid of toClose) closeRightTab(tid);
        state.rightPane.expandedDirs.delete(targetPath);
        await reloadExpandedWorkspaceTrees();
        actions.showAppToast(`已删除 ${targetPath}`, { duration: 2200 });
      }
      actions.loadGitChanges(true);
    } catch (err) {
      if (wsEntryError) wsEntryError.textContent = `请求出错：${err.message}`;
      if (wsEntryConfirm) wsEntryConfirm.disabled = false;
    }
  }

  async function reloadExpandedWorkspaceTrees() {
    state.rightPane.dirCache.clear();
    await loadWorkspaceTree('', true);
    for (const dirRel of Array.from(state.rightPane.expandedDirs)) {
      await loadWorkspaceTree(dirRel, true);
    }
  }

  function showTreeContextMenu(e, entry) {
    if (!treeCtxMenu) return;
    e.preventDefault();
    e.stopPropagation();

    const menuItems = entry.is_dir
      ? [
          { act: 'new-file', label: '新建文件…' },
          { act: 'new-folder', label: '新建子文件夹…' },
          { sep: true },
          { act: 'rename', label: '重命名…' },
          { act: 'delete', label: '删除文件夹…', danger: true },
        ]
      : [
          { act: 'open', label: '在右侧打开' },
          { act: 'split', label: '并排分屏打开' },
          { act: 'cite', label: '@ 引用到对话' },
          { sep: true },
          { act: 'rename', label: '重命名…' },
          { act: 'delete', label: '删除文件…', danger: true },
        ];

    treeCtxMenu.innerHTML = menuItems
      .map((it) =>
        it.sep
          ? '<div class="codex-menu-sep"></div>'
          : `<button type="button" class="codex-menu-item ${it.danger ? 'is-danger' : ''}" data-tree-act="${it.act}"><span>${escapeHtml(it.label)}</span></button>`
      )
      .join('');

    treeCtxMenu.style.display = 'block';
    const mw = 172;
    const mh = menuItems.length * 30 + 14;
    const left = Math.min(e.clientX, window.innerWidth - mw - 10);
    const top = Math.min(e.clientY, window.innerHeight - mh - 10);
    treeCtxMenu.style.left = `${Math.max(8, left)}px`;
    treeCtxMenu.style.top = `${Math.max(8, top)}px`;

    treeCtxMenu.querySelectorAll('[data-tree-act]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const act = btn.dataset.treeAct;
        closeTreeCtxMenu();
        if (act === 'open') {
          openFileInRightPane(entry.rel_path);
        } else if (act === 'split') {
          await openFileInRightPane(entry.rel_path);
          openFileInSplitSlot(`file:${entry.rel_path}`);
        } else if (act === 'cite') {
          const abs = state.activeCwd ? `${state.activeCwd.replace(/[\\/]+$/, '')}/${entry.rel_path}` : entry.rel_path;
          citeWorkspaceFileToComposer(abs, entry.rel_path, entry.size || 0, false);
        } else if (act === 'new-file') {
          openWsEntryModal({ mode: 'new-file', baseDir: entry.rel_path });
        } else if (act === 'new-folder') {
          openWsEntryModal({ mode: 'new-folder', baseDir: entry.rel_path });
        } else if (act === 'rename') {
          openWsEntryModal({ mode: 'rename', targetPath: entry.rel_path, isDir: Boolean(entry.is_dir) });
        } else if (act === 'delete') {
          openWsEntryModal({ mode: 'delete', targetPath: entry.rel_path, isDir: Boolean(entry.is_dir) });
        }
      });
    });
  }

  async function refreshOpenFileTabs(silentNotify = true) {
    const fileTabs = state.rightPane.tabs.filter((t) => t.kind === 'file' && !t.editDirty);
    if (!fileTabs.length) return [];
    const updatedNames = [];
    const activeTab = getActiveRightTab();

    for (const tab of fileTabs) {
      try {
        const url = `/api/workspace/read?cwd=${encodeURIComponent(state.activeCwd || '')}&path=${encodeURIComponent(tab.relPath)}`;
        const res = await fetch(url);
        const fresh = await res.json();
        if (!fresh.ok) continue;

        const prev = tab.fileData;
        const changed =
          !prev ||
          prev.size !== fresh.size ||
          prev.lines !== fresh.lines ||
          (typeof prev.content === 'string' && typeof fresh.content === 'string' && prev.content !== fresh.content);

        if (changed) {
          if (tab === activeTab && rpReaderContent) {
            tab.scrollTop = rpReaderContent.scrollTop;
          }
          tab.fileData = fresh;
          if (tab.editing) {
            tab.draftContent = fresh.content || '';
          }
          updatedNames.push(tab.title);
          if (tab === activeTab && sidePane.classList.contains('open') && state.sidePaneMode === 'file') {
            renderActiveFileTab(tab);
          }
          if (state.rightPane.splitActive && state.rightPane.splitTabId === tab.id) {
            renderSplitSecondSlot();
          }
        }
      } catch {
        // ignore transient refresh failure
      }
    }

    if (silentNotify && updatedNames.length) {
      const label =
        updatedNames.length <= 2
          ? updatedNames.join('、')
          : `${updatedNames.slice(0, 2).join('、')} 等 ${updatedNames.length} 个文件`;
      actions.showAppToast(`右侧文件已热更新：${label} ✓`, { duration: 2600 });
    }
    return updatedNames;
  }

  function getActiveRightTab() {
    if (state.rightPane.showLauncher) return null;
    return state.rightPane.tabs.find((t) => t.id === state.rightPane.activeTabId) || null;
  }

  function saveCurrentFileScroll() {
    const cur = getActiveRightTab();
    if (cur && cur.kind === 'file' && rpReaderContent) {
      cur.scrollTop = rpReaderContent.scrollTop;
    }
  }

  function tabIconMarkup(tab) {
    if (tab.kind === 'explorer') return '📁';
    if (tab.kind === 'changes') return '⎇';
    if (tab.kind === 'terminal') return '&gt;_';
    if (tab.kind === 'artifact') return '✦';
    if (tab.kind === 'css') return '{}';
    const ext = (tab.ext || '').replace(/^\./, '').toLowerCase();
    if (ext === 'css' || ext === 'json') return '{}';
    if (ext === 'html' || ext === 'htm' || ext === 'svg') return '&lt;&gt;';
    if (ext === 'md' || ext === 'markdown') return 'MD';
    if (ext === 'py') return 'PY';
    if (ext === 'js' || ext === 'jsx' || ext === 'mjs') return 'JS';
    if (ext === 'ts' || ext === 'tsx') return 'TS';
    if (ext === 'pdf') return 'PDF';
    if (ext === 'docx' || ext === 'doc') return 'DOC';
    if (ext === 'xlsx' || ext === 'csv' || ext === 'tsv') return 'TBL';
    if (ext === 'pptx') return 'PPT';
    if (ext === 'ipynb') return 'NB';
    if (ext === 'zip') return 'ZIP';
    if (ext === 'mp4' || ext === 'webm' || ext === 'mov' || ext === 'mp3' || ext === 'wav' || ext === 'm4a') return '▶';
    if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp' || ext === 'gif' || ext === 'ico') return '🖼';
    return '📄';
  }

  function ensureSidePaneOpen() {
    if (window.innerWidth < 1180 && !appEl.classList.contains('sidebar-collapsed')) {
      appEl.classList.add('sidebar-collapsed');
      state.rightPane.autoCollapsedLeft = true;
    }
    sidePane.classList.add('open');
  }

  function renderRightTabBar() {
    if (!rpDynamicTabs) return;
    rpDynamicTabs.innerHTML = '';

    for (const tab of state.rightPane.tabs) {
      const isAct = !state.rightPane.showLauncher && state.rightPane.activeTabId === tab.id;
      const btn = document.createElement('div');
      btn.className = 'rp-dyn-tab' + (isAct ? ' active' : '');
      btn.dataset.tabId = tab.id;
      btn.title = tab.relPath || tab.title;
      btn.innerHTML = `
        <span class="rp-dyn-tab-icon">${tabIconMarkup(tab)}</span>
        <span class="rp-dyn-tab-label">${escapeHtml(tab.title)}</span>
        ${tab.editDirty ? '<span class="rp-tab-dirty-dot" title="有未保存修改 (Ctrl+S)"></span>' : ''}
        <button type="button" class="rp-dyn-tab-close" title="关闭标签页">×</button>
      `;

      btn.addEventListener('click', (e) => {
        if (e.target.closest('.rp-dyn-tab-close')) {
          e.stopPropagation();
          closeRightTab(tab.id);
          return;
        }
        if ((e.ctrlKey || e.shiftKey) && tab.kind === 'file') {
          openFileInSplitSlot(tab.id);
          return;
        }
        activateRightTab(tab.id);
      });
      btn.addEventListener('auxclick', (e) => {
        if (e.button === 1) {
          e.preventDefault();
          closeRightTab(tab.id);
        }
      });
      if (tab.kind === 'file') {
        btn.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          activateRightTab(tab.id);
          if (rpFileMoreWrap) rpFileMoreWrap.classList.add('open');
        });
      }
      rpDynamicTabs.appendChild(btn);
    }

    const plusBtn = document.createElement('button');
    plusBtn.type = 'button';
    plusBtn.id = 'btn-rp-new-tab';
    plusBtn.className = 'rp-new-tab-btn' + (state.rightPane.showLauncher ? ' active' : '');
    plusBtn.title = '打开新标签页（文件 / 变更 / 终端 / 产物）';
    plusBtn.textContent = '+';
    plusBtn.addEventListener('click', () => openLauncherView());
    rpDynamicTabs.appendChild(plusBtn);

    const activeEl = rpDynamicTabs.querySelector('.rp-dyn-tab.active');
    if (activeEl && activeEl.scrollIntoView) {
      activeEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  function closeRpFileMoreMenu() {
    if (rpFileMoreWrap) rpFileMoreWrap.classList.remove('open');
  }

  function setMenuItemLabel(btn, text) {
    if (!btn) return;
    const sp = btn.querySelector('span');
    if (sp) sp.textContent = text;
    else btn.textContent = text;
  }

  function syncRightPaneView() {
    const isOpen = sidePane.classList.contains('open');
    const activeTab = getActiveRightTab();
    const mode = state.rightPane.showLauncher ? 'launcher' : (activeTab ? activeTab.kind : 'launcher');
    state.sidePaneMode = isOpen ? mode : null;

    if (!isOpen || mode === 'launcher') {
      state.rightPane.focusWide = false;
    }
    if (!isOpen || mode !== 'file') {
      closeRpFileMoreMenu();
    }

    if (btnToggleRightPane) btnToggleRightPane.classList.toggle('active', isOpen);
    btnTopbarArtifact.classList.toggle('active', isOpen && mode === 'artifact');

    paneLauncherBody.style.display = mode === 'launcher' ? 'flex' : 'none';
    paneFileBody.style.display = mode === 'file' ? 'flex' : 'none';
    paneExplorerBody.style.display = mode === 'explorer' ? 'flex' : 'none';
    paneChangesBody.style.display = mode === 'changes' ? 'flex' : 'none';
    paneArtifactBody.style.display = mode === 'artifact' ? 'flex' : 'none';
    paneTerminalBody.style.display = mode === 'terminal' ? 'flex' : 'none';
    paneCssBody.style.display = mode === 'css' ? 'flex' : 'none';

    const showFileActions = isOpen && mode === 'file';
    const isEditableTab = showFileActions && activeTab && isEditableFileData(activeTab.fileData);
    if (btnRpFileEdit) {
      btnRpFileEdit.style.display = isEditableTab ? 'inline-flex' : 'none';
      btnRpFileEdit.classList.toggle('is-active', Boolean(activeTab && activeTab.editing));
      btnRpFileEdit.title = activeTab && activeTab.editing ? '退出编辑回到只读视图' : '切换轻量编辑模式 (Ctrl+S 保存)';
    }
    if (btnRpFileSave) {
      const showSave = Boolean(isEditableTab && activeTab && activeTab.editing && activeTab.editDirty);
      btnRpFileSave.style.display = showSave ? 'inline-flex' : 'none';
      btnRpFileSave.disabled = !showSave;
      btnRpFileSave.textContent = '保存 ●';
    }
    if (btnRpMenuEdit) {
      btnRpMenuEdit.style.display = isEditableTab ? 'flex' : 'none';
      setMenuItemLabel(btnRpMenuEdit, activeTab && activeTab.editing ? '退出编辑模式' : '编辑文件');
    }
    if (btnRpToggleSplit) {
      btnRpToggleSplit.style.display = showFileActions ? 'inline-flex' : 'none';
      btnRpToggleSplit.classList.toggle('is-active', state.rightPane.splitActive);
    }
    if (rpFileMoreWrap) {
      rpFileMoreWrap.style.display = showFileActions ? 'block' : 'none';
    }
    const showFocusBtn = isOpen && mode !== 'launcher';
    if (btnRpFocusWide) {
      btnRpFocusWide.style.display = showFocusBtn ? 'inline-flex' : 'none';
      btnRpFocusWide.classList.toggle('is-active', Boolean(state.rightPane.focusWide));
      btnRpFocusWide.title = state.rightPane.focusWide ? '退出全宽专注阅读，恢复对话分栏' : '全宽专注阅读';
    }
    if (iconRpFocusWide) {
      iconRpFocusWide.innerHTML = state.rightPane.focusWide
        ? '<polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="3" y1="21" x2="10" y2="14"></line>'
        : '<polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line>';
    }
    if (stageCardShell) {
      stageCardShell.classList.toggle('rp-focus-wide', isOpen && Boolean(state.rightPane.focusWide));
    }
    setMenuItemLabel(btnRpMenuSplit, state.rightPane.splitActive ? '关闭并排分屏' : '并排阅读两个文件');
    setMenuItemLabel(btnRpMenuFocus, state.rightPane.focusWide ? '退出全宽专注阅读' : '全宽专注阅读');

    const showSplitNow = isOpen && mode === 'file' && state.rightPane.splitActive;
    sidePane.classList.toggle('is-split', showSplitNow);

    renderRightTabBar();
  }

  function openLauncherView() {
    saveCurrentFileScroll();
    ensureSidePaneOpen();
    state.rightPane.showLauncher = true;
    syncRightPaneView();

    if (rpLauncherCwd) {
      rpLauncherCwd.textContent = folderBasename(state.activeCwd);
      rpLauncherCwd.title = state.activeCwd;
    }
    if (rpLauncherSearch) {
      rpLauncherSearch.value = '';
      if (rpLauncherSearchResults) rpLauncherSearchResults.style.display = 'none';
      if (rpLauncherDefault) rpLauncherDefault.style.display = 'block';
    }
    if (!state.rightPane.dirCache.size) {
      loadWorkspaceTree('', true);
    } else {
      renderAllWorkspaceTrees();
    }
    setTimeout(() => rpLauncherSearch && rpLauncherSearch.focus(), 40);
  }

  function activateRightTab(tabId) {
    const tab = state.rightPane.tabs.find((t) => t.id === tabId);
    if (!tab) return;
    saveCurrentFileScroll();
    ensureSidePaneOpen();
    state.rightPane.activeTabId = tab.id;
    state.rightPane.showLauncher = false;
    syncRightPaneView();

    if (tab.kind === 'file') {
      if (tab.fileData) {
        renderActiveFileTab(tab);
      } else {
        fetchFileTabContent(tab);
      }
      if (state.rightPane.splitActive) {
        renderSplitSecondSlot();
      }
    } else if (tab.kind === 'explorer') {
      if (rpFilesCwd) {
        rpFilesCwd.textContent = folderBasename(state.activeCwd);
        rpFilesCwd.title = state.activeCwd;
      }
      if (!state.rightPane.dirCache.size) loadWorkspaceTree('', true);
      else renderAllWorkspaceTrees();
    } else if (tab.kind === 'changes') {
      actions.loadGitChanges(false);
    } else if (tab.kind === 'artifact') {
      renderArtifactPaneState();
    } else if (tab.kind === 'terminal') {
      if (!state.rightPane.termCwd) state.rightPane.termCwd = state.activeCwd || '';
      updateTerminalCwdUi();
      setTimeout(() => rpTermInput && rpTermInput.focus(), 50);
    } else if (tab.kind === 'css') {
      loadCustomCssIntoEditor();
    }
  }

  function closeRightTab(tabId) {
    const idx = state.rightPane.tabs.findIndex((t) => t.id === tabId);
    if (idx === -1) return;
    const wasActive = !state.rightPane.showLauncher && state.rightPane.activeTabId === tabId;
    state.rightPane.tabs.splice(idx, 1);
    if (state.rightPane.splitTabId === tabId) {
      const alt = state.rightPane.tabs.find((t) => t.kind === 'file' && t.id !== state.rightPane.activeTabId);
      state.rightPane.splitTabId = alt ? alt.id : null;
    }

    if (wasActive) {
      if (state.rightPane.tabs.length > 0) {
        const nextTab = state.rightPane.tabs[Math.min(idx, state.rightPane.tabs.length - 1)];
        activateRightTab(nextTab.id);
      } else {
        state.rightPane.activeTabId = null;
        openLauncherView();
      }
    } else {
      renderRightTabBar();
      renderAllWorkspaceTrees();
    }
  }

  function openToolTab(kind) {
    const meta = {
      explorer: { id: 'tool:explorer', title: '文件目录' },
      changes: { id: 'tool:changes', title: 'Review' },
      terminal: { id: 'tool:terminal', title: 'Terminal' },
      artifact: { id: 'tool:artifact', title: (state.lastArtifact && state.lastArtifact.title) || 'Artifact' },
      css: { id: 'tool:css', title: 'Custom CSS' },
    }[kind];
    if (!meta) return;

    let existing = state.rightPane.tabs.find((t) => t.id === meta.id);
    if (!existing) {
      existing = { id: meta.id, kind, title: meta.title };
      state.rightPane.tabs.push(existing);
    } else if (kind === 'artifact' && state.lastArtifact && state.lastArtifact.title) {
      existing.title = state.lastArtifact.title;
    }
    activateRightTab(existing.id);
  }

  async function openFileInRightPane(relPath, forceReload = false) {
    if (!relPath) return;
    const isServerLog = relPath === '__studio_server_log__';
    const normRel = isServerLog
      ? 'data/desktop-server.log'
      : relPath.replace(/\\/g, '/').replace(/^\/+/, '');
    const id = isServerLog ? 'file:__studio_server_log__' : `file:${normRel}`;
    let tab = state.rightPane.tabs.find((t) => t.id === id);
    if (!tab) {
      const name = isServerLog ? '本地运行日志' : folderBasename(normRel);
      const dotIdx = name.lastIndexOf('.');
      const ext = isServerLog ? '.log' : dotIdx !== -1 ? name.slice(dotIdx).toLowerCase() : '';
      tab = {
        id,
        kind: 'file',
        isServerLog,
        relPath: normRel,
        title: name,
        ext,
        fileData: null,
        mdRendered: false,
        scrollTop: 0,
      };
      state.rightPane.tabs.push(tab);
    } else if (forceReload) {
      tab.fileData = null;
    }
    activateRightTab(tab.id);
  }

  function openRightPane(preferredKind) {
    if (preferredKind && preferredKind !== 'launcher') {
      openToolTab(preferredKind);
      return;
    }
    ensureSidePaneOpen();
    if (state.rightPane.tabs.length > 0 && state.rightPane.activeTabId && !state.rightPane.showLauncher) {
      activateRightTab(state.rightPane.activeTabId);
    } else if (state.rightPane.tabs.length > 0 && !preferredKind) {
      activateRightTab(state.rightPane.activeTabId || state.rightPane.tabs[0].id);
    } else {
      openLauncherView();
    }
  }

  function toggleRightPane(preferredKind) {
    if (sidePane.classList.contains('open')) {
      if (preferredKind && state.sidePaneMode !== preferredKind) {
        openRightPane(preferredKind);
      } else {
        closeSidePane();
      }
    } else {
      openRightPane(preferredKind);
    }
  }

  function openCssStudio() {
    openToolTab('css');
  }

  function renderArtifactPaneState() {
    const item = state.lastArtifact;
    if (!item) {
      if (rpArtifactTitle) rpArtifactTitle.textContent = 'Artifact 预览';
      artifactTabs.style.display = 'none';
      if (rpArtifactEmpty) rpArtifactEmpty.style.display = 'flex';
      artifactIframe.style.display = 'none';
      artifactSource.style.display = 'none';
      return;
    }

    if (rpArtifactEmpty) rpArtifactEmpty.style.display = 'none';
    if (rpArtifactTitle) rpArtifactTitle.textContent = item.title || `Artifact (${item.lang})`;
    const isPreviewable = ['html', 'svg'].includes((item.lang || '').toLowerCase());
    artifactTabs.style.display = isPreviewable ? 'inline-flex' : 'none';
    artifactSource.textContent = item.code;

    if (isPreviewable) {
      setArtifactTab('preview');
      const doc =
        item.lang.toLowerCase() === 'svg'
          ? `<!DOCTYPE html><html><body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#FAF9F5;">${item.code}</body></html>`
          : item.code;
      artifactIframe.srcdoc = doc;
    } else {
      setArtifactTab('source');
    }
  }

  function openArtifactPane(item) {
    if (!item) return;
    state.lastArtifact = item;
    btnTopbarArtifact.style.display = 'inline-flex';
    openToolTab('artifact');
  }

  function setArtifactTab(tab) {
    artifactTabs.querySelectorAll('.seg-tab').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    if (!state.lastArtifact) return;
    artifactIframe.style.display = tab === 'preview' ? 'block' : 'none';
    artifactSource.style.display = tab === 'preview' ? 'none' : 'block';
  }

  function closeSidePane() {
    saveCurrentFileScroll();
    state.sidePaneMode = null;
    state.rightPane.focusWide = false;
    closeRpFileMoreMenu();
    if (stageCardShell) stageCardShell.classList.remove('rp-focus-wide');
    sidePane.classList.remove('open');
    if (btnToggleRightPane) btnToggleRightPane.classList.remove('active');
    btnTopbarArtifact.classList.remove('active');
    if (state.rightPane.autoCollapsedLeft) {
      appEl.classList.remove('sidebar-collapsed');
      state.rightPane.autoCollapsedLeft = false;
    }
  }

  function syncRightPaneWorkspace() {
    state.rightPane.expandedDirs.clear();
    state.rightPane.dirCache.clear();
    state.rightPane.tabs = state.rightPane.tabs.filter((t) => t.kind !== 'file');
    if (state.rightPane.activeTabId && !state.rightPane.tabs.some((t) => t.id === state.rightPane.activeTabId)) {
      state.rightPane.activeTabId = state.rightPane.tabs.length ? state.rightPane.tabs[0].id : null;
      if (!state.rightPane.activeTabId) state.rightPane.showLauncher = true;
    }
    state.rightPane.activeDiffPath = '';
    state.rightPane.termCwd = state.activeCwd || '';
    if (rpFilesSearch) rpFilesSearch.value = '';
    if (rpLauncherSearch) rpLauncherSearch.value = '';
    if (rpFilesCwd) {
      rpFilesCwd.textContent = folderBasename(state.activeCwd);
      rpFilesCwd.title = state.activeCwd;
    }
    if (rpLauncherCwd) {
      rpLauncherCwd.textContent = folderBasename(state.activeCwd);
      rpLauncherCwd.title = state.activeCwd;
    }
    updateTerminalCwdUi();
    actions.loadGitChanges(true);
    if (sidePane.classList.contains('open')) {
      syncRightPaneView();
      if (state.sidePaneMode === 'launcher' || state.sidePaneMode === 'explorer') loadWorkspaceTree('', true);
      else if (state.sidePaneMode === 'changes') actions.loadGitChanges(false);
    }
  }

  async function loadWorkspaceTree(relDir = '', force = false) {
    if (!force && state.rightPane.dirCache.has(relDir)) {
      renderAllWorkspaceTrees();
      return;
    }
    if (relDir === '' && !state.rightPane.dirCache.size) {
      const loadingHtml = '<div class="rp-empty-state" style="padding:24px 12px;"><div class="rp-empty-desc">正在加载工作区文件…</div></div>';
      if (rpLauncherTree) rpLauncherTree.innerHTML = loadingHtml;
      if (rpFilesTree) rpFilesTree.innerHTML = loadingHtml;
    }
    try {
      const url = `/api/workspace/tree?cwd=${encodeURIComponent(state.activeCwd || '')}&path=${encodeURIComponent(relDir)}`;
      const res = await fetch(url);
      const data = await res.json();
      state.rightPane.dirCache.set(relDir, data.ok ? data.entries || [] : []);
    } catch {
      state.rightPane.dirCache.set(relDir, []);
    }
    renderAllWorkspaceTrees();
  }

  function renderDirectoryTreeInto(container) {
    if (!container) return;
    const rootEntries = state.rightPane.dirCache.get('') || [];
    container.innerHTML = '';

    if (!rootEntries.length) {
      container.innerHTML = '<div class="rp-empty-state" style="padding:20px 12px;"><div class="rp-empty-desc">当前目录为空</div></div>';
      return;
    }

    const openFileSet = new Set(
      state.rightPane.tabs.filter((t) => t.kind === 'file').map((t) => t.relPath)
    );

    const appendEntries = (entries, depth) => {
      for (const entry of entries) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'rp-tree-row' + (!entry.is_dir && openFileSet.has(entry.rel_path) ? ' active' : '');
        row.style.paddingLeft = `${8 + depth * 15}px`;
        row.title = entry.rel_path;

        if (entry.is_dir) {
          const isExp = state.rightPane.expandedDirs.has(entry.rel_path);
          row.innerHTML = `
            <span class="rp-tree-chevron ${isExp ? 'expanded' : ''}">›</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="color:var(--accent);flex-shrink:0;">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
            <span class="rp-tree-name">${escapeHtml(entry.name)}</span>
            <span class="rp-tree-more-btn" role="button" tabindex="-1" title="更多操作（新建/重命名/删除）">⋯</span>
          `;
          row.addEventListener('contextmenu', (e) => showTreeContextMenu(e, entry));
          row.querySelector('.rp-tree-more-btn').addEventListener('click', (e) => showTreeContextMenu(e, entry));
          row.addEventListener('click', async (e) => {
            if (e.target.closest('.rp-tree-more-btn')) return;
            if (state.rightPane.expandedDirs.has(entry.rel_path)) {
              state.rightPane.expandedDirs.delete(entry.rel_path);
              renderAllWorkspaceTrees();
            } else {
              state.rightPane.expandedDirs.add(entry.rel_path);
              await loadWorkspaceTree(entry.rel_path, false);
            }
          });
          container.appendChild(row);

          if (isExp) {
            const children = state.rightPane.dirCache.get(entry.rel_path);
            if (children && children.length) {
              appendEntries(children, depth + 1);
            } else if (children) {
              const emptyRow = document.createElement('div');
              emptyRow.style.padding = `3px 8px 3px ${30 + depth * 15}px`;
              emptyRow.style.fontSize = '11.5px';
              emptyRow.style.color = 'var(--text-muted)';
              emptyRow.textContent = '（空文件夹）';
              container.appendChild(emptyRow);
            }
          }
        } else {
          row.innerHTML = `
            <span class="rp-tree-chevron" style="opacity:0;">›</span>
            <span class="rp-file-ext-pill">${escapeHtml(fileExtBadge(entry.name))}</span>
            <span class="rp-tree-name">${escapeHtml(entry.name)}</span>
            <span class="rp-tree-meta">${escapeHtml(formatBytes(entry.size))}</span>
            <span class="rp-tree-more-btn" role="button" tabindex="-1" title="更多操作（重命名/删除/分屏）">⋯</span>
          `;
          row.addEventListener('contextmenu', (e) => showTreeContextMenu(e, entry));
          row.querySelector('.rp-tree-more-btn').addEventListener('click', (e) => showTreeContextMenu(e, entry));
          row.addEventListener('click', (e) => {
            if (e.target.closest('.rp-tree-more-btn')) return;
            openFileInRightPane(entry.rel_path);
          });
          container.appendChild(row);
        }
      }
    };

    appendEntries(rootEntries, 0);
  }

  function renderAllWorkspaceTrees() {
    renderDirectoryTreeInto(rpLauncherTree);
    if (!rpFilesSearch || !rpFilesSearch.value.trim()) {
      renderDirectoryTreeInto(rpFilesTree);
    }
  }

  async function searchRightPaneFilesInto(query, container, onEmptyRestore) {
    const q = (query || '').trim();
    if (!q) {
      if (onEmptyRestore) onEmptyRestore();
      return [];
    }
    try {
      const url = `/api/fs/files?cwd=${encodeURIComponent(state.activeCwd || '')}&q=${encodeURIComponent(q)}`;
      const res = await fetch(url);
      const data = await res.json();
      const files = data.files || [];
      container.innerHTML = '';
      if (!files.length) {
        container.innerHTML = '<div class="rp-empty-state" style="padding:20px 12px;"><div class="rp-empty-desc">未找到匹配文件</div></div>';
        return [];
      }
      for (const f of files) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'rp-tree-row';
        row.title = f.rel_path;
        row.innerHTML = `
          <span class="rp-file-ext-pill">${escapeHtml(fileExtBadge(f.name))}</span>
          <span class="rp-tree-name">${escapeHtml(f.rel_path)}</span>
          <span class="rp-tree-meta">${escapeHtml(formatBytes(f.size))}</span>
        `;
        row.addEventListener('click', () => openFileInRightPane(f.rel_path));
        container.appendChild(row);
      }
      return files;
    } catch {
      container.innerHTML = '<div class="rp-empty-state" style="padding:20px 12px;"><div class="rp-empty-desc">搜索失败</div></div>';
      return [];
    }
  }

  async function fetchFileTabContent(tab) {
    rpReaderPath.textContent = tab.relPath;
    rpReaderPath.title = tab.relPath;
    rpReaderMeta.textContent = '读取中…';
    rpReaderContent.innerHTML = '<div class="rp-empty-state"><div class="rp-empty-desc">正在读取文件…</div></div>';

    try {
      const url = tab.isServerLog
        ? '/api/server-log'
        : `/api/workspace/read?cwd=${encodeURIComponent(state.activeCwd || '')}&path=${encodeURIComponent(tab.relPath)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!data.ok) {
        if (getActiveRightTab() === tab) {
          rpReaderMeta.textContent = '读取失败';
          rpReaderContent.innerHTML = `<div class="rp-empty-state"><div class="rp-empty-desc">${escapeHtml(data.error || '无法读取文件')}</div></div>`;
        }
        return;
      }
      tab.fileData = data;
      if (getActiveRightTab() === tab) {
        renderActiveFileTab(tab);
      }
    } catch (err) {
      if (getActiveRightTab() === tab) {
        rpReaderMeta.textContent = '读取出错';
        rpReaderContent.innerHTML = `<div class="rp-empty-state"><div class="rp-empty-desc">${escapeHtml(err.message)}</div></div>`;
      }
    }
  }

  function openExternalPath(targetPath, reveal = false) {
    fetch('/api/workspace/open-external', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cwd: state.activeCwd || '', path: targetPath, reveal: Boolean(reveal) }),
    }).catch(() => {});
  }

  async function saveActiveFileEdit(tab) {
    if (!tab || !tab.fileData || !tab.editing) return;
    const nextContent = typeof tab.draftContent === 'string' ? tab.draftContent : (tab.fileData.content || '');
    if (btnRpFileSave) {
      btnRpFileSave.disabled = true;
      btnRpFileSave.textContent = '保存中…';
    }
    try {
      const res = await fetch('/api/workspace/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cwd: state.activeCwd || '',
          path: tab.fileData.rel_path || tab.relPath,
          content: nextContent,
        }),
      });
      const d = await res.json();
      if (!d.ok) {
        actions.showAppToast(d.error || '文件保存失败');
        if (btnRpFileSave) {
          btnRpFileSave.disabled = false;
          btnRpFileSave.textContent = '保存 ●';
        }
        return;
      }
      tab.fileData.content = nextContent;
      tab.fileData.size = d.size;
      tab.fileData.lines = d.lines;
      tab.editDirty = false;
      renderRightTabBar();
      if (btnRpFileSave) {
        btnRpFileSave.disabled = true;
        btnRpFileSave.textContent = '已保存 ✓';
        setTimeout(() => {
          if (!tab.editDirty && btnRpFileSave) btnRpFileSave.style.display = 'none';
        }, 1000);
      }
      actions.showAppToast(`已保存 ${tab.fileData.rel_path || tab.title} ✓`, { duration: 2200 });
      actions.loadGitChanges(true);
    } catch (err) {
      actions.showAppToast(`保存出错：${err.message}`);
      if (btnRpFileSave) {
        btnRpFileSave.disabled = false;
        btnRpFileSave.textContent = '保存 ●';
      }
    }
  }

  function toggleActiveFileEdit() {
    const tab = getActiveRightTab();
    if (!tab || tab.kind !== 'file' || !isEditableFileData(tab.fileData)) return;
    tab.editing = !tab.editing;
    if (tab.editing) {
      tab.draftContent = tab.editDirty && typeof tab.draftContent === 'string'
        ? tab.draftContent
        : (tab.fileData.content || '');
    }
    syncRightPaneView();
    renderActiveFileTab(tab);
  }

  const getFileRendererDeps = () => ({
    renderMarkdown: actions.renderMarkdown,
    openExternalPath,
    primaryReaderEl: rpReaderContent,
    btnSaveEl: btnRpFileSave,
    renderRightTabBar,
    saveActiveFileEdit,
  });

  function renderActiveFileTab(tab) {
    if (!tab) return;
    const f = tab.fileData;
    rpReaderPath.textContent = (f && f.rel_path) || tab.relPath;
    rpReaderPath.title = (f && f.abs_path) || tab.relPath;

    const info = renderFileBodyHtmlInto(rpReaderContent, tab, () => renderActiveFileTab(tab), getFileRendererDeps());
    rpReaderMeta.textContent = info.meta;
    btnRpReaderMdToggle.style.display = info.toggleLabel ? 'flex' : 'none';
    if (info.toggleLabel) {
      const labelMap = {
        '渲染': '切换为 Markdown 渲染视图',
        '源码': '切换为源码视图',
        '预览': '切换为实时预览',
        '精简': '隐藏 PDF 工具栏（精简）',
        '工具栏': '显示 PDF 工具栏',
        '纯文本': '切换为纯文本视图',
        '排版': '切换为排版视图',
      };
      setMenuItemLabel(btnRpReaderMdToggle, labelMap[info.toggleLabel] || info.toggleLabel);
    }
    btnRpReaderCopy.style.display = info.canCopy ? 'flex' : 'none';
    const isEditable = Boolean(!f || !f.read_only) && isEditableFileData(f);
    if (btnRpFileEdit) {
      btnRpFileEdit.style.display = isEditable ? 'inline-flex' : 'none';
      btnRpFileEdit.classList.toggle('is-active', Boolean(tab.editing));
    }
    if (btnRpFileSave) {
      const showSave = Boolean(isEditable && tab.editing && tab.editDirty);
      btnRpFileSave.style.display = showSave ? 'inline-flex' : 'none';
      btnRpFileSave.disabled = !showSave;
      btnRpFileSave.textContent = '保存 ●';
    }
    if (btnRpMenuEdit) {
      btnRpMenuEdit.style.display = isEditable ? 'flex' : 'none';
      setMenuItemLabel(btnRpMenuEdit, tab.editing ? '退出编辑模式' : '编辑文件');
    }
    if (!tab.editing) {
      rpReaderContent.scrollTop = tab.scrollTop || 0;
    }
  }

  function toggleRightPaneFocusWide() {
    if (!sidePane.classList.contains('open')) return;
    state.rightPane.focusWide = !state.rightPane.focusWide;
    syncRightPaneView();
  }

  function openFileInSplitSlot(tabId) {
    state.rightPane.splitActive = true;
    state.rightPane.splitTabId = tabId;
    if (window.innerWidth < 1450 && !appEl.classList.contains('sidebar-collapsed')) {
      appEl.classList.add('sidebar-collapsed');
      state.rightPane.autoCollapsedLeft = true;
    }
    ensureSidePaneOpen();
    if (!getActiveRightTab() || getActiveRightTab().kind !== 'file') {
      const firstFile = state.rightPane.tabs.find((t) => t.kind === 'file');
      if (firstFile) {
        state.rightPane.activeTabId = firstFile.id;
        state.rightPane.showLauncher = false;
      }
    }
    syncRightPaneView();
    renderSplitSecondSlot();
  }

  function toggleSplitReading() {
    const active = getActiveRightTab();
    if (!active || active.kind !== 'file') {
      const firstFile = state.rightPane.tabs.find((t) => t.kind === 'file');
      if (!firstFile) {
        openLauncherView();
        return;
      }
      activateRightTab(firstFile.id);
    }
    state.rightPane.splitActive = !state.rightPane.splitActive;
    if (state.rightPane.splitActive) {
      if (window.innerWidth < 1450 && !appEl.classList.contains('sidebar-collapsed')) {
        appEl.classList.add('sidebar-collapsed');
        state.rightPane.autoCollapsedLeft = true;
      }
      const curId = state.rightPane.activeTabId;
      const other = state.rightPane.tabs.find((t) => t.kind === 'file' && t.id !== curId);
      state.rightPane.splitTabId = other ? other.id : null;
    } else if (state.rightPane.autoCollapsedLeft && window.innerWidth >= 1180) {
      appEl.classList.remove('sidebar-collapsed');
      state.rightPane.autoCollapsedLeft = false;
    }
    syncRightPaneView();
    renderSplitSecondSlot();
  }

  async function renderSplitSecondSlot() {
    if (!rpFileSlot1 || !rpSplitContainer) return;
    rpSplitContainer.classList.toggle('split-vertical', Boolean(state.rightPane.splitVertical));
    if (btnRpSplitOrient) {
      btnRpSplitOrient.textContent = state.rightPane.splitVertical ? '左右' : '上下';
    }

    if (!state.rightPane.splitActive) {
      rpFileSlot1.style.display = 'none';
      return;
    }
    rpFileSlot1.style.display = 'flex';

    const fileTabs = state.rightPane.tabs.filter((t) => t.kind === 'file');
    rpSplitSelect.innerHTML = '';
    const pickOpt = document.createElement('option');
    pickOpt.value = '__PICK__';
    pickOpt.textContent = '选择工作区文件…';
    rpSplitSelect.appendChild(pickOpt);
    for (const ft of fileTabs) {
      const opt = document.createElement('option');
      opt.value = ft.id;
      opt.textContent = ft.title;
      if (ft.id === state.rightPane.splitTabId) opt.selected = true;
      rpSplitSelect.appendChild(opt);
    }

    const splitTab = fileTabs.find((t) => t.id === state.rightPane.splitTabId);
    if (!splitTab) {
      rpSplitSelect.value = '__PICK__';
      rpSplitMeta.textContent = '';
      if (btnRpSplitMdToggle) btnRpSplitMdToggle.style.display = 'none';
      if (btnRpSplitCite) btnRpSplitCite.style.display = 'none';
      rpSplitContent.innerHTML = `
        <div class="rp-split-picker">
          <div class="rp-split-picker-title">选择要在右侧并排阅读的第二个文件</div>
          <div id="rp-split-picker-tree"></div>
        </div>
      `;
      const pickTree = $('rp-split-picker-tree');
      if (!state.rightPane.dirCache.size) await loadWorkspaceTree('', true);
      const entries = state.rightPane.dirCache.get('') || [];
      const renderPickList = (list) => {
        pickTree.innerHTML = '';
        for (const e of list) {
          if (e.is_dir) continue;
          const row = document.createElement('button');
          row.type = 'button';
          row.className = 'rp-tree-row';
          row.innerHTML = `
            <span class="rp-file-ext-pill">${escapeHtml(fileExtBadge(e.name))}</span>
            <span class="rp-tree-name">${escapeHtml(e.rel_path)}</span>
            <span class="rp-tree-meta">${escapeHtml(formatBytes(e.size))}</span>
          `;
          row.addEventListener('click', async () => {
            await openFileInRightPane(e.rel_path);
            const newlyOpened = state.rightPane.tabs.find((t) => t.id === `file:${e.rel_path}`);
            const prevPrimary = fileTabs.find((t) => t.id !== (newlyOpened && newlyOpened.id));
            if (prevPrimary && newlyOpened) {
              state.rightPane.activeTabId = prevPrimary.id;
              state.rightPane.splitTabId = newlyOpened.id;
              syncRightPaneView();
              renderActiveFileTab(prevPrimary);
              renderSplitSecondSlot();
            }
          });
          pickTree.appendChild(row);
        }
      };
      try {
        const res = await fetch(`/api/fs/files?cwd=${encodeURIComponent(state.activeCwd || '')}&q=`);
        const d = await res.json();
        renderPickList((d.files || []).slice(0, 60));
      } catch {
        renderPickList(entries);
      }
      return;
    }

    if (btnRpSplitCite) btnRpSplitCite.style.display = 'inline-flex';
    if (!splitTab.fileData) {
      rpSplitMeta.textContent = '读取中…';
      rpSplitContent.innerHTML = '<div class="rp-empty-state"><div class="rp-empty-desc">正在读取文件…</div></div>';
      try {
        const url = `/api/workspace/read?cwd=${encodeURIComponent(state.activeCwd || '')}&path=${encodeURIComponent(splitTab.relPath)}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.ok) splitTab.fileData = data;
      } catch {
        // ignore
      }
    }

    const info = renderFileBodyHtmlInto(rpSplitContent, splitTab, () => renderSplitSecondSlot(), getFileRendererDeps());
    rpSplitMeta.textContent = info.meta;
    if (btnRpSplitMdToggle) {
      btnRpSplitMdToggle.style.display = info.toggleLabel ? 'inline-flex' : 'none';
      if (info.toggleLabel) btnRpSplitMdToggle.textContent = info.toggleLabel;
    }
  }

  function citeWorkspaceFileToComposer(absPath, relPath, size = 0, isImage = false, customPrompt = '') {
    const name = folderBasename(relPath || absPath);
    if (!state.pendingAttachments.some((a) => a.path === absPath)) {
      state.pendingAttachments.push({
        id: `rp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name,
        rel_path: relPath || name,
        path: absPath,
        size,
        is_image: isImage,
        preview_url: isImage ? `/api/local-image?path=${encodeURIComponent(absPath)}` : '',
        source: 'workspace',
      });
      actions.renderPendingAttachments();
    }
    if (customPrompt) {
      composerInput.value = composerInput.value.trim()
        ? `${composerInput.value.trim()}\n${customPrompt}`
        : customPrompt;
      actions.autoResizeTextarea();
    }
    if (state.activeView !== 'chat') actions.switchMainView('chat');
    composerInput.focus();
  }

  function updateTerminalCwdUi() {
    if (!rpTermCwd) return;
    const cwd = state.rightPane.termCwd || state.activeCwd || '';
    rpTermCwd.textContent = shortenPath(cwd);
    rpTermCwd.title = cwd;
  }

  async function runTerminalCommand(rawCmd) {
    const cmd = (rawCmd || '').trim();
    if (!cmd || state.rightPane.termRunning) return;

    state.rightPane.termHistory.push(cmd);
    if (state.rightPane.termHistory.length > 60) state.rightPane.termHistory.shift();
    state.rightPane.termHistoryIdx = state.rightPane.termHistory.length;
    rpTermInput.value = '';

    const activeCwd = state.rightPane.termCwd || state.activeCwd || '';
    await runStreamingTerminal({
      cmd,
      cwd: activeCwd,
      sessionId: state.rightPane.termSessionId,
      outputEl: rpTermOutput,
      onStart: () => {
        state.rightPane.termRunning = true;
        btnRpTermRun.disabled = true;
        btnRpTermStop.style.display = 'inline-flex';
      },
      onCwdChange: (newCwd) => {
        state.rightPane.termCwd = newCwd;
        updateTerminalCwdUi();
      },
      onSendToAi: ({ cwd, cmd: ranCmd, exitCode, stdout, stderr }) => {
        const combined = [
          `我在 \`${cwd}\` 执行了命令：\`${ranCmd}\`（退出码 ${exitCode}）：`,
          '```text',
          (stdout + (stderr ? '\n' + stderr : '')).slice(0, 4000) || '(无输出)',
          '```',
          '请帮我分析结果或解决其中的问题。',
        ].join('\n');
        composerInput.value = combined;
        actions.autoResizeTextarea();
        if (state.activeView !== 'chat') actions.switchMainView('chat');
        composerInput.focus();
      },
      onDone: () => {
        state.rightPane.termRunning = false;
        btnRpTermRun.disabled = false;
        btnRpTermStop.style.display = 'none';
        actions.loadGitChanges(true);
        state.rightPane.dirCache.clear();
        refreshOpenFileTabs(true);
        rpTermInput.focus();
      },
    });
  }

  function initRightPaneResizer() {
    if (!sidePaneResizer) return;
    const MIN_CHAT_WIDTH = 390;
    const MIN_RP_WIDTH = 320;

    const getAvailableShellWidth = () =>
      (stageCardShell && stageCardShell.clientWidth) || window.innerWidth;

    const clampRpWidth = (desiredW, allowAutoCollapseLeft = false) => {
      let shellW = getAvailableShellWidth();
      if (
        allowAutoCollapseLeft &&
        desiredW > shellW - MIN_CHAT_WIDTH &&
        !appEl.classList.contains('sidebar-collapsed') &&
        window.innerWidth >= 820
      ) {
        appEl.classList.add('sidebar-collapsed');
        state.rightPane.autoCollapsedLeft = true;
        shellW = getAvailableShellWidth();
      }
      const maxW = Math.max(MIN_RP_WIDTH, shellW - MIN_CHAT_WIDTH);
      return Math.max(MIN_RP_WIDTH, Math.min(maxW, Math.round(desiredW)));
    };

    try {
      const saved = Number(localStorage.getItem('claude_agy_rp_width') || 0);
      if (saved >= MIN_RP_WIDTH) {
        document.documentElement.style.setProperty('--right-pane-width', `${Math.min(saved, 860)}px`);
      }
    } catch {
      // ignore storage errors
    }

    let dragging = false;
    sidePaneResizer.addEventListener('mousedown', (e) => {
      if (!sidePane.classList.contains('open') || state.rightPane.focusWide) return;
      dragging = true;
      sidePane.classList.add('is-resizing');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      if (artifactIframe) artifactIframe.style.pointerEvents = 'none';
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const desiredW = window.innerWidth - e.clientX;
      const nextW = clampRpWidth(desiredW, true);
      const cssVar = state.rightPane.splitActive ? '--right-pane-split-width' : '--right-pane-width';
      document.documentElement.style.setProperty(cssVar, `${nextW}px`);
    });

    window.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      sidePane.classList.remove('is-resizing');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (artifactIframe) artifactIframe.style.pointerEvents = '';
      try {
        const cur = parseInt(getComputedStyle(sidePane).width, 10);
        if (!state.rightPane.splitActive && cur >= MIN_RP_WIDTH) {
          localStorage.setItem('claude_agy_rp_width', String(cur));
        }
      } catch {
        // ignore
      }
    });

    window.addEventListener('resize', () => {
      if (!sidePane.classList.contains('open') || state.rightPane.focusWide) return;
      const cssVar = state.rightPane.splitActive ? '--right-pane-split-width' : '--right-pane-width';
      const cur = parseInt(getComputedStyle(sidePane).width, 10);
      if (cur > 0) {
        const clamped = clampRpWidth(cur, false);
        if (clamped < cur) {
          document.documentElement.style.setProperty(cssVar, `${clamped}px`);
        }
      }
    });
  }

  async function loadCustomCssIntoEditor() {
    const res = await fetch('/api/css');
    const data = await res.json();
    state.cssMtime = data.mtime || 0;
    cssEditor.value = data.css || '';
    state.cssDirty = false;
    livePreviewCss.textContent = '';
    cssSaveStatus.textContent = '已与磁盘 custom.css 同步';
  }

  async function saveCustomCss() {
    const css = cssEditor.value;
    const res = await fetch('/api/css', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ css }),
    });
    const data = await res.json();
    state.cssMtime = data.mtime || 0;
    state.cssDirty = false;
    customCssLink.href = `/custom.css?v=${Date.now()}`;
    livePreviewCss.textContent = '';
    cssSaveStatus.textContent = '已保存至 custom.css ✓';
  }

  function startCustomCssHotReloadWatcher() {
    setInterval(async () => {
      try {
        const res = await fetch('/api/status');
        if (!res.ok) return;
        const data = await res.json();
        actions.updateCliStatusBadge(data.agy_installed, data.agy_path);
        if (data.custom_css_mtime && data.custom_css_mtime !== state.cssMtime) {
          state.cssMtime = data.custom_css_mtime;
          customCssLink.href = `/custom.css?v=${Date.now()}`;
          if (!state.cssDirty) {
            const cssRes = await fetch('/api/css');
            const cssData = await cssRes.json();
            cssEditor.value = cssData.css || '';
            cssSaveStatus.textContent = '检测到外部修改，已自动热重载 ✓';
          }
        }
      } catch {
        // Ignore transient polling errors
      }
    }, 2000);
  }

  function bindEvents() {
    if (rpSplitContainer) {
      rpSplitContainer.addEventListener('click', (e) => {
        const img = e.target.closest('.rp-reader-img-box img');
        if (!img) return;
        const tab = getActiveRightTab();
        const f = tab && tab.fileData;
        actions.openImageLightbox({
          src: img.getAttribute('src') || '',
          localPath: (f && f.abs_path) || '',
          name: (f && f.name) || img.getAttribute('alt') || '图片预览',
        });
      });
    }

    if (btnToggleRightPane) {
      btnToggleRightPane.addEventListener('click', () => toggleRightPane());
    }
    btnTopbarArtifact.addEventListener('click', () => {
      if (state.sidePaneMode === 'artifact' && sidePane.classList.contains('open')) {
        closeSidePane();
      } else if (state.lastArtifact) {
        openArtifactPane(state.lastArtifact);
      } else {
        openToolTab('artifact');
      }
    });
    $('btn-close-pane').addEventListener('click', closeSidePane);

    document.querySelectorAll('[data-rp-launch]').forEach((btn) => {
      btn.addEventListener('click', () => openToolTab(btn.dataset.rpLaunch));
    });

    if (rpLauncherSearch) {
      rpLauncherSearch.addEventListener('input', () => {
        clearTimeout(rpLauncherSearchTimer);
        const q = rpLauncherSearch.value.trim();
        if (!q) {
          rpLauncherLastMatches = [];
          if (rpLauncherSearchResults) rpLauncherSearchResults.style.display = 'none';
          if (rpLauncherDefault) rpLauncherDefault.style.display = 'block';
          return;
        }
        rpLauncherSearchTimer = setTimeout(async () => {
          if (rpLauncherDefault) rpLauncherDefault.style.display = 'none';
          if (rpLauncherSearchResults) rpLauncherSearchResults.style.display = 'flex';
          rpLauncherLastMatches = await searchRightPaneFilesInto(q, rpLauncherSearchResults);
        }, 140);
      });
      rpLauncherSearch.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && rpLauncherLastMatches.length) {
          e.preventDefault();
          openFileInRightPane(rpLauncherLastMatches[0].rel_path);
        } else if (e.key === 'Escape') {
          rpLauncherSearch.value = '';
          rpLauncherLastMatches = [];
          if (rpLauncherSearchResults) rpLauncherSearchResults.style.display = 'none';
          if (rpLauncherDefault) rpLauncherDefault.style.display = 'block';
        }
      });
    }

    if (btnRpLauncherRefresh) {
      btnRpLauncherRefresh.addEventListener('click', () => {
        reloadExpandedWorkspaceTrees();
      });
    }
    if (btnRpExplorerRefresh) {
      btnRpExplorerRefresh.addEventListener('click', () => {
        reloadExpandedWorkspaceTrees();
      });
    }
    if ($('btn-rp-new-file')) {
      $('btn-rp-new-file').addEventListener('click', () => openWsEntryModal({ mode: 'new-file' }));
    }
    if ($('btn-rp-new-folder')) {
      $('btn-rp-new-folder').addEventListener('click', () => openWsEntryModal({ mode: 'new-folder' }));
    }
    if ($('btn-rp-launcher-new-file')) {
      $('btn-rp-launcher-new-file').addEventListener('click', () => openWsEntryModal({ mode: 'new-file' }));
    }
    if ($('btn-rp-launcher-new-folder')) {
      $('btn-rp-launcher-new-folder').addEventListener('click', () => openWsEntryModal({ mode: 'new-folder' }));
    }
    if ($('btn-ws-entry-cancel')) {
      $('btn-ws-entry-cancel').addEventListener('click', closeWsEntryModal);
    }
    if (wsEntryConfirm) {
      wsEntryConfirm.addEventListener('click', submitWsEntryModal);
    }
    if (wsEntryInput) {
      wsEntryInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitWsEntryModal();
        } else if (e.key === 'Escape') {
          closeWsEntryModal();
        }
      });
    }
    if (wsEntryModal) {
      wsEntryModal.addEventListener('click', (e) => {
        if (e.target === wsEntryModal) closeWsEntryModal();
      });
    }
    document.addEventListener('click', (e) => {
      if (treeCtxMenu && treeCtxMenu.style.display !== 'none' && !treeCtxMenu.contains(e.target)) {
        closeTreeCtxMenu();
      }
    });
    if (btnRpChangesRefresh) {
      btnRpChangesRefresh.addEventListener('click', () => actions.refreshReviewPanel());
    }

    if (rpFilesSearch) {
      rpFilesSearch.addEventListener('input', () => {
        clearTimeout(rpSearchTimer);
        rpSearchTimer = setTimeout(() => {
          searchRightPaneFilesInto(rpFilesSearch.value, rpFilesTree, () => renderAllWorkspaceTrees());
        }, 160);
      });
    }

    if (btnRpFileMore && rpFileMoreWrap) {
      btnRpFileMore.addEventListener('click', (e) => {
        e.stopPropagation();
        actions.closeAllPopovers();
        rpFileMoreWrap.classList.toggle('open');
      });
    }
    if (btnRpFocusWide) {
      btnRpFocusWide.addEventListener('click', () => {
        closeRpFileMoreMenu();
        toggleRightPaneFocusWide();
      });
    }
    if (btnRpFileEdit) {
      btnRpFileEdit.addEventListener('click', () => {
        closeRpFileMoreMenu();
        toggleActiveFileEdit();
      });
    }
    if (btnRpMenuEdit) {
      btnRpMenuEdit.addEventListener('click', () => {
        closeRpFileMoreMenu();
        toggleActiveFileEdit();
      });
    }
    if (btnRpFileSave) {
      btnRpFileSave.addEventListener('click', () => {
        const tab = getActiveRightTab();
        if (tab) saveActiveFileEdit(tab);
      });
    }
    if (btnRpMenuFocus) {
      btnRpMenuFocus.addEventListener('click', () => {
        closeRpFileMoreMenu();
        toggleRightPaneFocusWide();
      });
    }
    if (btnRpMenuSplit) {
      btnRpMenuSplit.addEventListener('click', () => {
        closeRpFileMoreMenu();
        toggleSplitReading();
      });
    }
    if (btnRpReaderMdToggle) {
      btnRpReaderMdToggle.addEventListener('click', () => {
        const tab = getActiveRightTab();
        if (!tab || tab.kind !== 'file') return;
        tab.mdRendered = !tab.mdRendered;
        renderActiveFileTab(tab);
        closeRpFileMoreMenu();
      });
    }
    if (btnRpReaderReload) {
      btnRpReaderReload.addEventListener('click', () => {
        const tab = getActiveRightTab();
        if (!tab || tab.kind !== 'file') return;
        fetchFileTabContent(tab);
        closeRpFileMoreMenu();
      });
    }
    if (btnRpReaderCopy) {
      btnRpReaderCopy.addEventListener('click', async () => {
        const tab = getActiveRightTab();
        if (!tab || !tab.fileData || !tab.fileData.content) return;
        await navigator.clipboard.writeText(tab.fileData.content);
        setMenuItemLabel(btnRpReaderCopy, '已复制到剪贴板 ✓');
        setTimeout(() => {
          setMenuItemLabel(btnRpReaderCopy, '复制文件内容');
          closeRpFileMoreMenu();
        }, 700);
      });
    }
    if (btnRpReaderCite) {
      btnRpReaderCite.addEventListener('click', () => {
        const tab = getActiveRightTab();
        const f = tab && tab.fileData;
        if (!f) return;
        citeWorkspaceFileToComposer(f.abs_path, f.rel_path, f.size || 0, f.kind === 'image');
        setMenuItemLabel(btnRpReaderCite, '已引用到对话 ✓');
        setTimeout(() => {
          setMenuItemLabel(btnRpReaderCite, '@ 引用到对话输入框');
          closeRpFileMoreMenu();
        }, 650);
      });
    }
    if (btnRpReaderExternal) {
      btnRpReaderExternal.addEventListener('click', () => {
        const tab = getActiveRightTab();
        const f = tab && tab.fileData;
        if (f) openExternalPath(f.abs_path || f.rel_path);
        closeRpFileMoreMenu();
      });
    }

    if (btnRpToggleSplit) {
      btnRpToggleSplit.addEventListener('click', () => toggleSplitReading());
    }
    if (rpSplitSelect) {
      rpSplitSelect.addEventListener('change', () => {
        const val = rpSplitSelect.value;
        state.rightPane.splitTabId = val === '__PICK__' ? null : val;
        renderSplitSecondSlot();
      });
    }
    if (btnRpSplitMdToggle) {
      btnRpSplitMdToggle.addEventListener('click', () => {
        const tab = state.rightPane.tabs.find((t) => t.id === state.rightPane.splitTabId);
        if (!tab) return;
        tab.mdRendered = !tab.mdRendered;
        renderSplitSecondSlot();
      });
    }
    if (btnRpSplitOrient) {
      btnRpSplitOrient.addEventListener('click', () => {
        state.rightPane.splitVertical = !state.rightPane.splitVertical;
        renderSplitSecondSlot();
      });
    }
    if (btnRpSplitCite) {
      btnRpSplitCite.addEventListener('click', () => {
        const tab = state.rightPane.tabs.find((t) => t.id === state.rightPane.splitTabId);
        const f = tab && tab.fileData;
        if (!f) return;
        citeWorkspaceFileToComposer(f.abs_path, f.rel_path, f.size || 0, f.kind === 'image');
        btnRpSplitCite.textContent = '已引用 ✓';
        setTimeout(() => (btnRpSplitCite.textContent = '@ 引用'), 1400);
      });
    }
    if (btnRpSplitClose) {
      btnRpSplitClose.addEventListener('click', () => {
        state.rightPane.splitActive = false;
        if (state.rightPane.autoCollapsedLeft && window.innerWidth >= 1180) {
          appEl.classList.remove('sidebar-collapsed');
          state.rightPane.autoCollapsedLeft = false;
        }
        syncRightPaneView();
        renderSplitSecondSlot();
      });
    }

    if (btnRpTermRun) {
      btnRpTermRun.addEventListener('click', () => runTerminalCommand(rpTermInput.value));
    }
    if (rpTermInput) {
      rpTermInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          runTerminalCommand(rpTermInput.value);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (state.rightPane.termHistory.length && state.rightPane.termHistoryIdx > 0) {
            state.rightPane.termHistoryIdx--;
            rpTermInput.value = state.rightPane.termHistory[state.rightPane.termHistoryIdx];
          }
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (state.rightPane.termHistoryIdx < state.rightPane.termHistory.length - 1) {
            state.rightPane.termHistoryIdx++;
            rpTermInput.value = state.rightPane.termHistory[state.rightPane.termHistoryIdx];
          } else {
            state.rightPane.termHistoryIdx = state.rightPane.termHistory.length;
            rpTermInput.value = '';
          }
        }
      });
    }
    if (btnRpTermClear) {
      btnRpTermClear.addEventListener('click', () => {
        rpTermOutput.innerHTML = '<div class="rp-term-welcome">输出已清空。</div>';
      });
    }
    if (btnRpTermStop) {
      btnRpTermStop.addEventListener('click', async () => {
        await fetch('/api/workspace/terminal/abort', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: state.rightPane.termSessionId }),
        }).catch(() => {});
      });
    }
    document.querySelectorAll('[data-term-quick]').forEach((btn) => {
      btn.addEventListener('click', () => runTerminalCommand(btn.dataset.termQuick));
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (actions.isLightboxOpen()) actions.closeImageLightbox();
        if ($('github-clone-modal')) $('github-clone-modal').classList.remove('open');
        closeTreeCtxMenu();
        closeWsEntryModal();
        closeRpFileMoreMenu();
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === '\\') {
        e.preventDefault();
        toggleRightPane();
      }
    });

    initRightPaneResizer();

    artifactTabs.querySelectorAll('.seg-tab').forEach((tabBtn) => {
      tabBtn.addEventListener('click', () => setArtifactTab(tabBtn.dataset.tab));
    });

    cssEditor.addEventListener('input', () => {
      state.cssDirty = true;
      livePreviewCss.textContent = cssEditor.value;
      cssSaveStatus.textContent = '实时预览中（未保存）';
    });
    cssEditor.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveCustomCss();
      }
    });
    $('btn-save-css').addEventListener('click', saveCustomCss);

    document.querySelectorAll('.css-preset-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.preset;
        if (key === 'reset') {
          cssEditor.value = '/* User Custom CSS */\n';
        } else if (CSS_PRESETS[key]) {
          cssEditor.value = cssEditor.value.trimEnd() + '\n' + CSS_PRESETS[key];
        }
        state.cssDirty = true;
        livePreviewCss.textContent = cssEditor.value;
        cssSaveStatus.textContent = '已应用预设（点击保存写入磁盘）';
      });
    });
  }

  return {
    getActiveRightTab,
    closeRpFileMoreMenu,
    openLauncherView,
    closeRightTab,
    openToolTab,
    openFileInRightPane,
    toggleRightPane,
    openCssStudio,
    openArtifactPane,
    closeSidePane,
    syncRightPaneWorkspace,
    loadWorkspaceTree,
    fetchFileTabContent,
    refreshOpenFileTabs,
    openExternalPath,
    toggleSplitReading,
    citeWorkspaceFileToComposer,
    loadCustomCssIntoEditor,
    startCustomCssHotReloadWatcher,
    bindEvents,
  };
}
