/**
 * AI provider factory - creates provider instances based on configuration
 */
import type { AIProvider, ProviderType } from '../types/index';
import { XAIProvider } from './xai';
import { OllamaProvider } from './ollama';
import { config } from '../config/index';

/**
 * Creates an AI provider instance of the specified type
 * @param type - Provider type (defaults to config value)
 * @returns Configured AI provider instance
 */
export function createProvider(type?: ProviderType): AIProvider {
  const providerType = type ?? config.ai.provider;
  const { maxTokens, timeout } = config.ai;

  switch (providerType) {
    case 'xai':
      return new XAIProvider(config.ai.xai.apiKey, config.ai.xai.model, maxTokens, timeout);
    case 'ollama':
      return new OllamaProvider(
        config.ai.ollama.baseUrl,
        config.ai.ollama.model,
        maxTokens,
        timeout
      );
    default:
      throw new Error(`Unknown provider type: ${String(providerType)}`);
  }
}

/**
 * Gets a configured provider instance, throwing if not properly configured
 * @throws Error if provider is missing required configuration (e.g., API key)
 */
export function getConfiguredProvider(): AIProvider {
  const provider = createProvider();
  if (!provider.isConfigured) {
    throw new Error(`Provider ${provider.name} is not configured. Missing API key.`);
  }
  return provider;
}

export { XAIProvider } from './xai';
export { OllamaProvider } from './ollama';
