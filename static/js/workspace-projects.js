/* ==========================================================================
   Antigravity Studio — Projects, CWD Switcher, Folder Browser & File Picker
   ========================================================================== */

import {
  escapeHtml,
  fileExtBadge,
  folderBasename,
  formatBytes,
  normalizePathKey,
  shortenPath,
} from './markdown-utils.js';

export function createWorkspaceProjectsController({ state, dom, actions }) {
  const $ = (id) => document.getElementById(id);
  const {
    projectListEl,
    composerContextBar,
    cwdChipLabel,
    popoverCwd,
    folderModal,
    folderModalTitle,
    folderShortcutsRow,
    folderPathInput,
    folderDirList,
    filePickerModal,
    filePickerCwdHint,
    filePickerSearch,
    filePickerList,
  } = dom;

  let fileSearchTimer = null;
  let folderInlineState = null;

  const folderInlineBar = $('folder-inline-bar');
  const folderInlineLabel = $('folder-inline-label');
  const folderInlineInput = $('folder-inline-input');
  const folderInlineSubmit = $('btn-folder-inline-submit');
  const folderInlineEnter = $('btn-folder-inline-enter');
  const folderInlineErr = $('folder-inline-err');
  const folderCtxMenu = $('folder-ctx-menu');

  function closeFolderCtxMenu() {
    if (folderCtxMenu) folderCtxMenu.style.display = 'none';
  }

  function closeFolderInlineBar() {
    folderInlineState = null;
    if (folderInlineBar) folderInlineBar.style.display = 'none';
    if (folderInlineErr) {
      folderInlineErr.style.display = 'none';
      folderInlineErr.textContent = '';
    }
    if (folderInlineSubmit) {
      folderInlineSubmit.classList.remove('danger-btn');
      folderInlineSubmit.disabled = false;
    }
    if (folderInlineEnter) folderInlineEnter.disabled = false;
  }

  function openFolderInlineBar({ mode, parentDir = '', targetPath = '', targetName = '' }) {
    if (!folderInlineBar) return;
    closeFolderCtxMenu();
    folderInlineState = { mode, parentDir, targetPath, targetName };
    if (folderInlineErr) {
      folderInlineErr.style.display = 'none';
      folderInlineErr.textContent = '';
    }
    if (folderInlineSubmit) {
      folderInlineSubmit.classList.remove('danger-btn');
      folderInlineSubmit.disabled = false;
    }
    if (folderInlineEnter) {
      folderInlineEnter.style.display = 'none';
      folderInlineEnter.disabled = false;
    }

    if (mode === 'mkdir') {
      const parentShort = folderBasename(parentDir || state.folderBrowserCurrent);
      folderInlineLabel.textContent = parentDir && parentDir !== state.folderBrowserCurrent
        ? `在「${parentShort}」新建子文件夹`
        : '新建文件夹';
      folderInlineInput.style.display = 'block';
      folderInlineInput.value = '';
      folderInlineInput.placeholder = '输入新文件夹名称（如 my-project）…';
      folderInlineSubmit.textContent = '创建';
      if (folderInlineEnter) folderInlineEnter.style.display = 'inline-flex';
    } else if (mode === 'rename') {
      folderInlineLabel.textContent = '重命名文件夹';
      folderInlineInput.style.display = 'block';
      folderInlineInput.value = targetName || folderBasename(targetPath);
      folderInlineInput.placeholder = '输入新的文件夹名称…';
      folderInlineSubmit.textContent = '确认重命名';
    } else if (mode === 'delete') {
      folderInlineLabel.textContent = `确认永久删除文件夹「${targetName || folderBasename(targetPath)}」及其全部内容？`;
      folderInlineInput.style.display = 'none';
      folderInlineSubmit.textContent = '确认删除';
      folderInlineSubmit.classList.add('danger-btn');
    }

    folderInlineBar.style.display = 'flex';
    if (folderInlineInput.style.display !== 'none') {
      setTimeout(() => {
        folderInlineInput.focus();
        folderInlineInput.select();
      }, 15);
    }
  }

  async function submitFolderInlineAction(enterAfterCreate = false) {
    if (!folderInlineState) return;
    const { mode, parentDir, targetPath } = folderInlineState;
    const val = (folderInlineInput ? folderInlineInput.value : '').trim();
    if (mode !== 'delete' && !val) {
      if (folderInlineErr) {
        folderInlineErr.textContent = '请输入文件夹名称';
        folderInlineErr.style.display = 'block';
      }
      return;
    }

    if (folderInlineSubmit) folderInlineSubmit.disabled = true;
    if (folderInlineEnter) folderInlineEnter.disabled = true;
    try {
      let url = '';
      let body = {};
      if (mode === 'mkdir') {
        url = '/api/fs/mkdir';
        body = { parent: parentDir || state.folderBrowserCurrent, name: val };
      } else if (mode === 'rename') {
        url = '/api/fs/rename';
        body = { path: targetPath, new_name: val };
      } else if (mode === 'delete') {
        url = '/api/fs/delete';
        body = { path: targetPath };
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.ok) {
        if (folderInlineErr) {
          folderInlineErr.textContent = data.error || '操作失败';
          folderInlineErr.style.display = 'block';
        }
        if (folderInlineSubmit) folderInlineSubmit.disabled = false;
        if (folderInlineEnter) folderInlineEnter.disabled = false;
        return;
      }

      closeFolderInlineBar();
      if (mode === 'mkdir' && enterAfterCreate && data.path) {
        await loadDirectoryIntoBrowser(data.path);
      } else {
        await loadDirectoryIntoBrowser(state.folderBrowserCurrent);
      }
      if (actions.showAppToast) {
        const msg =
          mode === 'mkdir'
            ? `已新建文件夹「${data.name}」✓`
            : mode === 'rename'
              ? `已重命名为「${data.name}」✓`
              : `已删除文件夹`;
        actions.showAppToast(msg, { duration: 2200 });
      }
    } catch (err) {
      if (folderInlineErr) {
        folderInlineErr.textContent = `请求出错：${err.message}`;
        folderInlineErr.style.display = 'block';
      }
      if (folderInlineSubmit) folderInlineSubmit.disabled = false;
      if (folderInlineEnter) folderInlineEnter.disabled = false;
    }
  }

  async function confirmChooseFolderPath(chosenPath) {
    if (!chosenPath) return;
    if (state.folderModalMode === 'add-project') {
      await addPinnedProject(chosenPath);
    } else {
      await setActiveWorkspace(chosenPath, true);
    }
    closeFolderCtxMenu();
    closeFolderInlineBar();
    folderModal.classList.remove('open');
  }

  function showFolderContextMenu(e, dirEntry = null) {
    if (!folderCtxMenu) return;
    e.preventDefault();
    e.stopPropagation();

    const menuItems = dirEntry
      ? [
          { act: 'enter', label: '进入文件夹' },
          { act: 'select', label: state.folderModalMode === 'add-project' ? '添加此文件夹为项目' : '选择此文件夹' },
          { act: 'mkdir-child', label: '在此新建子文件夹…' },
          { sep: true },
          { act: 'rename', label: '重命名…' },
          { act: 'open-ext', label: '在系统资源管理器中打开' },
          { act: 'delete', label: '删除文件夹…', danger: true },
        ]
      : [
          { act: 'mkdir-here', label: '新建文件夹…' },
          { act: 'refresh', label: '刷新当前目录' },
          { sep: true },
          { act: 'open-cur-ext', label: '在系统资源管理器中打开' },
        ];

    folderCtxMenu.innerHTML = menuItems
      .map((it) =>
        it.sep
          ? '<div class="codex-menu-sep"></div>'
          : `<button type="button" class="codex-menu-item ${it.danger ? 'is-danger' : ''}" data-fctx-act="${it.act}"><span>${escapeHtml(it.label)}</span></button>`
      )
      .join('');

    folderCtxMenu.style.display = 'block';
    const mw = 192;
    const mh = menuItems.length * 30 + 16;
    const left = Math.min(e.clientX, window.innerWidth - mw - 10);
    const top = Math.min(e.clientY, window.innerHeight - mh - 10);
    folderCtxMenu.style.left = `${Math.max(8, left)}px`;
    folderCtxMenu.style.top = `${Math.max(8, top)}px`;

    folderCtxMenu.querySelectorAll('[data-fctx-act]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const act = btn.dataset.fctxAct;
        closeFolderCtxMenu();
        if (act === 'enter' && dirEntry) {
          await loadDirectoryIntoBrowser(dirEntry.path);
        } else if (act === 'select' && dirEntry) {
          await confirmChooseFolderPath(dirEntry.path);
        } else if (act === 'mkdir-child' && dirEntry) {
          openFolderInlineBar({ mode: 'mkdir', parentDir: dirEntry.path });
        } else if (act === 'mkdir-here') {
          openFolderInlineBar({ mode: 'mkdir', parentDir: state.folderBrowserCurrent });
        } else if (act === 'rename' && dirEntry) {
          openFolderInlineBar({ mode: 'rename', targetPath: dirEntry.path, targetName: dirEntry.name });
        } else if (act === 'delete' && dirEntry) {
          openFolderInlineBar({ mode: 'delete', targetPath: dirEntry.path, targetName: dirEntry.name });
        } else if (act === 'refresh') {
          await loadDirectoryIntoBrowser(state.folderBrowserCurrent);
        } else if (act === 'open-ext' && dirEntry && actions.openExternalPath) {
          actions.openExternalPath(dirEntry.path, false);
        } else if (act === 'open-cur-ext' && actions.openExternalPath) {
          actions.openExternalPath(state.folderBrowserCurrent, false);
        }
      });
    });
  }

  function isDefaultWorkspacePath(p) {
    if (!p) return true;
    if (!state.defaultWorkspaceDir) return false;
    return normalizePathKey(p) === normalizePathKey(state.defaultWorkspaceDir);
  }

  function syncComposerContextBar() {
    if (!composerContextBar) return;
    composerContextBar.classList.toggle('is-visible', Boolean(state.workspaceExplicit));
  }

  async function setActiveWorkspace(newPath, persistDefault = true, explicit = true) {
    if (!newPath) return;
    state.activeCwd = newPath;
    state.workspaceExplicit = Boolean(explicit) && !isDefaultWorkspacePath(newPath);
    cwdChipLabel.textContent = folderBasename(newPath);
    cwdChipLabel.title = newPath;
    syncComposerContextBar();

    if (state.activeConv) {
      await fetch(`/api/conversations/${state.activeConv.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd: newPath }),
      });
      state.activeConv.cwd = newPath;
      actions.updateSessionFooter(state.activeConv);
    }
    if (persistDefault && state.workspaceExplicit) {
      state.settings.default_cwd = newPath;
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ default_cwd: newPath }),
      });
    }
    renderProjectList();
    renderCwdPopover();
    actions.syncRightPaneWorkspace();
  }

  async function addPinnedProject(folderPath) {
    if (!folderPath) return;
    const key = normalizePathKey(folderPath);
    const list = Array.isArray(state.settings.projects) ? [...state.settings.projects] : [];
    if (!list.some((p) => normalizePathKey(p.path) === key)) {
      list.unshift({ name: folderBasename(folderPath), path: folderPath });
      state.settings.projects = list;
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projects: list }),
      });
    }
    await setActiveWorkspace(folderPath, true);
  }

  async function removePinnedProject(folderPath) {
    const key = normalizePathKey(folderPath);
    const list = (state.settings.projects || []).filter((p) => normalizePathKey(p.path) !== key);
    state.settings.projects = list;
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projects: list }),
    });
    renderProjectList();
    renderCwdPopover();
    actions.syncRightPaneWorkspace();
  }

  function renderProjectList() {
    projectListEl.innerHTML = '';
    const projects = state.settings.projects || [];
    if (!projects.length) {
      const empty = document.createElement('div');
      empty.style.padding = '5px 12px';
      empty.style.fontSize = '12px';
      empty.style.color = 'var(--text-muted)';
      empty.textContent = '点击右上角 + 添加项目目录';
      projectListEl.appendChild(empty);
      return;
    }

    const activeKey = normalizePathKey(state.activeCwd);
    for (const proj of projects) {
      const isAct = state.workspaceExplicit && normalizePathKey(proj.path) === activeKey;
      const row = document.createElement('div');
      row.className = 'project-item' + (isAct ? ' active' : '');
      row.title = proj.path;
      row.innerHTML = `
        <div class="project-item-left">
          <svg class="project-item-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          </svg>
          <span class="project-item-name">${escapeHtml(proj.name || folderBasename(proj.path))}</span>
        </div>
        <div class="project-item-actions">
          <button type="button" class="section-icon-btn" data-proj-new="1" title="在此项目新建聊天">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
          <button type="button" class="section-icon-btn" data-proj-del="1" title="移除项目">✕</button>
        </div>
      `;

      row.addEventListener('click', async (e) => {
        if (e.target.closest('[data-proj-new]')) {
          e.stopPropagation();
          await setActiveWorkspace(proj.path, true);
          actions.startNewChatView(proj.path);
          return;
        }
        if (e.target.closest('[data-proj-del]')) {
          e.stopPropagation();
          await removePinnedProject(proj.path);
          return;
        }
        await setActiveWorkspace(proj.path, true);
      });
      projectListEl.appendChild(row);
    }
  }

  function renderCwdPopover() {
    popoverCwd.innerHTML = '<div class="popover-group-label">工作区目录</div>';
    const projects = state.settings.projects || [];
    const activeKey = normalizePathKey(state.activeCwd);

    for (const proj of projects) {
      const isAct = normalizePathKey(proj.path) === activeKey;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'popover-item' + (isAct ? ' active' : '');
      btn.innerHTML = `
        <div class="popover-item-main">
          <span class="popover-item-title">${escapeHtml(proj.name || folderBasename(proj.path))}</span>
          <span class="popover-item-desc">${escapeHtml(shortenPath(proj.path))}</span>
        </div>
        ${isAct ? '<span class="popover-check">✓</span>' : ''}
      `;
      btn.addEventListener('click', async () => {
        await setActiveWorkspace(proj.path, true);
        actions.closeAllPopovers();
      });
      popoverCwd.appendChild(btn);
    }

    const divider = document.createElement('div');
    divider.className = 'popover-divider';
    popoverCwd.appendChild(divider);

    const browseBtn = document.createElement('button');
    browseBtn.type = 'button';
    browseBtn.className = 'popover-item';
    browseBtn.innerHTML = `
      <div class="popover-item-row">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
        </svg>
        <div class="popover-item-main">
          <span class="popover-item-title">浏览本地文件夹…</span>
          <span class="popover-item-desc">可视化选择任意目录或磁盘</span>
        </div>
      </div>
    `;
    browseBtn.addEventListener('click', () => {
      actions.closeAllPopovers();
      openFolderBrowserModal('switch');
    });
    popoverCwd.appendChild(browseBtn);

    const nativeBtn = document.createElement('button');
    nativeBtn.type = 'button';
    nativeBtn.className = 'popover-item';
    nativeBtn.innerHTML = `
      <div class="popover-item-row">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"></rect>
          <path d="M9 3v18"></path>
        </svg>
        <div class="popover-item-main">
          <span class="popover-item-title">打开系统文件夹弹窗…</span>
          <span class="popover-item-desc">调用 Windows 原生目录选择器</span>
        </div>
      </div>
    `;
    nativeBtn.addEventListener('click', async () => {
      actions.closeAllPopovers();
      await triggerNativeFolderDialog(false);
    });
    popoverCwd.appendChild(nativeBtn);
  }

  async function openFolderBrowserModal(mode = 'switch') {
    state.folderModalMode = mode;
    folderModalTitle.textContent = mode === 'add-project' ? '添加项目文件夹' : '选择工作区文件夹';
    closeFolderCtxMenu();
    closeFolderInlineBar();
    folderModal.classList.add('open');
    await loadDirectoryIntoBrowser(state.activeCwd || state.settings.default_cwd || '');
  }

  async function loadDirectoryIntoBrowser(targetPath) {
    closeFolderCtxMenu();
    const url = '/api/fs/list' + (targetPath ? `?path=${encodeURIComponent(targetPath)}` : '');
    const res = await fetch(url);
    const data = await res.json();
    state.folderBrowserCurrent = data.current || '';
    state.folderBrowserParent = data.parent || '';
    folderPathInput.value = state.folderBrowserCurrent;

    folderShortcutsRow.innerHTML = '';
    for (const sc of data.shortcuts || []) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'folder-shortcut-chip';
      chip.textContent = sc.label;
      chip.addEventListener('click', () => loadDirectoryIntoBrowser(sc.path));
      folderShortcutsRow.appendChild(chip);
    }
    for (const drv of data.drives || []) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'folder-shortcut-chip';
      chip.textContent = drv;
      chip.addEventListener('click', () => loadDirectoryIntoBrowser(drv));
      folderShortcutsRow.appendChild(chip);
    }

    folderDirList.innerHTML = '';
    const dirs = data.dirs || [];
    if (!dirs.length) {
      const empty = document.createElement('div');
      empty.style.padding = '22px 16px';
      empty.style.textAlign = 'center';
      empty.style.color = 'var(--text-muted)';
      empty.style.fontSize = '13px';
      empty.textContent = '此目录下没有子文件夹（可点击上方「新建文件夹」或右键新建）';
      folderDirList.appendChild(empty);
      return;
    }

    for (const d of dirs) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'folder-dir-row';
      row.innerHTML = `
        <div class="folder-dir-row-left">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent); flex-shrink:0;">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          </svg>
          <span class="folder-dir-name">${escapeHtml(d.name)}</span>
        </div>
        <div class="folder-dir-row-right">
          <span class="folder-dir-more-btn" role="button" tabindex="-1" title="更多操作（新建子文件夹 / 重命名 / 删除）">⋯</span>
          <span class="folder-dir-meta">进入 →</span>
        </div>
      `;
      row.addEventListener('contextmenu', (e) => showFolderContextMenu(e, d));
      row.querySelector('.folder-dir-more-btn').addEventListener('click', (e) => showFolderContextMenu(e, d));
      row.addEventListener('click', (e) => {
        if (e.target.closest('.folder-dir-more-btn')) return;
        loadDirectoryIntoBrowser(d.path);
      });
      folderDirList.appendChild(row);
    }
  }

  async function triggerNativeFolderDialog(alsoPinProject) {
    const res = await fetch('/api/dialog/folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initial_dir: state.folderBrowserCurrent || state.activeCwd || '' }),
    });
    const data = await res.json();
    if (!data.cancelled && data.path) {
      if (alsoPinProject || state.folderModalMode === 'add-project') {
        await addPinnedProject(data.path);
      } else {
        await setActiveWorkspace(data.path, true);
      }
      folderModal.classList.remove('open');
    }
  }

  async function openWorkspaceFilePicker() {
    filePickerCwdHint.textContent = shortenPath(state.activeCwd);
    filePickerSearch.value = '';
    filePickerModal.classList.add('open');
    filePickerSearch.focus();
    await queryWorkspaceFiles('');
  }

  async function queryWorkspaceFiles(q) {
    const url = `/api/fs/files?cwd=${encodeURIComponent(state.activeCwd || '')}&q=${encodeURIComponent(q || '')}`;
    const res = await fetch(url);
    const data = await res.json();
    const files = data.files || [];

    filePickerList.innerHTML = '';
    if (!files.length) {
      filePickerList.innerHTML =
        '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px;">未找到匹配的工作区文件</div>';
      return;
    }

    for (const f of files) {
      const already = state.pendingAttachments.some((a) => a.path === f.path);
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'folder-dir-row';
      row.innerHTML = `
        <div class="folder-dir-row-left">
          <span class="att-ext-badge" style="width:28px;height:22px;font-size:9.5px;">${escapeHtml(fileExtBadge(f.name))}</span>
          <span class="folder-dir-name">${escapeHtml(f.rel_path)}</span>
        </div>
        <span class="folder-dir-meta" style="color:${already ? 'var(--accent)' : 'var(--text-muted)'};">
          ${already ? '已添加 ✓' : formatBytes(f.size)}
        </span>
      `;
      row.addEventListener('click', () => {
        if (!state.pendingAttachments.some((a) => a.path === f.path)) {
          state.pendingAttachments.push({
            id: `ws-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: f.name,
            rel_path: f.rel_path,
            path: f.path,
            size: f.size,
            is_image: f.is_image,
            preview_url: '',
            source: 'workspace',
          });
          actions.renderPendingAttachments();
          queryWorkspaceFiles(filePickerSearch.value);
        }
      });
      filePickerList.appendChild(row);
    }
  }

  function bindEvents() {
    $('btn-add-project').addEventListener('click', () => openFolderBrowserModal('add-project'));
    $('btn-folder-up').addEventListener('click', () => {
      if (state.folderBrowserParent) loadDirectoryIntoBrowser(state.folderBrowserParent);
    });
    if ($('btn-folder-mkdir')) {
      $('btn-folder-mkdir').addEventListener('click', () => {
        openFolderInlineBar({ mode: 'mkdir', parentDir: state.folderBrowserCurrent });
      });
    }
    if ($('btn-folder-refresh')) {
      $('btn-folder-refresh').addEventListener('click', () => {
        loadDirectoryIntoBrowser(state.folderBrowserCurrent);
      });
    }
    if ($('btn-folder-inline-cancel')) {
      $('btn-folder-inline-cancel').addEventListener('click', closeFolderInlineBar);
    }
    if (folderInlineSubmit) {
      folderInlineSubmit.addEventListener('click', () => submitFolderInlineAction(false));
    }
    if (folderInlineEnter) {
      folderInlineEnter.addEventListener('click', () => submitFolderInlineAction(true));
    }
    if (folderInlineInput) {
      folderInlineInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitFolderInlineAction(false);
        } else if (e.key === 'Escape') {
          e.stopPropagation();
          closeFolderInlineBar();
        }
      });
    }
    if (folderDirList) {
      folderDirList.addEventListener('contextmenu', (e) => {
        if (e.target.closest('.folder-dir-row')) return;
        showFolderContextMenu(e, null);
      });
    }
    document.addEventListener('click', (e) => {
      if (folderCtxMenu && folderCtxMenu.style.display !== 'none' && !folderCtxMenu.contains(e.target)) {
        closeFolderCtxMenu();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeFolderCtxMenu();
        closeFolderInlineBar();
      }
    });
    folderPathInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        loadDirectoryIntoBrowser(folderPathInput.value.trim());
      }
    });
    $('btn-native-folder-dialog').addEventListener('click', () =>
      triggerNativeFolderDialog(state.folderModalMode === 'add-project')
    );
    $('btn-folder-confirm').addEventListener('click', async () => {
      const chosen = folderPathInput.value.trim() || state.folderBrowserCurrent;
      if (chosen) await confirmChooseFolderPath(chosen);
      else folderModal.classList.remove('open');
    });
    $('btn-folder-pin-and-use').addEventListener('click', async () => {
      const chosen = folderPathInput.value.trim() || state.folderBrowserCurrent;
      if (chosen) await addPinnedProject(chosen);
      closeFolderCtxMenu();
      closeFolderInlineBar();
      folderModal.classList.remove('open');
    });
    $('btn-close-folder-modal').addEventListener('click', () => {
      closeFolderCtxMenu();
      closeFolderInlineBar();
      folderModal.classList.remove('open');
    });
    folderModal.addEventListener('click', (e) => {
      if (e.target === folderModal) {
        closeFolderCtxMenu();
        closeFolderInlineBar();
        folderModal.classList.remove('open');
      }
    });

    filePickerSearch.addEventListener('input', () => {
      clearTimeout(fileSearchTimer);
      fileSearchTimer = setTimeout(() => queryWorkspaceFiles(filePickerSearch.value), 160);
    });
    $('btn-close-file-picker').addEventListener('click', () => filePickerModal.classList.remove('open'));
    filePickerModal.addEventListener('click', (e) => {
      if (e.target === filePickerModal) filePickerModal.classList.remove('open');
    });
  }

  return {
    isDefaultWorkspacePath,
    syncComposerContextBar,
    setActiveWorkspace,
    addPinnedProject,
    removePinnedProject,
    renderProjectList,
    renderCwdPopover,
    openFolderBrowserModal,
    openWorkspaceFilePicker,
    bindEvents,
  };
}
