// ---------------------------------------------------------------------------
// Oceanix Search Types — inspired by VSCode's search.ts type hierarchy
// ---------------------------------------------------------------------------

// ─── Query types ──────────────────────────────────────

/** The kind of search to perform. */
export const enum QueryType {
  File = 1,
  Text = 2,
}

/**
 * Search pattern options.
 * Mirrors VSCode's IPatternInfo but simplified for Oceanix.
 */
export interface PatternInfo {
  /** The raw search string (or regex pattern if isRegExp is true). */
  pattern: string;
  /** Whether `pattern` is a regular expression. */
  isRegExp?: boolean;
  /** Match whole words only. */
  isWordMatch?: boolean;
  /** Case-sensitive matching. */
  isCaseSensitive?: boolean;
}

// ─── Folder query ─────────────────────────────────────

export interface FolderQuery {
  /** Absolute path to the folder to search under. */
  folder: string;
  /** Display name for the folder (used in tree view). */
  folderName?: string;
  /** Glob pattern for files to include. */
  includePattern?: string;
  /** Glob pattern for files to exclude. */
  excludePattern?: string;
}

// ─── Text search query ────────────────────────────────

export interface TextSearchQuery {
  type: QueryType.Text;
  /** One or more folders to search under. */
  folderQueries: FolderQuery[];
  /** The search pattern with options. */
  contentPattern: PatternInfo;
  /** Max total results to return. */
  maxResults?: number;
  /** Number of surrounding context lines above/below each match. */
  surroundingContext?: number;
  /** Max file size in bytes to search. */
  maxFileSize?: number;
}

// ─── File search query ────────────────────────────────

export interface FileSearchQuery {
  type: QueryType.File;
  folderQueries: FolderQuery[];
  /** File name / glob pattern, e.g. "*.ts" or "readme". */
  filePattern: string;
  maxResults?: number;
}

// ─── Union type ───────────────────────────────────────

export type SearchQuery = TextSearchQuery | FileSearchQuery;

// ─── Result types (tree model) ────────────────────────

/**
 * A single match within a file.
 * Mirrors VSCode's ITextSearchMatch.
 */
export interface SearchMatch {
  /** 1-based line number. */
  lineNumber: number;
  /** 1-based column of the match start. */
  column: number;
  /** The line text containing the match. */
  lineText: string;
  /** 0-based byte offset of the match start within lineText. */
  matchStart: number;
  /** 0-based byte offset of the match end within lineText. */
  matchEnd: number;
}

/**
 * A file that contains one or more matches.
 * Mirrors VSCode's IFileMatch but simplified.
 */
export interface FileMatch {
  /** Absolute path to the file. */
  filePath: string;
  /** The base name of the file (for display). */
  fileName: string;
  /** Relative path from the search root to the file. */
  relativePath: string;
  /** The folder query that produced this result. */
  folderName: string;
  /** Matches within this file. */
  matches: SearchMatch[];
}

/**
 * Completion status of a search.
 * Mirrors VSCode's ISearchComplete.
 */
export interface SearchComplete {
  results: FileMatch[];
  /** Whether the search hit the maxResults limit. */
  limitHit: boolean;
  /** Total count of matches before truncation. */
  totalMatchCount: number;
}

// ─── Shared serialized form (over the wire) ───────────

/**
 * Raw match as returned by the Tauri backend.
 * The frontend transforms this into the tree model.
 */
export interface RawSearchMatch {
  file: string;
  line: number;
  column: number;
  text: string;
}
