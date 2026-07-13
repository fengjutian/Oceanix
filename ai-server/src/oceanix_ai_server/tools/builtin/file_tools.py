"""Built-in tools for the agent.

These are the core tools that ship with Oceanix.
Each tool is a standalone function that can be wrapped
by both the LangGraph agent and the ToolService.
"""
import os
import re
import glob as glob_mod

# ── File tools ────────────────────────────────────────

def read_file(path: str) -> str:
    """Read the contents of a file."""
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            return f.read()
    except Exception as e:
        return f"Error reading {path}: {e}"


def write_file(path: str, content: str) -> str:
    """Write content to a file."""
    try:
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        return f"Successfully wrote {path}"
    except Exception as e:
        return f"Error writing {path}: {e}"


# ── Search tools ──────────────────────────────────────

def grep_files(query: str, path: str = ".") -> str:
    """Search for text in files (regex or literal)."""
    results: list[str] = []
    try:
        pattern = re.compile(query)
    except re.error:
        pattern = re.compile(re.escape(query))

    for dirpath, _, filenames in os.walk(path):
        for fname in filenames:
            fpath = os.path.join(dirpath, fname)
            try:
                if os.path.getsize(fpath) > 500 * 1024:
                    continue
                with open(fpath, "r", encoding="utf-8", errors="replace") as f:
                    for i, line in enumerate(f, 1):
                        if pattern.search(line):
                            results.append(f"{fpath}:{i}: {line.strip()[:200]}")
                            if len(results) >= 20:
                                break
            except Exception:
                continue
            if len(results) >= 20:
                break
        if len(results) >= 20:
            break

    if results:
        return "\n".join(results)
    return f"No matches found for '{query}'"


def glob_files(pattern: str, path: str = ".") -> str:
    """Find files matching a glob pattern."""
    files = glob_mod.glob(f"{path}/**/{pattern}", recursive=True)
    if files:
        return "\n".join(files[:50])
    return f"No files matching '{pattern}'"
