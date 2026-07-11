"""RAG module — codebase indexing and semantic search.

Uses a lightweight approach with incremental indexing:
- Filesystem walker for code discovery
- Content-aware chunking (function/class boundaries)
- TF-IDF + BM25-style scoring (no external vector DB required)
- File hash tracking for incremental updates
- JSON cache for fast startup

Upgrade path: replace `_score_chunk` with embedding + Qdrant local.
"""

import os
import json
import re
import hashlib
from pathlib import Path
from typing import Optional
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from loguru import logger

# ── Config ──────────────────────────────────────────────

SKIP_DIRS = {
    ".git", "node_modules", "target", "dist", "build",
    "__pycache__", ".venv", "venv", ".idea", ".vscode",
    ".next", ".turbo", "coverage", ".pytest_cache",
    ".oceanix",
}
SKIP_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg",
    ".woff", ".woff2", ".ttf", ".eot",
    ".zip", ".tar", ".gz", ".rar", ".7z",
    ".exe", ".dll", ".so", ".dylib",
    ".pyc", ".class", ".o", ".obj",
    ".lock", ".sum",
}
MAX_FILE_SIZE = 500 * 1024
CHUNK_LINES = 50
CHUNK_OVERLAP = 25

INDEX_DIR = ".oceanix/rag"
INDEX_FILE = "index.json"
HASH_FILE = "file_hashes.json"

# ── Function/class boundary detection ───────────────────

# Matches: def func, class Name, fn func, function func, export function, etc.
FUNC_BOUNDARY = re.compile(
    r"^\s*(def |class |async def |fn |function |export function |"
    r"export class |export const |public class |private class |"
    r"impl |pub fn |pub struct |pub enum |pub trait )",
    re.MULTILINE,
)


def _find_boundaries(lines: list[str]) -> list[int]:
    """Find function/class boundary line indices."""
    boundaries = [0]
    text = "\n".join(lines)
    for m in FUNC_BOUNDARY.finditer(text):
        line_no = text[: m.start()].count("\n")
        if line_no > boundaries[-1]:
            boundaries.append(line_no)
    if boundaries[-1] < len(lines):
        boundaries.append(len(lines))
    return boundaries


# ── Data types ──────────────────────────────────────────

class CodeChunk:
    __slots__ = ("file", "start_line", "end_line", "content", "language")

    def __init__(self, file: str, start: int, end: int, content: str, language: str):
        self.file = file
        self.start_line = start
        self.end_line = end
        self.content = content
        self.language = language

    def to_dict(self) -> dict:
        return {
            "file": self.file, "start_line": self.start_line,
            "end_line": self.end_line, "content": self.content,
            "language": self.language,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "CodeChunk":
        return cls(d["file"], d["start_line"], d["end_line"], d["content"], d["language"])


# ── Language detection ──────────────────────────────────

EXT_TO_LANG = {
    ".py": "python", ".rs": "rust", ".toml": "toml",
    ".ts": "typescript", ".tsx": "typescriptreact",
    ".js": "javascript", ".jsx": "javascriptreact",
    ".json": "json", ".md": "markdown", ".css": "css",
    ".html": "html", ".yaml": "yaml", ".yml": "yaml",
    ".go": "go", ".java": "java", ".cpp": "cpp", ".c": "c",
    ".h": "c", ".hpp": "cpp", ".sh": "shell", ".ps1": "powershell",
    ".sql": "sql", ".graphql": "graphql", ".proto": "protobuf",
}


def _detect_language(path: str) -> str:
    return EXT_TO_LANG.get(Path(path).suffix.lower(), "plaintext")


# ── File hashing for incremental indexing ───────────────

def _file_hash(path: str) -> str:
    """Fast hash using mtime + size (not content) for quick change detection."""
    try:
        stat = os.stat(path)
        return hashlib.md5(f"{stat.st_mtime}:{stat.st_size}".encode()).hexdigest()
    except OSError:
        return ""


# ── Indexer ─────────────────────────────────────────────

class CodeIndex:
    """In-memory code index with incremental updates and persistence."""

    def __init__(self, root: str):
        self.root = Path(root).resolve()
        self.chunks: list[CodeChunk] = []
        self._file_to_chunks: dict[str, list[int]] = defaultdict(list)
        self._file_hashes: dict[str, str] = {}
        self._chunk_count = 0

    # ── Build / Update ──────────────────────────────────

    def build(self, force: bool = False) -> int:
        """Full build or incremental update. Returns chunk count."""
        if not force and self._try_load_cache():
            # Incremental: check for changed/new/deleted files
            changed = self._find_changed_files()
            if changed:
                logger.info(f"Incremental update: {len(changed)} changed files")
                self._remove_files(changed)
                self._index_files(changed)
                self._save_cache()
            logger.info(f"RAG ready: {len(self.chunks)} chunks from {len(self._file_to_chunks)} files")
            return len(self.chunks)

        logger.info("Building code index from scratch...")
        self.chunks.clear()
        self._file_to_chunks.clear()
        self._file_hashes.clear()
        self._chunk_count = 0

        all_files = self._collect_files()
        logger.info(f"Indexing {len(all_files)} files...")
        self._index_files(all_files)
        self._save_cache()
        logger.info(f"RAG built: {len(self.chunks)} chunks from {len(self._file_to_chunks)} files")
        return len(self.chunks)

    def _collect_files(self) -> list[str]:
        """Walk the project tree and collect indexable files."""
        files = []
        for dirpath, dirnames, filenames in os.walk(self.root):
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".")]
            for fname in filenames:
                ext = Path(fname).suffix.lower()
                if ext in SKIP_EXTENSIONS:
                    continue
                fpath = os.path.join(dirpath, fname)
                try:
                    if os.path.getsize(fpath) > MAX_FILE_SIZE:
                        continue
                except OSError:
                    continue
                rel = os.path.relpath(fpath, self.root).replace("\\", "/")
                files.append(rel)
        return files

    def _index_files(self, files: list[str]) -> None:
        """Index a list of relative file paths."""
        with ThreadPoolExecutor(max_workers=4) as pool:
            futures = {pool.submit(self._index_one, f): f for f in files}
            for future in as_completed(futures):
                try:
                    future.result()
                except Exception as e:
                    logger.debug(f"Index failed for {futures[future]}: {e}")

    def _index_one(self, rel: str) -> None:
        """Index a single file."""
        fpath = self.root / rel
        try:
            with open(fpath, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
        except Exception:
            return

        language = _detect_language(rel)
        lines = content.split("\n")
        h = _file_hash(str(fpath))
        self._file_hashes[rel] = h

        # Content-aware chunking: use function/class boundaries when possible
        boundaries = _find_boundaries(lines)
        if len(boundaries) <= 2:
            # Fallback: fixed-size chunks with overlap
            for i in range(0, len(lines), CHUNK_LINES - CHUNK_OVERLAP):
                end = min(i + CHUNK_LINES, len(lines))
                chunk_text = "\n".join(lines[i:end]).strip()
                if chunk_text:
                    self._add_chunk(rel, i, end, chunk_text, language)
        else:
            # Chunk by boundaries
            for idx in range(len(boundaries) - 1):
                start = boundaries[idx]
                end = boundaries[idx + 1]
                chunk_text = "\n".join(lines[start:end]).strip()
                if chunk_text:
                    self._add_chunk(rel, start, end, chunk_text, language)

    def _add_chunk(self, file: str, start: int, end: int, content: str, language: str):
        idx = len(self.chunks)
        self.chunks.append(CodeChunk(file, start, end, content, language))
        self._file_to_chunks[file].append(idx)
        self._chunk_count += 1

    def _remove_files(self, files: set[str]) -> None:
        """Remove chunks for changed files (will be re-indexed)."""
        for f in files:
            if f in self._file_to_chunks:
                del self._file_to_chunks[f]
            self._file_hashes.pop(f, None)
        # Rebuild chunk list without removed files
        self.chunks = [c for c in self.chunks if c.file not in files]
        # Rebuild file_to_chunks indices
        self._file_to_chunks.clear()
        for idx, chunk in enumerate(self.chunks):
            self._file_to_chunks[chunk.file].append(idx)

    def _find_changed_files(self) -> set[str]:
        """Return set of files that are new, modified, or deleted."""
        changed: set[str] = set()
        current_files: set[str] = set()

        for dirpath, dirnames, filenames in os.walk(self.root):
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".")]
            for fname in filenames:
                ext = Path(fname).suffix.lower()
                if ext in SKIP_EXTENSIONS:
                    continue
                fpath = os.path.join(dirpath, fname)
                try:
                    if os.path.getsize(fpath) > MAX_FILE_SIZE:
                        continue
                except OSError:
                    continue
                rel = os.path.relpath(fpath, self.root).replace("\\", "/")
                current_files.add(rel)

                h = _file_hash(fpath)
                old_h = self._file_hashes.get(rel)
                if old_h is None or old_h != h:
                    changed.add(rel)

        # Deleted files
        for f in self._file_hashes:
            if f not in current_files:
                changed.add(f)

        return changed

    # ── Search ──────────────────────────────────────────

    def search(self, query: str, top_k: int = 10, language: Optional[str] = None) -> list[dict]:
        """Search the codebase. Returns top_k results with relevance scores."""
        if not self.chunks:
            return []

        query_lower = query.lower()
        query_words = set(re.findall(r"\w+", query_lower))

        scored: list[tuple[float, int]] = []
        for idx, chunk in enumerate(self.chunks):
            if language and chunk.language != language:
                continue
            score = self._score_chunk(chunk, query_lower, query_words)
            if score > 0:
                scored.append((score, idx))

        scored.sort(key=lambda x: x[0], reverse=True)

        # Normalize scores
        if scored:
            top_score = scored[0][0]
            if top_score > 0:
                scored = [(s / top_score, idx) for s, idx in scored]

        return [
            {
                "file": self.chunks[idx].file,
                "start_line": self.chunks[idx].start_line + 1,
                "end_line": self.chunks[idx].end_line,
                "content": self.chunks[idx].content[:500],
                "language": self.chunks[idx].language,
                "score": round(score, 3),
            }
            for score, idx in scored[:top_k]
        ]

    # ── Scoring ─────────────────────────────────────────

    def _score_chunk(self, chunk: CodeChunk, query_lower: str, query_words: set[str]) -> float:
        """BM25-inspired relevance scoring."""
        text_lower = chunk.content.lower()
        score = 0.0

        # Exact phrase match (highest weight)
        if query_lower in text_lower:
            score += 15.0

        # Word overlap (TF-like)
        text_words = set(re.findall(r"\w+", text_lower))
        overlap = query_words & text_words
        if overlap:
            # IDF-like: rarer words matter more
            score += len(overlap) * 3.0
            # Bonus for all words matching
            if overlap == query_words:
                score += 5.0

        # File name match
        file_lower = chunk.file.lower()
        if query_lower in file_lower:
            score += 8.0
        # Individual word match in filename
        for w in query_words:
            if w in file_lower:
                score += 2.0

        # Short chunk preference (more focused)
        score += max(0, 3.0 - len(chunk.content) * 0.0005)

        return max(0, score)

    # ── Cache ───────────────────────────────────────────

    def _cache_dir(self) -> Path:
        return self.root / INDEX_DIR

    def _cache_path(self) -> Path:
        return self._cache_dir() / INDEX_FILE

    def _hash_path(self) -> Path:
        return self._cache_dir() / HASH_FILE

    def _try_load_cache(self) -> bool:
        cp = self._cache_path()
        hp = self._hash_path()
        if not cp.exists():
            return False
        try:
            data = json.loads(cp.read_text())
            self.chunks = [CodeChunk.from_dict(d) for d in data]
            self._file_to_chunks.clear()
            for idx, chunk in enumerate(self.chunks):
                self._file_to_chunks[chunk.file].append(idx)
            if hp.exists():
                self._file_hashes = json.loads(hp.read_text())
            return True
        except Exception as e:
            logger.warning(f"Failed to load RAG cache: {e}")
            return False

    def _save_cache(self):
        cp = self._cache_path()
        hp = self._hash_path()
        cp.parent.mkdir(parents=True, exist_ok=True)
        cp.write_text(json.dumps([c.to_dict() for c in self.chunks], indent=2))
        hp.write_text(json.dumps(self._file_hashes, indent=2))

    # ── Stats ───────────────────────────────────────────

    def stats(self) -> dict:
        return {
            "chunks": len(self.chunks),
            "files": len(self._file_to_chunks),
            "languages": list({c.language for c in self.chunks}),
        }


# ── Module-level singleton ──────────────────────────────

_index: Optional[CodeIndex] = None


def get_index(root: Optional[str] = None) -> CodeIndex:
    global _index
    if _index is None:
        _index = CodeIndex(root or os.getcwd())
        _index.build()
    return _index


def search_codebase(query: str, top_k: int = 10) -> list[dict]:
    """Search the codebase via the RAG index."""
    return get_index().search(query, top_k=top_k)


def rebuild_index(root: Optional[str] = None):
    global _index
    _index = CodeIndex(root or os.getcwd())
    _index.build(force=True)


def init_rag():
    """Initialize RAG index on startup."""
    logger.info("Initializing RAG code index...")
    get_index()
    s = _index.stats() if _index else {}
    logger.info(f"RAG ready: {s.get('chunks', 0)} chunks in {s.get('files', 0)} files")
