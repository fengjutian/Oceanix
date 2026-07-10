# Oceanix — 需求文档

> 下一代代码编辑器，基于 Tauri + React，对标 VS Code。

---

## 1. 项目概述

**Oceanix** 是一个跨平台的桌面代码编辑器，具备现代 IDE 的核心能力。利用 Tauri v2 的 Rust 后端与 React 前端，在保持小体积、低内存占用的同时，提供与 VS Code 同等甚至更优的开发体验。

### 1.1 核心设计原则

| 原则 | 说明 |
|------|------|
| **性能优先** | 启动 < 2s，编辑延迟 < 50ms；Rust 承载计算密集型任务，WebView 仅负责渲染 |
| **轻量体积** | 安装包 < 30MB（Tauri 天然优势，对比 Electron ~100MB+） |
| **扩展性** | 插件体系支撑 Language Server Protocol、自定义主题、自定义命令 |
| **跨平台一致** | macOS / Windows / Linux 三端原生外观与行为 |
| **渐进交付** | MVP → Alpha → Beta → GA 四阶段，先编辑器后 IDE |

### 1.2 组件化原则 — 高内聚低耦合

> **铁律：能用开源组件，绝不自己实现。必须自研的，必须抽取为独立组件/包。**

#### 1.2.1 选型优先级

按以下顺序评估每一项功能的技术选型，不允许跳过：

```
1. 成熟开源组件（社区活跃、License 兼容）
2. 可裁剪/嵌入的开源项目（fork 后按需裁剪）
3. 自研并抽取为独立包（crate / npm package）
4. 自研但禁止内嵌在业务代码中（至少是独立模块，有明确接口边界）
```

#### 1.2.2 组件清单与归属

| 功能域 | 选型决策 | 归属 | 说明 |
|--------|----------|------|------|
| 代码编辑器 | Monaco Editor（开源） | 前端 npm 依赖 | 不自己实现编辑器核心 |
| 终端渲染 | xterm.js（开源） | 前端 npm 依赖 | 不自己实现终端渲染 |
| 文件树 | `react-arborist` 或自研 | 若自研 → 独立 npm 包 `@oceanix/file-tree` | 必须可脱离主项目独立使用 |
| 命令面板 | 自研 | 独立 npm 包 `@oceanix/command-palette` | 通用命令注册/搜索/执行 |
| 面板布局 | `react-resizable-panels`（开源） | 前端 npm 依赖 | 可拖拽分割面板 |
| LSP 客户端 | 自研 | 独立 Rust crate `oceanix-lsp` | 只依赖 `lsp-types`，不耦合 Tauri |
| 终端 PTY 管理 | 自研 | 独立 Rust crate `oceanix-pty` | 只依赖 `portable-pty`，不耦合 Tauri |
| Git 服务 | 自研 | 独立 Rust crate `oceanix-git` | 只依赖 `git2`，不耦合 Tauri |
| 全文搜索 | 自研 | 独立 Rust crate `oceanix-search` | 封装 `ripgrep`，不耦合 Tauri |
| 文件监听 | `notify`（开源） | Rust 依赖 | 已有成熟 crate |
| 快捷键 | 自研 | 独立 npm 包 `@oceanix/keybinding` | 键盘事件 → 命令映射引擎 |
| 主题引擎 | 自研 | 独立 npm 包 `@oceanix/theme` | CSS 变量生成 + VS Code 主题兼容 |
| AI / MCP 桥接 | 自研 | 独立 Rust crate `oceanix-ai` | 薄层：spawn Python sidecar，转发 MCP 消息，零编排逻辑 |
| AI Sidecar | 自研 | 独立 Python 包 `oceanix-ai-server` | Python MCP Server：LangGraph Agent、LangChain 工具链、LLM API 调用、提示词管理 |
| AI 对话面板 | 自研 | 独立 npm 包 `@oceanix/ai-chat` | 流式对话、工具调用结果展示、对话历史 |
| Agent 工作区 | 自研 | 独立 npm 包 `@oceanix/agent-workspace` | 任务规划视图、步骤进度、Diff 审查、Agent 日志 |
| Inline 补全 | Monaco API + Python Sidecar | `oceanix-ai` 转发 → `oceanix-ai-server` → LLM → 返回 ghost text | Rust 不做补全逻辑，仅桥接 |
| RAG 代码索引 | 自研（Python sidecar 内） | `oceanix-ai-server` 内 `rag.py` 模块 | LlamaIndex + Qdrant Local + voyage/ollama 嵌入 |
| 长期记忆 | Mem0 (开源) + 文件系统 | `oceanix-ai-server` 内 `memory.py` 模块 | 跨会话记住用户偏好、项目架构、编码规范 |

#### 1.2.3 耦合约束

每个自研组件必须满足：

- **零框架依赖**：核心逻辑不依赖 React / Tauri / 特定 UI 框架，可被任何前端框架消费（React 绑定作为薄封装层）
- **显式接口**：每个 crate/package 导出 ≤ 5 个公开类型/函数；内部实现完全隐藏
- **独立可测**：`cargo test` 或 `vitest` 不依赖主项目即可运行全部测试
- **单一职责**：一个组件只做一件事，违反则拆分

**反面示例（禁止）：**
```
❌ 在 React 组件中直接调用 `invoke("git_commit")` 
   → git 逻辑与 UI 耦合 → 必须通过 `OceanixGit` 抽象层

❌ 在 Rust `#[tauri::command]` 中直接写 LSP JSON-RPC 解析
   → LSP 协议与 Tauri 耦合 → 必须移入 `oceanix-lsp` crate
```

#### 1.2.4 目录结构约定

```
Oceanix/
├── src/                        # Tauri 主进程（薄壳，仅注册/组装）
│   ├── main.rs                 # 入口，组装各 crate
│   └── commands.rs             # Tauri #[command] 委托给各 crate
├── crates/                     # Rust 自研组件
│   ├── oceanix-lsp/            # LSP 客户端 (独立 crate)
│   ├── oceanix-pty/            # PTY 终端管理 (独立 crate)
│   ├── oceanix-git/            # Git 操作封装 (独立 crate)
│   ├── oceanix-search/         # 全局搜索 (独立 crate)
│   └── oceanix-ai/             # AI MCP 桥接层 (独立 crate，薄层)
├── ai-server/                  # Python AI Sidecar
│   ├── pyproject.toml          # oceanix-ai-server (pip install)
│   └── src/
│       ├── server.py           # MCP Server 入口 (FastMCP)
│       ├── agent.py            # LangGraph Agent Runtime
│       ├── tools.py            # LangChain 工具注册
│       ├── prompts.py          # 提示词模板引擎
│       ├── providers.py        # LLM Provider 适配层
│       ├── rag.py              # RAG 模块 (LlamaIndex + Qdrant)
│       └── memory.py           # 长期记忆 (Mem0 + 文件系统)
├── packages/                   # 前端自研组件
│   ├── file-tree/              # @oceanix/file-tree
│   ├── command-palette/        # @oceanix/command-palette
│   ├── keybinding/             # @oceanix/keybinding
│   ├── theme/                  # @oceanix/theme
│   └── ai-chat/                # @oceanix/ai-chat
│   └── agent-workspace/        # @oceanix/agent-workspace
├── app/                        # React 主应用（组装前端组件）
│   ├── src/
│   └── package.json
└── Cargo.toml                  # workspace members = ["crates/*"]
```

---

## 2. 功能性需求

### 2.1 编辑核心

| ID | 功能 | 描述 | 优先级 |
|----|------|------|--------|
| F-001 | 文本编辑 | 支持全功能文本输入、选择、删除、剪切/复制/粘贴 | P0 |
| F-002 | 语法高亮 | 根据文件类型自动着色关键字/字符串/注释等 Token | P0 |
| F-003 | 代码折叠 | 按缩进或括号成对折叠/展开代码块 | P0 |
| F-004 | 多光标编辑 | 支持 Alt+Click 添加光标、Ctrl+D 选择下一个相同词、列选择 (Shift+Alt+拖拽) | P0 |
| F-005 | 自动补全 | 基于文件内容的单词补全 + LSP 语义补全 | P0 |
| F-006 | 参数提示 | 函数调用时展示参数签名（需 LSP） | P1 |
| F-007 | 悬停提示 | 悬停符号显示类型/文档（需 LSP） | P1 |
| F-008 | 跳转到定义 | Ctrl+Click / F12 跳转（需 LSP） | P1 |
| F-009 | 查找所有引用 | Shift+F12 列出所有引用位置（需 LSP） | P1 |
| F-010 | 重命名符号 | F2 批量重命名（需 LSP） | P1 |
| F-011 | 代码缩略图 (Minimap) | 右侧缩略预览，快速导航 | P1 |
| F-012 | 括号/标签配对 | 高亮匹配括号、自动闭合标签 | P0 |
| F-013 | 自动缩进 | 换行自动缩进、粘贴自动格式化 | P0 |
| F-014 | 缩进参考线 | 展示缩进对齐竖线 | P1 |
| F-015 | 行号 | 显示/隐藏行号，支持相对行号 | P0 |
| F-016 | Diff 编辑器 | 并排/内联差异对比视图 | P1 |
| F-017 | 代码片段 (Snippets) | 预定义/用户自定义代码片段，Tab 跳占位符 | P1 |
| F-018 | Emmet 支持 | HTML/CSS 快捷展开 | P2 |
| F-019 | 字体连字 (Ligatures) | 支持 Fira Code / JetBrains Mono 等连字字体 | P2 |
| F-020 | 括号配色 (Bracket Pair Colorization) | 不同层级括号不同颜色 | P1 |
| F-021 | 自动保存 (Auto Save) | 窗口失焦 / 编辑器失焦 / 延迟后自动保存文件 | P0 |
| F-022 | 自动换行 (Word Wrap) | Alt+Z 切换自动换行，可配置按列宽或视口宽度 | P0 |
| F-023 | Peek 定义 | Alt+F12 嵌入式弹窗查看定义，不离开当前文件 | P1 |
| F-024 | Peek 引用 | 嵌入式弹窗查看所有引用位置 | P1 |
| F-025 | 缩进检测 | 打开文件自动检测缩进风格（空格/制表符、宽度），不一致时提示 | P1 |
| F-026 | 链接编辑 (Linked Editing) | 同时重命名 HTML/JSX 的开始和结束标签 | P2 |
| F-027 | 颜色选择器 | CSS/SCSS/Less 中颜色值旁弹出取色器，支持 HEX/RGB/HSL | P2 |
| F-028 | 空白符渲染 | 显示空格为灰点、制表符为箭头，可选显示尾随空格 | P2 |
| F-029 | 禅模式 (Zen Mode) | Ctrl+K Z 全屏无干扰编辑 | P2 |

**推荐方案**: 使用 Monaco Editor（`@monaco-editor/react`），与 VS Code 共享同一编辑核心，直接获得 F-001 ~ F-020 大部分功能。

---

### 2.2 文件管理

| ID | 功能 | 描述 | 优先级 |
|----|------|------|--------|
| F-100 | 文件树 | 左侧目录树，展开/折叠文件夹，文件图标 | P0 |
| F-101 | 新建/删除/重命名 | 右键菜单操作文件/文件夹 | P0 |
| F-102 | 拖拽移动 | 拖拽文件到目标文件夹完成移动 | P1 |
| F-103 | 面包屑导航 | 编辑器顶部展示文件路径层级 | P1 |
| F-104 | 最近打开 | 工作区切换/欢迎页展示最近项目 | P1 |
| F-105 | 文件恢复 | 未保存的脏文件意外关闭后恢复 | P2 |
| F-106 | 二进制预览 | 图片/PDF 等二进制文件的只读预览 | P2 |
| F-107 | 文件编码检测 | 自动检测 UTF-8/GBK/Shift-JIS 等并正确打开 | P1 |
| F-108 | 欢迎页 | 首次启动引导（选主题、配 Provider、打开项目）；非首次显示：最近项目列表 + 快捷入口（新建/打开/克隆） | P2 |

**推荐方案**: 文件树由 React 组件实现（如 `react-arborist` 或自研），Rust 后端通过 `notify` crate 监听文件系统变更并通过 Tauri event 推送到前端。

---

### 2.3 搜索与替换

| ID | 功能 | 描述 | 优先级 |
|----|------|------|--------|
| F-200 | 单文件搜索 | Ctrl+F，命中高亮、计数、上下导航 | P0 |
| F-201 | 单文件替换 | 逐个替换 / 全部替换 | P0 |
| F-202 | 全局搜索 | Ctrl+Shift+F，跨文件/跨文件夹搜索 | P0 |
| F-203 | 全局替换 | 跨文件逐项/批量替换，预览变更 | P1 |
| F-204 | 正则搜索 | 支持正则表达式匹配 | P1 |
| F-205 | 文件过滤 | 按 glob 模式 (`**/*.ts`, `src/**`) 限定搜索范围 | P1 |
| F-206 | 排除模式 | .gitignore 感知，手动指定排除目录 | P1 |
| F-207 | 搜索历史 | 保存/复用最近搜索词 | P2 |
| F-208 | 跳转到行 (Go to Line) | Ctrl+G 输入行号快速跳转 | P0 |
| F-209 | 文件内符号跳转 | Ctrl+Shift+O / `@` 列出当前文件所有符号，模糊搜索跳转 | P1 |
| F-210 | 工作区符号跳转 | Ctrl+T / `#` 跨整个工作区搜索并跳转符号 | P1 |

**推荐方案**: 单文件搜索复用 Monaco 内置的 Find Widget；全局搜索由 Rust 后端用 `grep` 算法（如 `ripgrep` crate）实现，流式返回结果给前端。

---

### 2.4 语言服务与 IntelliSense

| ID | 功能 | 描述 | 优先级 |
|----|------|------|--------|
| F-300 | LSP 客户端 | 启动/管理 Language Server 进程，收发 JSON-RPC | P1 |
| F-301 | 诊断信息 | 红色波浪线标记错误，黄色标记警告，悬停展示详情 | P1 |
| F-302 | 代码操作 | 灯泡菜单提供快速修复（Quick Fix） | P1 |
| F-303 | 自动格式化 | 保存时/粘贴时调用 LSP formatting | P1 |
| F-304 | 内置语言支持 | 不依赖外部 LSP 时，至少提供 JS/TS/HTML/CSS/JSON/Markdown 的语法高亮 | P0 |
| F-305 | LSP 发现 | 自动检测系统中已安装的语言服务器（如 `typescript-language-server`） | P2 |
| F-306 | LSP 配置 | 手动指定语言服务器的路径和参数 | P2 |
| F-307 | Code Lens | 函数上方内联展示引用计数、运行/调试入口（需 LSP） | P1 |
| F-308 | Inlay Hints | 参数名、类型推断结果的内联提示（需 LSP） | P2 |
| F-309 | 调用层次 (Call Hierarchy) | 查看函数调用链：谁调用我 / 我调用谁（需 LSP） | P2 |
| F-310 | 类型层次 (Type Hierarchy) | 查看类型/接口的继承链（需 LSP） | P2 |

**推荐方案**: Rust 端通过 `lsp-types` 构建轻量 LSP 客户端，管理子进程生命周期，将 JSON-RPC 结果转为高频 Tauri events 推送到前端；Monaco 端通过 `IEditor.worker` 消费结果或直接使用 Monaco 内置的 TypeScript worker。

---

### 2.5 集成终端

| ID | 功能 | 描述 | 优先级 |
|----|------|------|--------|
| F-400 | 终端面板 | 底部可拖拽高度的终端区域 | P0 |
| F-401 | 多终端标签 | 多个 shell 会话以标签页管理 | P1 |
| F-402 | 终端分屏 | 左右/上下分屏同时显示多个终端 | P2 |
| F-403 | 本地 Shell | 自动检测系统默认 shell（bash/zsh/fish/pwsh） | P0 |
| F-404 | ANSI 转义 | 完整的颜色/光标/清除等终端控制序列支持 | P0 |
| F-405 | 字体等宽 | 与编辑器共用等宽字体设置 | P0 |
| F-406 | 复制/粘贴 | 终端内选中即复制、右键粘贴 | P1 |

**推荐方案**: Rust 端用 `portable-pty` 创建 PTY 伪终端；前端用 `xterm.js` + `xterm-addon-fit` 渲染；通信通过 Tauri events 双向流。

---

### 2.6 Git 集成

| ID | 功能 | 描述 | 优先级 |
|----|------|------|--------|
| F-500 | Git 状态标记 | 文件树中标记修改(M)/新增(A)/删除(D)/未跟踪(U)状态 | P1 |
| F-501 | 行内差异指示 | 编辑器左侧装订线标记增/删/改行（Gutter Diff） | P1 |
| F-502 | Diff 视图 | 选中文件展示暂存区与工作区差异 | P1 |
| F-503 | Stage / Unstage | 暂存/取消暂存单个文件或代码块 | P2 |
| F-504 | Commit | 填写 commit message 并提交 | P2 |
| F-505 | 分支管理 | 查看/切换/新建/删除分支 | P2 |
| F-506 | Push / Pull | 推送到远程 / 拉取更新 | P2 |
| F-507 | 解决冲突 | 三方合并视图辅助解决冲突 | P3 |
| F-508 | Source Control 面板 | 独立侧边栏：变更文件列表、diff 预览、Stage/Unstage 按钮、commit message 输入框 | P1 |

**推荐方案**: Rust 端用 `git2` crate 操作仓库，暴露 `git_status`、`git_diff`、`git_commit` 等 Tauri commands。

---

### 2.7 命令面板

| ID | 功能 | 描述 | 优先级 |
|----|------|------|--------|
| F-600 | 命令面板 | Ctrl+Shift+P 打开，模糊搜索命令列表 | P0 |
| F-601 | 快捷键绑定 | 可配置的键盘快捷键，支持多键和弦 (Chord) | P0 |
| F-602 | 快捷打开文件 | Ctrl+P 按文件名模糊查找并打开 | P0 |
| F-603 | 命令注册 | 扩展可注册自定义命令到面板 | P2 |

**推荐方案**: 自研命令注册与快捷键系统；Monaco 自带部分 actions 可复用。

---

### 2.8 工作区与布局

| ID | 功能 | 描述 | 优先级 |
|----|------|------|--------|
| F-700 | 多标签页 | 顶部标签栏管理已打开文件 | P0 |
| F-701 | 分屏编辑 | 左右/上下分屏，同一文件可分屏对照编辑 | P1 |
| F-702 | 面板区 | 底部面板（终端/问题/输出/调试控制台）可折叠 | P0 |
| F-703 | 侧边栏 | 左侧（文件树/搜索/Git/扩展）、右侧（大纲/详情）可折叠 | P0 |
| F-704 | 状态栏 | 底部状态栏显示光标行列、编码、缩进模式、语言模式、Git 分支 | P0 |
| F-705 | 活动栏 | 最左侧图标栏切换侧边栏视图 | P0 |
| F-706 | 布局持久化 | 窗口大小/面板比例/侧边栏展开状态持久化 | P1 |
| F-707 | 多根工作区 (Multi-root Workspace) | `.oceanix-workspace` 文件，一个窗口管理多个不相关文件夹 | P2 |
| F-708 | 会话恢复 | 退出时保存：打开文件列表、光标位置、分屏布局、面板展开状态、侧边栏选择；下次启动自动恢复 | P1 |

**推荐方案**: 使用 `react-resizable-panels` 或 `allotment` 实现可拖拽面板布局；布局状态持久化到本地存储或 Rust 端配置文件。

---

### 2.9 主题与个性化

| ID | 功能 | 描述 | 优先级 |
|----|------|------|--------|
| F-800 | 暗色/亮色主题 | 内置至少一套暗色和亮色主题 | P0 |
| F-801 | VS Code 主题兼容 | 导入 VS Code 的 `.json` 主题文件 | P1 |
| F-802 | 图标主题 | 文件树/标签页的文件图标主题 | P1 |
| F-803 | 编辑器字体 | 可配置字体族、字号、行高、字重 | P0 |
| F-804 | CSS 变量驱动 | 主题通过 CSS 变量控制，方便扩展 | P0 |

**推荐方案**: Monaco 原生支持 VS Code 主题 JSON 格式；UI 主题通过 CSS 变量实现。

---

### 2.10 设置系统

| ID | 功能 | 描述 | 优先级 |
|----|------|------|--------|
| F-900 | JSON 设置文件 | 用户设置写入 `settings.json`，支持代码补全 | P0 |
| F-901 | 图形设置界面 | 搜索/分类浏览 GUI 设置 | P2 |
| F-902 | 工作区设置 | 项目级 `.oceanix/settings.json` 覆盖用户设置 | P1 |
| F-903 | 设置同步 | 通过 Git / 账户同步设置（远期） | P3 |

---

### 2.11 扩展系统

| ID | 功能 | 描述 | 优先级 |
|----|------|------|--------|
| F-1000 | 扩展市场 | 浏览/搜索/安装/卸载扩展 | P3 |
| F-1001 | 扩展 API | 提供 JavaScript/TypeScript API：注册命令、创建 WebView、访问编辑器、文件系统 | P3 |
| F-1002 | LSP 扩展 | 通过扩展安装语言服务器 | P3 |
| F-1003 | 主题扩展 | 扩展可贡献主题/图标主题 | P2 |

**说明**: 扩展系统是长期目标，MVP 阶段内置核心功能，通过配置文件满足个性化。

---

### 2.12 问题与输出

| ID | 功能 | 描述 | 优先级 |
|----|------|------|--------|
| F-1200 | Problems 面板 | 底部面板 Tab，集中列出所有文件的诊断错误/警告，点击跳转到对应位置 | P0 |
| F-1201 | Output 面板 | 底部面板 Tab，每个 Language Server / Task / 扩展拥有独立输出通道 | P1 |

---

### 2.13 大纲视图

| ID | 功能 | 描述 | 优先级 |
|----|------|------|--------|
| F-1300 | 大纲视图 (Outline) | 右侧栏展示当前文件的符号树（类/函数/变量），点击导航，随光标自动展开 | P0 |

---

### 2.14 任务系统

| ID | 功能 | 描述 | 优先级 |
|----|------|------|--------|
| F-1400 | 任务自动检测 | 自动检测 `package.json` scripts / `Makefile` / `cargo` 等构建任务 | P1 |
| F-1401 | 任务运行 | 在终端中运行任务，输出到 Output 面板，支持 `problemMatcher` 解析错误 | P1 |

---

### 2.15 Markdown 预览

| ID | 功能 | 描述 | 优先级 |
|----|------|------|--------|
| F-1500 | Markdown 实时预览 | Ctrl+Shift+V 分屏预览 Markdown 渲染结果，同步滚动 | P1 |
| F-1501 | 预览数学公式 | 内联 LaTeX 数学公式渲染（KaTeX） | P2 |

---

### 2.16 AI 智能体系统

> **杀手功能。MCP (Model Context Protocol) 是 AI 时代的 LSP — Oceanix 原生内置 MCP 客户端，连接任意 AI 模型与编辑器工具。**

#### 2.16.1 MCP 客户端

| ID | 功能 | 描述 | 优先级 |
|----|------|------|--------|
| F-1600 | MCP 客户端核心 | 基于 `rmcp` 的 Rust 端 MCP 客户端：启动/管理 MCP Server 子进程（stdio），连接远程 MCP Server（Streamable HTTP），连接池管理，认证（OAuth / API Key） | P0 |
| F-1601 | MCP 配置 | JSON 配置文件定义 MCP Server 列表（命令、参数、环境变量），UI 管理界面增删禁用 | P0 |
| F-1602 | 多 Provider 支持 | 同时连接多个 MCP Server（如：本地代码分析 + 远程 Claude + Ollama 本地模型），按场景路由 | P1 |

#### 2.16.2 Inline 代码补全

| ID | 功能 | 描述 | 优先级 |
|----|------|------|--------|
| F-1610 | 自动触发补全 | 输入时自动调用 AI 生成 ghost text（灰色预览），Tab 接受，Esc 拒绝 | P0 |
| F-1611 | 上下文收集 | 自动收集：当前文件内容 ±N 行、光标位置、语言类型、相邻打开文件、LSP 诊断 | P0 |
| F-1612 | 多行补全 | 支持生成多行代码块（函数体、if/for 块），缩进自动对齐 | P1 |
| F-1613 | 补全缓存 | 相同上下文 + 相同前缀时复用上次结果，减少 API 调用 | P1 |
| F-1614 | 补全开关 | 按语言 / 按文件 / 全局开关 inline 补全 | P1 |

#### 2.16.3 AI 对话面板与上下文管理

| ID | 功能 | 描述 | 优先级 |
|----|------|------|--------|
| F-1620 | 对话面板 | 侧边栏/底部面板中的 Chat UI：消息气泡、流式渲染、Markdown 渲染、代码高亮 | P0 |
| F-1621 | 选区对话 | 选中代码 → 右键菜单 "Ask Oceanix" → 以选中代码为上下文提问 | P0 |
| F-1622 | 对话上下文 | 对话自动附带：当前打开文件列表、光标位置、最近 LSP 诊断 | P0 |
| F-1623 | 对话历史 | 持久化对话历史到本地（Python `sqlite3`，文件存储于 `~/.oceanix/sessions/`），可搜索、删除、导出 | P1 |
| F-1624 | 多会话 | 同时开启多个独立对话（按主题/任务分离），每个会话独立上下文 | P1 |
| F-1625 | Token 预算可视化 | 聊天输入框显示当前用量填充条（如 `45K/128K`），悬停看分类明细（系统提示词 / 对话历史 / 代码上下文 / 工具结果） | P1 |
| F-1626 | 自动上下文压缩 | 接近 Token 上限时自动压缩早期对话（SummarizationMiddleware：保留最近 5 轮完整 + 早期生成摘要），用户可配置开/关 | P1 |
| F-1627 | 手动压缩 `/compact` | 用户输入 `/compact` 触发即时压缩，可附带指令如 `/compact focus on database schema` | P2 |
| F-1628 | 结构化笔记 `NOTES.md` | Agent 自动在 `.oceanix/notes.md` 记录关键决策和任务状态，压缩后从此文件恢复上下文 | P2 |
| F-1629 | 上下文提供器 | 可插拔的上下文源：`@file` `@folder` `@codebase`（RAG 检索）`@git`（diff/log）`@terminal`（最后输出）`@lsp`（诊断） | P1 |

**上下文管理策略（Python 端，~10 行 LangChain）：**

```python
SummarizationMiddleware(
    model="gpt-5.4-mini",       # 便宜模型做总结
    trigger=("tokens", 70000),   # 128K 窗口的 70% 时触发
    keep=("messages", 10),       # 保留最近 5 轮完整消息
)
```

**Token 预算分配（128K 窗口）：**

| 组件 | 预算 | 说明 |
|------|------|------|
| System Prompt | 2-5K | 角色、规则、工具指引 |
| Tools Schema | 2-4K | 函数签名定义 |
| 对话历史 | 40-80K | 动态，触顶自动压缩 |
| 代码上下文（RAG） | 10-30K | 即时检索，仅注入相关块 |
| 输出预留 | 4-16K | 模型响应 + thinking tokens |

**长期记忆（跨会话持久化）：**

双层架构——文件系统记忆（P1）= 零依赖，Mem0 语义记忆（P2）= 智能检索。

```
对话压缩 ──→ 提取关键信息 ──→ ┌─ .oceanix/memory/*.md  (Markdown, git 可追踪)
                              └─ Mem0 语义索引          (向量检索)
新对话启动 ──→ 记忆检索 ──→ 注入 System Prompt
```

| 记忆类型 | 存储 | 检索方式 | 内容示例 |
|----------|------|---------|---------|
| 项目架构 | `.oceanix/memory/architecture.md` | 全文搜索 / Agent 读取 | "后端用 FastAPI，前端 React + Tauri" |
| 编码规范 | `.oceanix/memory/conventions.md` | 全文搜索 | "使用 Prettier 默认配置，2 空格缩进" |
| Bug 记录 | `.oceanix/memory/bugs.md` | 语义检索 (Mem0) | "JWT token 刷新偶发 401，怀疑时区问题" |
| 用户偏好 | Mem0 嵌入 | 语义检索 | "偏好函数组件 + hooks，不喜 class" |
| 决策记录 | `.oceanix/memory/decisions.md` | 全文搜索 | "2026-07-10：选定 Qdrant 替代 ChromaDB" |

**实现（Python sidecar）：**
```python
# Phase 1: 文件系统记忆（零依赖）
with open(".oceanix/memory/architecture.md", "a") as f:
    f.write("## 2026-07-10\n- 选定 PostgreSQL + Prisma\n")

# Phase 6: Mem0 语义记忆
from mem0 import Memory
m = Memory()
m.add("用户偏好函数组件 + hooks，避免 class", user_id=project_id)
relevant = m.search("怎么设计状态管理？", user_id=project_id)
```

---

#### 2.16.4 工具调用 (Tool Calling)

| ID | 功能 | 描述 | 优先级 |
|----|------|------|--------|
| F-1630 | 编辑器工具 | AI 可调用：读文件、写文件、替换代码块、打开文件、搜索符号 | P1 |
| F-1631 | 文件系统工具 | AI 可调用：列出目录、搜索文件（glob）、读取文件内容 | P1 |
| F-1632 | Git 工具 | AI 可调用：查看 diff、log、status、生成 commit message | P1 |
| F-1633 | 终端工具 | AI 可调用：执行 shell 命令并获取输出（用户确认后） | P2 |
| F-1634 | 工具确认 | 写操作 / 终端命令执行前必须用户确认（可配置白名单自动批准） | P1 |
| F-1635 | 工具结果渲染 | 工具调用结果以可折叠卡片形式展示在对话中（diff 视图、文件列表等） | P1 |

#### 2.16.5 提示词系统

| ID | 功能 | 描述 | 优先级 |
|----|------|------|--------|
| F-1640 | 系统提示词 | 可配置的 System Prompt（角色、规则、风格），按 Provider / 会话设置 | P1 |
| F-1641 | 提示词模板 | 内置模板库：代码审查、重构建议、生成注释、写测试、解释代码、优化性能 | P1 |
| F-1642 | 自定义模板 | 用户可创建/编辑/分享提示词模板（JSON 格式，支持 `{{变量}}` 占位） | P2 |
| F-1643 | 斜杠命令 | 对话中输入 `/review`、`/test`、`/explain` 等快捷指令替换为对应模板 | P1 |

#### 2.16.6 Oceanix 内置 MCP Server

| ID | 功能 | 描述 | 优先级 |
|----|------|------|--------|
| F-1650 | 编辑器 MCP Server | Oceanix 自身可作为 MCP Server 运行：`oceanix --mcp-server` 在 stdio 上暴露编辑器工具给外部 AI 客户端（Claude Desktop、Cursor 等） | P2 |
| F-1651 | 暴露的工具集 | 对外暴露：文件读写、全局搜索、Git 操作、LSP 诊断查询、终端执行 | P2 |

#### 2.16.7 智能体 (Agent) 模式

> **核心差异：不是问答，是自主执行。Agent 理解任务 → 制定计划 → 逐步执行 → 观察结果 → 修正重试 → 完成交付。**
> **Agent Runtime 运行在 Python sidecar (`oceanix-ai-server`) 中，基于 LangGraph 实现。**

| ID | 功能 | 描述 | 优先级 |
|----|------|------|--------|
| F-1700 | 任务规划 | 用户输入自然语言任务（"给这个项目加暗色主题支持"），Agent 分解为步骤列表，用户审核后执行 | P1 |
| F-1701 | 自主执行 | Agent 逐步执行计划：读文件 → 编辑代码 → 运行测试 → 观察输出 → 修正错误 → 继续，无需用户干预 | P1 |
| F-1702 | 中途干预 | 关键步骤（文件写入、命令执行）可配置为需用户确认，用户可随时暂停/修改/取消 Agent 任务 | P1 |
| F-1703 | 状态归因 | Agent 每步执行后展示：做了什么、为什么这样做、观察到了什么、下一步是什么 | P1 |
| F-1704 | 错误恢复 | 某步失败时 Agent 自动分析错误、调整方案、重试（最多 N 次，可配置） | P1 |
| F-1705 | 检查点/回滚 | 每步自动保存检查点，Agent 或用户可回滚到任意步骤重新开始 | P2 |
| F-1706 | 后台 Agent | Agent 任务在后台异步执行，用户继续编辑其他文件，完成后通知 | P1 |
| F-1707 | 并行 Agent | 同时运行多个 Agent 完成独立子任务（如：一个改前端、一个改后端） | P2 |

#### 2.16.8 AI 编排 (Orchestration)

> **多模型协作层。不同任务用不同模型，Agent 链式协作，成本可控。编排逻辑全部在 Python sidecar 中，使用 LangChain + LangGraph。**

| ID | 功能 | 描述 | 优先级 |
|----|------|------|--------|
| F-1710 | 模型路由 | 按任务类型自动选择模型：补全用轻量模型（低延迟）、Agent 用强模型（高推理）、简单问答用本地模型（免费） | P1 |
| F-1711 | Agent 流水线 | 链式编排：编码 Agent 产出 → 审查 Agent 检查 → 修复 Agent 修正 → 测试 Agent 验证，最终提交结果 | P2 |
| F-1712 | 成本控制 | 每个 Provider 设置月度预算上限，超出后自动降级到更便宜的模型或暂停 | P1 |
| F-1713 | Token 用量仪表盘 | 可视化展示每次调用、每个 Agent、每个 Provider 的 Token 消耗和费用 | P2 |
| F-1714 | 模型回退 | 主模型不可用时自动切换备用模型（如 GPT-4 → Claude → Ollama 本地） | P1 |
| F-1715 | 速率限制 | 防止短时间内大量 API 调用，队列管理 + 用户可配的速率上限 | P1 |

#### 2.16.9 Agent 工作区 UI

| ID | 功能 | 描述 | 优先级 |
|----|------|------|--------|
| F-1720 | Agent 面板 | 专用 Agent 视图：左侧任务列表，右侧当前任务详情（计划步骤 + 执行进度 + 日志） | P1 |
| F-1721 | Diff 审查 | Agent 修改的文件以 Diff 视图展示，用户逐文件审查：Accept / Reject / Edit | P1 |
| F-1722 | Agent 终端 | Agent 执行命令时，输出实时流到专用终端面板，用户可随时 Ctrl+C 中断 | P2 |
| F-1723 | 通知中心 | Agent 完成任务 / 需要确认 / 出错时，系统通知 + 状态栏角标 | P1 |

#### 2.16.10 技术方案 — Python Sidecar 架构

```
┌──────────────────────────────────────────────────────────┐
│          React 前端 (Monaco Editor)                        │
│                                                            │
│  ┌──────────────┐ ┌──────────────┐ ┌───────────────────┐  │
│  │ Inline       │ │ @oceanix/    │ │ @oceanix/         │  │
│  │ Completion   │ │ ai-chat      │ │ agent-workspace   │  │
│  │ Provider     │ │ (对话面板)    │ │ (Agent 工作区)     │  │
│  └──────┬───────┘ └──────┬───────┘ └────────┬──────────┘  │
│         │ invoke()       │ listen()          │ listen()    │
├─────────┼────────────────┼───────────────────┼─────────────┤
│         ▼                ▼                    ▼             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Rust 后端: oceanix-ai crate (薄 MCP 桥接层)         │  │
│  │                                                       │  │
│  │  • spawn Python sidecar 子进程                        │  │
│  │  • 转发前端请求 → Python (MCP stdio)                  │  │
│  │  • 回传 Python 结果 → 前端 (Tauri event)              │  │
│  │  • 零编排逻辑、零 LLM SDK 依赖                        │  │
│  └────────────────────┬─────────────────────────────────┘  │
│                       │ MCP stdio (子进程 stdin/stdout)     │
│  ┌────────────────────┴─────────────────────────────────┐  │
│  │  Python AI Sidecar: oceanix-ai-server                 │  │
│  │  (独立进程, pip install oceanix-ai-server)             │  │
│  │                                                       │  │
│  │  ┌────────────┐ ┌───────────┐ ┌──────────────────┐   │  │
│  │  │ MCP Server │ │ LangGraph │ │ LangChain Tools  │   │  │
│  │  │ (FastMCP)  │ │ Agent     │ │ (工具注册/调用)   │   │  │
│  │  └─────┬──────┘ └─────┬─────┘ └────────┬─────────┘   │  │
│  │        │              │               │               │  │
│  │  ┌─────┴──────────────┴───────────────┴───────────┐   │  │
│  │  │  LLM Provider 适配层                             │   │  │
│  │  │  openai │ anthropic │ ollama │ 任意 OpenAI 兼容  │   │  │
│  │  └─────────────────────────────────────────────────┘   │  │
│  │                                                       │  │
│  │  职责：Agent 执行 | 编排 | 路由 | 预算 | 提示词 | RAG  │  │
│  └───────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

**架构原则：**
- **Rust 不写 AI 逻辑**：`oceanix-ai` crate 仅做子进程管理和 MCP 消息转发，< 500 行代码
- **Python 用成熟生态**：LangGraph（Agent DAG）、LangChain（工具链）、FastMCP（MCP Server 骨架）、openai/anthropic SDK
- **进程隔离**：Python crash 不影响编辑器；用户可 kill sidecar 进程独立重启
- **独立升级**：`pip install --upgrade oceanix-ai-server`，不依赖编辑器发版
- **安全**：API Key 存储在系统凭据保管箱（`keyring-rs`），由 Rust 端注入 Python 进程环境变量

**组件全景图：**

```
oceanix-ai-server (Python) — 全部使用开源生态，零自研重型组件
│
├── 📐 编排引擎 ──── langgraph ──────── StateGraph, 子 Agent, 检查点, 人机交互
├── 🔧 工具框架 ──── langchain ──────── 工具定义/绑定/错误处理
├── 📡 MCP 传输 ──── fastmcp ───────── MCP Server 骨架 (stdio/HTTP)
├── 🧠 LLM 适配 ──── langchain-openai ─ OpenAI / Anthropic / Ollama 统一接口
│                   langchain-anthropic
│                   langchain-ollama
├── 📊 上下文 ────── langchain ──────── SummarizationMiddleware (自动压缩)
│                   middleware
├── 🔍 RAG ──────── llama-index ─────── 代码分块 + 索引
│                   qdrant-client ───── 向量存储 (HNSW + BM25)
│                   tree-sitter ─────── AST 分块
├── 🗄️ 记忆 ──────── mem0ai ──────────── 语义长期记忆
│                   文件系统 ────────── .oceanix/memory/*.md
├── 📈 监控 ──────── 自研 (薄层) ─────── Token 计数, 预算控制, 速率限制 (~120 行)
└── 💬 提示词 ────── 自研 (薄层) ─────── 模板引擎, /斜杠命令 (~80 行)
```

**LangGraph 即编排引擎（不需要额外框架）：**
```python
# 子 Agent 委托
main_agent = create_agent(model="claude", tools=[delegate_to_code_agent])

# Agent 流水线
pipeline = code_agent | review_agent | fix_agent

# 人工确认节点
graph.add_node("confirm", human_approval_node)

# 检查点
checkpointer = SqliteSaver.from_conn_string("sessions.db")
```

**明确不引入的组件（及原因）：**

| 组件 | 不引入原因 |
|------|-----------|
| CrewAI | 多 Agent 角色扮演框架，为营销/客服设计，代码编辑器场景过重 |
| AutoGen (Microsoft) | 多 Agent 对话编排，面向企业工作流，不适合桌面嵌入 |
| DSPy | LLM pipeline 优化编译器，学习曲线陡，编辑器不需要 prompt 自动调优 |
| Temporal / Prefect | 分布式工作流引擎，需要独立服务，桌面应用不需要 |

#### 2.16.11 AI Provider 兼容列表（Phase 1 目标）

| Provider | 接入方式 | 说明 |
|----------|---------|------|
| Anthropic Claude | MCP (官方 Server) + 直连 API | 一线模型，MCP 生态最成熟 |
| OpenAI (GPT-4 / o 系列) | 直连 API | 最广泛使用 |
| Ollama | 直连 API (本地) | 本地开源模型，隐私优先 |
| 任意 MCP 兼容 Server | MCP stdio / HTTP | 通用接入 |

---

### 2.17 代码库 RAG（检索增强生成）

> **代码库语义索引。让 AI 理解整个项目，而非仅当前文件。Cursor 的 `@Codebase` 等价能力。**

#### 2.17.1 代码索引

| ID | 功能 | 描述 | 优先级 |
|----|------|------|--------|
| F-1800 | 代码库索引 | 打开项目时自动索引全仓代码，tree-sitter AST 分块（函数/类/方法/模块），增量更新（文件保存时仅重索引变更部分） | P2 |
| F-1801 | 混合检索 | 语义向量检索（Qdrant HNSW）+ 关键词检索（ripgrep BM25），结果融合排序 | P2 |
| F-1802 | 嵌入模型 | 支持双模：云端 `voyage-code-3`（质量优先）+ 本地 `voyage-4-nano` / `nomic-embed-text`（隐私/离线优先），用户可选 | P2 |
| F-1803 | 多语言分块 | tree-sitter 支持 TypeScript、Python、Rust、Go、Java、C/C++、C# 等语言的 AST 感知分块 | P2 |

#### 2.17.2 RAG 触发方式

| ID | 功能 | 描述 | 优先级 |
|----|------|------|--------|
| F-1810 | `@Codebase` 命令 | 对话/Agent 中使用 `@Codebase` 自动检索相关代码上下文 | P2 |
| F-1811 | 自动上下文 | Inline 补全和 Agent 执行前，自动检索与当前光标/任务相关的代码片段（无需手动触发） | P2 |
| F-1812 | 文件关联 | 根据 import / require 关系自动拉入相关文件作为上下文 | P2 |
| F-1813 | 搜索结果增强 | 全局搜索（F-202）结果自动附带语义相似片段 | P2 |

#### 2.17.3 技术方案

```
oceanix-ai-server (Python Sidecar)
┌────────────────────────────────────────────┐
│  RAG 模块 (rag.py)                          │
│                                             │
│  ┌──────────┐ ┌───────────┐ ┌───────────┐ │
│  │ Indexer  │ │ Retriever │ │ Embedding │ │
│  │          │ │           │ │ Router    │ │
│  │ tree-    │ │ Qdrant    │ │ voyage/api│ │
│  │ sitter   │ │ Local     │ │ ollama/lcl│ │
│  │ 分块     │ │ (HNSW+    │ │           │ │
│  │ 增量更新 │ │  BM25)    │ │           │ │
│  └──────────┘ └───────────┘ └───────────┘ │
└────────────────────────────────────────────┘
        │ MCP stdio
┌───────┴────────────────────────────────────┐
│  Rust: oceanix-search (ripgrep 精确匹配)    │
│         oceanix-ai (桥接转发)               │
│         notify (文件变更 → 触发增量索引)     │
└────────────────────────────────────────────┘
```

- **栈**：LlamaIndex（代码分块）+ Qdrant Local（向量存储 + BM25）+ voyage / ollama（嵌入生成）
- **MCP**：Qdrant 官方 MCP Server + LlamaIndex MCP 集成，可被外部 AI 客户端直接调用
- **增量**：Rust 端 `notify` 检测文件保存 → 发 Tauri event → Python sidecar 增量索引变更文件
- **离线**：voyage-4-nano + Qdrant Local = 完全离线 RAG，无需任何 API

---

## 3. 非功能性需求

| ID | 需求 | 指标 | 优先级 |
|----|------|------|--------|
| NF-001 | 启动时间 | 冷启动 ≤ 2s，热启动 ≤ 1s | P0 |
| NF-002 | 编辑延迟 | 按键到屏幕更新 ≤ 50ms（包含语法高亮） | P0 |
| NF-003 | 内存占用 | 空工作区 ≤ 150MB（VS Code ~200MB） | P1 |
| NF-004 | 安装包大小 | macOS ≤ 30MB，Windows ≤ 25MB，Linux ≤ 25MB | P1 |
| NF-005 | 大文件 | ≥ 10MB 文件打开不卡顿，语法高亮降级处理 | P1 |
| NF-006 | 大项目 | 10,000+ 文件项目文件树及搜索可正常使用 | P2 |
| NF-007 | 崩溃恢复 | 异常退出后恢复未保存的修改 | P2 |
| NF-008 | 可访问性 | 支持屏幕阅读器、键盘导航、高对比度主题 | P2 |
| NF-009 | 国际化 | 界面支持中文/英文，预留 i18n 框架 | P2 |
| NF-010 | 崩溃监听与日志 | 三层统一日志：Rust `tracing` + Python `loguru` + 前端 `ErrorBoundary`，汇聚到 `~/.oceanix/logs/`，按日滚动，保留 30 天；崩溃时写 backtrace，下次启动检测异常退出并提示恢复 | P1 |

---

## 4. 技术架构

### 4.1 分层架构图

```
┌──────────────────────────────────────────────────────────┐
│                    React 主应用 (app/)                     │
│  仅组装组件，不含业务逻辑                                    │
│                                                            │
│  ┌──────────┐ ┌──────┐ ┌────────┐ ┌──────────────────┐   │
│  │ Monaco    │ │xterm │ │@oceanix│ │@oceanix/         │   │
│  │ Editor    │ │ .js  │ │/file-  │ │command-palette   │   │
│  │ (开源)    │ │(开源)│ │tree    │ │keybinding theme  │   │
│  │           │ │      │ │        │ │ai-chat           │   │
│  │           │ │      │ │        │ │agent-workspace   │   │
│  └──────────┘ └──────┘ └────────┘ └──────────────────┘   │
│         │          │          │            │               │
│  ┌──────┴──────────┴──────────┴────────────┴───────────┐  │
│  │              Tauri API Bridge (invoke / event)       │  │
│  │  React 组件不直接 invoke，通过 service 抽象层调用      │  │
│  └──────────────────────┬──────────────────────────────┘  │
├─────────────────────────┼─────────────────────────────────┤
│                    Rust 主进程 (src/)                       │
│  薄壳：仅注册 Tauri commands，委托给各 crate                │
│                                                            │
│  ┌───────────┐ ┌───────────┐ ┌──────────┐ ┌───────────┐ ┌──────────┐  │
│  │oceanix-lsp│ │oceanix-pty│ │oceanix-  │ │oceanix-   │ │oceanix-  │  │
│  │ (crate)   │ │ (crate)   │ │git (crate│ │search     │ │ai (crate)│  │
│  │           │ │           │ │          │ │(crate)    │ │(薄桥接)   │  │
│  └─────┬─────┘ └─────┬─────┘ └────┬─────┘ └─────┬─────┘ └────┬─────┘  │
│        │             │            │             │         │         │
│  ┌─────┴─────────────┴────────────┴─────────────┴─────────┴──────┐  │
│  │          底层开源依赖（不直接暴露给前端）                        │  │
│  │  lsp-types │ portable-pty │ git2 │ notify │ grep │ keyring-rs  │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  Python AI Sidecar: oceanix-ai-server (独立子进程)               │  │
│  │  FastMCP │ LangGraph │ LangChain │ openai │ anthropic │ ollama │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

### 4.2 依赖清单

#### 前端：开源组件（不自己实现）

| 包名 | 用途 |  License |
|------|------|----------|
| `@monaco-editor/react` | 代码编辑器核心 | MIT |
| `xterm` + `xterm-addon-fit` | 终端模拟器渲染 | MIT |
| `@tauri-apps/api` | Tauri 前端桥接 | Apache-2.0 / MIT |
| `react-resizable-panels` | 可拖拽面板分割 | MIT |
| `fuse.js` | 模糊搜索（命令面板/快开文件） | Apache-2.0 |
| `zustand` | 轻量状态管理 | MIT |

#### 前端：自研组件（抽取为独立 npm 包）

| 包名 | 用途 | 接口 |
|------|------|------|
| `@oceanix/file-tree` | 文件树组件 | `<FileTree root={path} onOpen={fn} />` |
| `@oceanix/command-palette` | 命令面板 | `<CommandPalette commands={[]} />` |
| `@oceanix/keybinding` | 快捷键引擎 | `KeybindingRegistry.register(binding, command)` |
| `@oceanix/theme` | 主题引擎 | `ThemeProvider, useTheme(), loadVSCodeTheme(json)` |
| `@oceanix/ai-chat` | AI 对话面板 | `<AiChatPanel provider={} tools={} />` |
| `@oceanix/agent-workspace` | Agent 工作区 | `<AgentWorkspace tasks={} onReview={fn} />` |

#### Rust 后端：开源依赖

| Crate | 用途 | License |
|-------|------|---------|
| `tauri` v2 | 桌面框架 | Apache-2.0 / MIT |
| `lsp-types` | LSP 协议 Rust 类型定义 | MIT |
| `portable-pty` | 跨平台伪终端 | MIT |
| `notify` + `notify-debouncer-full` | 文件系统监听 | CC0 |
| `git2` | libgit2 Rust 绑定 | MIT |
| `serde` + `serde_json` | JSON 序列化 | MIT |
| `tokio` | 异步运行时 | MIT |
| `grep` crate family | 全文正则搜索 | MIT |
| `rmcp` | MCP 官方 Rust SDK（客户端 + 服务端） | Apache-2.0 |
| `keyring-rs` | 系统凭据保管箱（API Key 安全存储） | MIT |
| `tracing` + `tracing-subscriber` + `tracing-appender` | 结构化日志 + panic backtrace 记录 | MIT |

#### Python AI Sidecar：开源依赖（不嵌入编辑器，独立进程）

| 包名 | 用途 | License |
|------|------|---------|
| `fastmcp` | MCP Server 骨架 | Apache-2.0 |
| `langgraph` | Agent 状态图执行引擎 | MIT |
| `langchain` | LLM 工具链框架 | MIT |
| `openai` | OpenAI API 客户端 | Apache-2.0 |
| `anthropic` | Anthropic API 客户端 | MIT |
| `ollama` | Ollama 本地模型客户端 | MIT |
| `qdrant-client` | Qdrant 向量数据库客户端（Local Mode） | Apache-2.0 |
| `llama-index` | LlamaIndex 代码分块 + 检索框架 | MIT |
| `tree-sitter` | 多语言 AST 解析器（代码分块） | MIT |
| `mem0ai` | AI 长期记忆（语义检索 + 图记忆） | Apache-2.0 |
| `python-sqlite3` | 对话历史 + 会话检查点持久化 | 内置 |

#### Rust 后端：自研组件（抽取为独立 crate）

| Crate | 用途 | 公开 API |
|-------|------|----------|
| `oceanix-lsp` | LSP 客户端（进程管理 + JSON-RPC） | `LspClient::start(), request(), on_notification()` |
| `oceanix-pty` | PTY 终端管理 | `PtySession::spawn(), read(), write(), resize()` |
| `oceanix-git` | Git 仓库操作 | `GitRepo::open(), status(), diff(), commit()` |
| `oceanix-search` | 全文搜索引擎 | `SearchEngine::new(), search(), replace()` |
| `oceanix-ai` | AI MCP 桥接层（薄层） | `AiBridge::start(), send(), on_response()` |

#### Python AI Sidecar：自研（`ai-server/`）

| 包名 | 用途 | 公开 API |
|------|------|----------|
| `oceanix-ai-server` | Python MCP Server | `mcp run oceanix_ai_server.server` |

### 4.3 数据流与耦合边界

```
                    React 组件层
                         │
                    ┌────┴────┐
                    │ service │  ← 抽象层（TypeScript interface）
                    └────┬────┘
                         │            ← 只有这一层知道 Tauri 存在
                    ┌────┴────┐
                    │  Tauri  │     invoke() / listen()
                    └────┬────┘
                         │
                    ┌────┴────┐
                    │commands │  ← src/commands.rs 薄委托层
                    └────┬────┘
                         │
              ┌──────────┼──────────┐
              ↓          ↓          ↓
        oceanix-lsp  oceanix-git  oceanix-pty  ...
              │          │          │
         ┌────┴────┐ ┌───┴───┐ ┌───┴────┐
         │lsp-types│ │ git2  │ │portable│
         └─────────┘ └───────┘ │ -pty   │
                               └────────┘
```

- **禁止**：React 组件直接 `import { invoke } from '@tauri-apps/api'` — 必须通过 `service/` 抽象层
- **禁止**：Rust `#[tauri::command]` 中写业务逻辑 — 必须 `#[tauri::command]` → 调用 crate API
- **禁止**：各 crate 之间互相引用 — crate 是叶子节点，无交叉依赖

### 4.4 Cargo.toml workspace 结构

```toml
[workspace]
members = [
    "src",              # Tauri 主进程（薄壳）
    "crates/oceanix-lsp",
    "crates/oceanix-pty",
    "crates/oceanix-git",
    "crates/oceanix-search",
    "crates/oceanix-ai",
]
```

### 4.5 前端 package.json / monorepo 结构

```
{
  "workspaces": [
    "app",                          # React 主应用
    "packages/file-tree",           # @oceanix/file-tree
    "packages/command-palette",     # @oceanix/command-palette
    "packages/keybinding",          # @oceanix/keybinding
    "packages/theme",               # @oceanix/theme
    "packages/ai-chat",             # @oceanix/ai-chat
    "packages/agent-workspace",      # @oceanix/agent-workspace
  ]
}
```

---

## 5. 分阶段规划

> 每个 Phase 遵循：**先搭组件 crate/package → 写测试 → 集成到主应用**。
> 
> **优先级 vs 排期说明**：部分 P0 功能因依赖链后置到 Phase 2-6（如终端依赖 `oceanix-pty` crate、全局搜索依赖 `oceanix-search` crate、Problems 面板依赖 LSP）。优先级标签 = 用户体验重要程度，排期 = 开发顺序约束。两者独立。

### Phase 0: 基础设施 (1 周)

**目标**: monorepo 骨架 + 开源组件集成 + 空壳布局

- 初始化 Tauri v2 + React + TypeScript + Vite 项目
- 配置 Cargo workspace：创建 `crates/` 目录，初始化 **6 个空 crate**（含 `oceanix-ai`）
- 配置 npm workspaces：创建 `packages/` 目录，初始化 **6 个空 package**（含 `@oceanix/ai-chat`、`@oceanix/agent-workspace`）
- 集成 Monaco Editor（`@monaco-editor/react`）— 验证基础文本编辑
- 集成 `react-resizable-panels` — 验证可折叠侧边栏 + 底部面板空壳
- 集成 `keyring-rs` 到 `oceanix-ai` crate 依赖
- 初始化 Python AI Sidecar：`ai-server/` 目录 + `pyproject.toml`，安装 FastMCP + LangGraph + LangChain + openai/anthropic SDK
- 验证 Rust ↔ Python MCP stdio 通信链路（spawn 子进程 + JSON-RPC 消息往返）
- 搭建 Tauri command 薄委托层 `src/commands.rs`
- 搭建前端 `service/` 抽象层（TypeScript interface）

### Phase 1: 基础编辑器 + AI 核心 (4-5 周)

**目标**: 可用的文件编辑体验 + Inline 补全 + AI 对话

| 自研组件 | 归属 | 交付物 |
|----------|------|--------|
| `@oceanix/file-tree` | `packages/file-tree` | 文件树组件：列出目录、右键菜单、文件图标、Git 状态色 |
| `@oceanix/command-palette` | `packages/command-palette` | 命令面板：模糊搜索、命令注册、键盘选择 |
| `@oceanix/keybinding` | `packages/keybinding` | 快捷键引擎：键位解析、和弦、上下文绑定 |
| `oceanix-ai` | `crates/oceanix-ai` | **MCP 桥接层（薄层）**：spawn Python sidecar + 转发 MCP 消息，< 500 行 |
| `oceanix-ai-server` | `ai-server/` | **Python AI Sidecar**：FastMCP Server + LangGraph Agent + LangChain 工具链 + LLM Provider 适配 |
| `@oceanix/ai-chat` | `packages/ai-chat` | AI 对话面板：流式渲染、Markdown + 代码、工具调用卡片 |
| `@oceanix/agent-workspace` | `packages/agent-workspace` | Agent 工作区（F-1720/F-1721/F-1723）：任务计划视图、步骤进度、Diff 审查面板 |

**编辑器基础：**
- 多标签页管理（打开/关闭/切换/拖拽排序）
- 文件保存、脏状态标记、关闭前提醒
- **自动保存**（F-021：窗口失焦/延迟触发）
- **自动换行**（F-022：Alt+Z 切换）
- **缩进检测**（F-025：打开文件自动检测，不一致提示）
- 单文件搜索（Ctrl+F，复用 Monaco 内置 Find Widget）
- **快捷打开文件**（F-602：Ctrl+P 模糊搜索文件名并打开）
- **跳转到行**（F-208：Ctrl+G）
- **活动栏** (F-705)：最左侧图标栏切换侧边栏视图
- 状态栏（行列号、编码、缩进模式）
- **会话恢复**（F-708：退出时保存工作区状态，启动时自动恢复）
- 前端 `service/` 层封装文件读写、配置存取

**AI 核心（Python sidecar 负责）：**
- **Inline 代码补全**（F-1610）：Monaco → Rust bridge → `oceanix-ai-server` → LLM API → ghost text
- **上下文收集**（F-1611）：自动收集光标附近代码、相邻文件、语言类型
- **对话上下文**（F-1622）：对话附带当前文件列表、光标位置、LSP 诊断
- **AI 对话面板**（F-1620）：侧边栏 Chat UI，流式渲染，Markdown 展示
- **选区对话**（F-1621）：选中代码 → 右键 → "Ask Oceanix"
- **Token 预算可视化**（F-1625）：输入框实时显示 `45K/128K` 用量填充条
- **自动上下文压缩**（F-1626）：LangChain `SummarizationMiddleware`，保留最近 5 轮 + 早期摘要
- **上下文提供器**（F-1629）：`@file` `@folder` `@codebase` `@git` `@terminal` `@lsp`
- **文件系统记忆**（`.oceanix/memory/`）：Agent 自动记录项目架构、编码规范、决策到 Markdown，跨会话读取
- **MCP Server**（Python FastMCP）：`oceanix-ai-server` 作为 MCP Server 运行
- **Python 生态集成**：LangGraph Agent Runtime、LangChain 工具链、openai/anthropic/ollama SDK
- **提示词模板**（F-1641）：内置 `/review`、`/test`、`/explain`、`/fix` 四条斜杠命令
- **Agent 模式**（F-1700~F-1704、F-1706）：LangGraph 驱动：任务规划 → 自主执行 → 归因展示 → 错误重试 → 后台运行
- **编排 + 路由**（F-1710~F-1715）：Python 端做模型路由、预算控制、速率限制、模型回退链
- **API Key 安全**：Rust 端通过 `keyring-rs` 存储，注入 Python 进程环境变量

### Phase 2: 集成终端 (1 周)

**目标**: 可交互的终端面板

| 自研组件 | 归属 | 交付物 |
|----------|------|--------|
| `oceanix-pty` | `crates/oceanix-pty` | PTY 管理：spawn、read、write、resize、close |

- Rust 端用 `portable-pty` 跨平台伪终端
- 前端集成 `xterm.js` + `xterm-addon-fit`
- 面板区可拖拽调整高度
- macOS / Windows / Linux 三端适配（bash / zsh / pwsh / cmd）

### Phase 3: 语言服务 (2-3 周)

**目标**: IntelliSense 基础能力

| 自研组件 | 归属 | 交付物 |
|----------|------|--------|
| `oceanix-lsp` | `crates/oceanix-lsp` | LSP 客户端：进程管理、JSON-RPC 收发、通知分发 |

- 启动/管理 TypeScript Language Server 子进程
- 诊断信息 → 编辑器红色/黄色波浪线
- **Problems 面板**（F-1200：集中展示所有诊断，点击跳转）
- 悬停提示（Hover）、跳转到定义（Go to Definition）
- **Peek 定义/引用**（F-023/F-024：Alt+F12 嵌入式弹窗）
- 代码补全（Completion）— LSP 语义 + 单词 fallback
- **Code Lens**（F-307：函数上方内联引用计数）
- **文件内符号跳转**（F-209：Ctrl+Shift+O）
- **Outline 大纲视图**（F-1300：右侧栏符号树）
- Monaco 端对接 LSP 结果的适配层

### Phase 4: Git 集成 (1-2 周)

**目标**: 版本控制可视化

| 自研组件 | 归属 | 交付物 |
|----------|------|--------|
| `oceanix-git` | `crates/oceanix-git` | Git 操作：status、diff、commit、branch |

- 文件树状态色标记（M / A / D / U）
- 编辑器装订线差异指示（Gutter Diff：绿/红/蓝竖条）
- 内联 Diff 视图（当前文件 vs HEAD）
- **Source Control 面板**（F-508：变更列表 + 输入框 + 按钮）
- 简易 Commit 面板（stage 选中文件 + message + commit）
- 分支管理（查看/切换/新建/删除）

### Phase 5: 全局搜索 (1 周)

**目标**: 跨文件全文搜索

| 自研组件 | 归属 | 交付物 |
|----------|------|--------|
| `oceanix-search` | `crates/oceanix-search` | 搜索引擎：正则搜索、文件过滤、流式结果 |

- Rust 端封装 `grep` crate
- `.gitignore` 感知 + glob 模式过滤
- **工作区符号跳转**（F-210：Ctrl+T 跨项目搜索）
- 搜索结果列表 → 点击跳转到文件+行
- 全局替换预览 + 批量应用

### Phase 6: 打磨发布 (2-4 周)

**目标**: 产品化

| 自研组件 | 归属 | 交付物 |
|----------|------|--------|
| `@oceanix/theme` | `packages/theme` | 主题引擎：CSS 变量生成、VS Code 主题 JSON 导入 |

- 暗色/亮色主题 + VS Code 主题兼容
- 分屏编辑（同一文件可左右对照）
- **Markdown 实时预览**（F-1500：Ctrl+Shift+V 分屏）
- **Output 面板**（F-1201：LSP/Task 独立输出通道）
- **任务系统**（F-1400/F-1401：自动检测+运行 `package.json` scripts 等）
- **多根工作区**（F-707：`.oceanix-workspace` 文件）
- **AI 工具调用**（F-1630~F-1635）：AI 可读/写文件、搜索、Git diff、终端执行（需确认），结果以卡片展示
- **Agent 流水线**（F-1711）：编码 → 审查 → 修复 → 测试 → 提交，链式自动执行
- **并行 Agent**（F-1707）：多个 Agent 同时执行独立子任务
- **检查点/回滚**（F-1705）：Agent 任务任意步骤可回滚
- **Token 仪表盘**（F-1713）：可视化用量和费用
- **RAG 代码索引**（F-1800~F-1813）：LlamaIndex + Qdrant Local，语义+关键词混合检索，`@Codebase` 命令
- **Mem0 语义记忆**：跨会话语义检索用户偏好、项目知识、Bug 模式
- **手动压缩 `/compact`**（F-1627）：用户触发即时压缩，可附带指令
- **结构化笔记**（F-1628）：Agent 写 `.oceanix/notes.md` 保持跨压缩记忆
- **Oceanix MCP Server**（F-1650）：`oceanix --mcp-server` 模式，对外暴露编辑器工具
- **自定义提示词模板**（F-1642）：用户创建/编辑/分享模板
- 设置 JSON 文件 + Schema 补全
- **Zen Mode**、**空白符渲染**、**链接编辑**、**颜色选择器**、**欢迎页**（P2 打磨项）
- 性能优化（大文件降级、内存控制）
- 各 crate/package 独立测试覆盖
- 三端打包分发（`.dmg` / `.msi` / `.AppImage`）

## 5.1 组件交付检查清单

每个自研组件在集成前必须满足：

- [ ] 有独立的 `README.md` 说明用途和 API
- [ ] 有单元测试且覆盖率 ≥ 60%
- [ ] 公开 API ≤ 5 个类型/函数（接口简洁）
- [ ] 不依赖主应用（Tauri / React 除外）
- [ ] 可在独立 demo 中运行（`cargo test` / `npm run dev`）


---

## 6. 不做 / 远期

| 项目 | 原因 |
|------|------|
| **调试器 (DAP)** | Debug Adapter Protocol 复杂度高，需大量沉淀，阶段规划外 |
| **扩展市场** | 无社区积累时无意义；优先内置功能完备 |
| **设置同步 / 账户系统** | 需要后端服务支撑 |
| **远程开发 (SSH/Container)** | VS Code 核心差异化能力，投入产出比低 |
| **Notebook (Jupyter)** | 独立赛道，暂不涉足 |
| **Copilot / AI 补全** | 可后期通过扩展集成，非核心路径 |

---

## 7. 实现进度 vs VS Code 差异分析

> 最后更新：2026-07-10

### 7.1 已实现功能清单

| # | 功能 | 状态 | 对应 VS Code | 实现方式 |
|---|------|------|-------------|----------|
| 1 | 文本编辑 + 语法高亮 + 多光标 | ✅ | 内置 | Monaco Editor 原生 |
| 2 | 代码折叠 + 括号配色 + Minimap | ✅ | 内置 | Monaco 配置开启 |
| 3 | 查找替换 Ctrl+F/H | ✅ | 内置 | Monaco Find Widget |
| 4 | 自动缩进 + 格式化 | ✅ | 内置 | Monaco + Shift+Alt+F |
| 5 | 自动保存 | ✅ | `files.autoSave` | 1.5s debounce → `file_write` |
| 6 | 文件树（真实文件系统） | ✅ | Explorer | `readDir` 递归 4 层，跳过 `.git`/`node_modules` |
| 7 | 多标签页管理 | ✅ | Tabs | `EditorTabs` 组件，脏状态标记，Ctrl+W 关闭 |
| 8 | 快捷打开文件 Ctrl+P | ✅ | `workbench.action.quickOpen` | 命令面板合并扁平文件列表 |
| 9 | 跳转到行 Ctrl+G | ✅ | `workbench.action.gotoLine` | Monaco 原生 |
| 10 | 集成终端 | ✅ | Terminal | `oceanix-pty` + xterm.js，50ms 轮询 + ResizeObserver |
| 11 | 分屏编辑器 | ✅ | Split Editor | Ctrl+\ 左右 / Ctrl+K Ctrl+\ 上下 |
| 12 | Git 面板 | ✅ | Source Control | 5 个 Tauri 命令 (`git_status/diff/commit/branch_name/branches`) |
| 13 | Git Diff 视图 | ✅ | Diff Editor | Monaco DiffEditor 并排对比 |
| 14 | 全局搜索 | ✅ | Search | `oceanix-search` (ripgrep) + 前端结果列表 |
| 15 | 命令面板 | ✅ | Command Palette | `@oceanix/command-palette` + 模糊搜索 |
| 16 | 快捷键系统 | ✅ | Keybindings | `@oceanix/keybinding` + 和弦支持 |
| 17 | 主题引擎 | ✅ | Themes | `@oceanix/theme` + VS Code 主题 JSON 兼容 |
| 18 | LSP 客户端 | ✅ | Language Server | `oceanix-lsp` JSON-RPC stdio，预配 rust-analyzer/pyright/typescript-ls |
| 19 | LSP 悬停提示 | ✅ | Hover | Monaco `registerHoverProvider` → `lspHover` |
| 20 | LSP 跳转定义 | ✅ | Go to Definition | Monaco `registerDefinitionProvider` → `lspDefinition` |
| 21 | LSP 诊断 → Problems 面板 | ✅ | Problems | 2s 轮询 `lspDiagnostics` → `ProblemsPanel` |
| 22 | AI 内联补全 | ✅ | (独有) | `oceanix-ai` MCP bridge → Python sidecar → LLM |
| 23 | AI 对话面板 | ✅ | Copilot Chat | `@oceanix/ai-chat` 流式对话 + token 预算 |
| 24 | Agent 工作区 | ✅ | (独有) | `@oceanix/agent-workspace` 任务列表 + 步骤时间线 |
| 25 | Markdown 预览 | ✅ | `markdown.showPreview` | Ctrl+Shift+V 分屏渲染 |
| 26 | 设置 GUI | ✅ | Settings UI | 模态面板：字体/主题/Tab/Wrap/Minimap/AutoSave |
| 27 | 会话持久化 | ✅ | Session Restore | 文件/光标/布局保存到 `session.json` |
| 28 | 状态栏 | ✅ | Status Bar | 分支/行号/编码/缩进/语言 |
| 29 | 活动栏 | ✅ | Activity Bar | Explorer/Search/Git/AI 四视图，lucide-react 图标 |
| 30 | 面板区域 (Terminal/Problems/Output) | ✅ | Panel | 三 tab 可切换 |
| 31 | 插件协议框架 | ✅ | Extensions | `oceanix-plugin` crate + `ExtensionRegistry` |
| 32 | 自动格式化文档 | ✅ | `editor.action.formatDocument` | Shift+Alt+F |

### 7.2 部分实现（有基础但未完成）

| # | 功能 | 当前状态 | 缺失 |
|---|------|---------|------|
| 1 | LSP Code Lens | Rust 类型已定义，前端未接 | Monaco `CodeLensProvider` 注册 |
| 2 | LSP 查找引用 | API 就绪，前端未接 | `lspReferences` Tauri 命令待添加 |
| 3 | LSP 重命名 | API 就绪，前端未接 | `lspRename` Tauri 命令待添加 |
| 4 | LSP 代码补全 | 仅单词 fallback | `lspCompletion` 未接线到 Monaco `CompletionItemProvider` |
| 5 | 文件树 | 一次性递归 4 层 | 缺少按需懒加载（展开时才加载子节点） |
| 6 | File > Open Folder | projectRoot 硬编码 cwd | 无文件夹选择对话框 |
| 7 | 终端 | 单会话 | 多终端标签 / 终端分屏 |
| 8 | Git | status/commit/diff | stage/unstage 单文件/代码块、分支切换 UI、push/pull |
| 9 | 面包屑导航 | TypeScript 类型问题 | Monaco `breadcrumbs` 选项在当前版本类型不兼容 |
| 10 | 插件系统 | 协议 + registry 完整 | manifest 文件加载、WASM/native 执行器 |

### 7.3 尚未实现的核心功能

| # | 功能 | 对应 VS Code | 难度 | 说明 |
|---|------|-------------|------|------|
| 1 | **调试器 (DAP)** | Run and Debug | 极高 | Debug Adapter Protocol 完整实现 |
| 2 | 代码片段 (Snippets) | Snippets | 中 | 预定义/用户自定义，Tab 跳占位符 |
| 3 | Stage / Unstage 文件块 | Source Control | 中 | 需 `git2` 文件块级别操作 |
| 4 | 行内差异指示 (Gutter Diff) | Editor Gutter | 中 | Monaco 装订线装饰 API |
| 5 | 文件内符号跳转 (Ctrl+Shift+O) | `@` outline | 中 | LSP `documentSymbol` 未接 |
| 6 | 工作区符号跳转 (Ctrl+T) | `#` workspace symbol | 中 | LSP `workspaceSymbol` 未接 |
| 7 | Peek 定义/引用 | Peek | 中 | Monaco `PeekView` API |
| 8 | 多根工作区 | Multi-root Workspace | 中 | `.oceanix-workspace` 文件 |
| 9 | 任务系统 | Tasks | 中 | `tasks.json` 构建/测试运行 |
| 10 | 扩展市场 | Marketplace | 极高 | 社区 + 后端服务 |
| 11 | 远程开发 (SSH/Container) | Remote Development | 极高 | 架构级 |
| 12 | 文件拖拽移动 | Explorer | 低 | FileTree 拖拽事件 |
| 13 | 欢迎页 | Welcome | 低 | 纯前端 |
| 14 | Zen Mode | Zen Mode | 低 | 全屏 + 隐藏 UI |

### 7.4 整体完成度估算

| 域 | 完成度 | 注解 |
|----|--------|------|
| 编辑核心 | 85% | Monaco 承担大部分，缺 snippets/peek/gutter diff |
| 文件管理 | 55% | 文件树有但缺懒加载/拖拽/面包屑/文件夹选择 |
| 搜索替换 | 65% | 单文件+全局搜索有，缺全局替换/搜索历史 |
| LSP / IntelliSense | 50% | 客户端完整，hover+definition+diagnostics 已接，缺 completion/references/rename/codeLens |
| 终端 | 60% | 单会话可用，缺多标签/分屏 |
| Git | 45% | status/diff/commit 可用，缺 stage/unstage/分支切换/push-pull |
| AI | 70% | 补全+对话+Agent 已通，缺 RAG/Mem0/工具调用 |
| 扩展系统 | 25% | 协议框架完整，缺加载/执行 |
| 整体 | **~55%** | 基础编辑器可用，需补齐 Git/终端/LSP/Multi-root |
