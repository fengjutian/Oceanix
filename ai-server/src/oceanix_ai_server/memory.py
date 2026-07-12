"""Long-term memory — filesystem-based memory store.

Stores:
- Conversation summaries in `.oceanix/memory/conversations/`
- Project facts in `.oceanix/memory/facts/`
- User preferences in `.oceanix/memory/prefs.json`

Upgrade path: Mem0 (semantic + graph memory) as a plugin.
"""

import os
import re
import json
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional
from loguru import logger

# ── Config ──────────────────────────────────────────────

MEMORY_ROOT = ".oceanix/memory"
CONVERSATIONS_DIR = "conversations"
FACTS_DIR = "facts"
PREFS_FILE = "prefs.json"

# Allowed characters for filenames (prevents path traversal)
_SAFE_NAME_RE = re.compile(r"[^a-zA-Z0-9._-]")


def _safe_name(name: str) -> str:
    """Sanitize a name to be safe for use in a filename."""
    return _SAFE_NAME_RE.sub("_", name) or "unnamed"


def _ensure_dirs(root: str) -> Path:
    base = (Path(root) / MEMORY_ROOT).resolve()
    base.mkdir(parents=True, exist_ok=True)
    (base / CONVERSATIONS_DIR).mkdir(exist_ok=True)
    (base / FACTS_DIR).mkdir(exist_ok=True)
    return base


# ── Conversation Memory ─────────────────────────────────


def save_conversation(root: str, conversation_id: str, messages: list[dict]) -> str:
    """Save a conversation to disk.

    Args:
        root: Project root directory.
        conversation_id: Unique ID for this conversation.
        messages: List of {"role": str, "content": str} dicts.

    Returns:
        The file path where the conversation was saved.
    """
    base = _ensure_dirs(root)
    safe_id = _safe_name(conversation_id)
    fpath = base / CONVERSATIONS_DIR / f"{safe_id}.json"

    data = {
        "id": conversation_id,
        "timestamp": datetime.now(tz=timezone.utc).isoformat(),
        "message_count": len(messages),
        "messages": messages,
    }
    fpath.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    logger.debug(f"Saved conversation {conversation_id} ({len(messages)} messages)")
    return str(fpath)


def load_conversation(root: str, conversation_id: str) -> Optional[dict]:
    """Load a saved conversation."""
    safe_id = _safe_name(conversation_id)
    base = _ensure_dirs(root)
    fpath = base / CONVERSATIONS_DIR / f"{safe_id}.json"
    if not fpath.exists():
        return None
    return json.loads(fpath.read_text())


def list_conversations(root: str, limit: int = 20) -> list[dict]:
    """List recent conversations."""
    base = Path(root) / MEMORY_ROOT / CONVERSATIONS_DIR
    if not base.exists():
        return []
    files = sorted(base.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    result = []
    for fp in files[:limit]:
        try:
            data = json.loads(fp.read_text())
            result.append({
                "id": data.get("id", fp.stem),
                "timestamp": data.get("timestamp", ""),
                "message_count": data.get("message_count", 0),
            })
        except Exception:
            continue
    return result


def delete_conversation(root: str, conversation_id: str) -> bool:
    """Delete a saved conversation. Returns True if deleted, False if not found."""
    safe_id = _safe_name(conversation_id)
    base = _ensure_dirs(root)
    fpath = base / CONVERSATIONS_DIR / f"{safe_id}.json"
    if not fpath.exists():
        return False
    fpath.unlink()
    logger.debug(f"Deleted conversation {conversation_id}")
    return True


# ── Project Facts ───────────────────────────────────────


def save_fact(root: str, key: str, value: str, category: str = "general") -> str:
    """Save a project fact.

    Examples:
        save_fact(".", "architecture", "This project uses CQRS pattern")
        save_fact(".", "prefers-tabs", "User prefers tabs over spaces", "preference")
    """
    base = _ensure_dirs(root)
    safe_key = _safe_name(key)
    fpath = base / FACTS_DIR / f"{safe_key}.json"
    data = {
        "key": key,
        "value": value,
        "category": category,
        "updated": datetime.now(tz=timezone.utc).isoformat(),
    }
    fpath.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    logger.debug(f"Saved fact: {key}")
    return str(fpath)


def load_fact(root: str, key: str) -> Optional[dict]:
    """Load a saved fact."""
    safe_key = _safe_name(key)
    base = _ensure_dirs(root)
    fpath = base / FACTS_DIR / f"{safe_key}.json"
    if not fpath.exists():
        return None
    return json.loads(fpath.read_text())


def search_facts(root: str, query: str, limit: int = 10) -> list[dict]:
    """Search facts by keyword (simple substring match)."""
    base = Path(root) / MEMORY_ROOT / FACTS_DIR
    if not base.exists():
        return []
    results = []
    for fp in base.glob("*.json"):
        try:
            data = json.loads(fp.read_text())
            text = f"{data.get('key','')} {data.get('value','')} {data.get('category','')}"
            if query.lower() in text.lower():
                results.append(data)
                if len(results) >= limit:
                    break
        except Exception:
            continue
    return results


def list_facts(root: str, category: Optional[str] = None) -> list[dict]:
    """List all facts, optionally filtered by category."""
    base = Path(root) / MEMORY_ROOT / FACTS_DIR
    if not base.exists():
        return []
    results = []
    for fp in base.glob("*.json"):
        try:
            data = json.loads(fp.read_text())
            if category and data.get("category") != category:
                continue
            results.append(data)
        except Exception:
            continue
    return sorted(results, key=lambda d: d.get("updated", ""), reverse=True)


# ── User Preferences ────────────────────────────────────


def load_preferences(root: str) -> dict:
    """Load user preferences."""
    fpath = Path(root) / MEMORY_ROOT / PREFS_FILE
    if not fpath.exists():
        return {}
    try:
        return json.loads(fpath.read_text())
    except Exception:
        return {}


def save_preferences(root: str, prefs: dict):
    """Save user preferences."""
    base = _ensure_dirs(root)
    fpath = base / PREFS_FILE
    data = {
        "updated": datetime.now(tz=timezone.utc).isoformat(),
        **prefs,
    }
    fpath.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    logger.debug("Saved preferences")


# ── Init ────────────────────────────────────────────────


def init_memory():
    """Initialize memory system on startup."""
    logger.info(f"Memory store root: {MEMORY_ROOT}")
    # Ensure directories exist
    cwd = os.getcwd()
    _ensure_dirs(cwd)
    logger.info("Memory system ready")
