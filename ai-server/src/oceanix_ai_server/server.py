"""Oceanix AI Server — FastMCP entry point.

Runs as a stdio-based MCP server. The Rust bridge (oceanix-ai)
spawns this process and communicates via JSON-RPC over stdin/stdout.
"""

import sys
import os
from loguru import logger
from dotenv import load_dotenv

# Load API keys from .env or environment
load_dotenv()

logger.remove()
logger.add(sys.stderr, level="INFO", format="<green>{time:HH:mm:ss}</green> | {level:<7} | {message}")

from fastmcp import FastMCP
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

mcp = FastMCP(
    "Oceanix AI",
    description="Oceanix code editor AI assistant — code completion, chat, and agent",
)


# ── RAG codebase search tool ────────────────────────────

@mcp.tool()
def search_codebase(query: str, top_k: int = 10) -> dict:
    """Search the codebase for relevant code chunks.

    Args:
        query: Natural language query or code snippet to search for.
        top_k: Number of results to return (default 10).
    """
    from .rag import search_codebase as search_fn
    results = search_fn(query, top_k=top_k)
    return {"results": results, "count": len(results)}


@mcp.tool()
def rebuild_index() -> str:
    """Rebuild the codebase search index. Call this when files change significantly."""
    from .rag import rebuild_index
    rebuild_index()
    return "Index rebuild started"


# ── Agent execution tool ────────────────────────────────

@mcp.tool()
def agent_execute(task: str, max_steps: int = 10) -> dict:
    """Execute an autonomous agent task using the editor tools.

    The agent will plan, execute tools, and report results.

    Args:
        task: Description of what the agent should do.
        max_steps: Maximum execution steps (default 10).
    """
    logger.info(f"Agent task: {task[:100]}")

    from .agent import get_agent
    agent = get_agent()

    try:
        result = agent.invoke(
            {
                "task": task,
                "messages": [HumanMessage(content=task)],
                "plan": [],
                "current_step": 0,
                "result": "",
            },
            config={"recursion_limit": max_steps * 2},  # each step is ~2 graph transitions
        )

        return {
            "status": "completed",
            "plan": result.get("plan", []),
            "steps_completed": result.get("current_step", 0),
            "result": result.get("result", "Done"),
            "messages": [
                {"role": msg.__class__.__name__, "content": str(msg.content)[:500]}
                for msg in result.get("messages", [])[-5:]  # Last 5 messages
            ],
        }
    except Exception as e:
        logger.error(f"Agent failed: {e}")
        return {"status": "error", "error": str(e)}


# ── Completion tool ────────────────────────────────────

@mcp.tool()
def completion(
    code: str,
    position: dict,
    language: str = "plaintext",
    file_path: str = "",
) -> dict | None:
    """Generate inline code completion (ghost text).

    Args:
        code: Full file content.
        position: Dict with 'line' and 'column' keys (1-indexed).
        language: Programming language identifier.
        file_path: Absolute path of the file being edited.
    """
    logger.debug(f"completion: {file_path}:{position.get('line')}:{position.get('column')}")

    provider = _get_llm()
    if not provider:
        return None

    try:
        # Extract context: ~20 lines around cursor
        lines = code.split("\n")
        cursor_line = position.get("line", 1)
        start = max(0, cursor_line - 15)
        end = min(len(lines), cursor_line + 5)
        context = "\n".join(lines[start:end])

        # RAG: search for related code in the project
        rag_context = ""
        try:
            from .rag import search_codebase as _search
            # Search using the current line as query
            current_line_text = lines[cursor_line - 1].strip() if cursor_line <= len(lines) else ""
            query = current_line_text[:80] if current_line_text else context[:100]
            rag_results = _search(f"{language} {query}", top_k=3)
            if rag_results:
                rag_parts = []
                for r in rag_results[:3]:
                    rag_parts.append(f"// {r['file']}:{r['start_line']}\n{r['content'][:200]}")
                rag_context = "// Related code from project:\n" + "\n---\n".join(rag_parts)
        except Exception:
            pass

        prompt_parts = [
            f"You are a code completion engine. Complete the {language} code at the cursor.",
        ]
        if rag_context:
            prompt_parts.append(rag_context)
        prompt_parts.extend([
            f"```{language}",
            context,
            "```",
            "",
            "Completion:",
        ])
        prompt = "\n".join(prompt_parts)

        response = provider.invoke(prompt)
        text = response.content if hasattr(response, "content") else str(response)

        # Clean up: remove markdown code fences if present
        text = text.strip()
        if text.startswith("```"):
            text = "\n".join(text.split("\n")[1:])
        if text.endswith("```"):
            text = "\n".join(text.split("\n")[:-1])

        return {"insertText": text.strip()}
    except Exception as e:
        logger.warning(f"Completion failed: {e}")
        return None


# ── Chat tool ──────────────────────────────────────────

@mcp.tool()
def chat(
    messages: list[dict],
    context_files: list[str] | None = None,
) -> str:
    """Chat with the AI assistant.

    Args:
        messages: List of {'role': 'user'|'assistant'|'system', 'content': str}.
        context_files: Optional list of file paths for additional context.
    """
    logger.debug(f"chat: {len(messages)} messages")

    provider = _get_llm()
    if not provider:
        return "AI service is not configured. Please set OPENAI_API_KEY or ANTHROPIC_API_KEY."

    from .prompts import SYSTEM_PROMPT

    role_map = {
        "system": SystemMessage,
        "user": HumanMessage,
        "assistant": AIMessage,
    }

    lc_messages = [SystemMessage(content=SYSTEM_PROMPT)]
    for msg in messages:
        cls = role_map.get(msg.get("role", "user"), HumanMessage)
        lc_messages.append(cls(content=msg.get("content", "")))

    try:
        response = provider.invoke(lc_messages)
        return response.content if hasattr(response, "content") else str(response)
    except Exception as e:
        logger.error(f"Chat failed: {e}")
        return f"Error: {e}"


# ── RAG tools ───────────────────────────────────────────

@mcp.tool()
def search_codebase(query: str, top_k: int = 10) -> list[dict]:
    """Search the project codebase using the RAG index.

    Args:
        query: Search query — can be natural language or code snippets.
        top_k: Number of results to return (default 10).

    Returns:
        List of matching code chunks with file, line numbers, content, and relevance score.
    """
    from .rag import search_codebase as _search

    results = _search(query, top_k=top_k)
    if not results:
        return [{"message": "No results found. Try rebuilding the index with rebuild_rag_index."}]
    return results


@mcp.tool()
def rebuild_rag_index() -> dict:
    """Rebuild the RAG code index from scratch.

    Use this after major code changes or if search results seem stale.
    """
    from .rag import rebuild_index as _rebuild

    _rebuild()
    from .rag import get_index
    idx = get_index()
    return idx.stats()


@mcp.tool()
def rag_stats() -> dict:
    """Get RAG index statistics."""
    from .rag import get_index
    return get_index().stats()


# ── LLM Provider ───────────────────────────────────────

_llm = None
_llm_checked = False


def _get_llm():
    """Lazy-init the LLM provider chain.
    
    Public so http_api.py can reuse the same provider."""
    global _llm, _llm_checked
    if _llm is not None:
        return _llm
    if _llm_checked:
        return None
    _llm_checked = True

    # Priority: Anthropic > OpenAI > Ollama (local)
    if os.environ.get("ANTHROPIC_API_KEY"):
        try:
            from langchain_anthropic import ChatAnthropic
            _llm = ChatAnthropic(
                model=os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-20250514"),
                max_tokens=4096,
                streaming=True,
            )
            logger.info("Using Anthropic Claude")
            return _llm
        except Exception as e:
            logger.warning(f"Anthropic init failed: {e}")

    if os.environ.get("OPENAI_API_KEY"):
        try:
            from langchain_openai import ChatOpenAI
            _llm = ChatOpenAI(
                model=os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
                max_tokens=4096,
                streaming=True,
            )
            logger.info("Using OpenAI")
            return _llm
        except Exception as e:
            logger.warning(f"OpenAI init failed: {e}")

    if os.environ.get("OLLAMA_HOST"):
        try:
            from langchain_ollama import ChatOllama
            _llm = ChatOllama(
                model=os.environ.get("OLLAMA_MODEL", "codellama"),
            )
            logger.info("Using Ollama (local)")
            return _llm
        except Exception as e:
            logger.warning(f"Ollama init failed: {e}")

    logger.warning("No LLM provider configured")
    return None


# ── Entry point ────────────────────────────────────────

def main():
    """Run the MCP server on stdio, with HTTP API on a background thread."""
    import threading

    logger.info("Oceanix AI Server starting on stdio...")

    # Start FastAPI HTTP server on a daemon thread
    http_port = int(os.environ.get("OCEANIX_AI_HTTP_PORT", "11435"))
    http_thread = threading.Thread(
        target=_run_http_server,
        args=(http_port,),
        daemon=True,
        name="ai-http-api",
    )
    http_thread.start()
    logger.info(f"HTTP API will listen on http://127.0.0.1:{http_port}")

    # Initialize RAG on startup
    try:
        from .rag import init_rag
        init_rag()
    except Exception as e:
        logger.warning(f"RAG init skipped: {e}")

    mcp.run(transport="stdio")


def _run_http_server(port: int):
    """Run the FastAPI HTTP server (runs in daemon thread)."""
    try:
        from .http_api import run_http
        run_http(port)
    except Exception as e:
        logger.error(f"HTTP server failed: {e}")


if __name__ == "__main__":
    main()
