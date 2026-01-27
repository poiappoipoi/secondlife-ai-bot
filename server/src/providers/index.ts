/**
 * AI provider factory - creates provider instances based on configuration
 */
import type { AIProvider, ProviderType } from '../types/index';
import { XAIProvider } from './xai';
import { OllamaProvider } from './ollama';
import { LoggerService } from '../services/logger';
import { config } from '../config/index';

/**
 * Creates an AI provider instance of the specified type
 * @param logger - Logger service instance
 * @param type - Provider type (defaults to config value)
 * @returns Configured AI provider instance
 */
export function createProvider(logger: LoggerService, type?: ProviderType): AIProvider {
  const providerType = type ?? config.ai.provider;
  const { maxTokens, timeout } = config.ai;

  switch (providerType) {
    case 'xai':
      return new XAIProvider(config.ai.xai.apiKey, config.ai.xai.model, maxTokens, timeout, logger);
    case 'ollama':
      return new OllamaProvider(
        config.ai.ollama.baseUrl,
        config.ai.ollama.model,
        maxTokens,
        timeout,
        logger
      );
    default:
      throw new Error(`Unknown provider type: ${String(providerType)}`);
  }
}

/**
 * Gets a configured provider instance, throwing if not properly configured
 * @param logger - Logger service instance
 * @throws Error if provider is missing required configuration (e.g., API key)
 */
export function getConfiguredProvider(logger: LoggerService): AIProvider {
  const provider = createProvider(logger);
  if (!provider.isConfigured) {
    throw new Error(`Provider ${provider.name} is not configured. Missing API key.`);
  }
  return provider;
}

export { XAIProvider } from './xai';
export { OllamaProvider } from './ollama';
