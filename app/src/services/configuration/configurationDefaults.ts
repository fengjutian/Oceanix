/**
 * Built-in Configuration Defaults — registers all Oceanix settings.
 *
 * Pattern: VSCode's core configuration contributions.
 * Each section maps to a top-level group in the Settings UI.
 *
 * Full key format:  "<section>.<property>"  e.g. "editor.fontSize"
 */

import { configurationRegistry, type IConfigurationNode } from "./configurationRegistry";

/* ─── Editor Section ────────────────────────────────── */

const editorConfiguration: IConfigurationNode = {
  id: "editor",
  title: "settings.group.editor",
  order: 10,
  properties: {
    "fontSize": {
      type: "number",
      default: 14,
      description: "settings.desc.fontSize",
      minimum: 10,
      maximum: 32,
      tags: ["appearance", "font"],
    },
    "fontFamily": {
      type: "string",
      default: "'Cascadia Code', 'Fira Code', monospace",
      description: "settings.desc.fontFamily",
      tags: ["appearance", "font"],
    },
    "tabSize": {
      type: "number",
      default: 2,
      description: "settings.desc.tabSize",
      enum: [1, 2, 4, 8],
      enumDescriptions: ["1", "2", "4", "8"],
      minimum: 1,
      maximum: 8,
      tags: ["indent", "format"],
    },
    "insertSpaces": {
      type: "boolean",
      default: true,
      description: "settings.desc.insertSpaces",
      tags: ["indent", "format"],
    },
    "wordWrap": {
      type: "string",
      default: "off",
      description: "settings.desc.wordWrap",
      enum: ["off", "on", "wordWrapColumn"],
      enumDescriptions: ["settings.option.off", "settings.option.on", "settings.option.wordWrapColumn"],
      tags: ["display"],
    },
    "minimap": {
      type: "boolean",
      default: true,
      description: "settings.desc.minimap",
      tags: ["appearance", "display"],
    },
    "autoSave": {
      type: "string",
      default: "off",
      description: "settings.desc.autoSave",
      enum: ["off", "afterDelay", "onFocusChange"],
      enumDescriptions: [
        "settings.option.off",
        "settings.option.afterDelay",
        "settings.option.onFocusChange",
      ],
      tags: ["save", "files"],
    },
    "autoSaveDelay": {
      type: "number",
      default: 1000,
      description: "settings.desc.autoSaveDelay",
      minimum: 500,
      maximum: 10000,
      step: 500,
      tags: ["save", "files"],
    },
    "cursorBlinking": {
      type: "string",
      default: "blink",
      description: "settings.desc.cursorBlinking",
      enum: ["blink", "smooth", "phase", "expand", "solid"],
      enumDescriptions: ["Blink", "Smooth", "Phase", "Expand", "Solid"],
      tags: ["appearance", "cursor"],
      order: 100,
    },
    "cursorWidth": {
      type: "number",
      default: 0,
      description: "settings.desc.cursorWidth",
      minimum: 0,
      maximum: 5,
      tags: ["appearance", "cursor"],
      order: 101,
    },
    "lineNumbers": {
      type: "string",
      default: "on",
      description: "settings.desc.lineNumbers",
      enum: ["on", "off", "relative"],
      enumDescriptions: ["On", "Off", "Relative"],
      tags: ["appearance", "display"],
      order: 102,
    },
    "renderWhitespace": {
      type: "string",
      default: "selection",
      description: "settings.desc.renderWhitespace",
      enum: ["none", "boundary", "selection", "trailing", "all"],
      enumDescriptions: ["None", "Boundary", "Selection", "Trailing", "All"],
      tags: ["appearance", "display"],
      order: 103,
    },
    "bracketPairColorization": {
      type: "boolean",
      default: true,
      description: "settings.desc.bracketPairColorization",
      tags: ["appearance", "highlight"],
      order: 104,
    },
  },
};

/* ─── Appearance (Theme) Section ────────────────────── */

const appearanceConfiguration: IConfigurationNode = {
  id: "appearance",
  title: "settings.group.appearance",
  order: 0,
  properties: {
    "theme": {
      type: "string",
      default: "vs-dark",
      description: "settings.desc.theme",
      enum: ["vs-dark", "vs-light"],
      enumDescriptions: ["settings.option.dark", "settings.option.light"],
      tags: ["theme", "color"],
    },
  },
};

/* ─── AI Section ────────────────────────────────────── */

const aiConfiguration: IConfigurationNode = {
  id: "ai",
  title: "settings.group.ai",
  order: 50,
  properties: {
    "model": {
      type: "string",
      default: "deepseek-v4-pro",
      description: "settings.desc.aiModel",
      enum: [
        "deepseek-v4-pro",
        "deepseek-v4-flash",
        "gpt-4o",
        "gpt-4o-mini",
        "claude-sonnet",
        "claude-haiku",
        "gemini-pro",
        "deepseek-v3",
      ],
      enumDescriptions: [
        "DeepSeek V4 Pro",
        "DeepSeek V4 Flash",
        "GPT-4o",
        "GPT-4o Mini",
        "Claude Sonnet",
        "Claude Haiku",
        "Gemini Pro",
        "DeepSeek V3",
      ],
      tags: ["ai", "model"],
    },
    "maxSteps": {
      type: "number",
      default: 10,
      description: "ai.maxSteps",
      minimum: 1,
      maximum: 50,
      tags: ["ai", "agent"],
    },
    "temperature": {
      type: "number",
      default: 0.7,
      description: "ai.temperature",
      minimum: 0,
      maximum: 2,
      step: 0.1,
      tags: ["ai", "agent"],
    },
    "systemPrompt": {
      type: "string",
      default: "",
      description: "ai.systemPrompt",
      editPresentation: "multiline",
      tags: ["ai", "agent"],
    },
    "chatModel": {
      type: "string",
      default: "",
      description: "ai.chatModel",
      enum: ["", "gpt-4o", "gpt-4o-mini", "claude-sonnet", "claude-haiku", "gemini-pro", "deepseek-v3"],
      enumDescriptions: ["Auto (default)", "GPT-4o", "GPT-4o Mini", "Claude Sonnet", "Claude Haiku", "Gemini Pro", "DeepSeek V3"],
      tags: ["ai", "model"],
    },
  },
};

/* ─── Files Section ─────────────────────────────────── */

const filesConfiguration: IConfigurationNode = {
  id: "files",
  title: "settings.group.files",
  order: 20,
  properties: {
    "defaultLanguage": {
      type: "string",
      default: "plaintext",
      description: "files.defaultLanguage",
      tags: ["files", "editor"],
      order: 200,
    },
    "encoding": {
      type: "string",
      default: "utf8",
      description: "files.encoding",
      enum: ["utf8", "utf16le", "utf16be", "latin1"],
      enumDescriptions: ["UTF-8", "UTF-16 LE", "UTF-16 BE", "Latin 1"],
      tags: ["files"],
      order: 201,
    },
    "eol": {
      type: "string",
      default: "auto",
      description: "files.eol",
      enum: ["auto", "\n", "\r\n"],
      enumDescriptions: ["Auto", "LF (\\n)", "CRLF (\\r\\n)"],
      tags: ["files", "format"],
      order: 202,
    },
    "trimTrailingWhitespace": {
      type: "boolean",
      default: false,
      description: "files.trimTrailingWhitespace",
      tags: ["files", "format"],
      order: 203,
    },
    "insertFinalNewline": {
      type: "boolean",
      default: false,
      description: "files.insertFinalNewline",
      tags: ["files", "format"],
      order: 204,
    },
    "exclude": {
      type: "object",
      default: { "**/node_modules": true, "**/.git": true },
      description: "files.exclude",
      tags: ["files", "explorer"],
      order: 205,
    },
  },
};

/* ─── Terminal Section ──────────────────────────────── */

const terminalConfiguration: IConfigurationNode = {
  id: "terminal",
  title: "settings.group.terminal",
  order: 30,
  properties: {
    "fontSize": {
      type: "number",
      default: 13,
      description: "terminal.fontSize",
      minimum: 8,
      maximum: 24,
      tags: ["terminal", "font"],
    },
    "fontFamily": {
      type: "string",
      default: "'Cascadia Code', monospace",
      description: "terminal.fontFamily",
      tags: ["terminal", "font"],
    },
    "cursorBlinking": {
      type: "boolean",
      default: true,
      description: "terminal.cursorBlinking",
      tags: ["terminal"],
    },
  },
};

/* ─── Register All ──────────────────────────────────── */

export function registerDefaultConfigurations(): void {
  configurationRegistry.registerConfiguration(appearanceConfiguration);
  configurationRegistry.registerConfiguration(editorConfiguration);
  configurationRegistry.registerConfiguration(filesConfiguration);
  configurationRegistry.registerConfiguration(terminalConfiguration);
  configurationRegistry.registerConfiguration(aiConfiguration);
}
