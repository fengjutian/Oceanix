"""LLM Provider layer.

Auto-discovers available providers based on environment variables.
Import this package and call `discover_providers()` to get a list
of ready-to-use provider instances.
"""
from .base import BaseLLMProvider, ModelInfo
from .deepseek import DeepSeekProvider
from .openai import OpenAIProvider
from .anthropic import AnthropicProvider
from .ollama import OllamaProvider

# Ordered by priority — first available provider wins for default
_PROVIDER_CLASSES: list[type[BaseLLMProvider]] = [
    DeepSeekProvider,
    AnthropicProvider,
    OpenAIProvider,
    OllamaProvider,
]


def discover_providers() -> list[BaseLLMProvider]:
    """Return all providers that are currently available (env vars set)."""
    available: list[BaseLLMProvider] = []
    for cls in _PROVIDER_CLASSES:
        try:
            provider = cls()
            if provider.is_available():
                available.append(provider)
        except ValueError:
            pass
    return available


def discover_default_provider() -> BaseLLMProvider | None:
    """Return the first available provider, or None if none are configured."""
    providers = discover_providers()
    return providers[0] if providers else None


__all__ = [
    "BaseLLMProvider",
    "ModelInfo",
    "DeepSeekProvider",
    "OpenAIProvider",
    "AnthropicProvider",
    "OllamaProvider",
    "discover_providers",
    "discover_default_provider",
]
