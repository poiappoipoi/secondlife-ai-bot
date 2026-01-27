/**
 * AI provider type definitions and interfaces
 */
import type { Message } from './conversation';

/**
 * Configuration required for AI provider initialization
 */
export interface AIProviderConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
  baseUrl: string;
  timeout: number;
}

/**
 * Standardized response format from AI providers
 */
export interface AIProviderResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Interface that all AI providers must implement
 */
export interface AIProvider {
  readonly name: string;
  readonly isConfigured: boolean;
  chat(messages: Message[]): Promise<AIProviderResponse>;
  chatStream(messages: Message[]): AsyncIterable<string>;
}

/**
 * Supported AI provider types
 */
export type ProviderType = 'xai' | 'ollama';
