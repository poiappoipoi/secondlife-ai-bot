/**
 * X.AI Grok provider implementation
 */
import { BaseAIProvider } from './base';
import type { Message } from '../types/index';
import type { AIProviderResponse } from '../types/index';

/**
 * X.AI API response format (choices array)
 */
interface XAIResponseChoice {
  message?: {
    content?: string;
  };
}

/**
 * X.AI API response format (output array)
 */
interface XAIResponseOutput {
  content?: Array<{
    text?: string;
  }>;
}

/**
 * X.AI API response structure (supports both formats)
 */
interface XAIResponse {
  choices?: XAIResponseChoice[];
  output?: XAIResponseOutput[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * X.AI Grok provider - implements chat completion using X.AI API
 */
export class XAIProvider extends BaseAIProvider {
  readonly name = 'X.AI Grok';

  constructor(apiKey: string, model: string, maxTokens: number, timeout: number) {
    super({
      apiKey,
      model,
      maxTokens,
      baseUrl: 'https://api.x.ai/v1',
      timeout,
    });
  }

  /**
   * Sends chat messages to X.AI Grok API
   */
  async chat(messages: Message[]): Promise<AIProviderResponse> {
    const data = await this.makeRequest<XAIResponse>('/chat/completions', {
      messages,
      model: this.config.model,
      stream: false,
      max_tokens: this.config.maxTokens,
    });

    return this.parseResponse(data);
  }

  /**
   * Streams chat messages from X.AI Grok API
   */
  async *chatStream(messages: Message[]): AsyncIterable<string> {
    const response = await this.makeStreamRequest('/chat/completions', {
      messages,
      model: this.config.model,
      stream: true,
      max_tokens: this.config.maxTokens,
    });

    if (!response.body) {
      throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    yield* this.parseSSEStream(reader);
  }

  /**
   * Extracts content delta from X.AI SSE data format
   */
  protected extractContentFromSSE(data: unknown): string | null {
    if (typeof data === 'object' && data !== null) {
      const obj = data as Record<string, unknown>;
      
      // X.AI uses choices[0].delta.content format
      if (obj.choices?.[0]?.delta?.content) {
        return String(obj.choices[0].delta.content);
      }
      
      // Fallback to choices[0].message.content (for non-delta chunks)
      if (obj.choices?.[0]?.message?.content) {
        return String(obj.choices[0].message.content);
      }
      
      // X.AI also supports output[] format
      if (obj.output?.[0]?.content?.[0]?.text) {
        return String(obj.output[0].content[0].text);
      }
    }
    return null;
  }

  /**
   * Parses X.AI response - handles both output[] and choices[] formats
   */
  protected parseResponse(data: XAIResponse): AIProviderResponse {
    let content: string;

    if (data.output?.[0]?.content?.[0]?.text) {
      content = data.output[0].content[0].text;
    } else if (data.choices?.[0]?.message?.content) {
      content = data.choices[0].message.content;
    } else {
      throw new Error('Unable to parse AI response format');
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
