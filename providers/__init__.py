from config.settings import settings

from providers.base import AIProvider
from providers.ollama import OllamaProvider

# Registry of available providers
_PROVIDER_REGISTRY = {
    "ollama": OllamaProvider,
}


def get_provider() -> AIProvider:
    """Factory: return the AI provider configured in settings."""
    provider_name = settings.AI_PROVIDER.lower()
    if provider_name not in _PROVIDER_REGISTRY:
        available = ", ".join(_PROVIDER_REGISTRY.keys())
        raise ValueError(
            f"Unknown AI provider '{provider_name}'. Available: {available}"
        )
    return _PROVIDER_REGISTRY[provider_name]()


def register_provider(name: str, cls):
    """Register a new provider at runtime."""
    _PROVIDER_REGISTRY[name.lower()] = cls


__all__ = ["get_provider", "register_provider", "AIProvider"]