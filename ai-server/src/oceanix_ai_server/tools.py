"""LangChain tool registration.

These tools are available to the LangGraph agent for autonomous execution.
Each tool corresponds to an MCP tool that the Rust bridge can forward.
"""

from langchain_core.tools import tool


@tool
def read_file(path: str) -> str:
    """Read the contents of a file."""
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            return f.read()
    except Exception as e:
        return f"Error reading {path}: {e}"


@tool
def write_file(path: str, content: str) -> str:
    """Write content to a file."""
    try:
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        return f"Successfully wrote {path}"
    except Exception as e:
        return f"Error writing {path}: {e}"


@tool
def grep_files(query: str, path: str = ".") -> str:
    """Search for text in files (regex or literal)."""
    import re
    import os
    results = []
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

    if results:
        return "\n".join(results)
    return f"No matches found for '{query}'"


@tool
def glob_files(pattern: str, path: str = ".") -> str:
    """Find files matching a glob pattern."""
    import glob
    files = glob.glob(f"{path}/**/{pattern}", recursive=True)
    if files:
        return "\n".join(files[:50])
    return f"No files matching '{pattern}'"


# Registry of all agent tools
TOOLS = [read_file, write_file, grep_files, glob_files]
