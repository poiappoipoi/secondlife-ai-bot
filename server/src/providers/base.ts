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
  protected async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeout: number
  ): Promise<Response> {
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
          Authorization: `Bearer ${this.config.apiKey}`,
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
   * Makes authenticated streaming POST request to AI provider API
   * Returns the response stream for parsing
   */
  protected async makeStreamRequest(endpoint: string, body: unknown): Promise<Response> {
    const url = `${this.config.baseUrl}${endpoint}`;
    const response = await this.fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
      },
      this.config.timeout
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`HTTP ${response.status} ${response.statusText}: ${errorText}`);
    }

    return response;
  }

  /**
   * Parses Server-Sent Events (SSE) stream
   * Yields content deltas from data: lines
   */
  protected async *parseSSEStream(
    reader: ReadableStreamDefaultReader<Uint8Array>
  ): AsyncGenerator<string> {
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') {
              return;
            }
            try {
              const parsed: unknown = JSON.parse(data);
              const content = this.extractContentFromSSE(parsed);
              if (content) {
                yield content;
              }
            } catch {
              // Ignore invalid JSON in SSE stream
            }
          }
        }
      }

      // Process remaining buffer
      if (buffer.trim()) {
        if (buffer.startsWith('data: ')) {
          const data = buffer.slice(6).trim();
          if (data !== '[DONE]') {
            try {
              const parsed: unknown = JSON.parse(data);
              const content = this.extractContentFromSSE(parsed);
              if (content) {
                yield content;
              }
            } catch {
              // Ignore invalid JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Extracts content delta from SSE data object
   * Override in subclasses for provider-specific formats
   */
  protected extractContentFromSSE(data: unknown): string | null {
    // Default implementation - subclasses should override
    if (typeof data === 'object' && data !== null) {
      const obj = data as Record<string, unknown>;
      const choices = obj.choices;
      if (
        Array.isArray(choices) &&
        choices[0] &&
        typeof choices[0] === 'object' &&
        choices[0] !== null
      ) {
        const choice = choices[0] as Record<string, unknown>;
        const delta = choice.delta;
        if (delta && typeof delta === 'object' && delta !== null && 'content' in delta) {
          return String((delta as { content: unknown }).content);
        }
        const message = choice.message;
        if (message && typeof message === 'object' && message !== null && 'content' in message) {
          return String((message as { content: unknown }).content);
        }
      }
    }
    return null;
  }

  /**
   * Sends chat messages to AI provider and returns response
   */
  abstract chat(messages: Message[]): Promise<AIProviderResponse>;

  /**
   * Streams chat messages from AI provider
   */
  abstract chatStream(messages: Message[]): AsyncIterable<string>;

  /**
   * Parses provider-specific response format into standard format
   */
  protected abstract parseResponse(data: unknown): AIProviderResponse;
}
