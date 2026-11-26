/* ==========================================================================
   Antigravity Studio — Profile, Interface, Notifications & Theme Appearance
   ========================================================================== */

import {
  FONT_PRESETS,
  COLOR_SCHEMES,
  resolveSchemeKey,
  hexToRgba,
  shiftHexBrightness,
} from './themes.js';
import { escapeHtml } from './markdown-utils.js';
import { rerenderAllMermaidForTheme } from './rich-render.js';
import { normalizeLanguage, t } from './i18n.js';

export function createAppearanceController({ state }) {
  const $ = (id) => document.getElementById(id);

  function applyProfileUi(name, avatarUrl, subtitle = null) {
    const displayName = (name || '').trim() || 'Antigravity CLI';
    const subText = subtitle !== null ? subtitle : (state.settings.profile_subtitle || '');
    const initial = displayName.charAt(0).toUpperCase() || 'A';
    $('sidebar-profile-name').textContent = displayName;
    $('sidebar-avatar-fallback').textContent = initial;
    $('settings-avatar-fallback').textContent = initial;
    if ($('settings-nav-name')) $('settings-nav-name').textContent = displayName;
    if ($('settings-nav-sub')) $('settings-nav-sub').textContent = subText || '点击编辑头像与资料';
    if ($('settings-nav-avatar-fallback')) $('settings-nav-avatar-fallback').textContent = initial;

    const cleanUrl = (avatarUrl || '').trim();
    const pairs = [
      [$('sidebar-avatar'), $('sidebar-avatar-img'), $('sidebar-avatar-fallback')],
      [$('settings-nav-avatar'), $('settings-nav-avatar-img'), $('settings-nav-avatar-fallback')],
      [$('settings-avatar-preview'), $('settings-avatar-img'), $('settings-avatar-fallback')],
    ];

    for (const [wrap, img, fb] of pairs) {
      if (!wrap || !img || !fb) continue;
      if (cleanUrl) {
        const showImg = () => {
          img.style.display = 'block';
          fb.style.display = 'none';
          wrap.classList.add('has-image');
        };
        const hideImg = () => {
          img.style.display = 'none';
          fb.style.display = 'inline';
          wrap.classList.remove('has-image');
        };
        img.onerror = hideImg;
        img.onload = showImg;
        img.src = cleanUrl;
        if (img.complete && img.naturalWidth > 0) showImg();
      } else {
        img.removeAttribute('src');
        img.style.display = 'none';
        fb.style.display = 'inline';
        wrap.classList.remove('has-image');
      }
    }
  }

  function applyInterfaceSettings() {
    const layout = state.settings.interface_layout === 'knowledge' ? 'knowledge' : 'engineering';
    document.documentElement.setAttribute('data-layout', layout);
    document.querySelectorAll('[data-layout-choice]').forEach((el) => {
      el.classList.toggle('active', el.dataset.layoutChoice === layout);
    });

    const widthMap = { compact: '680px', standard: '768px', wide: '920px' };
    const wKey = widthMap[state.settings.chat_width] ? state.settings.chat_width : 'standard';
    document.documentElement.style.setProperty('--chat-max-width', widthMap[wKey]);
    document.querySelectorAll('[data-width-choice]').forEach((el) => {
      el.classList.toggle('active', el.dataset.widthChoice === wKey);
    });

    const sendKey = state.settings.send_shortcut === 'ctrl_enter' ? 'ctrl_enter' : 'enter';
    document.querySelectorAll('[data-sendkey-choice]').forEach((el) => {
      el.classList.toggle('active', el.dataset.sendkeyChoice === sendKey);
    });
    if ($('shortcut-send-readout')) {
      $('shortcut-send-readout').textContent = sendKey === 'ctrl_enter' ? 'Ctrl + Enter' : 'Enter';
    }

    const qMode = state.settings.queued_behavior === 'immediate' ? 'immediate' : 'queue';
    document.querySelectorAll('[data-queued-choice]').forEach((el) => {
      el.classList.toggle('active', el.dataset.queuedChoice === qMode);
    });

    const defModeEl = $('settings-default-mode');
    if (defModeEl) defModeEl.value = state.settings.default_mode || 'default';

    const curLang = normalizeLanguage(state.settings.language || 'zh-CN');
    document.querySelectorAll('[data-lang-choice]').forEach((el) => {
      el.classList.toggle('active', el.dataset.langChoice === curLang);
    });

    if ($('toggle-notify-desktop')) $('toggle-notify-desktop').checked = Boolean(state.settings.notify_desktop);
    if ($('toggle-notify-sound')) $('toggle-notify-sound').checked = Boolean(state.settings.notify_sound);
  }

  function playCompletionChime() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.14);
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.36);
    } catch {
      // ignore audio restrictions
    }
  }

  function fireCompletionNotifications(titleText) {
    if (state.settings.notify_sound) {
      playCompletionChime();
    }
    if (
      state.settings.notify_desktop &&
      document.hidden &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      try {
        new Notification(t('Antigravity 回复已完成'), { body: titleText || t('你的任务已完成。') });
      } catch {
        // ignore
      }
    }
  }

  function applyColorPalette(themeMode, schemeKey, customOverrides = {}) {
    const mode = themeMode === 'dark' ? 'dark' : 'light';
    const resolvedKey = resolveSchemeKey(schemeKey);
    const scheme = COLOR_SCHEMES[resolvedKey] || COLOR_SCHEMES.claude;
    const base = scheme[mode];
    const custom = customOverrides || {};
    const merged = { ...base };

    if (custom.accent) {
      merged.accent = custom.accent;
      merged.accent_hover = shiftHexBrightness(custom.accent, mode === 'dark' ? 18 : -18);
      merged.starburst = custom.accent;
      merged.accent_glow = shiftHexBrightness(custom.accent, 38);
    }
    if (custom.bg_main) merged.bg_main = custom.bg_main;
    if (custom.bg_sidebar) {
      merged.bg_sidebar = custom.bg_sidebar;
      merged.bg_sidebar_hover = shiftHexBrightness(custom.bg_sidebar, mode === 'dark' ? 12 : -10);
      merged.bg_sidebar_active = shiftHexBrightness(custom.bg_sidebar, mode === 'dark' ? 22 : -18);
    }
    if (custom.bg_user_bubble) merged.bg_user_bubble = custom.bg_user_bubble;

    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--bg-main', merged.bg_main);
    rootStyle.setProperty('--bg-sidebar', merged.bg_sidebar);
    rootStyle.setProperty('--bg-sidebar-hover', merged.bg_sidebar_hover);
    rootStyle.setProperty('--bg-sidebar-active', merged.bg_sidebar_active);
    rootStyle.setProperty('--bg-composer', merged.bg_composer);
    rootStyle.setProperty('--bg-surface', merged.bg_surface);
    rootStyle.setProperty('--bg-subtle', merged.bg_subtle);
    rootStyle.setProperty('--bg-user-bubble', merged.bg_user_bubble);
    rootStyle.setProperty('--bg-code', merged.bg_code);
    rootStyle.setProperty('--bg-code-header', merged.bg_code_header);
    rootStyle.setProperty('--accent', merged.accent);
    rootStyle.setProperty('--accent-hover', merged.accent_hover);
    rootStyle.setProperty('--accent-soft', hexToRgba(merged.accent, mode === 'dark' ? 0.16 : 0.11));
    rootStyle.setProperty('--starburst', merged.starburst);
    rootStyle.setProperty('--accent-glow', merged.accent_glow);

    const themeMeta = document.getElementById('meta-theme-color');
    if (themeMeta) {
      themeMeta.setAttribute('content', merged.bg_sidebar);
    }
    if (window.chrome && window.chrome.webview) {
      try {
        window.chrome.webview.postMessage('window:bg:' + merged.bg_sidebar);
      } catch {
        // ignore outside WebView2
      }
    }

    const accentClean = merged.accent.replace('#', '');
    if (accentClean.length === 6) {
      const r = parseInt(accentClean.slice(0, 2), 16);
      const g = parseInt(accentClean.slice(2, 4), 16);
      const b = parseInt(accentClean.slice(4, 6), 16);
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      rootStyle.setProperty('--text-on-accent', lum > 0.65 ? '#141413' : '#FFFFFF');
    }

    const syncPicker = (inputId, hexId, val) => {
      const inp = $(inputId);
      const lbl = $(hexId);
      if (inp && val && /^#[0-9a-fA-F]{6}$/.test(val)) inp.value = val;
      if (lbl && val) lbl.textContent = val.toUpperCase();
    };
    syncPicker('pick-color-accent', 'hex-color-accent', merged.accent);
    syncPicker('pick-color-bg-main', 'hex-color-bg-main', merged.bg_main);
    syncPicker('pick-color-bg-sidebar', 'hex-color-bg-sidebar', merged.bg_sidebar);
    syncPicker('pick-color-user-bubble', 'hex-color-user-bubble', merged.bg_user_bubble);
    syncPicker('settings-pick-accent', 'settings-hex-accent', merged.accent);
    syncPicker('settings-pick-bg-main', 'settings-hex-bg-main', merged.bg_main);
    syncPicker('settings-pick-bg-sidebar', 'settings-hex-bg-sidebar', merged.bg_sidebar);
    syncPicker('settings-pick-user-bubble', 'settings-hex-user-bubble', merged.bg_user_bubble);

    renderThemePresetUI();
  }

  function renderFontPresetUI() {
    const activeFont = FONT_PRESETS[state.settings.font_style] ? state.settings.font_style : 'serif';
    for (const gridId of ['settings-font-grid', 'cust-font-grid']) {
      const grid = $(gridId);
      if (!grid) continue;
      grid.innerHTML = '';
      for (const [key, item] of Object.entries(FONT_PRESETS)) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'font-preset-card' + (key === activeFont ? ' active' : '');
        card.dataset.fontChoice = key;
        card.innerHTML = `
          <span class="font-specimen">${escapeHtml(item.sample)}</span>
          <div class="font-preset-meta">
            <span class="popover-item-title">${escapeHtml(item.name)}</span>
            <span class="popover-item-desc">${escapeHtml(item.desc)}</span>
          </div>
        `;
        const specimenEl = card.querySelector('.font-specimen');
        if (specimenEl) specimenEl.style.fontFamily = item.previewFamily;
        card.addEventListener('click', () => selectFontStyle(key));
        grid.appendChild(card);
      }
    }
  }

  async function selectFontStyle(fontKey) {
    const f = FONT_PRESETS[fontKey] ? fontKey : 'serif';
    state.settings.font_style = f;
    applyAppearance(state.settings.theme, f);
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ font_style: f }),
    });
  }

  function renderThemePresetUI() {
    const mode = state.settings.theme === 'dark' ? 'dark' : 'light';
    const activeScheme = resolveSchemeKey(state.settings.color_scheme || 'claude');

    const quickGrid = $('palette-quick-grid');
    if (quickGrid) {
      quickGrid.innerHTML = '';
      for (const [key, item] of Object.entries(COLOR_SCHEMES)) {
        const pal = item[mode];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'palette-quick-btn' + (key === activeScheme ? ' active' : '');
        btn.innerHTML = `<span class="palette-dot" style="background:${pal.accent};"></span><span>${escapeHtml(item.name.split(' · ')[0])}</span>`;
        btn.addEventListener('click', () => selectColorScheme(key));
        quickGrid.appendChild(btn);
      }
    }

    for (const gridId of ['theme-preset-grid', 'settings-theme-preset-grid']) {
      const fullGrid = $(gridId);
      if (!fullGrid) continue;
      fullGrid.innerHTML = '';
      for (const [key, item] of Object.entries(COLOR_SCHEMES)) {
        const pal = item[mode];
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'theme-preset-card' + (key === activeScheme ? ' active' : '');
        card.innerHTML = `
          <div class="popover-item-main">
            <span class="popover-item-title">${escapeHtml(item.name)}</span>
            <span class="popover-item-desc">${escapeHtml(item.desc)}</span>
          </div>
          <div class="preset-swatches">
            <span style="background:${pal.bg_main};"></span>
            <span style="background:${pal.bg_sidebar};"></span>
            <span style="background:${pal.accent};"></span>
          </div>
        `;
        card.addEventListener('click', () => selectColorScheme(key));
        fullGrid.appendChild(card);
      }
    }
  }

  async function selectColorScheme(schemeKey) {
    state.settings.color_scheme = schemeKey;
    state.settings.custom_colors = {};
    applyColorPalette(state.settings.theme, schemeKey, {});
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ color_scheme: schemeKey, custom_colors: {} }),
    });
  }

  function applyAppearance(theme, fontStyle) {
    const t = theme === 'dark' ? 'dark' : 'light';
    const f = FONT_PRESETS[fontStyle] ? fontStyle : 'serif';
    const prevTheme = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', t);
    document.documentElement.setAttribute('data-font', f);
    if (prevTheme && prevTheme !== t) {
      rerenderAllMermaidForTheme();
    }
    applyColorPalette(t, state.settings.color_scheme || 'claude', state.settings.custom_colors || {});
    renderFontPresetUI();

    document.querySelectorAll('[data-cust-theme]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.custTheme === t);
    });
    document.querySelectorAll('[data-settings-theme]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.settingsTheme === t);
    });

    const themeIcon = $('theme-icon');
    if (themeIcon) {
      if (t === 'dark') {
        themeIcon.innerHTML =
          '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>';
      } else {
        themeIcon.innerHTML =
          '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>';
      }
    }
  }

  function bindEvents() {
    $('btn-toggle-theme').addEventListener('click', async () => {
      const nextTheme = state.settings.theme === 'dark' ? 'light' : 'dark';
      state.settings.theme = nextTheme;
      applyAppearance(nextTheme, state.settings.font_style);
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: nextTheme }),
      });
    });

    let colorSaveTimer = null;
    document.querySelectorAll('[data-custom-color]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const key = inp.dataset.customColor;
        state.settings.custom_colors = { ...(state.settings.custom_colors || {}), [key]: inp.value };
        applyColorPalette(state.settings.theme, state.settings.color_scheme || 'claude', state.settings.custom_colors);
        clearTimeout(colorSaveTimer);
        colorSaveTimer = setTimeout(() => {
          fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ custom_colors: state.settings.custom_colors }),
          }).catch(() => {});
        }, 220);
      });
    });

    $('btn-reset-colors').addEventListener('click', async () => {
      state.settings.custom_colors = {};
      applyColorPalette(state.settings.theme, state.settings.color_scheme || 'claude', {});
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ custom_colors: {} }),
      });
    });
  }

  return {
    applyProfileUi,
    applyInterfaceSettings,
    playCompletionChime,
    fireCompletionNotifications,
    applyColorPalette,
    renderFontPresetUI,
    selectFontStyle,
    renderThemePresetUI,
    selectColorScheme,
    applyAppearance,
    bindEvents,
  };
}
