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

mcp = FastMCP(
    "Oceanix AI",
    description="Oceanix code editor AI assistant — code completion and chat",
)


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

        prompt = (
            f"You are a code completion engine. Given the following {language} code context, "
            f"predict the next tokens the user is likely to type at the cursor position (line {cursor_line}).\n"
            f"Return ONLY the completion text, no explanation, no markdown formatting.\n\n"
            f"```{language}\n{context}\n```\n\nCompletion:"
        )

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

    from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

    role_map = {
        "system": SystemMessage,
        "user": HumanMessage,
        "assistant": AIMessage,
    }

    from .prompts import SYSTEM_PROMPT

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


# ── LLM Provider ───────────────────────────────────────

_llm = None
_llm_checked = False


def _get_llm():
    """Lazy-init the LLM provider chain."""
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
            )
            logger.info("Using OpenAI")
            return _llm
        except Exception as e:
            logger.warning(f"OpenAI init failed: {e}")

    if os.environ.get("OLLAMA_HOST") or True:
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
    """Run the MCP server on stdio."""
    logger.info("Oceanix AI Server starting on stdio...")
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
