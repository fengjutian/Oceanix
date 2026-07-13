// ---------------------------------------------------------------------------
// Oceanix Search QueryBuilder
// Translates UI state into a structured TextSearchQuery (or FileSearchQuery).
// Inspired by VSCode's QueryBuilder (services/search/common/queryBuilder.ts).
// ---------------------------------------------------------------------------

import type {
  TextSearchQuery,
  FileSearchQuery,
  FolderQuery,
  PatternInfo,
} from "./types";
import { QueryType } from "./types";

// ─── Builder input (UI state) ─────────────────────────

export interface QueryBuilderOptions {
  /** The raw text the user typed (may contain regex). */
  pattern: string;
  /** Whether to treat `pattern` as a regular expression. */
  isRegExp?: boolean;
  /** Whether to match case-sensitively. */
  isCaseSensitive?: boolean;
  /** Whether to match whole words only. */
  isWordMatch?: boolean;
  /** Root folder path to search under. */
  folderPath: string;
  /** Optional display name for the folder. */
  folderName?: string;
  /** Glob pattern for files to include. */
  includePattern?: string;
  /** Glob pattern for files to exclude. */
  excludePattern?: string;
  /** Max total results. */
  maxResults?: number;
}

// ─── Defaults ─────────────────────────────────────────

const DEFAULT_MAX_RESULTS = 50;

// ─── Regex special-char escape ────────────────────────

/**
 * Escape regex special characters so the pattern is treated literally.
 * Used when `isRegExp` is false.
 */
function escapeRegex(pattern: string): string {
  return pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── Public API ───────────────────────────────────────

/**
 * Build a full-text search query from UI options.
 */
export function buildTextSearchQuery(
  options: QueryBuilderOptions,
): TextSearchQuery {
  const rawPattern = options.pattern;

  const contentPattern: PatternInfo = {
    pattern: options.isRegExp ? rawPattern : escapeRegex(rawPattern),
    isRegExp: options.isRegExp ?? false,
    isCaseSensitive: options.isCaseSensitive ?? false,
    isWordMatch: options.isWordMatch ?? false,
  };

  const folderQuery: FolderQuery = {
    folder: options.folderPath,
    folderName: options.folderName ?? options.folderPath.split("/").pop() ?? options.folderPath,
    includePattern: options.includePattern,
    excludePattern: options.excludePattern,
  };

  return {
    type: QueryType.Text,
    folderQueries: [folderQuery],
    contentPattern,
    maxResults: options.maxResults ?? DEFAULT_MAX_RESULTS,
  };
}

/**
 * Build a file-name search query from UI options.
 * Used for "Quick Open" style search (Ctrl+P).
 */
export function buildFileSearchQuery(
  options: QueryBuilderOptions & { filePattern: string },
): FileSearchQuery {
  const folderQuery: FolderQuery = {
    folder: options.folderPath,
    folderName: options.folderName ?? options.folderPath.split("/").pop() ?? options.folderPath,
  };

  return {
    type: QueryType.File,
    folderQueries: [folderQuery],
    filePattern: options.filePattern,
    maxResults: options.maxResults ?? DEFAULT_MAX_RESULTS,
  };
}
