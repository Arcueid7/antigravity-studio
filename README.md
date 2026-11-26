<div align="center">

# Antigravity Studio

**Zero-dependency local Desktop Workbench & Web UI Harness for Google Antigravity CLI (`agy`)**

[English](README.md) · [简体中文](README_ZH.md)

[![CI](https://img.shields.io/badge/tests-32%20passing-2e7d4f)](tests/run_all.py)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform: Windows 10/11](https://img.shields.io/badge/platform-Windows%2010%2F11-0078D6)](#quick-start)

</div>

> **Disclaimer**: Antigravity Studio is an independent, community-built open-source project and is **not** affiliated with, endorsed by, or officially connected to Google or the official Antigravity team. It drives your locally installed `agy` CLI over loopback (`127.0.0.1`).

---

## Highlights

- **Zero External Build or Runtime Dependencies**
  - Pure **Python 3.10+ standard library** backend (`ThreadingHTTPServer` + SSE streaming) + native **ES Modules** frontend (27 modular files, no Node/npm/bundler required) + lightweight **Win11 WebView2** C# desktop launcher.
  - All rich rendering engines (**KaTeX** with full `.woff2` fonts & **Mermaid**) are vendored locally for instant offline rendering.
- **Calm, Focused Conversation Experience**
  - **Offline LaTeX Math & Mermaid Diagrams**: Renders inline/display math (`$...$`, `$$...$$`, `\(...\)`, `\[...\]`) and interactive Mermaid diagrams with source toggle and automatic light/dark theme syncing.
  - **Minimal Monochrome `/` & `@` Palettes**: Type `@` to fuzzy-mention and attach workspace files; type `/` for clean single-line commands (`/review`, `/plan`, `/compact`, `/clear`, `/worktree`) and mounted local Skills.
  - **Concise Tool Activity Summaries**: Groups noisy tool calls into a single collapsible monochrome summary line (e.g., `查阅了 13 处文件 · 运行了 3 条命令`), folds repetitive steps, and expands to clickable file-jump pills and compact red/green diffs.
  - **Multi-Session Concurrency, Local AGY Sync & Navigation**: Automatic read-only incremental sync with local Antigravity App (`~/.gemini/antigravity`) and `agy` CLI (`~/.gemini/antigravity-cli`) histories, Claude-style rotating starburst thinking indicator with live timer, concurrent background streaming, one-click Regenerate, conversation Fork, Checkpoint snapshots & rollback (with automatic GC), Pinning, Full-Text Search, Markdown export, and floating **Turn Timeline Navigator** (`Ctrl+Shift+O`).
- **Dedicated Skill Repository & Auto-Dispatcher**
  - Manage starter, workspace, and global `SKILL.md` skills with create/edit/import/CLI-sync, keyword-based automatic routing, live routing preview tester, and scheduled task binding.
- **Developer Right Sidebar (`Ctrl+\`) & Local Workflows**
  - **Multi-Tab Reader & Lightweight Editor**: Syntax-highlighted code, Markdown preview/source toggle, CSV/TSV tables, `.ipynb`, `.zip`, PDF, image lightbox, side-by-side split reading (`Ctrl+Shift+\`), auto hot-refresh on non-dirty tabs, and tree Create/Rename/Delete.
  - **Local Folder Browser (`Ctrl+O`)**: Quick shortcuts, path bar, inline New Folder, and right-click Rename/Delete with system-directory guards.
  - **Git, GitHub & Worktree**: Visual diff review, staging/commit/push, AI commit messages & PR review, GitHub OAuth Device Flow one-click login, repo clone browser, and Git Worktree management.
  - **Streaming UTF-8 Terminal (`Ctrl+J`) & Artifact Sandbox**: Live PowerShell SSE terminal (`cd` persistence + send output to AI), live HTML/SVG Artifact preview, and a standalone **Server Log Viewer** (`Help → 查看本地运行日志`).
- **Customization, Multilingual UI & Global Command Palette (`Ctrl+Shift+P`)**
  - Instant zero-reload UI language switching (**简体中文 / English / 日本語 / 한국어**) in Settings, View menu, and Command Palette; fuzzy search across commands, projects, conversations, **8 color schemes**, **9 typography presets**, custom color pickers, `custom.css` hot-reload, and Skills.

---

## Prerequisites

1. **Windows 10 / 11** (64-bit) with **Python 3.10+** (`python --version`).
2. **Microsoft Edge WebView2 Runtime** (pre-installed on Windows 11 and modern Windows 10) if using the desktop `.exe` shell.
3. **Google Antigravity CLI (`agy`)** installed and signed in:
   ```powershell
   # 1. Install agy CLI (PowerShell)
   irm https://antigravity.google/cli/install.ps1 | iex

   # 2. Sign in once in your terminal
   agy login

   # 3. Verify agy is detected
   agy --version
   ```
   *(If `agy` is not installed yet, Antigravity Studio still launches cleanly with a built-in demo stream so you can preview the UI immediately.)*

---

## Quick Start

### Option 1: Prebuilt Windows Release (Recommended)
1. Download `AntigravityStudio-<version>-win-x64.zip` and `SHA256SUMS.txt` from [GitHub Releases](../../releases).
2. Verify checksum (optional): `Get-FileHash AntigravityStudio-*.zip -Algorithm SHA256`.
3. Extract and double-click **`AntigravityStudio.exe`** to open the frameless desktop app (closing the window cleanly shuts down the local backend).
4. Optional: Run **`create-desktop-shortcut.bat`** to pin shortcuts to your Desktop and Start Menu.

> **Windows SmartScreen Note**: Because `AntigravityStudio.exe` is an unsigned open-source community binary, Windows SmartScreen may show *"Windows protected your PC"* on first launch. Click **More info → Run anyway**, verify the SHA-256 hash against `SHA256SUMS.txt`, or compile the launcher yourself from source in 2 seconds using `desktop\build_desktop_app.bat`.

### Option 2: Run from Source (Web or Build Desktop Launcher)
```powershell
git clone https://github.com/Arcueid7/antigravity-studio.git
cd antigravity-studio

# Run in browser directly (zero dependencies)
python server.py --port 8765 --open
# Or double-click start.bat

# Build AntigravityStudio.exe locally (uses built-in Windows .NET csc.exe)
desktop\build_desktop_app.bat
```

---

## Project Layout

```text
antigravity-studio/
├── server.py                      # Pure-stdlib HTTP/SSE local server entrypoint
├── backend/                       # Modular backend (routes, agy runtime, checkpoints, skills, Git/GitHub, security)
├── static/
│   ├── index.html                 # Single-page Studio shell
│   ├── studio-theme.css           # Multi-scheme & multi-font design system
│   ├── app.js                     # Frontend bootstrap & orchestration
│   ├── js/                        # 27 native ES Module controllers
│   └── vendor/                    # Offline vendored KaTeX & Mermaid engines
├── desktop/
│   ├── AntigravityStudioLauncher.cs  # Frameless Win11 WebView2 desktop shell
│   ├── GenerateIcons.cs              # Multi-resolution .ico/.png generator
│   ├── build_desktop_app.bat         # One-click local .exe build script
│   ├── package_release.ps1           # Clean Release .zip + SHA256SUMS packager
│   ├── create_shortcut.ps1           # Desktop & Start Menu shortcut helper
│   └── lib/                          # Microsoft WebView2 redistributable DLLs
├── tests/                         # Full-stack unittest suite (32 tests)
├── custom.css                     # User hot-reloading custom stylesheet
├── start.bat                      # Quick browser launch script
└── create-desktop-shortcut.bat    # Windows shortcut creator wrapper
```

*(Runtime user data, tokens, conversations, checkpoints, and WebView2 cache are stored strictly under `data/`, which is gitignored.)*

---

## Testing & Release Packaging

```powershell
# Run full test suite (bytecode compile + unit + HTTP/SSE integration + frontend integrity + C# compile check)
python tests/run_all.py

# Package a clean Windows release zip + SHA256SUMS.txt into dist/
powershell -NoProfile -ExecutionPolicy Bypass -File desktop\package_release.ps1 -Version v1.0.0
```

Pushing a Git tag matching `v*` (e.g., `git tag v1.0.0 && git push origin v1.0.0`) automatically triggers [`.github/workflows/release.yml`](.github/workflows/release.yml) to run all tests, compile `AntigravityStudio.exe`, package the release archive with `SHA256SUMS.txt`, and publish a GitHub Release.

---

## Security & Licenses

- Security architecture, loopback-only isolation, CSRF/DNS-rebinding defenses, and GitHub OAuth Device Flow details: see **[SECURITY.md](SECURITY.md)**.
- Project license: **[MIT License](LICENSE)** (`Copyright (c) 2026 Arcueid7`).
- Bundled third-party components (KaTeX, Mermaid, Microsoft WebView2 SDK): see **[THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md)**.
