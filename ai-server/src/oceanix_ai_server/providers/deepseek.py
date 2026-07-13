"""DeepSeek provider (OpenAI-compatible API).

DeepSeek uses the standard OpenAI chat completions endpoint.
We wrap it via langchain_openai.ChatOpenAI for consistency with
the existing codebase, but expose it through the BaseLLMProvider interface.
"""
import os
from collections.abc import Iterator

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, ToolMessage

from .base import BaseLLMProvider, ModelInfo
from ..models.chat import ChatMessage, ChatResponse, ChatRole


DEEPSEEK_MODELS = [
    ModelInfo(
        id="deepseek-v4-pro",
        display_name="DeepSeek V4 Pro",
        provider_id="deepseek",
        max_tokens=4096,
        supports_streaming=True,
        supports_tools=True,
    ),
    ModelInfo(
        id="deepseek-chat",
        display_name="DeepSeek Chat",
        provider_id="deepseek",
        max_tokens=4096,
        supports_streaming=True,
        supports_tools=True,
    ),
]


_ROLE_TO_LANGCHAIN = {
    ChatRole.SYSTEM: SystemMessage,
    ChatRole.USER: HumanMessage,
    ChatRole.ASSISTANT: AIMessage,
    ChatRole.TOOL: ToolMessage,
}


class DeepSeekProvider(BaseLLMProvider):
    provider_id = "deepseek"
    display_name = "DeepSeek"
    supported_models = DEEPSEEK_MODELS
    default_model = "deepseek-v4-pro"

    def __init__(self) -> None:
        self._llm: ChatOpenAI | None = None
        super().__init__()

    def _validate_config(self) -> None:
        if not os.environ.get("DEEPSEEK_API_KEY"):
            raise ValueError("DEEPSEEK_API_KEY not set")

    def _get_llm(self, model_id: str | None = None) -> ChatOpenAI:
        model = self.get_model(model_id)
        if self._llm is None or self._llm.model_name != model.id:
            self._llm = ChatOpenAI(
                model=model.id,
                base_url="https://api.deepseek.com/v1",
                api_key=os.environ["DEEPSEEK_API_KEY"],
                max_tokens=model.max_tokens,
                streaming=True,
            )
        return self._llm

    def _to_langchain(self, messages: list[ChatMessage]) -> list:
        return [
            _ROLE_TO_LANGCHAIN[m.role](content=m.content)
            for m in messages
        ]

    def invoke(
        self,
        messages: list[ChatMessage],
        model_id: str | None = None,
        **kwargs,
    ) -> ChatResponse:
        llm = self._get_llm(model_id)
        lc_messages = self._to_langchain(messages)
        response = llm.invoke(lc_messages, **kwargs)
        return ChatResponse(
            content=response.content if hasattr(response, "content") else str(response),
            model_id=llm.model_name,
        )

    def stream(
        self,
        messages: list[ChatMessage],
        model_id: str | None = None,
        **kwargs,
    ) -> Iterator[str]:
        llm = self._get_llm(model_id)
        lc_messages = self._to_langchain(messages)
        for chunk in llm.stream(lc_messages, **kwargs):
            content = chunk.content if hasattr(chunk, "content") else str(chunk)
            if content:
                yield content
