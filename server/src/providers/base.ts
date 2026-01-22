/**
 * Base class for AI providers - provides common functionality for HTTP requests with timeout
 */
import type { Message } from '../types/index';
import type { AIProvider, AIProviderConfig, AIProviderResponse } from '../types/index';

/**
 * Abstract base class for AI provider implementations
 * Handles HTTP requests, timeouts, and common provider logic
 */
export abstract class BaseAIProvider implements AIProvider {
  abstract readonly name: string;
  protected readonly config: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    this.config = config;
  }

  /**
   * Checks if provider is properly configured (has API key)
   */
  get isConfigured(): boolean {
    return Boolean(this.config.apiKey);
  }

  /**
   * Performs fetch request with timeout using AbortController
   */
  protected async fetchWithTimeout(url: string, options: RequestInit, timeout: number): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`);
      }
      throw error;
    }
  }

  /**
   * Makes authenticated POST request to AI provider API
   * Handles errors and JSON parsing
   */
  protected async makeRequest<T>(endpoint: string, body: unknown): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`;
    const response = await this.fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
      },
      this.config.timeout
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`HTTP ${response.status} ${response.statusText}: ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Sends chat messages to AI provider and returns response
   */
  abstract chat(messages: Message[]): Promise<AIProviderResponse>;
  
  /**
   * Parses provider-specific response format into standard format
   */
  protected abstract parseResponse(data: unknown): AIProviderResponse;
}
