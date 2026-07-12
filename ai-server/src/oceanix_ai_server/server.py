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
_llm_model = None
_llm_checked = False


def _get_llm(model: str | None = None):
    """Lazy-init the LLM provider chain.
    
    If `model` is provided and differs from the cached model, re-initialize.
    Public so http_api.py can reuse the same provider."""
    global _llm, _llm_model, _llm_checked
    if _llm is not None and (model is None or model == _llm_model):
        return _llm
    if _llm_checked and model is None:
        return None

    # Determine which model to use
    selected_model = model or ""

    # ── DeepSeek (OpenAI-compatible API) ──────────────
    if os.environ.get("DEEPSEEK_API_KEY") and (
        selected_model.startswith("deepseek-") or not selected_model
    ):
        try:
            from langchain_openai import ChatOpenAI
            deepseek_model = selected_model if selected_model.startswith("deepseek-") else os.environ.get("DEEPSEEK_MODEL", "deepseek-v4-pro")
            _llm = ChatOpenAI(
                model=deepseek_model,
                base_url="https://api.deepseek.com/v1",
                api_key=os.environ["DEEPSEEK_API_KEY"],
                max_tokens=4096,
                streaming=True,
            )
            _llm_model = deepseek_model
            _llm_checked = True
            logger.info(f"Using DeepSeek: {deepseek_model}")
            return _llm
        except Exception as e:
            logger.warning(f"DeepSeek init failed: {e}")

    # ── Anthropic ─────────────────────────────────────
    if os.environ.get("ANTHROPIC_API_KEY") and (
        selected_model.startswith("claude-") or not selected_model
    ):
        try:
            from langchain_anthropic import ChatAnthropic
            anthropic_model = selected_model if selected_model.startswith("claude-") else os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-20250514")
            _llm = ChatAnthropic(
                model=anthropic_model,
                max_tokens=4096,
                streaming=True,
            )
            _llm_model = anthropic_model
            _llm_checked = True
            logger.info(f"Using Anthropic Claude: {anthropic_model}")
            return _llm
        except Exception as e:
            logger.warning(f"Anthropic init failed: {e}")

    # ── OpenAI ────────────────────────────────────────
    if os.environ.get("OPENAI_API_KEY") and (
        selected_model.startswith("gpt-") or selected_model.startswith("o1") or selected_model.startswith("o3") or not selected_model
    ):
        try:
            from langchain_openai import ChatOpenAI
            openai_model = selected_model if selected_model else os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
            _llm = ChatOpenAI(
                model=openai_model,
                max_tokens=4096,
                streaming=True,
            )
            _llm_model = openai_model
            _llm_checked = True
            logger.info(f"Using OpenAI: {openai_model}")
            return _llm
        except Exception as e:
            logger.warning(f"OpenAI init failed: {e}")

    # ── Ollama (local) ────────────────────────────────
    if os.environ.get("OLLAMA_HOST"):
        try:
            from langchain_ollama import ChatOllama
            ollama_model = selected_model if selected_model else os.environ.get("OLLAMA_MODEL", "codellama")
            _llm = ChatOllama(
                model=ollama_model,
            )
            _llm_model = ollama_model
            _llm_checked = True
            logger.info(f"Using Ollama (local): {ollama_model}")
            return _llm
        except Exception as e:
            logger.warning(f"Ollama init failed: {e}")

    _llm_checked = True
    logger.warning("No LLM provider configured")
    return None


# ── MCP tool metadata ────────────────────────────────


def get_mcp_tool_definitions() -> list[dict]:
    """Return metadata for all registered MCP tools.

    Used by the HTTP API to expose the tool list to the frontend.
    """
    return [
        {
            "name": "agent_execute",
            "description": "Execute an autonomous agent task using the editor tools. The agent will plan, execute tools, and report results.",
            "parameters": [
                {"name": "task", "type": "str", "description": "Description of what the agent should do."},
                {"name": "max_steps", "type": "int", "description": "Maximum execution steps (default 10)."},
            ],
        },
        {
            "name": "completion",
            "description": "Generate inline code completion (ghost text) at the cursor position.",
            "parameters": [
                {"name": "code", "type": "str", "description": "Full file content."},
                {"name": "position", "type": "dict", "description": "Dict with 'line' and 'column' keys (1-indexed)."},
                {"name": "language", "type": "str", "description": "Programming language identifier."},
                {"name": "file_path", "type": "str", "description": "Absolute path of the file being edited."},
            ],
        },
        {
            "name": "chat",
            "description": "Chat with the AI assistant using the LLM provider.",
            "parameters": [
                {"name": "messages", "type": "list[dict]", "description": "List of {'role': 'user'|'assistant'|'system', 'content': str}."},
                {"name": "context_files", "type": "list[str] | None", "description": "Optional list of file paths for additional context."},
            ],
        },
        {
            "name": "search_codebase",
            "description": "Search the project codebase using the RAG index. Accepts natural language or code snippets.",
            "parameters": [
                {"name": "query", "type": "str", "description": "Search query — natural language or code snippets."},
                {"name": "top_k", "type": "int", "description": "Number of results to return (default 10)."},
            ],
        },
        {
            "name": "rebuild_rag_index",
            "description": "Rebuild the RAG code index from scratch. Use after major code changes or if search results seem stale.",
            "parameters": [],
        },
        {
            "name": "rag_stats",
            "description": "Get RAG index statistics — number of files, chunks, and index size.",
            "parameters": [],
        },
    ]


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
