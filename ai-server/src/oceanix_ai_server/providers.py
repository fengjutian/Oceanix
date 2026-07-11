""LLM Provider adapter layer — kept for future use. Currently server.py._get_llm() handles provider init."""

PROVIDERS = {
    "openai": "OpenAI GPT-4 / o-series",
    "anthropic": "Anthropic Claude",
    "ollama": "Ollama (local)",
}

def get_provider(name: str):
    """Get provider metadata by name."""
    return PROVIDERS.get(name)
