"""Chat Service — handles conversational chat (non-agent).

Manages message history, system prompts, and SSE streaming.
The Agent path goes through agent_service; this is for the
simpler "chat with AI" mode.
"""
from collections.abc import Iterator
from loguru import logger

from ..models.chat import ChatMessage, ChatRequest, ChatResponse, ChatRole
from .llm_service import LLMService


class ChatService:
    """Conversational chat — sends messages to LLM, returns responses.

    Does NOT drive agent execution loops. For autonomous agent tasks,
    use AgentService instead.
    """

    def __init__(self, llm_service: LLMService) -> None:
        self._llm = llm_service

    def chat(self, request: ChatRequest) -> ChatResponse:
        """Send a chat request and return the full response.

        This is the simplest path: messages → LLM → response.
        """
        return self._llm.invoke(
            request.messages,
            model_id=request.model_id,
            system_prompt=request.system_prompt,
        )

    def chat_stream(self, request: ChatRequest) -> Iterator[str]:
        """Send a chat request and yield response tokens via SSE-style streaming."""
        yield from self._llm.stream(
            request.messages,
            model_id=request.model_id,
            system_prompt=request.system_prompt,
        )
