"""OpenAI provider."""

import os
from collections.abc import Iterator

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, ToolMessage

from .base import BaseLLMProvider, ModelInfo
from ..models.chat import ChatMessage, ChatResponse, ChatRole


OPENAI_MODELS = [
    ModelInfo(id="gpt-4o", display_name="GPT-4o", provider_id="openai", max_tokens=4096),
    ModelInfo(id="gpt-4o-mini", display_name="GPT-4o Mini", provider_id="openai", max_tokens=4096),
    ModelInfo(id="gpt-4-turbo", display_name="GPT-4 Turbo", provider_id="openai", max_tokens=4096),
    ModelInfo(id="o1", display_name="o1", provider_id="openai", max_tokens=4096),
    ModelInfo(id="o3-mini", display_name="o3 Mini", provider_id="openai", max_tokens=4096),
]

_ROLE_TO_LANGCHAIN = {
    ChatRole.SYSTEM: SystemMessage,
    ChatRole.USER: HumanMessage,
    ChatRole.ASSISTANT: AIMessage,
    ChatRole.TOOL: ToolMessage,
}


class OpenAIProvider(BaseLLMProvider):
    provider_id = "openai"
    display_name = "OpenAI"
    supported_models = OPENAI_MODELS
    default_model = "gpt-4o-mini"

    def __init__(self) -> None:
        self._llm: ChatOpenAI | None = None
        super().__init__()

    def _validate_config(self) -> None:
        if not os.environ.get("OPENAI_API_KEY"):
            raise ValueError("OPENAI_API_KEY not set")

    def _get_llm(self, model_id: str | None = None) -> ChatOpenAI:
        model = self.get_model(model_id)
        if self._llm is None or self._llm.model_name != model.id:
            self._llm = ChatOpenAI(
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
