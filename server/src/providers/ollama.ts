/**
 * Ollama provider implementation for local LLM
 */
import type { Message } from '../types/index';
import type { AIProvider, AIProviderConfig, AIProviderResponse } from '../types/index';

/**
 * Ollama OpenAI-compatible API response format
 */
interface OllamaResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Ollama provider - implements chat completion using local Ollama instance
 * Uses OpenAI-compatible API endpoint
 */
export class OllamaProvider implements AIProvider {
  readonly name = 'Ollama';
  protected readonly config: AIProviderConfig;

  constructor(baseUrl: string, model: string, maxTokens: number, timeout: number) {
    this.config = {
      apiKey: 'ollama',
      model,
      maxTokens,
      baseUrl,
      timeout,
    };
  }

  /**
   * Ollama doesn't require API key authentication
   */
  get isConfigured(): boolean {
    return true;
  }

  /**
   * Performs fetch request with timeout using AbortController
   */
  private async fetchWithTimeout(url: string, options: RequestInit, timeout: number): Promise<Response> {
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
   * Sends chat messages to Ollama API
   * Filters out empty system messages to allow modelfile's SYSTEM directive to work
   */
  async chat(messages: Message[]): Promise<AIProviderResponse> {
    const filteredMessages = messages.filter((msg) => {
      if (msg.role !== 'system') {
        return true;
      }
      return msg.content.trim().length > 0;
    });

    const url = `${this.config.baseUrl}/chat/completions`;
    const response = await this.fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: filteredMessages,
          model: this.config.model,
          stream: false,
        }),
      },
      this.config.timeout
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`HTTP ${response.status} ${response.statusText}: ${errorText}`);
    }

    const data = await response.json() as OllamaResponse;
    return this.parseResponse(data);
  }

  /**
   * Streams chat messages from Ollama API
   * Filters out empty system messages to allow modelfile's SYSTEM directive to work
   */
  async *chatStream(messages: Message[]): AsyncIterable<string> {
    const filteredMessages = messages.filter((msg) => {
      if (msg.role !== 'system') {
        return true;
      }
      return msg.content.trim().length > 0;
    });

    const url = `${this.config.baseUrl}/chat/completions`;
    const response = await this.fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: filteredMessages,
          model: this.config.model,
          stream: true,
        }),
      },
      this.config.timeout
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`HTTP ${response.status} ${response.statusText}: ${errorText}`);
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
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
          if (line.trim()) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') {
                return;
              }
              try {
                const parsed = JSON.parse(data);
                if (parsed.choices?.[0]?.delta?.content) {
                  yield String(parsed.choices[0].delta.content);
                }
              } catch {
                // Ignore invalid JSON in stream
              }
            } else {
              // Ollama may also send JSON directly without "data: " prefix
              try {
                const parsed = JSON.parse(line);
                if (parsed.choices?.[0]?.delta?.content) {
                  yield String(parsed.choices[0].delta.content);
                }
                if (parsed.choices?.[0]?.finish_reason === 'stop') {
                  return;
                }
              } catch {
                // Ignore invalid JSON
              }
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
              const parsed = JSON.parse(data);
              if (parsed.choices?.[0]?.delta?.content) {
                yield String(parsed.choices[0].delta.content);
              }
            } catch {
              // Ignore invalid JSON
            }
          }
        } else {
          try {
            const parsed = JSON.parse(buffer);
            if (parsed.choices?.[0]?.delta?.content) {
              yield String(parsed.choices[0].delta.content);
            }
          } catch {
            // Ignore invalid JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Parses Ollama response into standard format
   */
  protected parseResponse(data: OllamaResponse): AIProviderResponse {
    const content = data.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Unable to parse Ollama response');
    }

    return {
      content,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined,
    };
  }
}
