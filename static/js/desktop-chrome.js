/* ==========================================================================
   Antigravity Studio — Frameless Codex Titlebar, Menus & Global Shortcuts
   ========================================================================== */

export function createDesktopChromeController({
  appEl,
  state,
  sidePane,
  composerInput,
  dropdownModel,
  modals,
  actions,
}) {
  const $ = (id) => document.getElementById(id);

  const postDesktopMsg = (msg) => {
    if (window.chrome && window.chrome.webview) {
      try {
        window.chrome.webview.postMessage(msg);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  };

  const toggleSidebar = () => {
    appEl.classList.toggle('sidebar-collapsed');
    state.rightPane.autoCollapsedLeft = false;
  };

  const navHistory = { stack: ['chat'], idx: 0 };
  const syncNavArrows = () => {
    const b = $('btn-tb-back');
    const f = $('btn-tb-forward');
    if (b) b.disabled = navHistory.idx <= 0;
    if (f) f.disabled = navHistory.idx >= navHistory.stack.length - 1;
  };

  const navigateToView = (v, push = true) => {
    actions.switchMainView(v);
    if (push && navHistory.stack[navHistory.idx] !== v) {
      navHistory.stack = navHistory.stack.slice(0, navHistory.idx + 1);
      navHistory.stack.push(v);
      navHistory.idx = navHistory.stack.length - 1;
    }
    syncNavArrows();
  };

  let uiZoomPct = 100;
  const applyUiZoom = (nextPct) => {
    uiZoomPct = Math.max(80, Math.min(130, nextPct));
    document.documentElement.style.zoom = `${uiZoomPct}%`;
  };

  const runCodexAction = async (act) => {
    switch (act) {
      case 'new-chat':
        actions.startNewChatView();
        navigateToView('chat');
        break;
      case 'add-project':
        actions.openFolderBrowserModal('add-project');
        break;
      case 'clone-github':
        actions.openGithubCloneModal();
        break;
      case 'open-folder':
        actions.openFolderBrowserModal('switch');
        break;
      case 'quick-open':
        actions.openLauncherView();
        break;
      case 'open-file-tab':
        actions.openToolTab('explorer');
        break;
      case 'close-tab': {
        const cur = actions.getActiveRightTab();
        if (cur) actions.closeRightTab(cur.id);
        else if (sidePane.classList.contains('open')) actions.closeSidePane();
        break;
      }
      case 'open-data-dir':
        actions.openExternalPath('__DATA_DIR__');
        break;
      case 'close-window':
        if (!postDesktopMsg('window:close')) window.close();
        break;
      case 'open-command-palette':
        if (actions.toggleCommandPalette) actions.toggleCommandPalette();
        break;
      case 'toggle-turn-nav':
        if (actions.toggleTurnNavigator) actions.toggleTurnNavigator();
        break;
      case 'undo': document.execCommand('undo'); break;
      case 'redo': document.execCommand('redo'); break;
      case 'cut': document.execCommand('cut'); break;
      case 'copy': document.execCommand('copy'); break;
      case 'paste':
        try {
          const clip = await navigator.clipboard.readText();
          const el = document.activeElement && ['TEXTAREA', 'INPUT'].includes(document.activeElement.tagName)
            ? document.activeElement
            : composerInput;
          if (el && clip) {
            const s = el.selectionStart || 0;
            const end = el.selectionEnd || 0;
            el.value = el.value.slice(0, s) + clip + el.value.slice(end);
            el.selectionStart = el.selectionEnd = s + clip.length;
            el.dispatchEvent(new Event('input'));
            el.focus();
          }
        } catch {
          document.execCommand('paste');
        }
        break;
      case 'delete': document.execCommand('delete'); break;
      case 'select-all': document.execCommand('selectAll'); break;
      case 'toggle-left': toggleSidebar(); break;
      case 'toggle-right': actions.toggleRightPane(); break;
      case 'toggle-split': actions.toggleSplitReading(); break;
      case 'open-terminal': actions.openToolTab('terminal'); break;
      case 'open-review': actions.openToolTab('changes'); break;
      case 'toggle-theme': $('btn-toggle-theme').click(); break;
      case 'open-language':
        actions.openSettingsModal('general');
        setTimeout(() => {
          const el = $('settings-lang-tabs');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 40);
        break;
      case 'open-palette': navigateToView('customize'); break;
      case 'open-css': actions.openCssStudio(); break;
      case 'zoom-in': applyUiZoom(uiZoomPct + 10); break;
      case 'zoom-out': applyUiZoom(uiZoomPct - 10); break;
      case 'zoom-reset': applyUiZoom(100); break;
      case 'fullscreen':
        if (!postDesktopMsg('window:fullscreen')) {
          if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
          else document.exitFullscreen().catch(() => {});
        }
        break;
      case 'reload': window.location.reload(); break;
      case 'view-usage':
        if (state.activeView !== 'chat') navigateToView('chat');
        actions.closeAllPopovers();
        dropdownModel.classList.add('open');
        setTimeout(() => {
          const uBtn = $('btn-view-usage');
          if (uBtn) uBtn.click();
        }, 30);
        break;
      case 'open-settings': actions.openSettingsModal('general'); break;
      case 'open-shortcuts': actions.openSettingsModal('shortcuts'); break;
      case 'view-server-log': actions.openFileInRightPane('__studio_server_log__', true); break;
      case 'about-app': actions.openSettingsModal('general'); break;
    }
  };

  const bindEvents = () => {
    const btnTbSidebar = $('btn-tb-sidebar');
    if (btnTbSidebar) btnTbSidebar.addEventListener('click', toggleSidebar);

    const tbDrag = $('codex-tb-drag');
    if (tbDrag) {
      tbDrag.addEventListener('mousedown', (e) => {
        if (e.button === 0 && e.detail === 1) postDesktopMsg('window:drag');
      });
      tbDrag.addEventListener('dblclick', () => postDesktopMsg('window:toggle-maximize'));
    }

    const btnWinMin = $('btn-win-min');
    const btnWinMax = $('btn-win-max');
    const btnWinClose = $('btn-win-close');
    if (btnWinMin) btnWinMin.addEventListener('click', () => postDesktopMsg('window:minimize'));
    if (btnWinMax) btnWinMax.addEventListener('click', () => postDesktopMsg('window:toggle-maximize'));
    if (btnWinClose) {
      btnWinClose.addEventListener('click', () => {
        if (!postDesktopMsg('window:close')) window.close();
      });
    }

    window.__onDesktopWindowState = (winState) => {
      const ico = $('icon-win-max');
      if (!ico) return;
      if (winState === 'maximized') {
        ico.innerHTML =
          '<rect x="1.5" y="3.5" width="7" height="7" rx="0.8"></rect><path d="M3.5 3.5V2.2a.7.7 0 0 1 .7-.7h5.6a.7.7 0 0 1 .7.7v5.6a.7.7 0 0 1-.7.7H8.5"></path>';
        if (btnWinMax) btnWinMax.title = '向下还原';
      } else {
        ico.innerHTML = '<rect x="2" y="2" width="8" height="8" rx="1"></rect>';
        if (btnWinMax) btnWinMax.title = '最大化';
      }
    };

    if ($('btn-tb-back')) {
      $('btn-tb-back').addEventListener('click', () => {
        if (navHistory.idx > 0) {
          navHistory.idx--;
          navigateToView(navHistory.stack[navHistory.idx], false);
        }
      });
    }
    if ($('btn-tb-forward')) {
      $('btn-tb-forward').addEventListener('click', () => {
        if (navHistory.idx < navHistory.stack.length - 1) {
          navHistory.idx++;
          navigateToView(navHistory.stack[navHistory.idx], false);
        }
      });
    }

    let codexMenuHoverAt = 0;
    const closeCodexMenus = () => {
      document.querySelectorAll('.codex-menu-group.open').forEach((g) => g.classList.remove('open'));
    };
    document.querySelectorAll('[data-codex-menu]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const grp = btn.closest('.codex-menu-group');
        const wasOpen = grp.classList.contains('open');
        if (wasOpen && Date.now() - codexMenuHoverAt < 350) return;
        actions.closeAllPopovers();
        closeCodexMenus();
        if (!wasOpen) grp.classList.add('open');
      });
      btn.addEventListener('mouseenter', () => {
        const grp = btn.closest('.codex-menu-group');
        if (document.querySelector('.codex-menu-group.open') && !grp.classList.contains('open')) {
          closeCodexMenus();
          grp.classList.add('open');
          codexMenuHoverAt = Date.now();
        }
      });
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.codex-menu-group')) closeCodexMenus();
    });

    document.querySelectorAll('[data-menu-act]').forEach((item) => {
      item.addEventListener('click', () => {
        const act = item.dataset.menuAct;
        closeCodexMenus();
        runCodexAction(act);
      });
    });

    document.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (e.key === 'F11') { e.preventDefault(); runCodexAction('fullscreen'); }
      else if (mod && e.shiftKey && key === 'p') { e.preventDefault(); runCodexAction('open-command-palette'); }
      else if (mod && e.shiftKey && key === 'o') { e.preventDefault(); runCodexAction('toggle-turn-nav'); }
      else if (mod && !e.shiftKey && key === 'b') { e.preventDefault(); runCodexAction('toggle-left'); }
      else if (mod && !e.shiftKey && (key === 'k' || key === 'n')) { e.preventDefault(); runCodexAction('new-chat'); }
      else if (mod && !e.shiftKey && key === 'o') { e.preventDefault(); runCodexAction('open-folder'); }
      else if (mod && !e.shiftKey && key === 'p') { e.preventDefault(); runCodexAction('quick-open'); }
      else if (mod && !e.shiftKey && key === 'w') { e.preventDefault(); runCodexAction('close-tab'); }
      else if (mod && !e.shiftKey && key === 'q') { e.preventDefault(); runCodexAction('close-window'); }
      else if (mod && !e.shiftKey && key === ',') { e.preventDefault(); runCodexAction('open-settings'); }
      else if (mod && !e.shiftKey && key === '/') { e.preventDefault(); runCodexAction('open-shortcuts'); }
      else if (mod && !e.shiftKey && key === 'j') { e.preventDefault(); runCodexAction('open-terminal'); }
      else if (mod && e.shiftKey && (e.key === '|' || e.key === '\\')) { e.preventDefault(); runCodexAction('toggle-split'); }
      else if (mod && e.shiftKey && key === 'g') { e.preventDefault(); runCodexAction('open-review'); }
      else if (mod && e.shiftKey && key === 'l') { e.preventDefault(); runCodexAction('toggle-theme'); }
      else if (mod && e.shiftKey && key === 'u') { e.preventDefault(); runCodexAction('view-usage'); }
      else if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); runCodexAction('zoom-in'); }
      else if (mod && e.key === '-') { e.preventDefault(); runCodexAction('zoom-out'); }
      else if (mod && e.key === '0') { e.preventDefault(); runCodexAction('zoom-reset'); }
      else if (e.key === 'Escape') {
        actions.closeAllPopovers();
        closeCodexMenus();
        Object.values(modals).forEach((m) => m && m.classList.remove('open'));
      }
    });
  };

  return { navigateToView, toggleSidebar, runCodexAction, bindEvents };
}
