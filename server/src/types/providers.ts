import type { Message } from './conversation.js';

export interface AIProviderConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
  baseUrl: string;
  timeout: number;
}

export interface AIProviderResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AIProvider {
  readonly name: string;
  readonly isConfigured: boolean;
  chat(messages: Message[]): Promise<AIProviderResponse>;
}

export type ProviderType = 'xai' | 'ollama';
