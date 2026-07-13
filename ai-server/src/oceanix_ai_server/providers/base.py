"""Base LLM Provider abstract class.

All LLM providers (DeepSeek, OpenAI, Anthropic, Ollama, etc.)
must implement this interface.

The provider layer is inspired by VSCode's ILanguageModelsService:
each provider registers its capabilities and the LLMService
routes requests to the appropriate provider based on model selection.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from collections.abc import Iterator

from ..models.chat import ChatMessage, ChatResponse


@dataclass
class ModelInfo:
    """Metadata about a model that a provider can serve."""
    id: str               # e.g. "deepseek-v4-pro", "gpt-4o-mini"
    display_name: str     # e.g. "DeepSeek V4 Pro"
    provider_id: str      # e.g. "deepseek", "openai"
    max_tokens: int = 4096
    supports_streaming: bool = True
    supports_tools: bool = True
    supports_images: bool = False
    pricing: str | None = None  # free-form pricing info for UI


class BaseLLMProvider(ABC):
    """Abstract interface for an LLM provider.

    Each provider wraps a specific LLM backend (OpenAI, Anthropic, local Ollama, etc.)
    and exposes a uniform invoke/stream API to the rest of the system.
    """

    provider_id: str
    display_name: str
    supported_models: list[ModelInfo]
    default_model: str

    def __init__(self) -> None:
        self._validate_config()

    # ── required overrides ────────────────────────────

    @abstractmethod
    def _validate_config(self) -> None:
        """Check that required env vars / config are present.

        Raise ValueError if the provider cannot be used (missing API key, etc.).
        """

    @abstractmethod
    def invoke(
        self,
        messages: list[ChatMessage],
        model_id: str | None = None,
        **kwargs,
    ) -> ChatResponse:
        """Synchronous invocation — block until the full response is ready."""

    @abstractmethod
    def stream(
        self,
        messages: list[ChatMessage],
        model_id: str | None = None,
        **kwargs,
    ) -> Iterator[str]:
        """Streaming invocation — yield tokens as they arrive."""

    # ── optional overrides ────────────────────────────

    def list_models(self) -> list[ModelInfo]:
        """Return the models this provider can serve."""
        return self.supported_models

    def get_model(self, model_id: str | None = None) -> ModelInfo:
        """Find model info by id, falling back to default_model."""
        target = model_id or self.default_model
        for m in self.supported_models:
            if m.id == target:
                return m
        raise ValueError(
            f"Model '{target}' not found in provider '{self.provider_id}'. "
            f"Available: {[m.id for m in self.supported_models]}"
        )

    def is_available(self) -> bool:
        """Check whether the provider is ready to serve requests."""
        try:
            self._validate_config()
            return True
        except ValueError:
            return False
