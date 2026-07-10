"""LLM Provider adapter layer."""

PROVIDERS = {
    "openai": "OpenAI GPT-4 / o-series",
    "anthropic": "Anthropic Claude",
    "ollama": "Ollama (local)",
}

def get_provider(name: str):
    """Get a provider by name. Placeholder for Phase 1."""
    return PROVIDERS.get(name)
