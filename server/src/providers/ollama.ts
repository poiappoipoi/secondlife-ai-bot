import axios, { AxiosInstance } from 'axios';
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
  protected readonly client: AxiosInstance;
  protected readonly config: AIProviderConfig;

  constructor(baseUrl: string, model: string, maxTokens: number, timeout: number) {
    this.config = {
      apiKey: 'ollama',
      model,
      maxTokens,
      baseUrl,
      timeout,
    };

    // Create axios client WITHOUT Authorization header for Ollama
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  get isConfigured(): boolean {
    return true; // Ollama doesn't need API key
  }

  async chat(messages: Message[]): Promise<AIProviderResponse> {
    // Filter out empty system messages to allow modelfile's SYSTEM directive to work
    // If system prompt is empty, don't send it so modelfile's system prompt is used
    // If system prompt has content, send it to override modelfile
    const filteredMessages = messages.filter((msg, index) => {
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
    const response = await this.client.post<OllamaResponse>('/chat/completions', {
      messages: filteredMessages,
      model: this.config.model,
      stream: false,
    });

    return this.parseResponse(response.data);
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
