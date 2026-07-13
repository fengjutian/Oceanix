"""Anthropic Claude provider."""

import os
from collections.abc import Iterator

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, ToolMessage

from .base import BaseLLMProvider, ModelInfo
from ..models.chat import ChatMessage, ChatResponse, ChatRole


ANTHROPIC_MODELS = [
    ModelInfo(id="claude-sonnet-4-20250514", display_name="Claude Sonnet 4", provider_id="anthropic", max_tokens=4096),
    ModelInfo(id="claude-3-5-sonnet-20241022", display_name="Claude 3.5 Sonnet", provider_id="anthropic", max_tokens=4096),
    ModelInfo(id="claude-3-opus-20240229", display_name="Claude 3 Opus", provider_id="anthropic", max_tokens=4096),
    ModelInfo(id="claude-3-haiku-20240307", display_name="Claude 3 Haiku", provider_id="anthropic", max_tokens=4096),
]

_ROLE_TO_LANGCHAIN = {
    ChatRole.SYSTEM: SystemMessage,
    ChatRole.USER: HumanMessage,
    ChatRole.ASSISTANT: AIMessage,
    ChatRole.TOOL: ToolMessage,
}


class AnthropicProvider(BaseLLMProvider):
    provider_id = "anthropic"
    display_name = "Anthropic"
    supported_models = ANTHROPIC_MODELS
    default_model = "claude-sonnet-4-20250514"

    def __init__(self) -> None:
        self._llm: ChatAnthropic | None = None
        super().__init__()

    def _validate_config(self) -> None:
        if not os.environ.get("ANTHROPIC_API_KEY"):
            raise ValueError("ANTHROPIC_API_KEY not set")

    def _get_llm(self, model_id: str | None = None) -> ChatAnthropic:
        model = self.get_model(model_id)
        if self._llm is None or self._llm.model_name != model.id:
            self._llm = ChatAnthropic(
                model=model.id,
                max_tokens=model.max_tokens,
                streaming=True,
            )
        return self._llm

    def _to_langchain(self, messages: list[ChatMessage]) -> list:
        return [_ROLE_TO_LANGCHAIN[m.role](content=m.content) for m in messages]

    def invoke(
        self, messages: list[ChatMessage], model_id: str | None = None, **kwargs
    ) -> ChatResponse:
        llm = self._get_llm(model_id)
        response = llm.invoke(self._to_langchain(messages), **kwargs)
        return ChatResponse(
            content=response.content if hasattr(response, "content") else str(response),
            model_id=llm.model_name,
        )

    def stream(
        self, messages: list[ChatMessage], model_id: str | None = None, **kwargs
    ) -> Iterator[str]:
        llm = self._get_llm(model_id)
        for chunk in llm.stream(self._to_langchain(messages), **kwargs):
            content = chunk.content if hasattr(chunk, "content") else str(chunk)
            if content:
                yield content
