/**
 * Locale data for Oceanix i18n.
 *
 * To add a new language: add a new key block with all translations.
 * To add a new string: add the key to ALL language blocks.
 */

export type Locale = "en" | "zh";

export interface LocaleStrings {
  // ── Menu: File ─────────────────────────────────
  "menu.file": string;
  "menu.file.newFile": string;
  "menu.file.openFile": string;
  "menu.file.openFolder": string;
  "menu.file.save": string;
  "menu.file.closeEditor": string;

  // ── Menu: Edit ─────────────────────────────────
  "menu.edit": string;
  "menu.edit.undo": string;
  "menu.edit.redo": string;
  "menu.edit.cut": string;
  "menu.edit.copy": string;
  "menu.edit.paste": string;
  "menu.edit.find": string;
  "menu.edit.replace": string;
  "menu.edit.findInFiles": string;

  // ── Menu: Selection ────────────────────────────
  "menu.selection": string;
  "menu.selection.selectAll": string;
  "menu.selection.expandSelection": string;
  "menu.selection.copyLineUp": string;
  "menu.selection.copyLineDown": string;
  "menu.selection.moveLineUp": string;
  "menu.selection.moveLineDown": string;
  "menu.selection.addCursorAbove": string;
  "menu.selection.addCursorBelow": string;
  "menu.selection.selectAllOccurrences": string;

  // ── Menu: View ─────────────────────────────────
  "menu.view": string;
  "menu.view.commandPalette": string;
  "menu.view.zoomIn": string;
  "menu.view.zoomOut": string;
  "menu.view.toggleSidebar": string;
  "menu.view.togglePanel": string;
  "menu.view.splitRight": string;
  "menu.view.splitDown": string;
  "menu.view.toggleTheme": string;
  "menu.view.fullScreen": string;
  "menu.view.settings": string;

  // ── Menu: Go ───────────────────────────────────
  "menu.go": string;
  "menu.go.quickOpen": string;
  "menu.go.gotoLine": string;
  "menu.go.gotoSymbol": string;
  "menu.go.back": string;
  "menu.go.forward": string;
  "menu.go.definition": string;
  "menu.go.references": string;

  // ── Menu: Run ──────────────────────────────────
  "menu.run": string;
  "menu.run.task": string;
  "menu.run.debug": string;

  // ── Menu: Terminal ─────────────────────────────
  "menu.terminal": string;
  "menu.terminal.new": string;
  "menu.terminal.kill": string;

  // ── Menu: Help ─────────────────────────────────
  "menu.help": string;
  "menu.help.about": string;

  // ── Activity Bar ───────────────────────────────
  "activity.explorer": string;
  "activity.search": string;
  "activity.git": string;
  "activity.ai": string;
  "activity.rag": string;

  // ── Sidebar ────────────────────────────────────
  "sidebar.explorer": string;
  "sidebar.search": string;
  "sidebar.searchPlaceholder": string;
  "sidebar.searchNoResults": string;
  "sidebar.aiChat": string;
  "sidebar.aiStreaming": string;
  "sidebar.rag": string;
  "sidebar.loading": string;
  "sidebar.retry": string;
  "sidebar.failedLoad": string;
  "sidebar.emptyExplorer": string;

  // ── Panel ──────────────────────────────────────
  "panel.terminal": string;
  "panel.problems": string;
  "panel.output": string;

  // ── Welcome Page ───────────────────────────────
  "welcome.title": string;
  "welcome.subtitle": string;
  "welcome.newFile": string;
  "welcome.openFolder": string;
  "welcome.settings": string;
  "welcome.togglePanel": string;
  "welcome.recent": string;
  "welcome.commandPalette": string;
  "welcome.quickOpen": string;
  "welcome.toggleTheme": string;

  // ── Chat Panel ─────────────────────────────────
  "chat.placeholder": string;
  "chat.streaming": string;
  "chat.send": string;
  "chat.empty": string;
  "chat.error": string;
  "chat.you": string;
  "chat.ai": string;
  "chat.noProvider": string;

  // ── Common ─────────────────────────────────────
  "common.justNow": string;
  "common.mAgo": string;
  "common.hAgo": string;
  "common.dAgo": string;
}

const en: LocaleStrings = {
  // Menu: File
  "menu.file": "File",
  "menu.file.newFile": "New File",
  "menu.file.openFile": "Open File...",
  "menu.file.openFolder": "Open Folder...",
  "menu.file.save": "Save",
  "menu.file.closeEditor": "Close Editor",

  // Menu: Edit
  "menu.edit": "Edit",
  "menu.edit.undo": "Undo",
  "menu.edit.redo": "Redo",
  "menu.edit.cut": "Cut",
  "menu.edit.copy": "Copy",
  "menu.edit.paste": "Paste",
  "menu.edit.find": "Find",
  "menu.edit.replace": "Replace",
  "menu.edit.findInFiles": "Find in Files",

  // Menu: Selection
  "menu.selection": "Selection",
  "menu.selection.selectAll": "Select All",
  "menu.selection.expandSelection": "Expand Selection",
  "menu.selection.copyLineUp": "Copy Line Up",
  "menu.selection.copyLineDown": "Copy Line Down",
  "menu.selection.moveLineUp": "Move Line Up",
  "menu.selection.moveLineDown": "Move Line Down",
  "menu.selection.addCursorAbove": "Add Cursor Above",
  "menu.selection.addCursorBelow": "Add Cursor Below",
  "menu.selection.selectAllOccurrences": "Select All Occurrences",

  // Menu: View
  "menu.view": "View",
  "menu.view.commandPalette": "Command Palette...",
  "menu.view.zoomIn": "Zoom In",
  "menu.view.zoomOut": "Zoom Out",
  "menu.view.toggleSidebar": "Toggle Sidebar",
  "menu.view.togglePanel": "Toggle Panel",
  "menu.view.splitRight": "Split Right",
  "menu.view.splitDown": "Split Down",
  "menu.view.toggleTheme": "Toggle Theme",
  "menu.view.fullScreen": "Full Screen",
  "menu.view.settings": "Settings",

  // Menu: Go
  "menu.go": "Go",
  "menu.go.quickOpen": "Quick Open...",
  "menu.go.gotoLine": "Go to Line...",
  "menu.go.gotoSymbol": "Go to Symbol...",
  "menu.go.back": "Go Back",
  "menu.go.forward": "Go Forward",
  "menu.go.definition": "Go to Definition",
  "menu.go.references": "Go to References",

  // Menu: Run
  "menu.run": "Run",
  "menu.run.task": "Run Task...",
  "menu.run.debug": "Start Debugging",

  // Menu: Terminal
  "menu.terminal": "Terminal",
  "menu.terminal.new": "New Terminal",
  "menu.terminal.kill": "Kill Terminal",

  // Menu: Help
  "menu.help": "Help",
  "menu.help.about": "About",

  // Activity Bar
  "activity.explorer": "Explorer",
  "activity.search": "Search",
  "activity.git": "Git",
  "activity.ai": "AI",
  "activity.rag": "RAG",

  // Sidebar
  "sidebar.explorer": "Explorer",
  "sidebar.search": "Search",
  "sidebar.searchPlaceholder": "Search files...",
  "sidebar.searchNoResults": "No results found",
  "sidebar.aiChat": "AI Chat",
  "sidebar.aiStreaming": "streaming",
  "sidebar.rag": "RAG — Retrieval-Augmented Generation",
  "sidebar.loading": "Loading...",
  "sidebar.retry": "Retry",
  "sidebar.failedLoad": "Failed to load:",
  "sidebar.emptyExplorer": "Open a folder to see files",

  // Panel
  "panel.terminal": "TERMINAL",
  "panel.problems": "PROBLEMS",
  "panel.output": "OUTPUT",

  // Welcome Page
  "welcome.title": "Oceanix",
  "welcome.subtitle": "Next-generation code editor",
  "welcome.newFile": "New File",
  "welcome.openFolder": "Open Folder",
  "welcome.settings": "Settings",
  "welcome.togglePanel": "Toggle Panel",
  "welcome.recent": "Recent",
  "welcome.commandPalette": "Command Palette",
  "welcome.quickOpen": "Quick Open",
  "welcome.toggleTheme": "Toggle Theme",

  // Chat Panel
  "chat.placeholder": "Ask AI... (Enter to send, Shift+Enter for newline)",
  "chat.streaming": "AI is thinking...",
  "chat.send": "Send",
  "chat.empty": "Ask anything about your code. Start a conversation below.",
  "chat.error": "Error:",
  "chat.you": "You",
  "chat.ai": "AI",
  "chat.noProvider": "AI service is not configured. Please set OPENAI_API_KEY or ANTHROPIC_API_KEY.",

  // Common
  "common.justNow": "Just now",
  "common.mAgo": "m ago",
  "common.hAgo": "h ago",
  "common.dAgo": "d ago",
};

const zh: LocaleStrings = {
  // Menu: File
  "menu.file": "文件",
  "menu.file.newFile": "新建文件",
  "menu.file.openFile": "打开文件...",
  "menu.file.openFolder": "打开文件夹...",
  "menu.file.save": "保存",
  "menu.file.closeEditor": "关闭编辑器",

  // Menu: Edit
  "menu.edit": "编辑",
  "menu.edit.undo": "撤销",
  "menu.edit.redo": "重做",
  "menu.edit.cut": "剪切",
  "menu.edit.copy": "复制",
  "menu.edit.paste": "粘贴",
  "menu.edit.find": "查找",
  "menu.edit.replace": "替换",
  "menu.edit.findInFiles": "在文件中查找",

  // Menu: Selection
  "menu.selection": "选择",
  "menu.selection.selectAll": "全选",
  "menu.selection.expandSelection": "扩展选择",
  "menu.selection.copyLineUp": "向上复制行",
  "menu.selection.copyLineDown": "向下复制行",
  "menu.selection.moveLineUp": "向上移动行",
  "menu.selection.moveLineDown": "向下移动行",
  "menu.selection.addCursorAbove": "向上添加光标",
  "menu.selection.addCursorBelow": "向下添加光标",
  "menu.selection.selectAllOccurrences": "选择所有匹配项",

  // Menu: View
  "menu.view": "查看",
  "menu.view.commandPalette": "命令面板...",
  "menu.view.zoomIn": "放大",
  "menu.view.zoomOut": "缩小",
  "menu.view.toggleSidebar": "切换侧边栏",
  "menu.view.togglePanel": "切换面板",
  "menu.view.splitRight": "向右拆分",
  "menu.view.splitDown": "向下拆分",
  "menu.view.toggleTheme": "切换主题",
  "menu.view.fullScreen": "全屏",
  "menu.view.settings": "设置",

  // Menu: Go
  "menu.go": "导航",
  "menu.go.quickOpen": "快速打开...",
  "menu.go.gotoLine": "转到行...",
  "menu.go.gotoSymbol": "转到符号...",
  "menu.go.back": "后退",
  "menu.go.forward": "前进",
  "menu.go.definition": "转到定义",
  "menu.go.references": "转到引用",

  // Menu: Run
  "menu.run": "运行",
  "menu.run.task": "运行任务...",
  "menu.run.debug": "开始调试",

  // Menu: Terminal
  "menu.terminal": "终端",
  "menu.terminal.new": "新建终端",
  "menu.terminal.kill": "关闭终端",

  // Menu: Help
  "menu.help": "帮助",
  "menu.help.about": "关于",

  // Activity Bar
  "activity.explorer": "资源管理器",
  "activity.search": "搜索",
  "activity.git": "Git",
  "activity.ai": "AI",
  "activity.rag": "RAG",

  // Sidebar
  "sidebar.explorer": "资源管理器",
  "sidebar.search": "搜索",
  "sidebar.searchPlaceholder": "搜索文件...",
  "sidebar.searchNoResults": "未找到结果",
  "sidebar.aiChat": "AI 对话",
  "sidebar.aiStreaming": "流式输出中",
  "sidebar.rag": "RAG — 检索增强生成",
  "sidebar.loading": "加载中...",
  "sidebar.retry": "重试",
  "sidebar.failedLoad": "加载失败：",
  "sidebar.emptyExplorer": "打开文件夹以查看文件",

  // Panel
  "panel.terminal": "终端",
  "panel.problems": "问题",
  "panel.output": "输出",

  // Welcome Page
  "welcome.title": "Oceanix",
  "welcome.subtitle": "下一代代码编辑器",
  "welcome.newFile": "新建文件",
  "welcome.openFolder": "打开文件夹",
  "welcome.settings": "设置",
  "welcome.togglePanel": "切换面板",
  "welcome.recent": "最近",
  "welcome.commandPalette": "命令面板",
  "welcome.quickOpen": "快速打开",
  "welcome.toggleTheme": "切换主题",

  // Chat Panel
  "chat.placeholder": "向 AI 提问...（Enter 发送，Shift+Enter 换行）",
  "chat.streaming": "AI 思考中...",
  "chat.send": "发送",
  "chat.empty": "询问任何关于代码的问题，在下方开始对话。",
  "chat.error": "错误：",
  "chat.you": "你",
  "chat.ai": "AI",
  "chat.noProvider": "AI 服务未配置，请设置 OPENAI_API_KEY 或 ANTHROPIC_API_KEY。",

  // Common
  "common.justNow": "刚刚",
  "common.mAgo": "分钟前",
  "common.hAgo": "小时前",
  "common.dAgo": "天前",
};

export const locales: Record<Locale, LocaleStrings> = { en, zh };
export const localeNames: Record<Locale, string> = { en: "English", zh: "中文" };
