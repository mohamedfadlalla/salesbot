import { AIProvider } from "./base";
import { GeminiProvider } from "./gemini";
import { OllamaProvider } from "./ollama";
import { OpenRouterProvider } from "./openrouter";
import { Settings } from "../config/settings";

export function getProvider(): AIProvider {
    const providerName = Settings.AI_PROVIDER.toLowerCase();
    
    if (providerName === "gemini") {
        return new GeminiProvider();
    } else if (providerName === "ollama") {
        return new OllamaProvider();
    } else if (providerName === "openrouter") {
        return new OpenRouterProvider();
    }
    
    throw new Error(`Unknown AI provider: ${providerName}`);
}

export { AIProvider };
