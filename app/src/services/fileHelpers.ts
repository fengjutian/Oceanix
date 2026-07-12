/**
 * Shared file-type helpers — avoids duplicating extension/mime/language maps
 * across Sidebar, App, ProblemsPanel, etc.
 */

const IMG_EXTS = new Set(["png", "jpg", "jpeg", "gif", "svg", "ico", "webp", "bmp", "tiff", "avif"]);

const MIME_MAP: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  gif: "image/gif", svg: "image/svg+xml", ico: "image/x-icon",
  webp: "image/webp", bmp: "image/bmp", tiff: "image/tiff",
  avif: "image/avif",
};

const LANG_MAP: Record<string, string> = {
  ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
  rs: "rust", json: "json", md: "markdown", css: "css", html: "html",
  py: "python", java: "java", go: "go", sql: "sql", scss: "scss", less: "less",
  vue: "html",
};

const LSP_LANGS = new Set(["rust", "python", "typescript", "typescriptreact", "javascript"]);

export function isImageExt(ext: string): boolean {
  return IMG_EXTS.has(ext.toLowerCase());
}

export function imageMimeType(ext: string): string {
  return MIME_MAP[ext.toLowerCase()] || "application/octet-stream";
}

export function languageFromExt(ext: string): string {
  return LANG_MAP[ext.toLowerCase()] || "plaintext";
}

export function isLspLang(lang: string): boolean {
  return LSP_LANGS.has(lang);
}
