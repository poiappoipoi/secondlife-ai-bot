import axios, { AxiosInstance } from 'axios';
import type { Message } from '../types/index.js';
import type { AIProvider, AIProviderConfig, AIProviderResponse } from '../types/index.js';

export abstract class BaseAIProvider implements AIProvider {
  abstract readonly name: string;
  protected readonly client: AxiosInstance;
  protected readonly config: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
    });
  }

  get isConfigured(): boolean {
    return Boolean(this.config.apiKey);
  }

  abstract chat(messages: Message[]): Promise<AIProviderResponse>;
  protected abstract parseResponse(data: unknown): AIProviderResponse;
}
