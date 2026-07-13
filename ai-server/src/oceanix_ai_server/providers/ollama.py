"""Ollama provider (local LLM)."""

import os
from collections.abc import Iterator

from langchain_ollama import ChatOllama
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, ToolMessage

from .base import BaseLLMProvider, ModelInfo
from ..models.chat import ChatMessage, ChatResponse, ChatRole


_ROLE_TO_LANGCHAIN = {
    ChatRole.SYSTEM: SystemMessage,
    ChatRole.USER: HumanMessage,
    ChatRole.ASSISTANT: AIMessage,
    ChatRole.TOOL: ToolMessage,
}


class OllamaProvider(BaseLLMProvider):
    provider_id = "ollama"
    display_name = "Ollama (Local)"
    default_model = "codellama"

    def __init__(self) -> None:
        self._llm: ChatOllama | None = None
        super().__init__()

    def _validate_config(self) -> None:
        if not os.environ.get("OLLAMA_HOST"):
            raise ValueError("OLLAMA_HOST not set")

    @property
    def supported_models(self) -> list[ModelInfo]:
        # Return the currently configured model as the only available one.
        # We could also query the Ollama API for a list but this is simpler.
        model = os.environ.get("OLLAMA_MODEL", self.default_model)
        return [
            ModelInfo(
                id=model,
                display_name=f"Ollama ({model})",
                provider_id="ollama",
                max_tokens=4096,
                supports_streaming=True,
                supports_tools=False,  # Most local models don't support tool calling
            )
        ]

    def _get_llm(self, model_id: str | None = None) -> ChatOllama:
        model = self.get_model(model_id)
        if self._llm is None or self._llm.model != model.id:
            self._llm = ChatOllama(model=model.id)
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
            model_id=llm.model,
        )

    def stream(
        self, messages: list[ChatMessage], model_id: str | None = None, **kwargs
    ) -> Iterator[str]:
        llm = self._get_llm(model_id)
        for chunk in llm.stream(self._to_langchain(messages), **kwargs):
            content = chunk.content if hasattr(chunk, "content") else str(chunk)
            if content:
                yield content
