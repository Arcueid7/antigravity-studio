/* ==========================================================================
   Antigravity Studio — Two-Column Settings Overlay & Profile/Avatar Manager
   ========================================================================== */

import { escapeHtml, folderBasename } from './markdown-utils.js';

export function createSettingsModalController({
  state,
  dom,
  actions,
}) {
  const $ = (id) => document.getElementById(id);
  const {
    settingsModal,
    inputAgyPath,
    inputCustomModel,
    inputExtraFlags,
    inputProfileName,
    inputProfileSubtitle,
    inputProfileAvatar,
    avatarFileInput,
    settingsCliEngine,
  } = dom;

  const switchSettingsTab = (tabName, projectObj = null) => {
    document.querySelectorAll('.agy-settings-nav-item, .agy-settings-profile-card').forEach((el) => {
      el.classList.toggle('active', el.dataset.stab === tabName && (!projectObj || el.dataset.projPath === projectObj.path));
    });
    document.querySelectorAll('.agy-stab-pane').forEach((pane) => {
      pane.classList.toggle('active', pane.id === `stab-${tabName}`);
    });
    if (tabName === 'models') renderSettingsModelsList();
    if (tabName === 'github') actions.loadGithubStatusUi();
    if (tabName === 'appearance') {
      actions.renderFontPresetUI();
      actions.renderThemePresetUI();
    }
    if (tabName === 'project' && projectObj) {
      state.selectedSettingsProject = projectObj;
      $('stab-proj-title').textContent = projectObj.name || folderBasename(projectObj.path);
      $('stab-proj-path').textContent = projectObj.path;
    }
  };

  const renderSettingsProjectsNav = () => {
    const nav = $('settings-projects-nav');
    if (!nav) return;
    nav.innerHTML = '';
    const projects = state.settings.projects || [];
    if (!projects.length) {
      nav.innerHTML = '<div style="padding:4px 10px;font-size:12px;color:var(--text-muted);">暂无已固定项目</div>';
      return;
    }
    for (const proj of projects) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'agy-settings-nav-item';
      btn.dataset.stab = 'project';
      btn.dataset.projPath = proj.path;
      btn.textContent = proj.name || folderBasename(proj.path);
      btn.addEventListener('click', () => switchSettingsTab('project', proj));
      nav.appendChild(btn);
    }
  };

  const renderSettingsModelsList = () => {
    const box = $('settings-models-list');
    if (!box) return;
    box.innerHTML = '';
    for (const fam of state.modelFamilies) {
      const row = document.createElement('div');
      row.className = 'agy-setting-row';
      const isCurrent = fam.key === state.selectedFamilyKey;
      const effortsStr = fam.efforts.length ? fam.efforts.map((e) => e.label).join(' / ') : 'Fixed';
      row.innerHTML = `
        <div>
          <div class="agy-row-title">${escapeHtml(fam.name)}</div>
          <div class="agy-row-desc">${escapeHtml(fam.desc)} · ${escapeHtml(effortsStr)}</div>
        </div>
        <button type="button" class="topbar-pill-btn ${isCurrent ? 'active' : ''}">${isCurrent ? '当前使用中' : '选用'}</button>
      `;
      row.querySelector('button').addEventListener('click', () => {
        actions.selectModelFamily(fam.key);
        renderSettingsModelsList();
      });
      box.appendChild(row);
    }
  };

  const persistSettingsPatch = async (patch) => {
    Object.assign(state.settings, patch);
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const data = await res.json();
      state.settings = { ...state.settings, ...(data.settings || {}) };
      actions.updateCliStatusBadge(data.agy_installed, data.agy_path);
      if (data.engines) actions.updateEnginesUi(data.engines, data.active_engine || state.settings.cli_engine);
    }
  };

  const openSettingsModal = (initialTab = 'general') => {
    inputProfileName.value = state.settings.profile_name || 'Antigravity CLI';
    if (inputProfileSubtitle) inputProfileSubtitle.value = state.settings.profile_subtitle || '';
    inputProfileAvatar.value =
      (state.settings.profile_avatar || '').startsWith('data:')
        ? '(已保存本地图片)'
        : (state.settings.profile_avatar || '');
    if ($('avatar-upload-status')) $('avatar-upload-status').textContent = '';
    if ($('profile-save-status')) $('profile-save-status').textContent = '';
    inputAgyPath.value = state.settings.agy_path || '';
    inputCustomModel.value = state.settings.custom_model || '';
    inputExtraFlags.value = state.settings.extra_flags || '';
    actions.applyAppearance(state.settings.theme, state.settings.font_style);
    actions.applyProfileUi(state.settings.profile_name, state.settings.profile_avatar, state.settings.profile_subtitle);
    actions.applyInterfaceSettings();
    renderSettingsProjectsNav();
    switchSettingsTab(initialTab);
    settingsModal.classList.add('open');
  };

  const bindEvents = () => {
    if (settingsCliEngine) {
      settingsCliEngine.addEventListener('change', async (e) => {
        const eng = e.target.value || 'agy';
        await persistSettingsPatch({ cli_engine: eng });
        actions.showAppToast(`已切换驱动引擎为 ${eng}`);
      });
    }

    document.querySelectorAll('.agy-settings-nav-item[data-stab], #btn-stab-profile').forEach((btn) => {
      btn.addEventListener('click', () => switchSettingsTab(btn.dataset.stab));
    });

    $('btn-open-settings').addEventListener('click', () => openSettingsModal('general'));

    // General Tab
    document.querySelectorAll('[data-lang-choice]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (actions.setAppLanguage) {
          await actions.setAppLanguage(btn.dataset.langChoice, true);
        }
      });
    });
    document.querySelectorAll('[data-layout-choice]').forEach((card) => {
      card.addEventListener('click', async () => {
        await persistSettingsPatch({ interface_layout: card.dataset.layoutChoice });
        actions.applyInterfaceSettings();
      });
    });
    $('settings-default-mode').addEventListener('change', async (e) => {
      const m = e.target.value;
      actions.setSelectedMode(m);
      await persistSettingsPatch({ default_mode: m });
    });
    if ($('toggle-sync-agy-convs')) {
      $('toggle-sync-agy-convs').addEventListener('change', async (e) => {
        const enabled = Boolean(e.target.checked);
        await persistSettingsPatch({ sync_agy_conversations: enabled });
        if (enabled && actions.syncAgyConversationsNow) {
          actions.syncAgyConversationsNow(false);
        }
      });
    }
    $('btn-toggle-adv-cli').addEventListener('click', () => {
      const body = $('adv-cli-body');
      body.style.display = body.style.display === 'none' ? 'block' : 'none';
    });
    $('btn-save-adv-cli').addEventListener('click', async (e) => {
      await persistSettingsPatch({
        agy_path: inputAgyPath.value.trim(),
        extra_flags: inputExtraFlags.value.trim(),
      });
      e.currentTarget.textContent = '已保存 ✓';
      setTimeout(() => (e.currentTarget.textContent = '保存 CLI 参数'), 1500);
    });
    document.querySelectorAll('[data-queued-choice]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await persistSettingsPatch({ queued_behavior: btn.dataset.queuedChoice });
        actions.applyInterfaceSettings();
      });
    });
    document.querySelectorAll('[data-sendkey-choice]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await persistSettingsPatch({ send_shortcut: btn.dataset.sendkeyChoice });
        actions.applyInterfaceSettings();
      });
    });

    // Appearance Tab
    document.querySelectorAll('[data-settings-theme]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const nextTheme = btn.dataset.settingsTheme;
        state.settings.theme = nextTheme;
        actions.applyAppearance(nextTheme, state.settings.font_style);
        await persistSettingsPatch({ theme: nextTheme });
      });
    });
    document.querySelectorAll('[data-width-choice]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await persistSettingsPatch({ chat_width: btn.dataset.widthChoice });
        actions.applyInterfaceSettings();
      });
    });
    $('btn-goto-palette-customize').addEventListener('click', () => {
      settingsModal.classList.remove('open');
      actions.switchMainView('customize');
    });

    // Notifications Tab
    $('toggle-notify-desktop').addEventListener('change', async (e) => {
      let enabled = e.target.checked;
      if (enabled && 'Notification' in window && Notification.permission === 'default') {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') {
          enabled = false;
          e.target.checked = false;
        }
      }
      await persistSettingsPatch({ notify_desktop: enabled });
    });
    $('toggle-notify-sound').addEventListener('change', async (e) => {
      const enabled = e.target.checked;
      await persistSettingsPatch({ notify_sound: enabled });
      if (enabled) actions.playCompletionChime();
    });

    // Models Tab Custom Slug Save
    $('btn-save-custom-model').addEventListener('click', async () => {
      const slug = inputCustomModel.value.trim();
      if (!slug) return;
      await persistSettingsPatch({ custom_model: slug });
      actions.ensureCustomModelFamily(slug);
      actions.syncPickersFromSlug(slug, 'default');
      renderSettingsModelsList();
    });

    // Project Detail Tab
    $('btn-stab-proj-open').addEventListener('click', async () => {
      if (!state.selectedSettingsProject) return;
      const p = state.selectedSettingsProject.path;
      settingsModal.classList.remove('open');
      await actions.setActiveWorkspace(p, true);
      actions.startNewChatView(p);
    });
    $('btn-stab-proj-remove').addEventListener('click', async () => {
      if (!state.selectedSettingsProject) return;
      await actions.removePinnedProject(state.selectedSettingsProject.path);
      renderSettingsProjectsNav();
      switchSettingsTab('general');
    });

    // Avatar Upload & Profile Controls
    $('btn-upload-avatar').addEventListener('click', () => {
      avatarFileInput.value = '';
      avatarFileInput.click();
    });
    avatarFileInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const statusEl = $('avatar-upload-status');
      if (statusEl) statusEl.textContent = '处理中…';
      try {
        const resizedDataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error('读取图片失败'));
          reader.onload = () => {
            const img = new Image();
            img.onerror = () => resolve(String(reader.result || ''));
            img.onload = () => {
              const size = 160;
              const canvas = document.createElement('canvas');
              canvas.width = size;
              canvas.height = size;
              const ctx = canvas.getContext('2d');
              const minSide = Math.min(img.width, img.height);
              const sx = (img.width - minSide) / 2;
              const sy = (img.height - minSide) / 2;
              ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
              resolve(canvas.toDataURL('image/png'));
            };
            img.src = String(reader.result || '');
          };
          reader.readAsDataURL(file);
        });

        let finalAvatarUrl = '';
        try {
          const res = await fetch('/api/avatar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: file.name || 'avatar.png', data_base64: resizedDataUrl, mime: 'image/png' }),
          });
          if (res.ok) {
            const data = await res.json();
            finalAvatarUrl = data.profile_avatar || '';
          }
        } catch { /* fall through */ }

        if (!finalAvatarUrl) {
          try {
            const upRes = await fetch('/api/upload', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: 'avatar.png', data_base64: resizedDataUrl, mime: 'image/png' }),
            });
            if (upRes.ok) {
              const upData = await upRes.json();
              finalAvatarUrl = (upData.file && upData.file.preview_url) || '';
            }
          } catch { /* fall through */ }
        }
        if (!finalAvatarUrl) finalAvatarUrl = resizedDataUrl;

        await persistSettingsPatch({ profile_avatar: finalAvatarUrl });
        inputProfileAvatar.value = finalAvatarUrl.startsWith('data:') ? '(已保存本地图片)' : finalAvatarUrl;
        actions.applyProfileUi(inputProfileName.value || state.settings.profile_name, finalAvatarUrl);
        if (statusEl) statusEl.textContent = '已上传并生效 ✓';
      } catch (err) {
        if (statusEl) statusEl.textContent = `上传失败: ${err.message}`;
      }
    });

    inputProfileAvatar.addEventListener('input', () => {
      if (inputProfileAvatar.value !== '(已保存本地图片)') {
        actions.applyProfileUi(inputProfileName.value, inputProfileAvatar.value);
      }
    });
    inputProfileName.addEventListener('input', () => {
      actions.applyProfileUi(inputProfileName.value, state.settings.profile_avatar, inputProfileSubtitle ? inputProfileSubtitle.value : '');
    });
    if (inputProfileSubtitle) {
      inputProfileSubtitle.addEventListener('input', () => {
        actions.applyProfileUi(inputProfileName.value, state.settings.profile_avatar, inputProfileSubtitle.value);
      });
    }
    $('btn-reset-avatar').addEventListener('click', async () => {
      inputProfileAvatar.value = '';
      await persistSettingsPatch({ profile_avatar: '' });
      actions.applyProfileUi(inputProfileName.value, '');
    });
    const btnSettingsResetColors = $('btn-settings-reset-colors');
    if (btnSettingsResetColors) {
      btnSettingsResetColors.addEventListener('click', async () => {
        state.settings.custom_colors = {};
        actions.applyColorPalette(state.settings.theme, state.settings.color_scheme || 'claude', {});
        await persistSettingsPatch({ custom_colors: {} });
      });
    }
    $('btn-open-css-from-settings').addEventListener('click', () => {
      settingsModal.classList.remove('open');
      actions.loadCustomCssIntoEditor();
      actions.openCssStudio();
    });
    $('btn-close-settings').addEventListener('click', () => settingsModal.classList.remove('open'));
    settingsModal.addEventListener('click', (e) => {
      if (e.target === settingsModal) settingsModal.classList.remove('open');
    });
    $('btn-save-settings').addEventListener('click', async () => {
      const rawAvatarVal = inputProfileAvatar.value.trim();
      const avatarToSave = rawAvatarVal === '(已保存本地图片)' ? state.settings.profile_avatar : rawAvatarVal;
      await persistSettingsPatch({
        profile_name: inputProfileName.value.trim() || 'Antigravity CLI',
        profile_subtitle: inputProfileSubtitle ? inputProfileSubtitle.value.trim() : '',
        profile_avatar: avatarToSave,
      });
      actions.applyProfileUi(state.settings.profile_name, state.settings.profile_avatar, state.settings.profile_subtitle);
      if ($('profile-save-status')) $('profile-save-status').textContent = '资料已保存 ✓';
    });
  };

  return { openSettingsModal, switchSettingsTab, persistSettingsPatch, bindEvents };
}
