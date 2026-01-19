import type { AIProvider, ProviderType } from '../types/index.js';
import { XAIProvider } from './xai.js';
import { OllamaProvider } from './ollama.js';
import { config } from '../config/index.js';

export function createProvider(type?: ProviderType): AIProvider {
  const providerType = type ?? config.ai.provider;
  const { maxTokens, timeout } = config.ai;

  switch (providerType) {
    case 'xai':
      return new XAIProvider(
        config.ai.xai.apiKey,
        config.ai.xai.model,
        maxTokens,
        timeout
      );
    case 'ollama':
      return new OllamaProvider(
        config.ai.ollama.baseUrl,
        config.ai.ollama.model,
        maxTokens,
        timeout
      );
    default:
      throw new Error(`Unknown provider type: ${providerType}`);
  }
}

export function getConfiguredProvider(): AIProvider {
  const provider = createProvider();
  if (!provider.isConfigured) {
    throw new Error(`Provider ${provider.name} is not configured. Missing API key.`);
  }
  return provider;
}

export { XAIProvider } from './xai.js';
export { OllamaProvider } from './ollama.js';
