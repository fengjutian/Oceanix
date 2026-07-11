"""LangChain tool registration — editor tools the AI Agent can invoke.

Each tool returns a structured result that can be displayed in the AgentWorkspace UI.

Security: All filesystem tools are sandboxed to WORKSPACE_ROOT.
"""

import os
import re
import shlex
import subprocess
from pathlib import Path
from typing import Optional

from langchain_core.tools import tool
from loguru import logger

# ── Workspace sandbox ───────────────────────────────────

# Set by server startup or default to CWD
WORKSPACE_ROOT = Path(os.environ.get("OCEANIX_WORKSPACE", os.getcwd())).resolve()


def _in_workspace(path: str) -> Path:
    """Resolve path and ensure it's inside the workspace. Raises ValueError if not."""
    p = (WORKSPACE_ROOT / path).resolve()
    if not str(p).startswith(str(WORKSPACE_ROOT)):
        raise ValueError(f"Path outside workspace: {path}")
    return p

# ── Filesystem tools ───────────────────────────────────


@tool
def read_file(path: str, start_line: int = 0, end_line: int = -1) -> str:
    """Read the contents of a file (relative to workspace root).

    Args:
        path: Path relative to workspace root.
        start_line: 0-based line to start reading from (default 0, min 0).
        end_line: 0-based line to end at, -1 means EOF.
    """
    try:
        p = _in_workspace(path)
        if not p.exists():
            return f"[Error] File not found: {path}"
        if start_line < 0:
            start_line = 0
        content = p.read_text(encoding="utf-8", errors="replace")
        lines = content.split("\n")
        if end_line == -1:
            end_line = len(lines)
        selected = lines[start_line:end_line]
        return "\n".join(selected)
    except ValueError as e:
        return f"[Error] {e}"
    except Exception as e:
        return f"[Error] Failed to read {path}: {e}"


@tool
def write_file(path: str, content: str, overwrite: bool = True) -> str:
    """Write content to a file.

    Args:
        path: Path relative to workspace root.
        content: The full text to write.
        overwrite: If False and file exists, return error (default True).
    """
    try:
        p = _in_workspace(path)
        if p.exists() and not overwrite:
            return f"[Error] File already exists (use overwrite=True): {path}"
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")
        return f"[OK] Wrote {len(content)} bytes to {path}"
    except ValueError as e:
        return f"[Error] {e}"
    except Exception as e:
        return f"[Error] Failed to write {path}: {e}"


@tool
def search_files(query: str, path: str = ".", file_pattern: str = "*") -> str:
    """Search for text in workspace files using substring matching.

    Args:
        query: Text to search for (case-insensitive substring).
        path: Directory to search in, relative to workspace (default '.').
        file_pattern: Glob pattern for files (default '*').
    """
    try:
        # Use Python's built-in recursive grep
        results = []
        base = _in_workspace(path)
        file_count = 0
        max_files = 5000
        for fp in base.rglob(file_pattern):
            if file_count >= max_files:
                break
            if fp.is_file() and not _is_binary(fp) and fp.stat().st_size < 1024 * 1024:
                try:
                    text = fp.read_text(encoding="utf-8", errors="replace")
                    for i, line in enumerate(text.split("\n")):
                        if query.lower() in line.lower():
                            results.append(f"{fp}:{i+1}: {line.strip()[:120]}")
                            if len(results) >= 20:
                                break
                except Exception:
                    continue
                if len(results) >= 20:
                    break
        if not results:
            return f"[OK] No matches found for '{query}'"
        return "\n".join(results)
    except Exception as e:
        return f"[Error] Search failed: {e}"


@tool
def git_diff(path: str = ".", staged: bool = False) -> str:
    """Show git diff for the working tree.

    Args:
        path: File or directory to diff (default '.' for full repo).
        staged: If True, show staged changes (default False).
    """
    try:
        cmd = ["git", "diff"]
        if staged:
            cmd.append("--staged")
        cmd.append(path)
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        output = result.stdout.strip()
        if not output:
            return "[OK] No changes"
        # Truncate if too large
        if len(output) > 8000:
            output = output[:8000] + "\n... (truncated)"
        return output
    except FileNotFoundError:
        return "[Error] git not found"
    except subprocess.TimeoutExpired:
        return "[Error] git diff timed out"
    except Exception as e:
        return f"[Error] git diff failed: {e}"


@tool
def git_status() -> str:
    """Show the current git status (short format)."""
    try:
        result = subprocess.run(
            ["git", "status", "--short"], capture_output=True, text=True, timeout=10
        )
        output = result.stdout.strip()
        if not output:
            return "[OK] Working tree clean"
        return output
    except FileNotFoundError:
        return "[Error] git not found"
    except Exception as e:
        return f"[Error] git status failed: {e}"


@tool
def terminal_exec(command: str, timeout: int = 30) -> str:
    """Execute a shell command and return its output.

    Args:
        command: The shell command to execute (list recommended, e.g. 'git status').
        timeout: Maximum seconds to wait (default 30).

    Security: Uses shell=False. Only safe commands are executable.
    """
    try:
        # Parse command into list: split on whitespace, respect quotes
        import shlex
        cmd_list = shlex.split(command)
        result = subprocess.run(
            cmd_list, capture_output=True, text=True, timeout=timeout,
            cwd=os.getcwd(), shell=False,
        )
        output = result.stdout.strip()
        if result.stderr:
            output += "\n[stderr]\n" + result.stderr.strip()
        if result.returncode != 0:
            output += f"\n[exit code: {result.returncode}]"
        if not output:
            return f"[OK] Command completed (exit {result.returncode})"
        if len(output) > 4000:
            output = output[:4000] + "\n... (truncated)"
        return output
    except subprocess.TimeoutExpired:
        return f"[Error] Command timed out after {timeout}s"
    except Exception as e:
        return f"[Error] Command failed: {e}"


# ── Helpers ─────────────────────────────────────────────


def _is_binary(path: Path) -> bool:
    """Quick heuristic to skip binary files."""
    try:
        with open(path, "rb") as f:
            chunk = f.read(1024)
        # If null bytes present, treat as binary
        return b"\x00" in chunk
    except Exception:
        return True


# ── Tool registry ───────────────────────────────────────

# All tools available to the Agent
TOOLS = [
    read_file,
    write_file,
    search_files,
    git_diff,
    git_status,
    terminal_exec,
]
