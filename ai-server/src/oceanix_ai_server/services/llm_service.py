"""LLM Service — the central routing layer for language models.

Wraps all registered providers behind a unified invoke/stream API.
The frontend calls this service to get available models and to
send chat requests — it never talks to a provider directly.
"""
from collections.abc import Iterator
from loguru import logger

from ..models.chat import ChatMessage, ChatResponse, ChatRole
from ..providers.base import BaseLLMProvider, ModelInfo
from ..providers import discover_providers


class LLMService:
    """Central LLM orchestration service.

    - Discovers providers on startup.
    - Exposes list of all available models to the frontend.
    - Routes invoke/stream calls to the correct provider.
    """

    def __init__(self) -> None:
        self.providers: dict[str, BaseLLMProvider] = {}
        self.default_provider_id: str | None = None
        self._discover()

    def _discover(self) -> None:
        """Auto-discover and register all available providers."""
        available = discover_providers()
        for p in available:
            self.providers[p.provider_id] = p
            logger.info(f"LLM Provider ready: {p.display_name} ({p.provider_id})")
        if available:
            self.default_provider_id = available[0].provider_id
            logger.info(f"Default provider: {self.default_provider_id}")
        else:
            logger.warning("No LLM providers configured. Set API keys in environment.")

    @property
    def is_ready(self) -> bool:
        """Whether at least one provider is available."""
        return len(self.providers) > 0

    # ── model discovery ───────────────────────────────

    def list_models(self) -> list[ModelInfo]:
        """Return all models from all available providers."""
        all_models: list[ModelInfo] = []
        for provider in self.providers.values():
            all_models.extend(provider.list_models())
        return all_models

    def get_model(self, model_id: str) -> ModelInfo | None:
        """Find a model by id across all providers."""
        for model in self.list_models():
            if model.id == model_id:
                return model
        return None

    # ── provider routing ──────────────────────────────

    def _resolve_provider(self, model_id: str | None = None) -> BaseLLMProvider:
        """Find the provider that can serve the requested model."""
        if model_id:
            for provider in self.providers.values():
                for m in provider.list_models():
                    if m.id == model_id:
                        return provider
            raise ValueError(f"No provider found for model '{model_id}'")

        if self.default_provider_id:
            return self.providers[self.default_provider_id]

        raise RuntimeError("No LLM providers available")

    # ── chat API ──────────────────────────────────────

    def invoke(
        self,
        messages: list[ChatMessage],
        model_id: str | None = None,
        system_prompt: str | None = None,
        **kwargs,
    ) -> ChatResponse:
        """Send messages to the LLM and wait for the full response."""
        provider = self._resolve_provider(model_id)

        # Prepend system message if provided
        if system_prompt:
            messages = [ChatMessage(role=ChatRole.SYSTEM, content=system_prompt)] + messages

        return provider.invoke(messages, model_id=model_id, **kwargs)

    def stream(
        self,
        messages: list[ChatMessage],
        model_id: str | None = None,
        system_prompt: str | None = None,
        **kwargs,
    ) -> Iterator[str]:
        """Send messages and yield tokens as they arrive."""
        provider = self._resolve_provider(model_id)

        if system_prompt:
            messages = [ChatMessage(role=ChatRole.SYSTEM, content=system_prompt)] + messages

        yield from provider.stream(messages, model_id=model_id, **kwargs)

    # ── compatibility helpers ─────────────────────────

    def to_langchain_model(self, model_id: str | None = None):
        """Get a LangChain-compatible LLM instance for Agent graph usage.

        This retains backward-compatibility with the existing LangGraph agent
        while the rest of the stack uses the new provider abstraction.
        """
        provider = self._resolve_provider(model_id)
        if hasattr(provider, "_get_llm"):
            return provider._get_llm(model_id)
        raise NotImplementedError(f"Provider {provider.provider_id} does not expose a LangChain model")
