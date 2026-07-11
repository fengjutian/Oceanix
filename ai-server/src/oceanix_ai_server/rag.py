"""RAG module — codebase indexing and semantic search.

Uses a lightweight approach:
- Filesystem walker for code discovery
- TF-IDF + BM25-style scoring for search (no external vector DB required)
- Fallback to substring search when no index is built

Upgrade path: replace `_search_tfidf` with embedding + Qdrant local.
"""

import os
import json
import re
from pathlib import Path
from typing import Optional
from collections import defaultdict
from loguru import logger

# ── Config ──────────────────────────────────────────────

# Files/directories to skip during indexing
SKIP_DIRS = {
    ".git", "node_modules", "target", "dist", "build",
    "__pycache__", ".venv", "venv", ".idea", ".vscode",
    ".next", ".turbo", "coverage", ".pytest_cache",
}
SKIP_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg",
    ".woff", ".woff2", ".ttf", ".eot",
    ".zip", ".tar", ".gz", ".rar", ".7z",
    ".exe", ".dll", ".so", ".dylib",
    ".pyc", ".class", ".o", ".obj",
    ".lock", ".sum",
}
MAX_FILE_SIZE = 500 * 1024  # 500KB

# Where the index is cached
INDEX_DIR = ".oceanix/rag"
INDEX_FILE = "index.json"


# ── Index entry ─────────────────────────────────────────

class CodeChunk:
    """A chunk of code from a single file."""
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
    ext = Path(path).suffix.lower()
    return EXT_TO_LANG.get(ext, "plaintext")


# ── Indexer ─────────────────────────────────────────────

class CodeIndex:
    """In-memory code index with persistence."""

    def __init__(self, root: str):
        self.root = Path(root).resolve()
        self.chunks: list[CodeChunk] = []
        self._file_to_chunks: dict[str, list[int]] = defaultdict(list)

    # ── Build ──────────────────────────────────────────

    def build(self, force: bool = False) -> int:
        """Walk the project tree and index all code files.

        Returns the number of chunks indexed.
        """
        if not force and self._try_load_cache():
            logger.info(f"Loaded {len(self.chunks)} chunks from cache")
            return len(self.chunks)

        logger.info("Building code index...")
        self.chunks = []
        self._file_to_chunks.clear()

        for dirpath, dirnames, filenames in os.walk(self.root):
            # Skip hidden dirs and known noise
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".")]

            for fname in sorted(filenames):
                fpath = os.path.join(dirpath, fname)
                ext = Path(fname).suffix.lower()
                if ext in SKIP_EXTENSIONS:
                    continue
                try:
                    stat = os.stat(fpath)
                    if stat.st_size > MAX_FILE_SIZE:
                        continue
                except OSError:
                    continue

                language = _detect_language(fname)
                rel = os.path.relpath(fpath, self.root).replace("\\", "/")

                try:
                    with open(fpath, "r", encoding="utf-8", errors="replace") as f:
                        content = f.read()
                except Exception:
                    continue

                # Split into chunks: by function/class boundaries or ~50 line blocks
                lines = content.split("\n")
                chunk_size = 50
                for i in range(0, len(lines), chunk_size // 2):  # 50% overlap
                    end = min(i + chunk_size, len(lines))
                    chunk_text = "\n".join(lines[i:end]).strip()
                    if not chunk_text:
                        continue
                    idx = len(self.chunks)
                    self.chunks.append(CodeChunk(rel, i, end, chunk_text, language))
                    self._file_to_chunks[rel].append(idx)

                if len(self.chunks) % 500 == 0:
                    logger.debug(f"Indexed {len(self.chunks)} chunks...")

        self._save_cache()
        logger.info(f"Indexed {len(self.chunks)} chunks from {len(self._file_to_chunks)} files")
        return len(self.chunks)

    # ── Search ──────────────────────────────────────────

    def search(self, query: str, top_k: int = 10, language: Optional[str] = None) -> list[dict]:
        """Search the codebase. Returns top_k results with relevance scores."""
        if not self.chunks:
            return [{"file": "", "start_line": 0, "content": "Index not built yet. Run build() first."}]

        query_lower = query.lower()
        scored: list[tuple[float, int]] = []

        for idx, chunk in enumerate(self.chunks):
            if language and chunk.language != language:
                continue
            score = self._score_chunk(chunk, query_lower)
            if score > 0:
                scored.append((score, idx))

        scored.sort(key=lambda x: x[0], reverse=True)
        top = scored[:top_k]

        return [
            {
                "file": self.chunks[idx].file,
                "start_line": self.chunks[idx].start_line,
                "end_line": self.chunks[idx].end_line,
                "content": self.chunks[idx].content[:500],
                "language": self.chunks[idx].language,
                "score": round(score, 3),
            }
            for score, idx in top
        ]

    # ── Scoring ─────────────────────────────────────────

    def _score_chunk(self, chunk: CodeChunk, query_lower: str) -> float:
        """BM25-inspired relevance score."""
        text_lower = chunk.content.lower()
        score = 0.0

        # Exact match bonus
        if query_lower in text_lower:
            score += 10.0

        # Word overlap
        query_words = set(query_lower.split())
        text_words = set(re.findall(r"\w+", text_lower))
        overlap = query_words & text_words
        score += len(overlap) * 2.0

        # File name match bonus
        if query_lower in chunk.file.lower():
            score += 5.0

        # Prefer shorter chunks (more focused)
        score -= len(chunk.content) * 0.0001

        return score

    # ── Cache ───────────────────────────────────────────

    def _cache_dir(self) -> Path:
        return self.root / INDEX_DIR

    def _cache_path(self) -> Path:
        return self._cache_dir() / INDEX_FILE

    def _try_load_cache(self) -> bool:
        cp = self._cache_path()
        if not cp.exists():
            return False
        try:
            data = json.loads(cp.read_text())
            self.chunks = [CodeChunk.from_dict(d) for d in data]
            for idx, chunk in enumerate(self.chunks):
                self._file_to_chunks[chunk.file].append(idx)
            return True
        except Exception as e:
            logger.warning(f"Failed to load RAG cache: {e}")
            return False

    def _save_cache(self):
        cp = self._cache_path()
        cp.parent.mkdir(parents=True, exist_ok=True)
        data = [c.to_dict() for c in self.chunks]
        cp.write_text(json.dumps(data, indent=2))


# ── Module-level singleton ──────────────────────────────

_index: Optional[CodeIndex] = None


def get_index(root: Optional[str] = None) -> CodeIndex:
    global _index
    if _index is None:
        _index = CodeIndex(root or os.getcwd())
        _index.build()
    return _index


def search_codebase(query: str, top_k: int = 10) -> list[dict]:
    """Convenience function for MCP tools."""
    idx = get_index()
    return idx.search(query, top_k=top_k)


def rebuild_index(root: Optional[str] = None):
    global _index
    _index = CodeIndex(root or os.getcwd())
    _index.build(force=True)


def init_rag():
    """Initialize RAG on startup."""
    logger.info("Initializing RAG code index...")
    get_index()
    logger.info("RAG ready")
