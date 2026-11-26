/* ==========================================================================
   Antigravity Studio — Lean Frontend Entrypoint & Module Orchestrator
   Pure Native ES Modules (Zero Build / Zero Bundler / Instant Load)
   ========================================================================== */

import {
  folderBasename,
  escapeHtml,
  renderMarkdownDocument,
} from './js/markdown-utils.js';
import { updateTimeGreetingEl } from './js/greetings.js';
import {
  getLanguage,
  getLanguageMeta,
  normalizeLanguage,
  setLanguage,
  startI18nObserver,
  t,
} from './js/i18n.js';
import { extToHighlightLang } from './js/file-renderer.js';
import { createAppearanceController } from './js/appearance.js';
import { createModelsUsageController } from './js/models-usage.js';
import { createLightboxController } from './js/lightbox.js';
import { createSketchpadController } from './js/sketchpad.js';
import { createWorkspaceProjectsController } from './js/workspace-projects.js';
import { createRightPaneController } from './js/right-pane.js';
import { createGithubPanelController } from './js/github-panel.js';
import { createChatEngineController } from './js/chat-engine.js';
import { createFeatureViewsController } from './js/feature-views.js';
import { createSettingsModalController } from './js/settings-modal.js';
import { createDesktopChromeController } from './js/desktop-chrome.js';
import { createSelectionAskController } from './js/selection-ask.js';
import { createCheckpointController } from './js/checkpoints.js';
import { createWorktreeController } from './js/worktrees.js';
import { createSkillsHubController } from './js/skills-hub.js';
import { createComposerPaletteController } from './js/composer-palette.js';
import { createCommandPaletteController } from './js/command-palette.js';
import { createTurnNavigatorController } from './js/turn-navigator.js';

// Ensure native frameless desktop controls render immediately inside WebView2
if (window.__ANTIGRAVITY_DESKTOP__ || (window.chrome && window.chrome.webview)) {
  document.documentElement.classList.add('is-desktop-shell');
}

// =========================================================================
// Shared Application State
// =========================================================================

const state = {
  conversations: [],
  activeConv: null,
  isStreaming: false,
  abortController: null,
  activeStreams: new Map(),
  unreadDoneConvs: new Set(),
  convSearchQuery: '',
  searchResults: null,
  engines: [],
  agyInstalled: false,
  agyPath: '',
  activeCwd: '',
  defaultWorkspaceDir: '',
  workspaceExplicit: false,
  settings: {
    cli_engine: 'agy',
    auto_dispatch_skills: true,
    sync_agy_conversations: true,
    agy_path: '',
    default_cwd: '',
    default_model: 'default',
    default_mode: 'default',
    default_effort: 'default',
    extra_flags: '',
    custom_instructions: '',
    profile_name: 'Antigravity CLI',
    profile_subtitle: '',
    profile_avatar: '',
    interface_layout: 'engineering',
    language: getLanguage(),
    send_shortcut: 'enter',
    queued_behavior: 'queue',
    chat_width: 'standard',
    notify_desktop: false,
    notify_sound: false,
    theme: 'light',
    color_scheme: 'claude',
    custom_colors: {},
    font_style: 'serif',
    custom_model: '',
    projects: [],
  },
  queuedFollowup: null,
  selectedSettingsProject: null,
  usageState: { loading: false, data: null, error: '', fetchedAt: 0 },
  cssMtime: 0,
  cssDirty: false,
  codeStore: new Map(),
  codeSeq: 0,
  lastArtifact: null,
  sidePaneMode: null,
  rightPane: {
    tabs: [],
    activeTabId: null,
    showLauncher: true,
    splitActive: false,
    splitTabId: null,
    splitVertical: false,
    focusWide: false,
    autoCollapsedLeft: false,
    expandedDirs: new Set(),
    dirCache: new Map(),
    gitStatus: null,
    ghTab: 'changes',
    activeDiffPath: '',
    termCwd: '',
    termRunning: false,
    termHistory: [],
    termHistoryIdx: -1,
    termSessionId: `term-${Date.now()}`,
  },
  github: {
    connected: false,
    user: null,
    defaultCloneDir: '',
    pulls: [],
    activePr: null,
    issues: [],
    activeIssue: null,
  },
  modelFamilies: [],
  selectedFamilyKey: 'default',
  selectedEffortKey: 'default',
  selectedMode: 'default',
  pendingAttachments: [],
  activeCapabilities: new Set(),
  activeView: 'chat',
  libraryItems: [],
  libraryFilter: 'all',
  selectedStudyMode: 'study_socratic',
  selectedVideoMode: 'video_motion',
  folderBrowserCurrent: '',
  folderBrowserParent: '',
  folderModalMode: 'switch',
};

// =========================================================================
// DOM Element Cache
// =========================================================================

const $ = (id) => document.getElementById(id);
const dom = {
  appEl: $('app'),
  stageEl: $('stage'),
  scrollArea: $('scroll-area'),
  projectListEl: $('project-list'),
  convListEl: $('conv-list'),
  messagesEl: $('messages-container'),
  composerCard: $('composer-card'),
  composerInput: $('composer-input'),
  composerAttachments: $('composer-attachments'),
  hiddenFileInput: $('hidden-file-input'),
  btnSend: $('btn-send'),
  iconSend: $('icon-send'),
  iconStop: $('icon-stop'),
  headerTitle: $('chat-header-title'),
  headerRenameInput: $('chat-header-rename-input'),
  greetingText: $('greeting-text'),
  cliStatusDot: $('cli-status-dot'),
  cliStatusText: $('cli-status-text'),
  cliMissingBanner: $('cli-missing-banner'),
  composerContextBar: $('composer-context-bar'),
  btnClearWorkspace: $('btn-clear-workspace'),
  cwdChipLabel: $('cwd-chip-label'),
  sessionMetaBar: $('session-meta-bar'),
  dropdownAttach: $('dropdown-attach'),
  btnAttachMenu: $('btn-attach-menu'),
  activeCapPills: $('active-cap-pills'),
  dropdownPalette: $('dropdown-palette'),
  btnPalettePopover: $('btn-palette-popover'),
  dropdownCwd: $('dropdown-cwd'),
  btnCwdPicker: $('btn-cwd-picker'),
  popoverCwd: $('popover-cwd'),
  dropdownMode: $('dropdown-mode'),
  btnModePicker: $('btn-mode-picker'),
  modePickerLabel: $('mode-picker-label'),
  popoverMode: $('popover-mode'),
  dropdownModel: $('dropdown-model'),
  btnModelPicker: $('btn-model-picker'),
  modelPickerLabel: $('model-picker-label'),
  popoverModel: $('popover-model'),
  dropdownEffort: $('dropdown-effort'),
  btnEffortPicker: $('btn-effort-picker'),
  effortPickerLabel: $('effort-picker-label'),
  popoverEffort: $('popover-effort'),
  stageCardShell: $('stage-card-shell'),
  sidePane: $('side-pane'),
  sidePaneResizer: $('side-pane-resizer'),
  rpDynamicTabs: $('rp-dynamic-tabs'),
  rpChangesBadge: $('rp-changes-badge'),
  topbarChangesDot: $('topbar-changes-dot'),
  btnToggleRightPane: $('btn-toggle-right-pane'),
  btnRpFocusWide: $('btn-rp-focus-wide'),
  iconRpFocusWide: $('icon-rp-focus-wide'),
  rpFileMoreWrap: $('rp-file-more-wrap'),
  btnRpFileMore: $('btn-rp-file-more'),
  btnRpMenuSplit: $('btn-rp-menu-split'),
  btnRpMenuFocus: $('btn-rp-menu-focus'),
  btnRpFileEdit: $('btn-rp-file-edit'),
  btnRpFileSave: $('btn-rp-file-save'),
  btnRpMenuEdit: $('btn-rp-menu-edit'),
  contextMeterPill: $('context-meter-pill'),
  convSearchInput: $('conv-search-input'),
  btnConvSearchClear: $('btn-conv-search-clear'),
  sidebarRunningCount: $('sidebar-running-count'),
  settingsCliEngine: $('settings-cli-engine'),
  settingsEngineDesc: $('settings-engine-desc'),
  appToastStack: $('app-toast-stack'),
  paneLauncherBody: $('pane-launcher-body'),
  paneFileBody: $('pane-file-body'),
  paneExplorerBody: $('pane-explorer-body'),
  paneChangesBody: $('pane-changes-body'),
  paneArtifactBody: $('pane-artifact-body'),
  paneTerminalBody: $('pane-terminal-body'),
  paneCssBody: $('pane-css-body'),
  rpLauncherSearch: $('rp-launcher-search'),
  rpLauncherSearchResults: $('rp-launcher-search-results'),
  rpLauncherDefault: $('rp-launcher-default'),
  rpLauncherCwd: $('rp-launcher-cwd'),
  rpLauncherTree: $('rp-launcher-tree'),
  btnRpLauncherRefresh: $('btn-rp-launcher-refresh'),
  rpFilesCwd: $('rp-files-cwd'),
  rpFilesSearch: $('rp-files-search'),
  rpFilesTree: $('rp-files-tree'),
  btnRpExplorerRefresh: $('btn-rp-explorer-refresh'),
  rpReaderPath: $('rp-reader-path'),
  rpReaderMeta: $('rp-reader-meta'),
  rpReaderContent: $('rp-reader-content'),
  btnRpReaderMdToggle: $('btn-rp-reader-md-toggle'),
  btnRpToggleSplit: $('btn-rp-toggle-split'),
  btnRpReaderCite: $('btn-rp-reader-cite'),
  btnRpReaderCopy: $('btn-rp-reader-copy'),
  btnRpReaderExternal: $('btn-rp-reader-external'),
  btnRpReaderReload: $('btn-rp-reader-reload'),
  rpSplitContainer: $('rp-split-container'),
  rpFileSlot1: $('rp-file-slot-1'),
  rpSplitSelect: $('rp-split-select'),
  rpSplitMeta: $('rp-split-meta'),
  rpSplitContent: $('rp-split-content'),
  btnRpSplitMdToggle: $('btn-rp-split-md-toggle'),
  btnRpSplitOrient: $('btn-rp-split-orient'),
  btnRpSplitCite: $('btn-rp-split-cite'),
  btnRpSplitClose: $('btn-rp-split-close'),
  rpGitBranch: $('rp-git-branch'),
  rpGitSummary: $('rp-git-summary'),
  btnRpDiffAll: $('btn-rp-diff-all'),
  btnRpChangesRefresh: $('btn-rp-changes-refresh'),
  rpChangesList: $('rp-changes-list'),
  rpDiffWrap: $('rp-diff-wrap'),
  rpDiffPath: $('rp-diff-path'),
  rpDiffStats: $('rp-diff-stats'),
  rpDiffCode: $('rp-diff-code'),
  btnRpDiffOpenFile: $('btn-rp-diff-open-file'),
  btnRpDiffReview: $('btn-rp-diff-review'),
  rpArtifactTitle: $('rp-artifact-title'),
  rpArtifactEmpty: $('rp-artifact-empty'),
  artifactTabs: $('artifact-tabs'),
  artifactIframe: $('artifact-iframe'),
  artifactSource: $('artifact-source'),
  btnTopbarArtifact: $('btn-topbar-artifact'),
  btnTopbarExportMd: $('btn-topbar-export-md'),
  rpTermCwd: $('rp-term-cwd'),
  rpTermOutput: $('rp-term-output'),
  rpTermInput: $('rp-term-input'),
  btnRpTermRun: $('btn-rp-term-run'),
  btnRpTermClear: $('btn-rp-term-clear'),
  btnRpTermStop: $('btn-rp-term-stop'),
  cssEditor: $('css-editor'),
  cssSaveStatus: $('css-save-status'),
  livePreviewCss: $('live-preview-css'),
  customCssLink: $('user-custom-css-link'),
  folderModal: $('folder-modal'),
  folderModalTitle: $('folder-modal-title'),
  folderShortcutsRow: $('folder-shortcuts-row'),
  folderPathInput: $('folder-path-input'),
  folderDirList: $('folder-dir-list'),
  filePickerModal: $('file-picker-modal'),
  filePickerCwdHint: $('file-picker-cwd-hint'),
  filePickerSearch: $('file-picker-search'),
  filePickerList: $('file-picker-list'),
  sketchModal: $('sketch-modal'),
  sketchCanvas: $('sketch-canvas'),
  sketchColors: $('sketch-colors'),
  sketchSizes: $('sketch-sizes'),
  settingsModal: $('settings-modal'),
  inputAgyPath: $('input-agy-path'),
  inputCustomModel: $('input-custom-model'),
  inputExtraFlags: $('input-extra-flags'),
  inputProfileName: $('input-profile-name'),
  inputProfileSubtitle: $('input-profile-subtitle'),
  inputProfileAvatar: $('input-profile-avatar'),
  avatarFileInput: $('avatar-file-input'),
  settingsDetectedAgy: $('settings-detected-agy'),
};

// =========================================================================
// Shared Cross-Module Helpers & Capability Pills
// =========================================================================

const CAPABILITY_META = {
  create_image: { label: '创建图像', icon: '🖼' },
  web_search: { label: '网页搜索', icon: '🌐' },
  deep_research: { label: '深度研究', icon: '🔭' },
  think_deeper: { label: '思考一下', icon: '🧠' },
  study_socratic: { label: '苏格拉底引导', icon: '🎓' },
  study_explain: { label: '概念精讲', icon: '🎓' },
  study_quiz: { label: '互动测验', icon: '🎓' },
  study_paper: { label: '论文精读', icon: '🎓' },
  video_script: { label: '视频脚本', icon: '🎬' },
  video_analyze: { label: '视频分析', icon: '🎬' },
  video_motion: { label: '动画演示', icon: '🎬' },
};

function showAppToast(message, { actionLabel = '', onAction = null, duration = 4200 } = {}) {
  if (!dom.appToastStack || !message) return;
  const localizedMsg = t(message);
  const localizedAct = actionLabel ? t(actionLabel) : '';
  const toast = document.createElement('div');
  toast.className = 'app-toast';
  toast.innerHTML = `
    <span class="app-toast-dot"></span>
    <span class="app-toast-msg">${escapeHtml(localizedMsg)}</span>
    ${localizedAct ? `<button type="button" class="app-toast-act">${escapeHtml(localizedAct)}</button>` : ''}
  `;
  const removeToast = () => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(6px)';
    toast.style.transition = 'opacity 0.16s ease, transform 0.16s ease';
    setTimeout(() => toast.remove(), 180);
  };
  const actBtn = toast.querySelector('.app-toast-act');
  if (actBtn && onAction) {
    actBtn.addEventListener('click', () => {
      onAction();
      removeToast();
    });
  }
  dom.appToastStack.appendChild(toast);
  setTimeout(removeToast, duration);
}

function renderMarkdown(mdText, isStreaming = false) {
  return renderMarkdownDocument(mdText, isStreaming, {
    nextBlockId: () => `cb-${++state.codeSeq}`,
    storeCodeBlock: (id, block) => state.codeStore.set(id, block),
    onArtifact: (art) => {
      state.lastArtifact = art;
      if (dom.btnTopbarArtifact) dom.btnTopbarArtifact.style.display = 'inline-flex';
    },
  });
}

function closeAllPopovers(exceptEl = null) {
  document.querySelectorAll('.claude-dropdown.open').forEach((el) => {
    if (el !== exceptEl) el.classList.remove('open');
  });
}

function updateTimeGreeting(animate = false) {
  updateTimeGreetingEl(dom.greetingText, animate);
}

async function setAppLanguage(lang, persist = true) {
  const norm = normalizeLanguage(lang);
  const prev = getLanguage();
  state.settings.language = norm;
  setLanguage(norm);
  appearanceCtrl.applyInterfaceSettings();
  if (prev !== norm) {
    updateTimeGreeting(true);
  }
  if (persist) {
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: norm }),
      });
    } catch {
      // ignore offline persist errors
    }
    const meta = getLanguageMeta(norm);
    showAppToast(`已切换界面语言为「${meta.label}」`, { duration: 2400 });
  }
}

function updateEnginesUi(engines = [], activeEngine = 'agy') {
  state.engines = Array.isArray(engines) ? engines : [];
  const activeId = activeEngine || state.settings.cli_engine || 'agy';
  const activeObj = state.engines.find((e) => e.id === activeId) || state.engines[0];
  if (dom.settingsCliEngine && state.engines.length) {
    dom.settingsCliEngine.innerHTML = '';
    for (const eng of state.engines) {
      const opt = document.createElement('option');
      opt.value = eng.id;
      opt.textContent = `${eng.label} ${eng.installed ? '✓' : '(未安装)'}`;
      if (eng.id === activeId) opt.selected = true;
      dom.settingsCliEngine.appendChild(opt);
    }
  }
  if (dom.settingsEngineDesc && activeObj) {
    dom.settingsEngineDesc.textContent = activeObj.installed
      ? `${activeObj.desc}（已识别：${activeObj.path}）`
      : `${activeObj.desc}（未检测到，安装：${activeObj.install_hint}）`;
  }
  if (activeObj) {
    dom.cliStatusDot.classList.toggle('ready', Boolean(activeObj.installed));
    dom.cliStatusText.textContent = activeObj.installed ? `${activeObj.id} 已就绪` : `未检测到 ${activeObj.id}`;
  }
}

function updateCliStatusBadge(installed, agyPath) {
  state.agyInstalled = installed;
  state.agyPath = agyPath || '';
  dom.cliStatusDot.classList.toggle('ready', installed);
  dom.cliStatusText.textContent = installed ? `${state.settings.cli_engine || 'agy'} 已就绪` : '未检测到 agy';
  dom.cliMissingBanner.style.display = installed ? 'none' : 'flex';
  dom.settingsDetectedAgy.textContent = installed
    ? `当前已识别路径: ${agyPath}`
    : '当前尚未在 PATH 中找到 agy 可执行文件';
}

// =========================================================================
// Instantiate Modular Controllers
// =========================================================================

let checkpointCtrl = null;
let worktreeCtrl = null;
let skillsHubCtrl = null;
let composerPaletteCtrl = null;
let commandPaletteCtrl = null;
let turnNavCtrl = null;

const appearanceCtrl = createAppearanceController({
  state,
});

const modelsUsageCtrl = createModelsUsageController({
  state,
  dom,
  closeAllPopovers,
  onModelChanged: () => chatEngineCtrl.refreshContextMeter(),
});

const autoResizeTextarea = () => {
  dom.composerInput.style.height = 'auto';
  dom.composerInput.style.height = Math.min(dom.composerInput.scrollHeight, 220) + 'px';
  chatEngineCtrl.updateSendButtonState();
  chatEngineCtrl.refreshContextMeter();
};

function toggleCapability(capKey) {
  if (!CAPABILITY_META[capKey]) return;
  if (state.activeCapabilities.has(capKey)) {
    state.activeCapabilities.delete(capKey);
  } else {
    state.activeCapabilities.add(capKey);
    if (capKey === 'deep_research' || capKey === 'think_deeper') {
      const fam = modelsUsageCtrl.getActiveFamily();
      if (fam.efforts.length) {
        const best = fam.efforts.find((e) => e.key === 'xhigh') || fam.efforts.find((e) => e.key === 'high');
        if (best) modelsUsageCtrl.selectEffortKey(best.key);
      }
    }
  }
  renderActiveCapabilityPills();
}

function renderActiveCapabilityPills() {
  dom.activeCapPills.innerHTML = '';
  for (const capKey of state.activeCapabilities) {
    const meta = CAPABILITY_META[capKey];
    if (!meta) continue;
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'cap-pill';
    pill.dataset.cap = capKey;
    pill.title = `点击关闭「${meta.label}」`;
    pill.innerHTML = `<span>${meta.icon}</span><span>${escapeHtml(meta.label)}</span><span class="cap-pill-x">✕</span>`;
    pill.addEventListener('click', () => toggleCapability(capKey));
    dom.activeCapPills.appendChild(pill);
  }
  document.querySelectorAll('[data-cap-toggle]').forEach((btn) => {
    const k = btn.dataset.capToggle;
    const isOn = state.activeCapabilities.has(k);
    btn.classList.toggle('active', isOn);
    const chk = btn.querySelector(`[data-cap-check="${k}"]`);
    if (chk) chk.textContent = isOn ? '✓' : '';
  });
}

const lightboxCtrl = createLightboxController({
  getActiveCwd: () => state.activeCwd || '',
  openExternalPath: (p, rev) => rightPaneCtrl.openExternalPath(p, rev),
  openFileInRightPane: (rel) => rightPaneCtrl.openFileInRightPane(rel),
});

const sketchpadCtrl = createSketchpadController({
  sketchModal: dom.sketchModal,
  sketchCanvas: dom.sketchCanvas,
  sketchColors: dom.sketchColors,
  sketchSizes: dom.sketchSizes,
  onAttached: (saved) => {
    state.pendingAttachments.push(saved);
    chatEngineCtrl.renderPendingAttachments();
    dom.composerInput.focus();
  },
});

const workspaceCtrl = createWorkspaceProjectsController({
  state,
  dom,
  actions: {
    updateSessionFooter: (conv) => chatEngineCtrl.updateSessionFooter(conv),
    syncRightPaneWorkspace: () => {
      if (composerPaletteCtrl) composerPaletteCtrl.invalidateFileCache();
      rightPaneCtrl.syncRightPaneWorkspace();
    },
    startNewChatView: (cwd) => chatEngineCtrl.startNewChatView(cwd),
    closeAllPopovers,
    renderPendingAttachments: () => chatEngineCtrl.renderPendingAttachments(),
    openExternalPath: (p, rev) => rightPaneCtrl.openExternalPath(p, rev),
    showAppToast,
  },
});

const githubPanelCtrl = createGithubPanelController({
  state,
  dom,
  actions: {
    loadWorktrees: () => worktreeCtrl && worktreeCtrl.loadWorktrees(),
    renderMarkdown,
    renderProjectList: () => workspaceCtrl.renderProjectList(),
    setActiveWorkspace: (p, persist) => workspaceCtrl.setActiveWorkspace(p, persist),
    startNewChatView: (cwd) => chatEngineCtrl.startNewChatView(cwd),
    openToolTab: (k) => rightPaneCtrl.openToolTab(k),
    openFileInRightPane: (rel) => rightPaneCtrl.openFileInRightPane(rel),
    citeWorkspaceFileToComposer: (...a) => rightPaneCtrl.citeWorkspaceFileToComposer(...a),
    autoResizeTextarea,
    switchMainView: (v) => featureViewsCtrl.switchMainView(v),
  },
});

const rightPaneCtrl = createRightPaneController({
  state,
  dom,
  actions: {
    renderMarkdown,
    showAppToast,
    closeAllPopovers,
    autoResizeTextarea,
    updateCliStatusBadge,
    loadGitChanges: (silent) => githubPanelCtrl.loadGitChanges(silent),
    refreshReviewPanel: () => {
      githubPanelCtrl.loadGitChanges(false);
      if (state.rightPane.ghTab === 'pulls') githubPanelCtrl.loadGithubPulls();
      else if (state.rightPane.ghTab === 'issues') githubPanelCtrl.loadGithubIssues();
    },
    renderPendingAttachments: () => chatEngineCtrl.renderPendingAttachments(),
    switchMainView: (v) => featureViewsCtrl.switchMainView(v),
    openImageLightbox: (opts) => lightboxCtrl.openImageLightbox(opts),
    isLightboxOpen: () => lightboxCtrl.lightboxState.open,
    closeImageLightbox: () => lightboxCtrl.closeImageLightbox(),
    invalidateFileCache: () => composerPaletteCtrl && composerPaletteCtrl.invalidateFileCache(),
  },
});

const chatEngineCtrl = createChatEngineController({
  state,
  dom,
  actions: {
    renderMarkdown,
    showAppToast,
    autoResizeTextarea,
    updateTimeGreeting,
    fireCompletionNotifications: (t) => appearanceCtrl.fireCompletionNotifications(t),
    getResolvedModelAndEffort: () => modelsUsageCtrl.getResolvedModelAndEffort(),
    setSelectedMode: (m) => modelsUsageCtrl.setSelectedMode(m),
    syncPickersFromSlug: (m, e) => modelsUsageCtrl.syncPickersFromSlug(m, e),
    fetchUsageQuota: (f) => modelsUsageCtrl.fetchUsageQuota(f),
    isDefaultWorkspacePath: (p) => workspaceCtrl.isDefaultWorkspacePath(p),
    syncComposerContextBar: () => workspaceCtrl.syncComposerContextBar(),
    renderProjectList: () => workspaceCtrl.renderProjectList(),
    renderCwdPopover: () => workspaceCtrl.renderCwdPopover(),
    syncRightPaneWorkspace: () => rightPaneCtrl.syncRightPaneWorkspace(),
    loadWorkspaceTree: (d, f) => rightPaneCtrl.loadWorkspaceTree(d, f),
    refreshOpenFileTabs: (silent) => rightPaneCtrl.refreshOpenFileTabs(silent),
    openArtifactPane: (art) => rightPaneCtrl.openArtifactPane(art),
    openExternalPath: (p, r) => rightPaneCtrl.openExternalPath(p, r),
    openFileInRightPane: (rel) => rightPaneCtrl.openFileInRightPane(rel),
    loadGitChanges: (s) => githubPanelCtrl.loadGitChanges(s),
    switchMainView: (v) => featureViewsCtrl.switchMainView(v),
    openImageLightbox: (o) => lightboxCtrl.openImageLightbox(o),
    openLocalFileSmart: (p, k) => lightboxCtrl.openLocalFileSmart(p, k),
    openRollbackModal: (id, hint) => checkpointCtrl && checkpointCtrl.openRollbackModal(id, hint),
    clearMountedSkills: () => skillsHubCtrl && skillsHubCtrl.clearMountedSkills(),
    getMountedSkillIds: () => (skillsHubCtrl ? skillsHubCtrl.getMountedSkillIds() : []),
    refreshTurnNavigator: () => turnNavCtrl && turnNavCtrl.refresh(),
    jumpToMessageIndex: (idx) => turnNavCtrl && turnNavCtrl.jumpToMessageIndex(idx),
  },
});

const featureViewsCtrl = createFeatureViewsController({
  state,
  dom,
  actions: {
    loadSkillsHub: (silent) => skillsHubCtrl && skillsHubCtrl.loadSkills(silent),
    openArtifactPane: (art) => rightPaneCtrl.openArtifactPane(art),
    renderPendingAttachments: () => chatEngineCtrl.renderPendingAttachments(),
    selectConversation: (id) => chatEngineCtrl.selectConversation(id),
    refreshConversationList: () => chatEngineCtrl.refreshConversationList(),
    startNewChatView: (cwd) => chatEngineCtrl.startNewChatView(cwd),
    sendMessage: (p, d) => chatEngineCtrl.sendMessage(p, d),
    uploadLocalFiles: (files) => chatEngineCtrl.uploadLocalFiles(files),
    applyAppearance: (t, f) => appearanceCtrl.applyAppearance(t, f),
    getResolvedModelAndEffort: () => modelsUsageCtrl.getResolvedModelAndEffort(),
    renderActiveCapabilityPills,
    loadCustomCssIntoEditor: () => rightPaneCtrl.loadCustomCssIntoEditor(),
    openCssStudio: () => rightPaneCtrl.openCssStudio(),
    syncExportButton: () => chatEngineCtrl.syncExportButton(),
    refreshTurnNavigator: () => turnNavCtrl && turnNavCtrl.refresh(),
  },
});

const settingsModalCtrl = createSettingsModalController({
  state,
  dom,
  actions: {
    loadGithubStatusUi: () => githubPanelCtrl.loadGithubStatusUi(),
    renderFontPresetUI: () => appearanceCtrl.renderFontPresetUI(),
    renderThemePresetUI: () => appearanceCtrl.renderThemePresetUI(),
    selectModelFamily: (k) => modelsUsageCtrl.selectModelFamily(k),
    updateCliStatusBadge,
    updateEnginesUi,
    applyAppearance: (t, f) => appearanceCtrl.applyAppearance(t, f),
    applyProfileUi: (n, a, s) => appearanceCtrl.applyProfileUi(n, a, s),
    applyInterfaceSettings: () => appearanceCtrl.applyInterfaceSettings(),
    syncAgyConversationsNow: (showToast) => chatEngineCtrl.syncAgyConversationsNow(showToast),
    setAppLanguage,
    showAppToast,
    setSelectedMode: (m) => modelsUsageCtrl.setSelectedMode(m),
    switchMainView: (v) => featureViewsCtrl.switchMainView(v),
    playCompletionChime: () => appearanceCtrl.playCompletionChime(),
    ensureCustomModelFamily: (s) => modelsUsageCtrl.ensureCustomModelFamily(s),
    syncPickersFromSlug: (m, e) => modelsUsageCtrl.syncPickersFromSlug(m, e),
    setActiveWorkspace: (p, persist) => workspaceCtrl.setActiveWorkspace(p, persist),
    startNewChatView: (p) => chatEngineCtrl.startNewChatView(p),
    removePinnedProject: (p) => workspaceCtrl.removePinnedProject(p),
    selectFontStyle: (f) => appearanceCtrl.selectFontStyle(f),
    applyColorPalette: (t, s, c) => appearanceCtrl.applyColorPalette(t, s, c),
    loadCustomCssIntoEditor: () => rightPaneCtrl.loadCustomCssIntoEditor(),
    openCssStudio: () => rightPaneCtrl.openCssStudio(),
    syncExportButton: () => chatEngineCtrl.syncExportButton(),
  },
});

const desktopChromeCtrl = createDesktopChromeController({
  appEl: dom.appEl,
  state,
  sidePane: dom.sidePane,
  composerInput: dom.composerInput,
  dropdownModel: dom.dropdownModel,
  modals: {
    folderModal: dom.folderModal,
    filePickerModal: dom.filePickerModal,
    sketchModal: dom.sketchModal,
    settingsModal: dom.settingsModal,
  },
  actions: {
    switchMainView: (v) => featureViewsCtrl.switchMainView(v),
    startNewChatView: () => chatEngineCtrl.startNewChatView(),
    openFolderBrowserModal: (m) => workspaceCtrl.openFolderBrowserModal(m),
    openGithubCloneModal: () => githubPanelCtrl.openGithubCloneModal(),
    openLauncherView: () => rightPaneCtrl.openLauncherView(),
    openToolTab: (k) => rightPaneCtrl.openToolTab(k),
    getActiveRightTab: () => rightPaneCtrl.getActiveRightTab(),
    closeRightTab: (id) => rightPaneCtrl.closeRightTab(id),
    closeSidePane: () => rightPaneCtrl.closeSidePane(),
    openExternalPath: (p) => rightPaneCtrl.openExternalPath(p),
    toggleRightPane: () => rightPaneCtrl.toggleRightPane(),
    toggleSplitReading: () => rightPaneCtrl.toggleSplitReading(),
    openCssStudio: () => rightPaneCtrl.openCssStudio(),
    closeAllPopovers,
    openSettingsModal: (tab) => settingsModalCtrl.openSettingsModal(tab),
    openFileInRightPane: (p, reload) => rightPaneCtrl.openFileInRightPane(p, reload),
    toggleCommandPalette: () => commandPaletteCtrl && commandPaletteCtrl.toggle(),
    toggleTurnNavigator: () => turnNavCtrl && turnNavCtrl.toggleCard(),
  },
});

// =========================================================================
// Initial Status Loader & Top-Level Event Wiring
// =========================================================================

async function loadInitialStatus() {
  modelsUsageCtrl.buildModelFamilies([]);
  modelsUsageCtrl.setSelectedMode('default');

  const res = await fetch('/api/status');
  const data = await res.json();
  state.settings = { ...state.settings, ...(data.settings || {}) };
  state.cssMtime = data.custom_css_mtime || 0;

  appearanceCtrl.applyAppearance(state.settings.theme, state.settings.font_style);
  appearanceCtrl.applyProfileUi(state.settings.profile_name, state.settings.profile_avatar, state.settings.profile_subtitle);
  const resolvedLang = normalizeLanguage(state.settings.language || getLanguage());
  const langChanged = resolvedLang !== getLanguage();
  state.settings.language = resolvedLang;
  setLanguage(resolvedLang);
  appearanceCtrl.applyInterfaceSettings();
  if (langChanged) updateTimeGreeting(false);
  modelsUsageCtrl.setSelectedMode(state.settings.default_mode || 'default');
  updateCliStatusBadge(data.agy_installed, data.agy_path);
  updateEnginesUi(data.engines || [], data.active_engine || state.settings.cli_engine || 'agy');

  state.defaultWorkspaceDir = data.default_workspace_dir || data.project_dir || '';
  state.activeCwd = state.defaultWorkspaceDir;
  state.workspaceExplicit = false;
  dom.cwdChipLabel.textContent = folderBasename(state.activeCwd);
  dom.cwdChipLabel.title = state.activeCwd;
  workspaceCtrl.syncComposerContextBar();

  workspaceCtrl.renderProjectList();
  workspaceCtrl.renderCwdPopover();
  rightPaneCtrl.syncRightPaneWorkspace();

  if (state.settings.custom_model) {
    modelsUsageCtrl.ensureCustomModelFamily(state.settings.custom_model);
  }

  if (data.agy_installed) {
    modelsUsageCtrl.fetchUsageQuota(false);
    fetch('/api/models')
      .then((r) => r.json())
      .then((m) => {
        const prevResolved = modelsUsageCtrl.getResolvedModelAndEffort();
        modelsUsageCtrl.buildModelFamilies(m.models || []);
        if (state.settings.custom_model) modelsUsageCtrl.ensureCustomModelFamily(state.settings.custom_model);
        if (state.activeConv && state.activeConv.model) {
          modelsUsageCtrl.syncPickersFromSlug(state.activeConv.model, state.activeConv.effort);
        } else if (prevResolved.model && prevResolved.model !== 'default') {
          modelsUsageCtrl.syncPickersFromSlug(prevResolved.model, prevResolved.effort);
        }
      })
      .catch(() => {});
  }
}

function bindEvents() {
  desktopChromeCtrl.bindEvents();
  appearanceCtrl.bindEvents();
  workspaceCtrl.bindEvents();
  lightboxCtrl.bindEvents();
  sketchpadCtrl.bindEvents();
  rightPaneCtrl.bindEvents();
  githubPanelCtrl.bindEvents();
  chatEngineCtrl.bindEvents();
  featureViewsCtrl.bindEvents();
  settingsModalCtrl.bindEvents();

  // Sidebar Navigation
  $('btn-new-chat').addEventListener('click', () => {
    chatEngineCtrl.startNewChatView();
    desktopChromeCtrl.navigateToView('chat');
  });
  dom.greetingText.addEventListener('click', () => updateTimeGreeting(true));
  $('nav-library').addEventListener('click', () => desktopChromeCtrl.navigateToView('library'));
  if ($('nav-skills')) $('nav-skills').addEventListener('click', () => desktopChromeCtrl.navigateToView('skills'));
  $('nav-scheduled').addEventListener('click', () => desktopChromeCtrl.navigateToView('scheduled'));
  $('nav-study').addEventListener('click', () => desktopChromeCtrl.navigateToView('study'));
  $('nav-customize').addEventListener('click', () => desktopChromeCtrl.navigateToView('customize'));
  $('nav-video').addEventListener('click', () => desktopChromeCtrl.navigateToView('video'));

  // Copy CLI Install Command
  $('btn-copy-install').addEventListener('click', async (e) => {
    await navigator.clipboard.writeText('irm https://antigravity.google/cli/install.ps1 | iex');
    e.currentTarget.textContent = '已复制 ✓';
    setTimeout(() => (e.currentTarget.textContent = '复制安装命令'), 1600);
  });

  // Popover Toggles
  const bindPopoverToggle = (btn, dd) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (btn.disabled) return;
      const willOpen = !dd.classList.contains('open');
      closeAllPopovers();
      if (willOpen) dd.classList.add('open');
    });
  };
  bindPopoverToggle(dom.btnAttachMenu, dom.dropdownAttach);
  bindPopoverToggle(dom.btnPalettePopover, dom.dropdownPalette);
  bindPopoverToggle(dom.btnCwdPicker, dom.dropdownCwd);
  bindPopoverToggle(dom.btnModePicker, dom.dropdownMode);
  bindPopoverToggle(dom.btnModelPicker, dom.dropdownModel);
  bindPopoverToggle(dom.btnEffortPicker, dom.dropdownEffort);

  if (dom.btnClearWorkspace) {
    dom.btnClearWorkspace.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllPopovers();
      workspaceCtrl.setActiveWorkspace(state.defaultWorkspaceDir, false, false);
    });
  }
  $('act-open-customize-colors').addEventListener('click', () => {
    closeAllPopovers();
    featureViewsCtrl.switchMainView('customize');
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.claude-dropdown')) closeAllPopovers();
    if (dom.rpFileMoreWrap && !e.target.closest('#rp-file-more-wrap')) rightPaneCtrl.closeRpFileMoreMenu();
  });

  // Attachment & Rich `+` Menu Actions
  $('act-upload-file').addEventListener('click', () => {
    closeAllPopovers();
    dom.hiddenFileInput.value = '';
    dom.hiddenFileInput.click();
  });
  $('act-pick-workspace-file').addEventListener('click', () => {
    closeAllPopovers();
    workspaceCtrl.openWorkspaceFilePicker();
  });
  if ($('act-dispatch-skill')) {
    $('act-dispatch-skill').addEventListener('click', () => {
      closeAllPopovers();
      if (composerPaletteCtrl) composerPaletteCtrl.openSlashMenuNow();
    });
  }
  $('act-work-in-project').addEventListener('click', () => {
    closeAllPopovers();
    workspaceCtrl.openFolderBrowserModal('switch');
  });
  $('act-open-sketchpad').addEventListener('click', () => {
    closeAllPopovers();
    sketchpadCtrl.openSketchpadModal();
  });
  document.querySelectorAll('[data-cap-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      toggleCapability(btn.dataset.capToggle);
      closeAllPopovers();
      dom.composerInput.focus();
    });
  });

  dom.hiddenFileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length) chatEngineCtrl.uploadLocalFiles(e.target.files);
  });
  dom.composerAttachments.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-remove-att]');
    if (!rm) return;
    state.pendingAttachments.splice(Number(rm.dataset.removeAtt), 1);
    chatEngineCtrl.renderPendingAttachments();
  });

  // Composer Drag & Drop + Paste
  dom.composerCard.addEventListener('dragover', (e) => {
    e.preventDefault();
    dom.composerCard.classList.add('drag-over');
  });
  dom.composerCard.addEventListener('dragleave', () => dom.composerCard.classList.remove('drag-over'));
  dom.composerCard.addEventListener('drop', (e) => {
    e.preventDefault();
    dom.composerCard.classList.remove('drag-over');
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
      chatEngineCtrl.uploadLocalFiles(e.dataTransfer.files);
    }
  });
  dom.composerInput.addEventListener('paste', (e) => {
    const items = e.clipboardData && e.clipboardData.files;
    if (items && items.length) {
      e.preventDefault();
      chatEngineCtrl.uploadLocalFiles(items);
    }
  });

  // Composer Input & Submit
  dom.composerInput.addEventListener('input', autoResizeTextarea);
  const triggerComposerSubmit = async () => {
    const hasInput = dom.composerInput.value.trim() || state.pendingAttachments.length;
    if (!hasInput) return;
    if (state.isStreaming) {
      const queuedText = dom.composerInput.value.trim();
      dom.composerInput.value = '';
      autoResizeTextarea();
      state.queuedFollowup = queuedText;
      if (state.settings.queued_behavior === 'immediate') {
        await chatEngineCtrl.stopActiveStream();
      }
      return;
    }
    chatEngineCtrl.sendMessage();
  };
  dom.composerInput.addEventListener('keydown', (e) => {
    if (composerPaletteCtrl && composerPaletteCtrl.isOpen()) return;
    const useCtrlEnter = state.settings.send_shortcut === 'ctrl_enter';
    const shouldSend = useCtrlEnter
      ? (e.key === 'Enter' && (e.ctrlKey || e.metaKey))
      : (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey);
    if (shouldSend) {
      e.preventDefault();
      triggerComposerSubmit();
    }
  });
  dom.btnSend.addEventListener('click', () => chatEngineCtrl.sendMessage());
}

// =========================================================================
// Application Bootstrap
// =========================================================================

async function init() {
  setLanguage(getLanguage());
  startI18nObserver();
  updateTimeGreeting();

  skillsHubCtrl = createSkillsHubController({
    getActiveCwd: () => state.activeCwd || '',
    getAutoDispatchEnabled: () => state.settings.auto_dispatch_skills !== false,
    onToggleAutoDispatch: async (enabled) => {
      state.settings.auto_dispatch_skills = Boolean(enabled);
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auto_dispatch_skills: Boolean(enabled) }),
      }).catch(() => {});
      showAppToast(enabled ? '已开启智能自动调度 Skill' : '已关闭自动调度（仍可通过 /slug 手动调用）');
    },
    onUseSkillInChat: (sk) => {
      featureViewsCtrl.switchMainView('chat');
      dom.composerInput.focus();
      showAppToast(`已挂载 Skill「${sk.name}」，直接输入需求即可使用`, { duration: 2800 });
    },
    onScheduleSkill: async (sk) => {
      featureViewsCtrl.switchMainView('scheduled');
      await skillsHubCtrl.loadSkills(true);
      if ($('sched-skill-select')) {
        $('sched-skill-select').value = sk.id;
        $('sched-skill-select').dispatchEvent(new Event('change'));
      }
      if ($('sched-name') && !$('sched-name').value.trim()) $('sched-name').value = `定时 · ${sk.name}`;
      if ($('sched-prompt')) $('sched-prompt').focus();
      showAppToast(`已在「已排定」绑定 Skill「${sk.name}」`);
    },
    composerInput: dom.composerInput,
    composerCard: dom.composerCard,
    activeSkillPillsEl: $('active-skill-pills'),
    slashMenuEl: $('composer-slash-menu'),
    schedSkillSelectEl: $('sched-skill-select'),
    showToast: showAppToast,
  });

  composerPaletteCtrl = createComposerPaletteController({
    composerInput: dom.composerInput,
    menuEl: $('composer-slash-menu'),
    state,
    actions: {
      getSkills: () => (skillsHubCtrl ? skillsHubCtrl.getSkills() : []),
      mountSkill: (id, silent) => skillsHubCtrl && skillsHubCtrl.mountSkill(id, silent),
      getAutoDispatchEnabled: () => state.settings.auto_dispatch_skills !== false,
      renderPendingAttachments: () => chatEngineCtrl.renderPendingAttachments(),
      openToolTab: (k) => rightPaneCtrl.openToolTab(k),
      switchReviewSubTab: (t) => githubPanelCtrl.switchReviewSubTab(t),
      setSelectedMode: (m) => modelsUsageCtrl.setSelectedMode(m),
      startNewChatView: () => chatEngineCtrl.startNewChatView(),
      sendMessage: (p, demo) => chatEngineCtrl.sendMessage(p, demo),
      showAppToast,
    },
  });

  commandPaletteCtrl = createCommandPaletteController({
    state,
    modalEl: $('command-palette-modal'),
    inputEl: $('cmdpal-input'),
    listEl: $('cmdpal-list'),
    actions: {
      startNewChatView: () => chatEngineCtrl.startNewChatView(),
      syncAgyConversationsNow: (showToast) => chatEngineCtrl.syncAgyConversationsNow(showToast),
      navigateToView: (v) => desktopChromeCtrl.navigateToView(v),
      openToolTab: (k) => rightPaneCtrl.openToolTab(k),
      switchReviewSubTab: (t) => githubPanelCtrl.switchReviewSubTab(t),
      toggleSplitReading: () => rightPaneCtrl.toggleSplitReading(),
      toggleTheme: () => $('btn-toggle-theme').click(),
      openCssStudio: () => rightPaneCtrl.openCssStudio(),
      openGithubCloneModal: () => githubPanelCtrl.openGithubCloneModal(),
      openFolderBrowserModal: (m) => workspaceCtrl.openFolderBrowserModal(m),
      openSettingsModal: (t) => settingsModalCtrl.openSettingsModal(t),
      runCodexAction: (a) => desktopChromeCtrl.runCodexAction(a),
      toggleSidebar: () => desktopChromeCtrl.toggleSidebar(),
      toggleRightPane: () => rightPaneCtrl.toggleRightPane(),
      exportActiveConversationMarkdown: () => chatEngineCtrl.exportActiveConversationMarkdown(),
      toggleTurnNavigator: () => turnNavCtrl && turnNavCtrl.toggleCard(),
      setActiveWorkspace: (p, persist) => workspaceCtrl.setActiveWorkspace(p, persist),
      selectConversation: (id) => chatEngineCtrl.selectConversation(id),
      selectColorScheme: (k) => appearanceCtrl.selectColorScheme(k),
      selectFontStyle: (f) => appearanceCtrl.selectFontStyle(f),
      setAppLanguage,
      getSkills: () => (skillsHubCtrl ? skillsHubCtrl.getSkills() : []),
      mountSkill: (id, s) => skillsHubCtrl && skillsHubCtrl.mountSkill(id, s),
      focusComposer: () => dom.composerInput.focus(),
      showAppToast,
    },
  });

  turnNavCtrl = createTurnNavigatorController({
    state,
    scrollArea: dom.scrollArea,
    messagesEl: dom.messagesEl,
    dockEl: $('turn-nav-dock'),
    railEl: $('turn-nav-rail'),
    cardEl: $('turn-nav-card'),
    titleEl: $('turn-nav-title'),
    metaEl: $('turn-nav-meta'),
    listEl: $('turn-nav-list'),
  });

  bindEvents();

  checkpointCtrl = createCheckpointController({
    modalEl: $('checkpoint-modal'),
    onRestored: (result) => {
      githubPanelCtrl.loadGitChanges(false);
      state.rightPane.dirCache.clear();
      rightPaneCtrl.refreshOpenFileTabs(false);
      showAppToast(`工作区已回滚：恢复 ${result.restored} 个文件，移除 ${result.removed} 个新建文件 ✓`);
    },
  });

  worktreeCtrl = createWorktreeController({
    listEl: $('rp-wt-list'),
    branchInputEl: $('rp-wt-branch-input'),
    addBtnEl: $('btn-rp-wt-add'),
    statusEl: $('rp-wt-status'),
    getActiveCwd: () => state.activeCwd || '',
    onEnterWorktree: async (wtPath, branch) => {
      await workspaceCtrl.setActiveWorkspace(wtPath, true, true);
      showAppToast(`已切换至 Worktree 分支 ${branch} ✓`);
      if (worktreeCtrl) worktreeCtrl.loadWorktrees();
    },
  });

  createSelectionAskController({
    containers: [dom.rpSplitContainer, dom.rpDiffCode],
    getSelectionContext: (srcContainer, ancEl) => {
      if (srcContainer === dom.rpDiffCode) {
        return { relPath: state.rightPane.activeDiffPath || 'git diff', lang: 'diff' };
      }
      const inSecond = ancEl && ancEl.closest('#rp-file-slot-1');
      const tab = inSecond
        ? state.rightPane.tabs.find((t) => t.id === state.rightPane.splitTabId)
        : rightPaneCtrl.getActiveRightTab();
      const f = tab && tab.fileData;
      return {
        relPath: (f && f.rel_path) || (tab && tab.relPath) || '',
        absPath: (f && f.abs_path) || '',
        lang: extToHighlightLang((f && f.ext) || (tab && tab.ext) || ''),
      };
    },
    onAskSelection: (payload, mode) => {
      const loc = payload.relPath
        ? payload.startLine
          ? payload.startLine === payload.endLine
            ? `${payload.relPath}:L${payload.startLine}`
            : `${payload.relPath}:L${payload.startLine}-L${payload.endLine}`
          : payload.relPath
        : '选中片段';
      const snippetBlock = `引用 \`${loc}\`：\n\`\`\`${payload.lang || ''}\n${payload.text}\n\`\`\``;
      const prefix = mode === 'ask' ? `${snippetBlock}\n请解释或分析这段代码：` : `${snippetBlock}\n`;
      const curVal = dom.composerInput.value;
      dom.composerInput.value = curVal && mode === 'quote' ? `${curVal.trimEnd()}\n\n${prefix}` : prefix;
      autoResizeTextarea();
      if (state.activeView !== 'chat') featureViewsCtrl.switchMainView('chat');
      dom.composerInput.focus();
      dom.composerInput.setSelectionRange(dom.composerInput.value.length, dom.composerInput.value.length);
    },
  });

  await loadInitialStatus();
  if (skillsHubCtrl) skillsHubCtrl.loadSkills(true);
  githubPanelCtrl.loadGithubStatusUi();
  await chatEngineCtrl.refreshConversationList();
  await rightPaneCtrl.loadCustomCssIntoEditor();
  rightPaneCtrl.startCustomCssHotReloadWatcher();
  dom.composerInput.focus();
}

init();
