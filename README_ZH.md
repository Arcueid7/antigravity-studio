<div align="center">

# Antigravity Studio

**零外部依赖的本地桌面工作台与 Web UI Harness，直接驱动 Google Antigravity CLI (`agy`)**

[English](README.md) · [简体中文](README_ZH.md)

[![CI](https://img.shields.io/badge/tests-32%20passing-2e7d4f)](tests/run_all.py)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform: Windows 10/11](https://img.shields.io/badge/platform-Windows%2010%2F11-0078D6)](#快速开始)

</div>

> **免责声明**：Antigravity Studio 为独立开源社区项目，与 Google 或 Antigravity 官方无隶属、赞助或官方合作关系。软件仅在你的本机回环地址（`127.0.0.1`）运行并调用本地已安装的 `agy` CLI。

---

## 核心特性

- **零外部构建与运行依赖**
  - 纯 **Python 3.10+ 标准库** 后端（`ThreadingHTTPServer` + SSE 流式推送）+ 原生 **ES Modules** 前端（27 个模块，无需 Node/npm/打包器）+ 轻量 **Win11 WebView2** C# 无边框桌面启动器。
  - 离线内置 **KaTeX**（含完整 `.woff2` 字体）与 **Mermaid** 图表引擎，断网环境同样秒开渲染。
- **克制、高效的对话与阅读体验**
  - **离线 LaTeX 公式 + Mermaid 图表**：支持行内/块级数学公式（`$...$`、`$$...$$`、`\(...\)`、`\[...\]`）与 Mermaid 流程图/架构图实时渲染，支持图表/源码一键切换并自动跟随浅/深主题。
  - **原生极简 `/` 与 `@` 联想面板**：键入 `@` 模糊搜索并附加工作区文件；键入 `/` 弹出无顶栏单行单色指令与技能菜单（`/review`、`/plan`、`/compact`、`/clear`、`/worktree` + 全部本地 Skills）。
  - **精简单行工具活动摘要**：将多步工具调用自动汇总为一条克制的单行单色摘要（如 `查阅了 13 处文件 · 运行了 3 条命令`），连续重复步骤自动合并折叠，展开后支持点击文件胶囊直达右侧阅读器与紧凑红绿 Diff 查看。
  - **多会话并发、本机 AGY 同步与导航定位**：自动增量同步本机 Antigravity 应用（`~/.gemini/antigravity`）与 `agy` CLI（`~/.gemini/antigravity-cli`）聊天记录、Claude 风格旋转星芒与流光计时思考提示器、并发流式对话、回复一键「重新生成」、消息分叉、工作区检查点快照与一键回滚（启动自动 GC）、对话置顶、正文全文检索、一键导出 Markdown，以及左侧悬浮「对话轮次时间轴目录」（`Ctrl+Shift+O`）。
- **专属 Skill 仓库与智能自动调度**
  - 内置开箱即用技能库，支持新建、编辑、导入、同步至 `agy` 全局目录、关键词自动路由匹配、调度试算预览以及绑定「已排定」本地定时任务。
- **右侧工作区与开发者边栏（`Ctrl+\`）**
  - **多标签文件阅读器 & 轻量编辑**：支持代码行号高亮、Markdown 渲染/源码切换、CSV/TSV 表格、`.ipynb`、`.zip`、PDF、图片灯箱、并排双文件分屏阅读（`Ctrl+Shift+\`）、未编辑标签页自动热刷新，以及目录树右键新建/重命名/删除。
  - **本地文件夹浏览器（`Ctrl+O`）**：支持快捷目录入口、内联新建文件夹与自定义右键重命名/删除（含系统关键目录保护）。
  - **Git / GitHub & Worktree**：内置变更 Diff 审查、暂存/提交/推送、AI 自动写 Commit 与 PR 审查、GitHub OAuth Device Flow 一键登录、仓库搜索克隆与 Git Worktree 多分支隔离。
  - **流式 UTF-8 终端（`Ctrl+J`）& Artifact 预览**：PowerShell 实时流式终端（保持 `cd` 状态、输出一键发给 AI）、HTML/SVG 实时沙箱预览，以及跨工作区可用的「帮助 → 查看本地运行日志」。
- **多语言界面、全局命令面板 & 深度外观定制**
  - 支持 **简体中文 / English / 日本語 / 한국어** 无刷新实时切换（可在「设置 → 通用」、顶栏「视图」菜单或命令面板一键切换）；**`Ctrl+Shift+P` 全局命令面板** 单色线条风格，模糊秒搜命令、项目、对话、**8 套主题配色**、**9 套字体排版** 与 Skills；支持自由调色盘与 `custom.css` 实时热重载。

---

## 环境前置条件

1. **Windows 10 / 11**（64 位）与 **Python 3.10+**（`python --version`）。
2. 如使用桌面端 `.exe`：需要 **Microsoft Edge WebView2 Runtime**（Windows 11 及现代 Windows 10 已内置）。
3. 安装并登录官方 **Google Antigravity CLI (`agy`)**：
   ```powershell
   # 1. 在 PowerShell 安装 agy CLI
   irm https://antigravity.google/cli/install.ps1 | iex

   # 2. 终端内完成一次账号登录
   agy login

   # 3. 检查是否就绪
   agy --version
   ```
   *（即使本机暂未安装 `agy`，Antigravity Studio 也可正常启动并通过内置演示流预览完整界面。）*

---

## 快速开始

### 方式一：下载 Windows 预编译发布包（推荐）
1. 前往 [GitHub Releases](../../releases) 下载 `AntigravityStudio-<version>-win-x64.zip` 与 `SHA256SUMS.txt`。
2. （可选）校验文件完整性：`Get-FileHash AntigravityStudio-*.zip -Algorithm SHA256`。
3. 解压后直接双击 **`AntigravityStudio.exe`** 打开无地址栏桌面窗口（关闭窗口自动退出本地后端）。
4. （可选）双击 **`create-desktop-shortcut.bat`** 一键创建桌面与开始菜单快捷方式。

> **Windows SmartScreen 提示说明**：由于 `AntigravityStudio.exe` 为开源社区未签名可执行文件，首次双击时 Windows 可能弹出「Windows 已保护你的电脑」提示。可点击 **更多信息 → 仍要运行**，核对 `SHA256SUMS.txt`，或直接拉取源码后运行 `desktop\build_desktop_app.bat` 在本机 2 秒自编译。

### 方式二：从源码运行或本机自编译
```powershell
git clone https://github.com/Arcueid7/antigravity-studio.git
cd antigravity-studio

# 直接以浏览器模式启动（零额外依赖）
python server.py --port 8765 --open
# 或双击根目录 start.bat

# 使用 Windows 自带 .NET csc.exe 本机编译 AntigravityStudio.exe
desktop\build_desktop_app.bat
```

---

## 目录结构

```text
antigravity-studio/
├── server.py                      # 纯标准库本地 HTTP/SSE 服务入口
├── backend/                       # 后端模块（路由、agy 运行时、检查点 GC、Skills、Git/GitHub、安全校验）
├── static/
│   ├── index.html                 # 单页工作台入口
│   ├── studio-theme.css           # 核心多配色多字体设计系统
│   ├── app.js                     # 前端主启动编排器
│   ├── js/                        # 27 个原生 ES Modules 模块
│   └── vendor/                    # 离线内置 KaTeX & Mermaid 引擎
├── desktop/
│   ├── AntigravityStudioLauncher.cs  # Win11 WebView2 无边框启动器源码
│   ├── GenerateIcons.cs              # 多分辨率图标生成器
│   ├── build_desktop_app.bat         # 一键编译桌面端 .exe
│   ├── package_release.ps1           # 发布包 .zip + SHA256SUMS 打包脚本
│   ├── create_shortcut.ps1           # 桌面/开始菜单快捷方式脚本
│   └── lib/                          # Microsoft WebView2 运行库 DLL
├── tests/                         # 全栈单元测试与集成测试套（32 项）
├── custom.css                     # 用户热重载自定义样式表
├── start.bat                      # 命令行快速启动脚本
└── create-desktop-shortcut.bat    # 创建桌面快捷方式入口脚本
```

*（运行时生成的对话、凭证 `settings.json`、检查点、上传文件与 WebView2 缓存全部存放在 `data/` 下，已由 `.gitignore` 严格隔离。）*

---

## 测试与发布打包

```powershell
# 运行全量自动化测试（字节码编译 + 单元测试 + HTTP/SSE 集成测试 + 前端完整性 + C# 编译校验）
python tests/run_all.py

# 本地打包干净的 Windows 发布压缩包与 SHA256SUMS.txt 到 dist/
powershell -NoProfile -ExecutionPolicy Bypass -File desktop\package_release.ps1 -Version v1.0.0
```

向 GitHub 推送 `v*` 版本标签（如 `git tag v1.0.0 && git push origin v1.0.0`）后，[`.github/workflows/release.yml`](.github/workflows/release.yml) 会自动执行全量测试、编译 `AntigravityStudio.exe`、打包 `.zip` 与 `SHA256SUMS.txt` 并发布 GitHub Release。

---

## 安全说明与开源协议

- 安全架构（仅 `127.0.0.1` 回环监听、DNS 重绑定与跨站防御、路径越权保护、Token 脱敏与 GitHub OAuth Device Flow 说明）：详见 **[SECURITY.md](SECURITY.md)**。
- 开源协议：**[MIT License](LICENSE)**（`Copyright (c) 2026 Arcueid7`）。
- 第三方离线组件与运行库许可声明（KaTeX、Mermaid、Microsoft WebView2 SDK）：详见 **[THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md)**。
