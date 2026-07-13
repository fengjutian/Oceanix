"""Oceanix AI Server — entry point.

Assembles services (LLM, Chat, Agent, Tool) and starts
both the MCP stdio transport and the HTTP REST/SSE API.
"""
import sys
import os
import threading
from loguru import logger
from dotenv import load_dotenv

# Load API keys from .env or environment
load_dotenv()

logger.remove()
logger.add(sys.stderr, level="INFO", format="<green>{time:HH:mm:ss}</green> | {level:<7} | {message}")

from fastmcp import FastMCP

from oceanix_ai_server.services import LLMService, ChatService, AgentService, ToolService
from oceanix_ai_server.tools import register_builtin_tools

# ── MCP Server (stdio) ────────────────────────────────

mcp = FastMCP(
    "Oceanix AI",
    description="Oceanix code editor AI assistant — code completion, chat, and agent",
)

# ── Service initialization ────────────────────────────

llm_service = LLMService()
tool_service = ToolService()
chat_service = ChatService(llm_service)
agent_service = AgentService(llm_service, tool_service)

# Register built-in tools
register_builtin_tools(tool_service)


# ── MCP Tools ─────────────────────────────────────────

@mcp.tool()
def agent_execute(task: str, max_steps: int = 10) -> dict:
    """Execute an autonomous agent task using the editor tools.

    The agent will plan, execute tools, and report results.
    """
    logger.info(f"Agent task: {task[:100]}")
    try:
        result = agent_service._graph.invoke(
            {
                "task": task,
                "messages": [{"role": "human", "content": task}],
                "plan": [],
                "current_step": 0,
                "result": "",
            },
            config={"recursion_limit": max_steps * 2},
        )
        return {
            "status": "completed",
            "plan": result.get("plan", []),
            "steps_completed": result.get("current_step", 0),
            "result": result.get("result", "Done"),
        }
    except Exception as e:
        logger.error(f"Agent failed: {e}")
        return {"status": "error", "error": str(e)}


@mcp.tool()
def chat(messages: list[dict], context_files: list[str] | None = None) -> str:
    """Chat with the AI assistant."""
    from oceanix_ai_server.models.chat import ChatMessage, ChatRequest, ChatRole

    role_map = {"system": ChatRole.SYSTEM, "user": ChatRole.USER, "assistant": ChatRole.ASSISTANT}
    cm = [ChatMessage(role=role_map.get(m["role"], ChatRole.USER), content=m["content"]) for m in messages]

    response = chat_service.chat(ChatRequest(messages=cm))
    return response.content


@mcp.tool()
def completion(code: str, position: dict, language: str = "plaintext", file_path: str = "") -> dict | None:
    """Generate inline code completion (ghost text)."""
    from oceanix_ai_server.models.chat import ChatMessage, ChatRole

    lines = code.split("\n")
    cursor_line = position.get("line", 1)
    start = max(0, cursor_line - 15)
    end = min(len(lines), cursor_line + 5)
    context = "\n".join(lines[start:end])

    prompt = f"You are a code completion engine. Complete the {language} code at the cursor.\n```{language}\n{context}\n```\n\nCompletion:"
    response = llm_service.invoke([ChatMessage(role=ChatRole.USER, content=prompt)])
    return {"insertText": response.content.strip()}


@mcp.tool()
def search_codebase(query: str, top_k: int = 10) -> list[dict]:
    """Search the project codebase using the RAG index."""
    from oceanix_ai_server.rag import search_codebase as _search
    return _search(query, top_k=top_k)


@mcp.tool()
def rebuild_rag_index() -> dict:
    """Rebuild the RAG code index from scratch."""
    from oceanix_ai_server.rag import rebuild_index as _rebuild, get_index
    _rebuild()
    return get_index().stats()


@mcp.tool()
def rag_stats() -> dict:
    """Get RAG index statistics."""
    from oceanix_ai_server.rag import get_index
    return get_index().stats()


# ── MCP Tool metadata (for frontend discovery) ────────

def get_mcp_tool_definitions() -> list[dict]:
    """Return metadata for all registered MCP tools."""
    builtin = [
        {"name": t.id, "description": t.description,
         "parameters": [{"name": p.name, "type": p.type, "description": p.description} for p in t.parameters]}
        for t in tool_service.list_all()
        if t.source.value == "builtin"
    ]
    return builtin + [
        {"name": "agent_execute", "description": "Execute an autonomous agent task", "parameters": [
            {"name": "task", "type": "str", "description": "Description of what the agent should do."},
            {"name": "max_steps", "type": "int", "description": "Maximum execution steps (default 10)."},
        ]},
        {"name": "chat", "description": "Chat with the AI assistant", "parameters": [
            {"name": "messages", "type": "list[dict]", "description": "List of messages"},
            {"name": "context_files", "type": "list[str] | None", "description": "Optional context files"},
        ]},
        {"name": "completion", "description": "Generate inline code completion", "parameters": [
            {"name": "code", "type": "str"},
            {"name": "position", "type": "dict"},
            {"name": "language", "type": "str"},
            {"name": "file_path", "type": "str"},
        ]},
        {"name": "search_codebase", "description": "Search the project codebase using RAG", "parameters": [
            {"name": "query", "type": "str"},
            {"name": "top_k", "type": "int"},
        ]},
        {"name": "rebuild_rag_index", "description": "Rebuild the RAG code index", "parameters": []},
        {"name": "rag_stats", "description": "Get RAG index statistics", "parameters": []},
    ]


# ── Entry point ────────────────────────────────────────

def main():
    """Run the MCP server on stdio, with HTTP API on a background thread."""
    logger.info("Oceanix AI Server starting on stdio...")

    # Start FastAPI HTTP server on a daemon thread
    http_port = int(os.environ.get("OCEANIX_AI_HTTP_PORT", "11435"))
    http_thread = threading.Thread(
        target=_run_http_server, args=(http_port,), daemon=True, name="ai-http-api",
    )
    http_thread.start()
    logger.info(f"HTTP API will listen on http://127.0.0.1:{http_port}")

    # Initialize RAG on startup
    try:
        from oceanix_ai_server.rag import init_rag
        init_rag()
    except Exception as e:
        logger.warning(f"RAG init skipped: {e}")

    mcp.run(transport="stdio")


def _run_http_server(port: int):
    """Run the FastAPI HTTP server (runs in daemon thread)."""
    try:
        from oceanix_ai_server.http_api import run_http
        run_http(port)
    except Exception as e:
        logger.error(f"HTTP server failed: {e}")


if __name__ == "__main__":
    main()
