import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { ChevronDown, ChevronRight, File, FileText, FileImage, FileSpreadsheet, FileTerminal, FileLock, FileType2, Folder, FolderOpen, FolderCode, FolderCog, FolderGit, FolderKey, FolderHeart, Loader2, ChevronsUpDown, Code2, Braces, Bug, Database, Globe, Palette, Package, Puzzle, Server, Settings2, Shield, TestTube, Zap, Box, FileVolume, Gem, Coffee, BookOpen, Container, Archive, FileClock, FileSignature } from "lucide-react";
import type { FileNode, FileTreeProps } from "./types";
import type { LucideIcon } from "lucide-react";

// ---------------------------------------------------------------------------
// VS Code–inspired inline styles
// ---------------------------------------------------------------------------

const COLORS = {
  bg: "#252526",
  text: "#cccccc",
  textDim: "#8a8a8a",
  hover: "#2a2d2e",
  active: "#37373d",
  activeSelected: "#094771",
  focusBorder: "#007acc",
  guide: "#383838",
  gitModified: "#e2b714",
  gitAdded: "#73c991",
  gitDeleted: "#f14c4c",
  gitUntracked: "#6ca3a5",
  gitIgnored: "#5a5a5a",
  fontFamily:
    '"Segoe UI", "SF Mono", "Cascadia Code", "Consolas", "Fira Code", monospace',
};

const TREE = {
  rowHeight: 22,
  indentWidth: 10,
  fontSize: 13,
};

// ---------------------------------------------------------------------------
// VS Code Seti–inspired icon mapping with colors
// ---------------------------------------------------------------------------

interface IconMeta {
  icon: LucideIcon;
  color: string;
}

// Seti-inspired color palette
const SETI = {
  blue:        "#519aba",
  green:       "#8dc149",
  orange:      "#e37926",
  purple:      "#a074c4",
  red:         "#cc3e44",
  yellow:      "#cbcb41",
  pink:        "#f55385",
  cyan:        "#4dbed4",
  grey:        "#6d8086",
  lime:        "#a2cc3c",
  brown:       "#c07744",
  white:       "#d4d7d6",
  violet:      "#b180c7",
  teal:        "#519aba",
  mustard:     "#cbcb41",
  rust:        "#cc3e44",
};

/**
 * Map a directory name to a specialized folder icon (matching VSCode Seti).
 */
function folderIcon(dirName: string, expanded: boolean): IconMeta {
  const lower = dirName.toLowerCase();

  // Source / code folders
  if (/^(src|source|sources|lib|app)$/.test(lower))
    return { icon: expanded ? FolderCode : FolderCode, color: SETI.blue };
  // Test folders
  if (/^(test|tests|spec|specs|__tests__|__mocks__|__fixtures__|e2e|integration)$/.test(lower))
    return { icon: expanded ? FolderHeart : FolderHeart, color: SETI.green };
  // Config folders
  if (/^(config|configs|configuration|\.config|settings)$/.test(lower))
    return { icon: expanded ? FolderCog : FolderCog, color: SETI.grey };
  // Git folders
  if (/^(\.github|\.git)$/.test(lower))
    return { icon: expanded ? FolderGit : FolderGit, color: SETI.grey };
  // Secret/key folders
  if (/^(secrets|keys|certs|certificates|\.ssh)$/.test(lower))
    return { icon: expanded ? FolderKey : FolderKey, color: SETI.orange };
  // Components
  if (/^(components?|widgets|ui|elements|views|pages|layouts|modules)$/.test(lower))
    return { icon: expanded ? Box : Box, color: SETI.purple };
  // Hooks
  if (/^(hooks?|composables|middleware|plugins?|services?|stores?|utils?|helpers?|lib)$/.test(lower))
    return { icon: expanded ? Puzzle : Puzzle, color: SETI.yellow };
  // Styles
  if (/^(styles?|css|scss|sass|less|themes?|theme)$/.test(lower))
    return { icon: expanded ? Palette : Palette, color: SETI.pink };
  // Assets
  if (/^(assets?|public|static|images?|img|media|icons?|fonts?|svg)$/.test(lower))
    return { icon: expanded ? Gem : Gem, color: SETI.orange };
  // Documentation
  if (/^(docs?|documentation|wiki|guides?|examples?|samples?)$/.test(lower))
    return { icon: expanded ? BookOpen : BookOpen, color: SETI.blue };
  // Build / dist
  if (/^(dist|build|out|output|\.next|\.nuxt|target)$/.test(lower))
    return { icon: expanded ? Archive : Archive, color: SETI.grey };
  // Database
  if (/^(db|database|migrations?|prisma|models?|schemas?)$/.test(lower))
    return { icon: expanded ? Database : Database, color: SETI.cyan };
  // API
  if (/^(api|apis|routes?|endpoints?|graphql)$/.test(lower))
    return { icon: expanded ? Server : Server, color: SETI.purple };
  // i18n / locales
  if (/^(i18n|locales?|translations?|lang|languages?)$/.test(lower))
    return { icon: expanded ? Globe : Globe, color: SETI.blue };
  // Docker / container
  if (/^(docker|containers?|k8s|kubernetes)$/.test(lower))
    return { icon: expanded ? Container : Container, color: SETI.blue };
  // Node modules
  if (lower === "node_modules")
    return { icon: expanded ? FolderCode : FolderCode, color: SETI.grey };

  // Default folder
  return { icon: expanded ? FolderOpen : Folder, color: SETI.yellow };
}

/**
 * Map a file (by name + extension) to an icon + color, VSCode Seti style.
 */
function fileIcon(fileName: string, extension?: string): IconMeta {
  const lower = fileName.toLowerCase();

  // ─── Special filenames (full match) ──────────────────────────
  const exactFileIcons: Record<string, IconMeta> = {
    // Package managers
    "package.json":        { icon: Package,     color: SETI.red },
    "package-lock.json":   { icon: Package,     color: SETI.grey },
    "yarn.lock":           { icon: Package,     color: SETI.grey },
    "pnpm-lock.yaml":      { icon: Package,     color: SETI.grey },
    "pnpm-workspace.yaml": { icon: Package,     color: SETI.grey },
    "cargo.toml":          { icon: Package,     color: SETI.rust },
    "cargo.lock":          { icon: Package,     color: SETI.grey },
    "composer.json":       { icon: Package,     color: SETI.yellow },
    "gemfile":             { icon: Gem,         color: SETI.red },

    // TypeScript config
    "tsconfig.json":       { icon: Braces,      color: SETI.blue },
    "tsconfig.node.json":  { icon: Braces,      color: SETI.blue },
    "jsconfig.json":       { icon: Braces,      color: SETI.yellow },

    // Build tools / bundlers
    "vite.config.ts":      { icon: Zap,         color: SETI.purple },
    "vite.config.js":      { icon: Zap,         color: SETI.yellow },
    "webpack.config.js":   { icon: Box,         color: SETI.blue },
    "rollup.config.js":    { icon: Box,         color: SETI.orange },
    "turbo.json":          { icon: Zap,         color: SETI.purple },
    "lerna.json":          { icon: Package,     color: SETI.purple },
    "nx.json":             { icon: Puzzle,      color: SETI.blue },

    // Linters / Formatters
    "eslint.config.js":    { icon: Shield,      color: SETI.purple },
    "eslint.config.mjs":   { icon: Shield,      color: SETI.purple },
    ".eslintrc.js":        { icon: Shield,      color: SETI.purple },
    ".eslintrc.json":      { icon: Shield,      color: SETI.purple },
    ".eslintrc.yaml":      { icon: Shield,      color: SETI.purple },
    ".eslintrc":           { icon: Shield,      color: SETI.purple },
    ".eslintignore":       { icon: Shield,      color: SETI.grey },
    ".prettierrc":         { icon: Palette,     color: SETI.pink },
    ".prettierrc.json":    { icon: Palette,     color: SETI.pink },
    ".prettierrc.js":      { icon: Palette,     color: SETI.pink },
    ".prettierrc.yaml":    { icon: Palette,     color: SETI.pink },
    "prettier.config.js":  { icon: Palette,     color: SETI.pink },
    ".prettierignore":     { icon: Palette,     color: SETI.grey },
    ".stylelintrc":        { icon: Palette,     color: SETI.pink },

    // Testing
    "jest.config.js":      { icon: TestTube,    color: SETI.green },
    "jest.config.ts":      { icon: TestTube,    color: SETI.green },
    "vitest.config.ts":    { icon: TestTube,    color: SETI.green },
    "vitest.config.js":    { icon: TestTube,    color: SETI.green },
    "playwright.config.ts":{ icon: Bug,         color: SETI.green },
    "playwright.config.js":{ icon: Bug,         color: SETI.green },
    "cypress.config.ts":   { icon: Bug,         color: SETI.green },
    "cypress.config.js":   { icon: Bug,         color: SETI.green },

    // Babel
    "babel.config.js":     { icon: Braces,      color: SETI.yellow },
    "babel.config.json":   { icon: Braces,      color: SETI.yellow },
    ".babelrc":            { icon: Braces,      color: SETI.yellow },
    ".babelrc.json":       { icon: Braces,      color: SETI.yellow },

    // Tailwind / PostCSS
    "tailwind.config.ts":  { icon: Palette,     color: SETI.cyan },
    "tailwind.config.js":  { icon: Palette,     color: SETI.cyan },
    "postcss.config.js":   { icon: Palette,     color: SETI.purple },
    "postcss.config.mjs":  { icon: Palette,     color: SETI.purple },

    // Docker
    "dockerfile":          { icon: Container,   color: SETI.blue },
    "docker-compose.yml":  { icon: Container,   color: SETI.blue },
    "docker-compose.yaml": { icon: Container,   color: SETI.blue },
    ".dockerignore":       { icon: Container,   color: SETI.grey },

    // CI / CD
    ".travis.yml":         { icon: Settings2,   color: SETI.orange },
    ".circleci/config.yml":{ icon: Settings2,   color: SETI.orange },
    "jenkinsfile":         { icon: Settings2,   color: SETI.orange },

    // Project docs
    "readme.md":           { icon: BookOpen,    color: SETI.blue },
    "readme":              { icon: BookOpen,    color: SETI.blue },
    "changelog.md":        { icon: FileClock,   color: SETI.blue },
    "changelog":           { icon: FileClock,   color: SETI.blue },
    "contributing.md":     { icon: BookOpen,    color: SETI.blue },
    "code_of_conduct.md":  { icon: BookOpen,    color: SETI.blue },
    "security.md":         { icon: Shield,      color: SETI.red },

    // License
    "license":             { icon: FileSignature, color: SETI.yellow },
    "license.md":          { icon: FileSignature, color: SETI.yellow },
    "licence":             { icon: FileSignature, color: SETI.yellow },

    // Git
    ".gitignore":          { icon: FolderGit,   color: SETI.grey },
    ".gitattributes":      { icon: FolderGit,   color: SETI.grey },
    ".gitmodules":         { icon: FolderGit,   color: SETI.grey },
    ".gitkeep":            { icon: FolderGit,   color: SETI.grey },

    // Environment
    ".env":                { icon: FileLock,    color: SETI.yellow },
    ".env.local":          { icon: FileLock,    color: SETI.yellow },
    ".env.development":    { icon: FileLock,    color: SETI.yellow },
    ".env.production":     { icon: FileLock,    color: SETI.yellow },
    ".env.test":           { icon: FileLock,    color: SETI.yellow },
    ".env.example":        { icon: FileLock,    color: SETI.grey },

    // Editor / IDE
    ".editorconfig":       { icon: Settings2,   color: SETI.grey },

    // Build
    "makefile":            { icon: Settings2,   color: SETI.orange },
    "gnumakefile":         { icon: Settings2,   color: SETI.orange },

    // Lock files
    // (pnpm-lock.yaml, cargo.toml, cargo.lock, package-lock, yarn.lock — already covered above)

    // Other configs
    "vercel.json":         { icon: Globe,       color: SETI.grey },
    "netlify.toml":        { icon: Globe,       color: SETI.cyan },
    "fly.toml":            { icon: Globe,       color: SETI.purple },
    "wrangler.toml":       { icon: Globe,       color: SETI.orange },
    "cloudbuild.yaml":     { icon: Globe,       color: SETI.blue },

    // Rust specific
    "main.rs":             { icon: Code2,       color: SETI.rust },
    "lib.rs":              { icon: Code2,       color: SETI.rust },
    "mod.rs":              { icon: Code2,       color: SETI.rust },

    // Go specific
    "go.mod":              { icon: Package,     color: SETI.cyan },
    "go.sum":              { icon: Package,     color: SETI.grey },
  };

  // Check exact filename match
  const exact = exactFileIcons[lower];
  if (exact) return exact;

  // Check prefix patterns (e.g., "tsconfig.*.json")
  if (/^tsconfig\..+\.json$/.test(lower)) return { icon: Braces, color: SETI.blue };

  // ─── Extension-based mappings ────────────────────────────────
  if (!extension) return { icon: File, color: SETI.white };

  const ext = extension.toLowerCase();

  // Rust
  if (ext === "rs") return { icon: Code2, color: SETI.rust };

  // Go
  if (ext === "go") return { icon: Code2, color: SETI.cyan };

  // Python
  if (ext === "py" || ext === "pyw" || ext === "pyx" || ext === "pxd" || ext === "pxi") return { icon: Code2, color: SETI.blue };
  if (ext === "ipynb") return { icon: BookOpen, color: SETI.orange };

  // JavaScript / TypeScript
  if (ext === "ts" || ext === "mts" || ext === "cts") return { icon: Code2, color: SETI.blue };
  if (ext === "tsx") return { icon: Code2, color: SETI.blue };
  if (ext === "js" || ext === "mjs" || ext === "cjs") return { icon: Code2, color: SETI.yellow };
  if (ext === "jsx") return { icon: Code2, color: SETI.blue };

  // Java
  if (ext === "java" || ext === "class" || ext === "jar") return { icon: Coffee, color: SETI.orange };
  // Kotlin
  if (ext === "kt" || ext === "kts") return { icon: Code2, color: SETI.orange };
  // Scala
  if (ext === "scala" || ext === "sc") return { icon: Code2, color: SETI.red };
  // Swift
  if (ext === "swift") return { icon: Code2, color: SETI.orange };
  // Dart
  if (ext === "dart") return { icon: Code2, color: SETI.cyan };

  // C / C++
  if (ext === "c" || ext === "h") return { icon: Code2, color: SETI.blue };
  if (ext === "cpp" || ext === "cc" || ext === "cxx" || ext === "hpp" || ext === "hh" || ext === "hxx") return { icon: Code2, color: SETI.purple };
  // C#
  if (ext === "cs" || ext === "csx") return { icon: Code2, color: SETI.blue };
  // F#
  if (ext === "fs" || ext === "fsx" || ext === "fsi") return { icon: Code2, color: SETI.blue };

  // Ruby
  if (ext === "rb" || ext === "erb") return { icon: Gem, color: SETI.red };
  // PHP
  if (ext === "php" || ext === "phtml") return { icon: Code2, color: SETI.purple };
  // Lua
  if (ext === "lua") return { icon: Code2, color: SETI.blue };
  // R
  if (ext === "r" || ext === "rmd" || ext === "rproj") return { icon: Code2, color: SETI.blue };
  // Perl
  if (ext === "pl" || ext === "pm") return { icon: Code2, color: SETI.blue };
  // Elm
  if (ext === "elm") return { icon: Code2, color: SETI.cyan };
  // Haskell
  if (ext === "hs" || ext === "lhs") return { icon: Code2, color: SETI.purple };
  // Nim
  if (ext === "nim") return { icon: Code2, color: SETI.yellow };
  // Zig
  if (ext === "zig") return { icon: Code2, color: SETI.orange };
  // Solidity
  if (ext === "sol") return { icon: Code2, color: SETI.grey };
  // V
  if (ext === "v") return { icon: Code2, color: SETI.blue };

  // Elixir
  if (ext === "ex" || ext === "exs" || ext === "eex" || ext === "leex") return { icon: Code2, color: SETI.purple };

  // JSON
  if (ext === "json" || ext === "jsonc" || ext === "json5") return { icon: Braces, color: SETI.yellow };
  // YAML / TOML / XML
  if (ext === "yaml" || ext === "yml") return { icon: Braces, color: SETI.red };
  if (ext === "toml") return { icon: Braces, color: SETI.grey };
  if (ext === "xml" || ext === "xsl" || ext === "xsd" || ext === "svg") return { icon: Braces, color: SETI.orange };
  if (ext === "graphql" || ext === "gql") return { icon: Braces, color: SETI.pink };

  // Styles
  if (ext === "css" || ext === "pcss") return { icon: Palette, color: SETI.blue };
  if (ext === "scss" || ext === "sass") return { icon: Palette, color: SETI.pink };
  if (ext === "less") return { icon: Palette, color: SETI.blue };
  if (ext === "styl" || ext === "stylus") return { icon: Palette, color: SETI.green };

  // Markup / Templates
  if (ext === "html" || ext === "htm") return { icon: Globe, color: SETI.orange };
  if (ext === "vue") return { icon: Code2, color: SETI.green };
  if (ext === "svelte") return { icon: Code2, color: SETI.orange };
  if (ext === "astro") return { icon: Code2, color: SETI.purple };
  if (ext === "jinja" || ext === "jinja2" || ext === "hbs" || ext === "ejs" || ext === "pug" || ext === "jade") return { icon: Globe, color: SETI.orange };

  // MD / docs
  if (ext === "md" || ext === "mdx" || ext === "markdown") return { icon: BookOpen, color: SETI.blue };
  if (ext === "txt" || ext === "log") return { icon: FileText, color: SETI.white };
  if (ext === "rst" || ext === "tex" || ext === "wiki") return { icon: FileText, color: SETI.blue };

  // Images
  if (ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "gif" || ext === "ico" || ext === "webp" || ext === "bmp" || ext === "tiff" || ext === "avif" || ext === "svg") return { icon: FileImage, color: SETI.purple };

  // Audio / Video
  if (ext === "mp3" || ext === "wav" || ext === "ogg" || ext === "flac" || ext === "aac" || ext === "wma") return { icon: FileVolume, color: SETI.purple };
  if (ext === "mp4" || ext === "webm" || ext === "avi" || ext === "mov" || ext === "mkv" || ext === "wmv") return { icon: FileVolume, color: SETI.purple };

  // Fonts
  if (ext === "ttf" || ext === "otf" || ext === "woff" || ext === "woff2" || ext === "eot") return { icon: FileType2, color: SETI.red };

  // Archives
  if (ext === "zip" || ext === "tar" || ext === "gz" || ext === "bz2" || ext === "xz" || ext === "7z" || ext === "rar" || ext === "tgz") return { icon: Archive, color: SETI.grey };

  // Spreadsheets / data
  if (ext === "csv" || ext === "tsv") return { icon: FileSpreadsheet, color: SETI.green };
  if (ext === "xls" || ext === "xlsx" || ext === "ods") return { icon: FileSpreadsheet, color: SETI.green };

  // Shell scripts
  if (ext === "sh" || ext === "bash" || ext === "zsh" || ext === "fish") return { icon: FileTerminal, color: SETI.green };
  if (ext === "ps1" || ext === "psm1" || ext === "psd1" || ext === "bat" || ext === "cmd") return { icon: FileTerminal, color: SETI.blue };

  // SQL / Database
  if (ext === "sql" || ext === "sqlite" || ext === "db") return { icon: Database, color: SETI.cyan };
  if (ext === "prisma") return { icon: Database, color: SETI.purple };

  // Protocol Buffers
  if (ext === "proto") return { icon: Braces, color: SETI.red };

  // Nix
  if (ext === "nix") return { icon: Package, color: SETI.blue };

  // Gradle
  if (ext === "gradle" || ext === "gradle.kts") return { icon: Settings2, color: SETI.cyan };

  // Default
  return { icon: File, color: SETI.white };
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  container: {
    height: "100%",
    overflow: "auto",
    background: COLORS.bg,
    color: COLORS.text,
    fontFamily: COLORS.fontFamily,
    fontSize: TREE.fontSize,
    userSelect: "none" as const,
    WebkitUserSelect: "none" as const,
    cursor: "default",
    outline: "none",
  },

  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "4px 8px",
    fontSize: 11,
    fontWeight: 600 as const,
    color: COLORS.textDim,
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
    borderBottom: `1px solid ${COLORS.guide}`,
  },

  headerBtn: {
    background: "none",
    border: "none",
    color: COLORS.textDim,
    cursor: "pointer",
    fontSize: 14,
    padding: "0 4px",
    lineHeight: 1,
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 3,
  } satisfies React.CSSProperties,

  row: {
    base: {
      display: "flex",
      alignItems: "center",
      height: TREE.rowHeight,
      lineHeight: `${TREE.rowHeight}px`,
      paddingRight: 8,
      whiteSpace: "nowrap" as const,
      cursor: "pointer",
    } satisfies React.CSSProperties,
  },

  indentGuide: {
    display: "inline-block",
    width: 1,
    height: TREE.rowHeight,
    background: COLORS.guide,
    flexShrink: 0,
  } satisfies React.CSSProperties,

  indentSpacer: {
    display: "inline-block",
    width: TREE.indentWidth,
    height: TREE.rowHeight,
    flexShrink: 0,
  } satisfies React.CSSProperties,

  twistie: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: TREE.indentWidth,
    height: TREE.rowHeight,
    flexShrink: 0,
    fontSize: 10,
    color: COLORS.textDim,
  } satisfies React.CSSProperties,

  icon: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 18,
    height: TREE.rowHeight,
    flexShrink: 0,
  } satisfies React.CSSProperties,

  label: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  } satisfies React.CSSProperties,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function gitColor(status: FileNode["gitStatus"]): string {
  switch (status) {
    case "modified": return COLORS.gitModified;
    case "added": return COLORS.gitAdded;
    case "deleted": return COLORS.gitDeleted;
    case "untracked": return COLORS.gitUntracked;
    case "ignored": return COLORS.gitIgnored;
    default: return COLORS.text;
  }
}

function sortTree(nodes: FileNode[]): FileNode[] {
  return [...nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

// ---------------------------------------------------------------------------
// Indent guides
// ---------------------------------------------------------------------------

const IndentGuides: React.FC<{ depth: number }> = React.memo(({ depth }) => {
  if (depth <= 0) return null;
  return (
    <>
      {Array.from({ length: depth }, (_, i) => (
        <span key={i} style={styles.indentSpacer} />
      ))}
    </>
  );
});
IndentGuides.displayName = "IndentGuides";

// ---------------------------------------------------------------------------
// Flatten visible tree for keyboard navigation
// ---------------------------------------------------------------------------

interface FlatItem {
  node: FileNode;
  depth: number;
}

function flattenVisible(
  node: FileNode,
  expandedDirs: Set<string>,
  depth: number,
  result: FlatItem[],
): void {
  result.push({ node, depth });
  if (node.type === "directory" && node.children && expandedDirs.has(node.path)) {
    for (const child of sortTree(node.children)) {
      flattenVisible(child, expandedDirs, depth + 1, result);
    }
  }
}

// ---------------------------------------------------------------------------
// Tree context
// ---------------------------------------------------------------------------

interface TreeContextValue {
  expandedDirs: Set<string>;
  toggleDir: (path: string) => void;
  activePath: string | null;
  setActivePath: (path: string | null) => void;
  onExpandDir: ((path: string) => Promise<FileNode[] | void>) | undefined;
}

const TreeContext = React.createContext<TreeContextValue | null>(null);

function useTreeState(): TreeContextValue {
  const ctx = React.useContext(TreeContext);
  if (!ctx) throw new Error("useTreeState must be used within a FileTree");
  return ctx;
}

// ---------------------------------------------------------------------------
// TreeNode
// ---------------------------------------------------------------------------

interface TreeNodeProps {
  node: FileNode;
  depth: number;
  expanded: boolean;
  onOpenFile: ((path: string) => void) | undefined;
  onContextMenu: FileTreeProps["onContextMenu"];
  onToggle: (path: string) => void;
}

const TreeNode: React.FC<TreeNodeProps> = React.memo(
  ({ node, depth, expanded, onOpenFile, onContextMenu, onToggle }) => {
    const { activePath, setActivePath, onExpandDir } = useTreeState();
    const isDir = node.type === "directory";
    const isActive = activePath === node.path;

    const handleClick = useCallback(() => {
      setActivePath(node.path);
      if (isDir) {
        onToggle(node.path);
      } else {
        onOpenFile?.(node.path);
      }
    }, [isDir, node.path, onToggle, onOpenFile, setActivePath]);

    const handleContextMenu = useCallback(
      (e: React.MouseEvent) => {
        setActivePath(node.path);
        onContextMenu?.(node, e);
      },
      [node, onContextMenu, setActivePath],
    );

    // On first expand of an unloaded directory, trigger lazy load
    useEffect(() => {
      if (isDir && expanded && !node.childrenLoaded && !node.isLoading && onExpandDir) {
        onExpandDir(node.path);
      }
    }, [isDir, expanded, node.childrenLoaded, node.isLoading, node.path, onExpandDir]);

    const rowStyle: React.CSSProperties = {
      ...styles.row.base,
      paddingLeft: 0,
      color: gitColor(node.gitStatus),
      background: isActive ? COLORS.active : undefined,
    };

    // Icon + color (VSCode Seti style)
    const meta: IconMeta = isDir
      ? folderIcon(node.name, expanded)
      : fileIcon(node.name, node.extension);
    const IconComp = meta.icon;
    const iconColor = meta.color;
    const iconEl = isDir && node.isLoading
      ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite", color: iconColor } as React.CSSProperties} />
      : <IconComp size={16} color={iconColor} style={{ flexShrink: 0 }} />;

    return (
      <>
        <div
          style={rowStyle}
          onClick={handleClick}
          onContextMenu={handleContextMenu}
          role="treeitem"
          aria-expanded={isDir ? expanded : undefined}
          aria-selected={isActive}
          data-path={node.path}
        >
          {depth > 0 && <IndentGuides depth={depth} />}

          <span style={styles.twistie}>
            {isDir ? (expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : null}
          </span>

          <span style={styles.icon}>{iconEl}</span>

          <span style={styles.label}>{node.name}</span>
        </div>

        {isDir && expanded && node.children && (
          <ChildrenRenderer
            nodes={node.children}
            depth={depth + 1}
            onOpenFile={onOpenFile}
            onContextMenu={onContextMenu}
          />
        )}
      </>
    );
  },
);
TreeNode.displayName = "TreeNode";

// ---------------------------------------------------------------------------
// ChildrenRenderer
// ---------------------------------------------------------------------------

interface ChildrenRendererProps {
  nodes: FileNode[];
  depth: number;
  onOpenFile: ((path: string) => void) | undefined;
  onContextMenu: FileTreeProps["onContextMenu"];
}

const ChildrenRenderer: React.FC<ChildrenRendererProps> = React.memo(
  ({ nodes, depth, onOpenFile, onContextMenu }) => {
    const { expandedDirs, toggleDir } = useTreeState();

    return (
      <>
        {sortTree(nodes).map((child) => (
          <TreeNode
            key={child.path}
            node={child}
            depth={depth}
            expanded={expandedDirs.has(child.path)}
            onToggle={toggleDir}
            onOpenFile={onOpenFile}
            onContextMenu={onContextMenu}
          />
        ))}
      </>
    );
  },
);
ChildrenRenderer.displayName = "ChildrenRenderer";

// ---------------------------------------------------------------------------
// Public FileTree component
// ---------------------------------------------------------------------------

export const FileTree: React.FC<FileTreeProps> = ({
  root,
  onOpenFile,
  onContextMenu,
  onExpandDir,
  activePath: externalActive,
  onSetActive,
  onRefresh,
  height = "100%",
}) => {
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(
    () => new Set([root.path]),
  );
  const [internalActive, setInternalActive] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const activePath = externalActive !== undefined ? externalActive : internalActive;

  const setActivePath = useCallback((path: string | null) => {
    setInternalActive(path);
    onSetActive?.(path);
  }, [onSetActive]);

  const toggleDir = useCallback((path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const collapseAll = useCallback(() => {
    setExpandedDirs(new Set([root.path]));
    setActivePath(root.path);
  }, [root.path, setActivePath]);

  // Build flat list of visible items for keyboard navigation
  const flatItems = useMemo<FlatItem[]>(() => {
    const result: FlatItem[] = [];
    flattenVisible(root, expandedDirs, 0, result);
    return result;
  }, [root, expandedDirs]);

  // Keyboard navigation (VS Code–style)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const currentIdx = flatItems.findIndex((f) => f.node.path === activePath);

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          const nextIdx = Math.min(currentIdx + 1, flatItems.length - 1);
          if (nextIdx >= 0) {
            setActivePath(flatItems[nextIdx].node.path);
            // Scroll into view
            const el = containerRef.current?.querySelector(`[data-path="${flatItems[nextIdx].node.path}"]`);
            el?.scrollIntoView({ block: "nearest" });
          }
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          const prevIdx = Math.max(currentIdx - 1, 0);
          if (prevIdx >= 0) {
            setActivePath(flatItems[prevIdx].node.path);
            const el = containerRef.current?.querySelector(`[data-path="${flatItems[prevIdx].node.path}"]`);
            el?.scrollIntoView({ block: "nearest" });
          }
          break;
        }
        case "ArrowRight": {
          e.preventDefault();
          if (currentIdx >= 0) {
            const item = flatItems[currentIdx];
            if (item.node.type === "directory") {
              if (!expandedDirs.has(item.node.path)) {
                toggleDir(item.node.path);
              }
            }
          }
          break;
        }
        case "ArrowLeft": {
          e.preventDefault();
          if (currentIdx >= 0) {
            const item = flatItems[currentIdx];
            if (item.node.type === "directory" && expandedDirs.has(item.node.path)) {
              toggleDir(item.node.path);
            }
          }
          break;
        }
        case "Enter": {
          e.preventDefault();
          if (currentIdx >= 0) {
            const item = flatItems[currentIdx];
            if (item.node.type === "directory") {
              toggleDir(item.node.path);
            } else {
              onOpenFile?.(item.node.path);
            }
          }
          break;
        }
        case " ":
        case "Space": {
          e.preventDefault();
          if (currentIdx >= 0) {
            const item = flatItems[currentIdx];
            if (item.node.type === "directory") {
              toggleDir(item.node.path);
            }
          }
          break;
        }
        case "Home": {
          e.preventDefault();
          if (flatItems.length > 0) {
            setActivePath(flatItems[0].node.path);
            const el = containerRef.current?.querySelector(`[data-path="${flatItems[0].node.path}"]`);
            el?.scrollIntoView({ block: "nearest" });
          }
          break;
        }
        case "End": {
          e.preventDefault();
          if (flatItems.length > 0) {
            const last = flatItems[flatItems.length - 1];
            setActivePath(last.node.path);
            const el = containerRef.current?.querySelector(`[data-path="${last.node.path}"]`);
            el?.scrollIntoView({ block: "nearest" });
          }
          break;
        }
      }
    },
    [flatItems, activePath, expandedDirs, toggleDir, onOpenFile, setActivePath],
  );

  const ctx: TreeContextValue = { expandedDirs, toggleDir, activePath, setActivePath, onExpandDir };

  return (
    <>
      {/* Inject spinner keyframes for loading icon — only once */}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <TreeContext.Provider value={ctx}>
        {/* Header toolbar */}
        <div style={styles.header}>
          <span>Explorer</span>
          <div style={{ display: "flex", gap: 2 }}>
            <button
              style={styles.headerBtn}
              onClick={collapseAll}
              title="Collapse All"
            >
              <ChevronsUpDown size={14} />
            </button>
            <button
              style={styles.headerBtn}
              onClick={onRefresh}
              title="Refresh"
            >
              ↻
            </button>
          </div>
        </div>

        {/* Tree */}
        <div
          ref={containerRef}
          style={{ ...styles.container, height: `calc(${typeof height === "number" ? height + "px" : height} - 29px)` }}
          role="tree"
          aria-label="File tree"
          tabIndex={0}
          onKeyDown={handleKeyDown}
        >
          <TreeNode
            node={root}
            depth={0}
            expanded={expandedDirs.has(root.path)}
            onToggle={toggleDir}
            onOpenFile={onOpenFile}
            onContextMenu={onContextMenu}
          />
        </div>
      </TreeContext.Provider>
    </>
  );
};

FileTree.displayName = "FileTree";
