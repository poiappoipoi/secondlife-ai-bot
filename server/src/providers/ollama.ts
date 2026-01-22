import type { Message } from '../types/index.js';
import type { AIProvider, AIProviderConfig, AIProviderResponse } from '../types/index.js';

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

  get isConfigured(): boolean {
    return true; // Ollama doesn't need API key
  }

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

  async chat(messages: Message[]): Promise<AIProviderResponse> {
    // Filter out empty system messages to allow modelfile's SYSTEM directive to work
    // If system prompt is empty, don't send it so modelfile's system prompt is used
    // If system prompt has content, send it to override modelfile
    const filteredMessages = messages.filter((msg) => {
      // Keep all non-system messages
      if (msg.role !== 'system') {
        return true;
      }
      // Only keep system message if it has content (non-empty)
      // This allows modelfile's SYSTEM directive to work when no custom prompt is set
      return msg.content.trim().length > 0;
    });

    // Ollama's OpenAI-compatible API format
    // Note: max_tokens may not be supported, so we omit it
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
